import * as THREE from "three";
import { RL } from "./rl-physics.js";

/**
 * Rocket League aerial torque (shared via `carPhysics.js`) on a Three.js Object3D.
 * Modes should import {@link AerialBody} from `carPhysics.js`, not this file.
 *
 * Physics frame is Z-up with car local x=front, y=right, z=up.
 * Render cars use Y-up with local z=front, y=up, x=right — map:
 *   physics forward → Three forward (0,0,1)
 *   physics right   → Three right   (1,0,0)  (pitch torque applied about -right = left)
 *   physics up      → Three up      (0,1,0)
 *
 * Sign convention (RocketSim CarControls / chase-cam screen):
 *   +pitch = nose up, +yaw = nose right (screen-right from behind),
 *   +roll = roll right.
 *
 * Pure RH rotation about +up takes +Z toward +X, but a chase camera looking
 * along +Z has screen-right = −X — so yaw torque is negated vs the raw RH
 * rule to keep +yaw = nose screen-right.
 */
export class AerialBody {
  constructor() {
    this.omega = new THREE.Vector3();
    this._omegaNext = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._omegaLocal = new THREE.Vector3();
    this._tauLocal = new THREE.Vector3();
    this._tauWorld = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._left = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  reset() {
    this.omega.set(0, 0, 0);
  }

  /**
   * @param {THREE.Object3D} object
   * @param {number} roll -1..1 (+ = roll right)
   * @param {number} pitch -1..1 (+ = nose up)
   * @param {number} yaw -1..1 (+ = nose right on chase-cam)
   * @param {number} dt
   */
  step(object, roll, pitch, yaw, dt) {
    const {
      omega,
      _omegaNext: omegaNext,
      _axis: axis,
      _omegaLocal: omegaLocal,
      _tauLocal: tauLocal,
      _tauWorld: tauWorld,
      _forward: forward,
      _left: left,
      _up: up,
      _q: tmpQ,
    } = this;

    const r = THREE.MathUtils.clamp(roll || 0, -1, 1);
    const p = THREE.MathUtils.clamp(pitch || 0, -1, 1);
    const y = THREE.MathUtils.clamp(yaw || 0, -1, 1);

    forward.set(0, 0, 1).applyQuaternion(object.quaternion);
    left.set(-1, 0, 0).applyQuaternion(object.quaternion);
    up.set(0, 1, 0).applyQuaternion(object.quaternion);

    // Local ω about (forward, left, up). Pitch about left (= −right) so
    // +T_PITCH*pitch matches RocketSim’s −T_PITCH about right. Roll about
    // forward needs −T_ROLL so +roll is roll-right in RH Three.js. Yaw
    // about up needs −T_YAW so +yaw is nose screen-right in chase-cam.
    omegaLocal.set(omega.dot(forward), omega.dot(left), omega.dot(up));

    tauLocal.set(
      RL.T_ROLL * r + RL.D_ROLL * omegaLocal.x,
      RL.T_PITCH * p + RL.D_PITCH * (1 - Math.abs(p)) * omegaLocal.y,
      -RL.T_YAW * y + RL.D_YAW * (1 - Math.abs(y)) * omegaLocal.z,
    );

    tauWorld
      .set(0, 0, 0)
      .addScaledVector(forward, tauLocal.x)
      .addScaledVector(left, tauLocal.y)
      .addScaledVector(up, tauLocal.z);

    omegaNext.copy(omega).addScaledVector(tauWorld, dt);

    // RocketSim: integrate orientation with post-torque ω (not the tick average).
    omega.copy(omegaNext);
    const phi = omega.length() * dt;
    if (phi > 1e-8) {
      tmpQ.setFromAxisAngle(axis.copy(omega).normalize(), phi);
      object.quaternion.premultiply(tmpQ);
      object.quaternion.normalize();
    }
    if (omega.length() > RL.MAX_ANG_VEL) omega.setLength(RL.MAX_ANG_VEL);
  }
}

/**
 * Fixed 120 Hz accumulator — call from the render loop with wall-clock dt.
 */
export class FixedStepClock {
  constructor() {
    /** @type {number} */
    this.acc = 0;
  }

  reset() {
    this.acc = 0;
  }

  /**
   * @param {number} elapsed
   * @param {(dt: number) => void} stepFn
   * @param {number} [maxCatchUp=0.1]
   */
  advance(elapsed, stepFn, maxCatchUp = 0.1) {
    this.acc += Math.min(elapsed, maxCatchUp);
    let steps = 0;
    while (this.acc >= RL.DT) {
      stepFn(RL.DT);
      this.acc -= RL.DT;
      steps++;
    }
    return steps;
  }
}

export { RL };
