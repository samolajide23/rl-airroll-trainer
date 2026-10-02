import { Matrix4, Quaternion, Vector3 } from "three";
import { SkybotDiagnostic } from "./skybot.js";

const clamp = value => Math.max(-1, Math.min(1, value));
const idle = () => ({ throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, handbrake: false });
const routes = [[0, -1800, 17], [2400, 1000, 17], [-2400, 2400, 17], [1800, -2800, 17], [-1800, -2800, 17]];

export class MechanicsBot extends SkybotDiagnostic {
  constructor() {
    super();
    this.mode = "circuit";
  }

  reset() {
    super.reset();
    this.routeIndex = 0;
    this.maneuver = null;
    this.cooldownUntil = 0;
    this.carryTicks = 0;
    this.stuckTicks = 0;
    this.previousPosition = null;
    this.action = "Driving";
  }

  begin(car, ball) {
    super.begin(car, ball);
    this.recording.notes = "Custom browser mechanics controller; not a full RLBot port or certified mechanic execution. Immutable exported controls for engine comparison.";
    this.recording.scenarios[0].id = "mechanics-recording";
  }

  startManeuver(kind, steer = 1) {
    this.maneuver = { kind, start: this.tick, steer: Math.sign(steer) || 1 };
    this.action = kind;
  }

  maneuverControls(car) {
    const { kind, start, steer } = this.maneuver;
    const age = this.tick - start;
    if (car && !this.maneuver.heading) {
      this.maneuver.heading = new Vector3(1, 0, 0).applyQuaternion(car.q).setZ(0).normalize();
      if (kind === "Half flip") this.maneuver.heading.negate();
    }
    const input = idle();
    const duration = kind === "Half flip" ? 240 : kind === "Speed flip" ? 180 : kind === "Wavedash" ? 120 : 180;
    if (age >= duration) {
      this.maneuver = null;
      this.cooldownUntil = this.tick + 180;
      return null;
    }
    input.throttle = kind === "Half flip" ? -1 : 1;
    input.jump = age < 6 || (age >= 12 && age < 15);
    if (kind === "Half flip") {
      const flipAge = age - 48;
      input.jump = flipAge >= 0 && (flipAge < 6 || (flipAge >= 12 && flipAge < 15));
      input.throttle = flipAge >= 65 ? 1 : -1;
      input.pitch = flipAge >= 12 && flipAge < 36 ? 1 : flipAge >= 36 && flipAge < 92 ? -1 : 0;
      input.roll = flipAge >= 40 && flipAge < 92 ? steer : 0;
    } else if (kind === "Speed flip") {
      input.pitch = age >= 12 && age < 16 ? -1 : age >= 16 && age < 92 ? 1 : 0;
      input.yaw = age >= 12 && age < 16 ? steer * 0.25 : 0;
      input.roll = age >= 20 && age < 65 ? -steer * 0.6 : 0;
      input.boost = age < 65;
    } else if (kind === "Wavedash") {
      input.jump = age < 3;
      input.pitch = age >= 3 && age < 16 ? 0.35 : 0;
      if (car && age > 18 && !car.onGround && car.vel.z < 0 && car.pos.z < 55 && !car.hasFlipped) {
        input.jump = true;
        input.pitch = -1;
      }
    } else {
      input.jump = age < 3 || (age >= 7 && age < 10);
      input.pitch = age >= 7 && age < 65 ? -1 : 0;
    }
    if (car) {
      const recovery = this.recovery(car, car.pos.clone().add(this.maneuver.heading), this.maneuver.heading);
      const forward = new Vector3(1, 0, 0).applyQuaternion(car.q);
      const heading = this.maneuver.heading;
      const headingError = Math.atan2(forward.x * heading.y - forward.y * heading.x, forward.x * heading.x + forward.y * heading.y);
      if (car.onGround && age > (kind === "Half flip" ? 64 : 16)) {
        input.steer = clamp(headingError * 3);
        input.handbrake = Math.abs(headingError) > 0.8;
        input.boost = Math.abs(headingError) < 0.15 && kind === "Speed flip";
      }
      const flipAge = kind === "Half flip" ? age - 48 : age;
      if (kind === "Half flip" && flipAge >= 40) input.roll = recovery.roll;
      if (kind === "Speed flip" && age >= 20) {
        input.roll = recovery.roll;
        input.yaw = recovery.yaw;
        input.boost = !car.onGround && forward.dot(heading) > 0.95 && forward.z > -0.15 && forward.z < 0.15;
      }
      if (((kind === "Half flip" || kind === "Speed flip") && flipAge >= 92) || (kind === "Flick" && age >= 65) || (kind === "Wavedash" && age >= 16 && !input.jump)) {
        input.pitch = recovery.pitch;
        input.yaw = recovery.yaw;
        input.roll = recovery.roll;
      }
      this.action = age > 92 ? `${kind} recovery` : kind;
    }
    return input;
  }

  recovery(car, target, heading) {
    const input = idle();
    const forward = new Vector3(1, 0, 0).applyQuaternion(car.q);
    const right = new Vector3(0, 1, 0).applyQuaternion(car.q);
    const up = new Vector3(0, 0, 1).applyQuaternion(car.q);
    const desired = heading ? heading.clone() : car.vel.clone().setZ(0);
    if (desired.lengthSq() < 10000) desired.copy(target).sub(car.pos).setZ(0);
    if (desired.lengthSq() === 0) desired.set(1, 0, 0);
    desired.normalize();
    const desiredUp = new Vector3(0, 0, 1);
    const desiredRight = desiredUp.clone().cross(desired);
    const orientation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(desired, desiredRight, desiredUp));
    const difference = orientation.multiply(car.q.clone().invert()).normalize();
    if (difference.w < 0) difference.set(-difference.x, -difference.y, -difference.z, -difference.w);
    const error = new Vector3(difference.x, difference.y, difference.z);
    const length = error.length();
    if (length > 1e-8) error.multiplyScalar(2 * Math.atan2(length, difference.w) / length);
    input.pitch = clamp(-error.dot(right) * 3 + car.omega.dot(right) * 0.8);
    input.yaw = clamp(error.dot(up) * 3 - car.omega.dot(up) * 0.8);
    input.roll = clamp(-error.dot(forward) * 3 + car.omega.dot(forward) * 0.8);
    input.throttle = 1;
    this.action = "Recovery";
    return input;
  }

  controls(car, ball) {
    super.controls(car, ball);
    let target = new Vector3(...routes[this.routeIndex]);
    let desiredSpeed = 1800;
    if (this.mode === "dribble") {
      const goalDirection = new Vector3(0, 5120, 100).sub(ball.pos).setZ(0).normalize();
      const offset = ball.pos.clone().sub(car.pos);
      const carrying = Math.hypot(offset.x, offset.y) < 105 && offset.z > 100 && offset.z < 210 && ball.vel.clone().sub(car.vel).length() < 350;
      this.carryTicks = carrying && car.onGround ? this.carryTicks + 1 : 0;
      target = ball.pos.clone().addScaledVector(goalDirection, carrying ? 500 : -100);
      desiredSpeed = carrying ? 900 : Math.min(1100, ball.vel.length() + Math.hypot(offset.x, offset.y) * 0.8);
      this.action = carrying ? "Carry" : "Dribble approach";
      if (this.carryTicks > 90 && !this.maneuver && this.tick >= this.cooldownUntil) this.startManeuver("Flick");
    } else {
      if (target.distanceTo(car.pos) < 350) {
        this.routeIndex = (this.routeIndex + 1) % routes.length;
        target.set(...routes[this.routeIndex]);
      }
      this.action = "Circuit";
    }
    this.target = target.toArray();
    if (this.maneuver) {
      this.action = this.maneuver.kind;
      const input = this.maneuverControls(car);
      if (input) return input;
    }
    if (!car.onGround) return this.recovery(car, target);
    const forward = new Vector3(1, 0, 0).applyQuaternion(car.q);
    const difference = target.clone().sub(car.pos).setZ(0);
    const angle = Math.atan2(forward.x * difference.y - forward.y * difference.x, forward.x * difference.x + forward.y * difference.y);
    const speed = car.vel.dot(forward);
    if (this.previousPosition && car.pos.distanceToSquared(this.previousPosition) < 0.04) this.stuckTicks++;
    else this.stuckTicks = 0;
    this.previousPosition = car.pos.clone();
    const input = idle();
    input.steer = clamp(angle * 2.5);
    input.handbrake = Math.abs(angle) > 1.2 && car.vel.length() > 400;
    input.throttle = speed > desiredSpeed + 80 ? -1 : 1;
    input.boost = this.mode === "circuit" && Math.abs(angle) < 0.12 && speed < 2100 && difference.length() > 1200 && car.boost > 0;
    if (this.tick >= this.cooldownUntil) {
      if (this.mode === "half-flip") this.startManeuver("Half flip", angle);
      else if (this.mode === "wavedash" && speed > 400) this.startManeuver("Wavedash");
      else if (Math.abs(angle) > 2.6 && speed < 600 && this.mode === "circuit") this.startManeuver("Half flip", angle);
      else if (this.stuckTicks > 180) this.startManeuver("Half flip", angle);
      else if (this.mode === "circuit" && Math.abs(angle) < 0.08 && speed > 700 && speed < 1700 && difference.length() > 2000) this.startManeuver("Speed flip", angle);
      if (this.maneuver) return this.maneuverControls(car);
    }
    if (input.handbrake) this.action = "Powerslide turn";
    return input;
  }
}