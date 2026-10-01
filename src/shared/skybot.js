import { Vector3 } from "three";

const DT = 1 / 120;
const idle = () => ({ throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, handbrake: false });
const vector = value => [value.x, value.y, value.z];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function predictSkybotBall(ball, ticks = 600) {
  const pos = ball.pos.clone();
  const vel = ball.vel.clone();
  const spin = ball.omega.clone();
  const frames = [vector(pos)];
  for (let tick = 0; tick < ticks; tick++) {
    vel.multiplyScalar(1 - 0.013 * DT);
    vel.z -= 650 * DT;
    pos.addScaledVector(vel, DT);
    if (pos.z < 93) {
      pos.z = 93;
      vel.z = Math.abs(vel.z) * 0.6;
      vel.x = (vel.x + spin.y * 93 * 0.4) * 0.713;
      vel.y = (vel.y - spin.x * 93 * 0.4) * 0.713;
      spin.set(-vel.y / 93, vel.x / 93, vel.z / 93).clampLength(0, 6);
      if (vel.z < 10) vel.z = 0;
    }
    if (pos.z > 2044 - 93) {
      pos.z = 2044 - 93;
      vel.z = -Math.abs(vel.z) * 0.6;
    }
    if (Math.abs(pos.x) > 4096 - 93) {
      pos.x = Math.sign(pos.x) * (4096 - 93);
      vel.x *= -0.6;
    }
    if (Math.abs(pos.y) > 5120 - 93) {
      if (Math.abs(pos.x) < 892.755 - 93 && pos.z < 642.775 - 93) break;
      pos.y = Math.sign(pos.y) * (5120 - 93);
      vel.y *= -0.6;
    }
    frames.push(vector(pos));
  }
  return frames;
}

function initialCar(car) {
  const forward = new Vector3(1, 0, 0).applyQuaternion(car.q);
  const right = new Vector3(0, 1, 0).applyQuaternion(car.q);
  const yaw = Math.atan2(forward.y, forward.x);
  return {
    pos: vector(car.pos), vel: vector(car.vel), ang_vel: vector(car.omega),
    yaw, pitch: Math.asin(clamp(forward.z, -1, 1)),
    roll: Math.atan2(-right.z, -right.x * Math.sin(yaw) + right.y * Math.cos(yaw)),
    boost: car.boost, on_ground: car.onGround, hitbox: car.hitbox.id ?? "octane",
  };
}

export class SkybotDiagnostic {
  constructor() {
    this.forward = new Vector3();
    this.reset();
  }

  reset() {
    this.tick = 0;
    this.prediction = [];
    this.actual = [];
    this.error = null;
    this.target = null;
    this.intercept = null;
    this.lastContact = null;
    this.recording = null;
    this.flipStart = -Infinity;
  }

  begin(car, ball) {
    this.reset();
    this.recording = {
      version: 2,
      notes: "Skybot-derived open-loop controls from trainer. Replay in RocketSim; not live-game ground truth. Initial suspension warmup may differ.",
      defaults: { tick_rate: 120, settle_ticks: 0, controls: idle() },
      scenarios: [{ id: "skybot-recording", game_mode: "soccar", ticks: 0,
        initial: initialCar(car), ball: { pos: vector(ball.pos), vel: vector(ball.vel), ang_vel: vector(ball.omega) },
        control_schedule: [] }],
      observations: [],
    };
  }

  controls(car, ball) {
    if (this.tick % 300 === 0 || !this.prediction.length) {
      this.prediction = predictSkybotBall(ball);
      this.predictionTick = this.tick;
      this.actual = [vector(ball.pos)];
      this.error = null;
    }
    const forecast = predictSkybotBall(ball, 360);
    let target = vector(ball.pos);
    let arrival = 0;
    let speedNeeded = 2300;
    for (let index = 12; index < forecast.length; index += 12) {
      const point = forecast[index];
      if (point[2] > 150) continue;
      const distance = Math.hypot(point[0] - car.pos.x, point[1] - 120 - car.pos.y);
      const speed = distance / (index * DT);
      const boostNeeded = Math.max(0, (6.31e-6 * speed ** 2 + 0.010383 * speed) - (6.31e-6 * car.vel.length() ** 2 + 0.010383 * car.vel.length()));
      if (speed <= 1410 || (speed < 2300 && car.boost + 1 >= boostNeeded)) {
        target = [point[0], point[1] - 120, point[2]];
        arrival = index * DT;
        speedNeeded = speed;
        break;
      }
    }
    this.target = target;
    if (!this.intercept && arrival > 0) this.intercept = { tick: this.tick, expectedTick: this.tick + Math.round(arrival / DT), point: forecast[Math.round(arrival / DT)] };
    this.forward.set(1, 0, 0).applyQuaternion(car.q);
    const yaw = Math.atan2(this.forward.y, this.forward.x);
    const heading = Math.atan2(target[1] - car.pos.y, target[0] - car.pos.x);
    const angle = Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw)) * 180 / Math.PI;
    const input = idle();
    if (car.onGround) {
      input.steer = clamp(angle / 10, -1, 1);
      input.handbrake = Math.abs(angle) > 100 && Math.abs(car.pos.y) < 5000;
      input.throttle = car.vel.length() > speedNeeded + 50 ? -1 : 1;
      input.boost = Math.abs(angle) < 3 && car.vel.length() < speedNeeded && car.boost > 0;
      if (car.boost < 1 && Math.abs(angle) < 3 && Math.hypot(target[0] - car.pos.x, target[1] - car.pos.y) > 3000 && this.tick - this.flipStart > 240) this.flipStart = this.tick;
    }
    const flipAge = this.tick - this.flipStart;
    if (flipAge < 36) {
      input.jump = flipAge < 6 || (flipAge >= 12 && flipAge < 15);
      input.pitch = flipAge >= 12 ? -1 : 0;
    }
    return input;
  }

  observe(car, ball, input, contact = false) {
    this.tick++;
    const expected = this.prediction[this.tick - this.predictionTick];
    if (expected) this.error = Math.hypot(ball.pos.x - expected[0], ball.pos.y - expected[1], ball.pos.z - expected[2]);
    if (this.tick % 4 === 0) this.actual.push(vector(ball.pos));
    if (contact && !this.lastContact) {
      this.lastContact = {
        tick: this.tick, time: this.tick * DT, point: vector(ball.pos),
        timingError: this.intercept ? (this.tick - this.intercept.expectedTick) * DT : null,
        positionError: this.intercept ? Math.hypot(...vector(ball.pos).map((value, index) => value - this.intercept.point[index])) : null,
      };
    }
    const scenario = this.recording?.scenarios[0];
    if (scenario && scenario.ticks < 7200) {
      scenario.ticks++;
      scenario.control_schedule.push({ until_tick: scenario.ticks, controls: { ...input } });
      this.recording.observations.push({ tick: scenario.ticks, car: vector(car.pos), ball: vector(ball.pos), predictionError: this.error, contact });
    }
  }
}