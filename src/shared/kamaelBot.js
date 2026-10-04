import { Vector3 } from "three";
import { SkybotDiagnostic } from "./skybot.js";
import { makeBall, stepBall, RL } from "./carPhysics.js";
import { releaseRocketSimWorld } from "./rocketSimRuntime.js";

const vector = value => ({ x: value.x, y: value.y, z: value.z });
const physics = (pos, vel, omega, rotation = { pitch: 0, yaw: 0, roll: 0 }) => ({ location: vector(pos), velocity: vector(vel), angular_velocity: vector(omega), rotation });

export function kamaelInput(car, ball, tick, pads, touch) {
  const orderedPads = [...pads].sort((first, second) => first.y - second.y || first.x - second.x);
  const forward = new Vector3(1, 0, 0).applyQuaternion(car.q);
  const right = new Vector3(0, 1, 0).applyQuaternion(car.q);
  const up = new Vector3(0, 0, 1).applyQuaternion(car.q);
  const rotation = { pitch: Math.asin(Math.max(-1, Math.min(1, forward.z))), yaw: Math.atan2(forward.y, forward.x), roll: Math.atan2(-right.z, up.z) };
  const time = tick / 120;
  const predictedBall = makeBall(ball.pos.clone());
  predictedBall.vel.copy(ball.vel);
  predictedBall.omega.copy(ball.omega);
  const slices = [];
  for (let index = 0; index < 360; index++) {
    slices.push({ game_seconds: time + index / 60, physics: physics(predictedBall.pos, predictedBall.vel, predictedBall.omega) });
    stepBall(predictedBall, RL.DT);
    stepBall(predictedBall, RL.DT);
  }
  releaseRocketSimWorld(predictedBall);
  const packet = {
    num_cars: 1,
    game_cars: [{ name: "Kamael", team: 0, is_demolished: false, is_super_sonic: car.isSupersonic, has_wheel_contact: car.onGround, jumped: car.hasJumped, double_jumped: car.hasDoubleJumped || car.hasFlipped, boost: car.boost, physics: physics(car.pos, car.vel, car.omega, rotation), hitbox: { length: car.hitbox.size[0], width: car.hitbox.size[1], height: car.hitbox.size[2] }, hitbox_offset: { x: car.hitbox.offset[0], y: car.hitbox.offset[1], z: car.hitbox.offset[2] } }],
    game_ball: { physics: physics(ball.pos, ball.vel, ball.omega), collision_shape: { sphere: { diameter: RL.BALL_RADIUS * 2 } }, latest_touch: touch },
    game_info: { seconds_elapsed: time, game_time_remaining: 300, is_overtime: false, is_unlimited_time: true, is_round_active: true, is_kickoff_pause: tick < 1, world_gravity_z: -RL.GRAVITY, game_speed: 1 },
    teams: [{ score: 0 }, { score: 0 }],
    game_boosts: orderedPads.map(pad => ({ is_active: pad.active, timer: pad.timer })),
  };
  return { packet, prediction: { slices, num_slices: slices.length }, field: { num_boosts: orderedPads.length, boost_pads: orderedPads.map(pad => ({ location: vector(pad), is_full_boost: pad.big })) } };
}

export class KamaelBot extends SkybotDiagnostic {
  constructor(pads) {
    super();
    this.pads = pads;
    this.mode = "kamael";
    this.generation = 0;
    this.action = "Loading Kamael runtime";
    this.worker = new Worker(new URL("./kamaelWorker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = ({ data }) => {
      if (data.type === "ready") {
        this.initialized = true;
        this.restartWorker();
      } else if (data.type === "begun" && data.generation === this.generation) {
        this.ready = true;
      } else if (data.type === "controls" && data.generation === this.generation) {
        this.pending = false;
        this.nextControls = data.controls;
        this.action = data.action;
      } else if (data.type === "error" && (data.generation == null || data.generation === this.generation)) {
        this.pending = false;
        this.errorMessage = data.message;
        this.action = "Kamael runtime error";
        console.error(data.message);
      }
    };
    this.worker.onerror = event => { this.errorMessage = event.message; this.action = "Kamael worker error"; };
    this.worker.postMessage({ type: "initialize" });
  }

  reset() {
    super.reset();
    this.errorMessage = null;
    this.ready = false;
    this.pending = false;
    this.nextControls = null;
    this.currentControls = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, handbrake: false };
    this.touch = { player_name: "", player_index: -1, team: 0, time_seconds: 0, hit_location: { x: 0, y: 0, z: 0 } };
  }

  begin(car, ball) {
    super.begin(car, ball);
    this.generation++;
    this.recording.scenarios[0].id = "kamael-recording";
    this.recording.notes = "Original pinned Kamael Python in Pyodide; Numba JIT disabled; trainer packet and ball-prediction adapters. Not native-runtime parity.";
    if (this.initialized) this.restartWorker();
  }

  restartWorker() {
    this.action = "Starting Kamael";
    this.worker.postMessage({ type: "begin", name: this.mode === "wyrm" ? "Wyrm" : "Kamael", generation: this.generation });
  }

  prepare(car, ball) {
    if (!this.ready || this.pending || this.nextControls || this.errorMessage) return;
    this.pending = true;
    this.worker.postMessage({ type: "step", generation: this.generation, input: kamaelInput(car, ball, this.tick, this.pads, this.touch) });
  }

  controls() {
    if (this.nextControls) {
      this.currentControls = this.nextControls;
      this.nextControls = null;
    }
    return this.currentControls;
  }

  advance(clock, elapsed, car, ball, step) {
    if (!this.ready || this.errorMessage) {
      clock.reset();
      return;
    }
    this.prepare(car, ball);
    clock.advance(elapsed, tickDt => {
      step(tickDt);
      this.prepare(car, ball);
    });
  }

  observe(car, ball, input, contact) {
    super.observe(car, ball, input, contact);
    if (contact) this.touch = { player_name: "Kamael", player_index: 0, team: 0, time_seconds: this.tick / 120, hit_location: vector(ball.pos) };
  }

  dispose() {
    this.worker.terminate();
  }
}