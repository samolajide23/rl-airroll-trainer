import * as THREE from "three";
import { getCamera } from "./settings.js";
import { UU } from "./rl-units.js";

export { UU };

/**
 * Rocket League `ProfileCameraSettings` defaults (Psyonix) + engine camera constants.
 * Source: BakkesMod `ProfileCameraSettings` / `CameraWrapper` / in-game camera sliders.
 */
export const RL_CAMERA = {
  FOV: 110, // [V] horizontal degrees
  DISTANCE: 270, // [V] uu
  HEIGHT: 100, // [V] uu
  /** In-game "Angle"; BakkesMod field `Pitch`. */
  ANGLE: -3, // [V] degrees
  STIFFNESS: 0.5, // [V] 0–1
  SWIVEL_SPEED: 2.5, // [V]
  TRANSITION_SPEED: 1.0, // [V] 1–2 in-game
  SHAKE: false, // [V] CameraSave.CameraShake
  /**
   * Extra distance (uu) pulled at max speed when stiffness = 0.
   * Soft-cam zoom-out observed in-game / common recreations.
   */
  STIFFNESS_ZOOM_UU: 100, // [V]
  /** Speed (uu/s) at which stiffness-zoom reaches full pullback. */
  STIFFNESS_ZOOM_SPEED: 2300, // [V] CAR_MAX_SPEED
  /**
   * DesiredSwivel yaw (rad) per SwivelSpeed unit at full stick.
   * SwivelSpeed=2.5 → ±90° yaw (matches RL default feel).
   */
  SWIVEL_YAW_PER_SPEED: Math.PI / 5, // [V]
  /** DesiredSwivel pitch (rad) per SwivelSpeed unit at full stick. */
  SWIVEL_PITCH_PER_SPEED: Math.PI / 8, // [V]
  /**
   * BakkesMod CameraWrapper::SwivelDieRate — return-to-center rate (1/s)
   * when the right stick is released.
   */
  SWIVEL_DIE_RATE: 6.5, // [V]
  /** How fast CurrentSwivel catches DesiredSwivel while stick held. */
  SWIVEL_CATCH_RATE: 14, // [V]
  /**
   * Rotational lag interp-speed range for stiffness (BakkesMod-style linterp
   * speed). At stiffness=0 → slow arm; at 1 → nearly locked behind the car.
   */
  STIFF_ROT_SPEED_MIN: 1.2, // [V]
  STIFF_ROT_SPEED_MAX: 22, // [V]
  /** Camera shake amplitude (uu) when boosting with shake enabled. */
  SHAKE_BOOST_UU: 4.5, // [V]
  SHAKE_IDLE_UU: 0, // [V]
  /** Soft floor clip — BakkesMod CameraWrapper::ClipToField analogue. */
  CLIP_MIN_Z_UU: 20, // [V]
};

/**
 * Convert Rocket League horizontal FOV (degrees) to Three.js vertical FOV.
 * @param {number} horizontalDeg
 * @param {number} aspect width / height
 * @returns {number}
 */
export function horizontalFovToVertical(horizontalDeg, aspect) {
  const h = THREE.MathUtils.degToRad(horizontalDeg);
  const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(aspect, 1e-6));
  return THREE.MathUtils.radToDeg(v);
}

/**
 * BakkesMod `CameraWrapper::linterp` — linear approach with speed.
 * `result = start + (end - start) * min(1, elapsed * speed)`
 * @param {THREE.Vector3} out
 * @param {THREE.Vector3} start
 * @param {THREE.Vector3} end
 * @param {number} elapsed
 * @param {number} speed
 */
export function linterp(out, start, end, elapsed, speed) {
  const t = Math.min(1, Math.max(0, elapsed * speed));
  out.copy(start).lerp(end, t);
  return out;
}

/**
 * Directional linterp (nlerp) for unit follow vectors.
 * @param {THREE.Vector3} current
 * @param {THREE.Vector3} target
 * @param {number} elapsed
 * @param {number} speed
 */
function linterpDir(current, target, elapsed, speed) {
  const t = Math.min(1, Math.max(0, elapsed * speed));
  current.lerp(target, t);
  if (current.lengthSq() > 1e-12) current.normalize();
  else current.copy(target);
}

/**
 * Rocket League car-cam / ball-cam chase.
 *
 * Arm math (ProfileCameraSettings):
 *   camLoc  = carLoc − forward·Distance + up·Height
 *   focusZ  = Height + Distance·tan(Pitch)
 *   focus   = carLoc + up·focusZ
 *
 * Stiffness lags the follow forward (rotational). TransitionSpeed is the
 * BakkesMod linterp speed for camera body / look. SwivelSpeed scales
 * CameraWrapper::GetDesiredSwivel; CurrentSwivel rotates the arm about focus.
 * Ball cam replaces the pitch focus with the ball.
 */
export class ChaseCamera {
  constructor() {
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    /** Lagged horizontal follow direction (car-forward on world-up plane). */
    this.smoothDir = new THREE.Vector3(0, 0, 1);
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.tmpRight = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.swivelYaw = 0;
    this.swivelPitch = 0;
    this.shakePhase = 0;
    this._ready = false;
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Vector3} target
   * @param {THREE.Vector3} [forward]
   * @param {THREE.Vector3} [lookAt]
   */
  snap(camera, target, forward, lookAt) {
    this._ready = false;
    this.swivelYaw = 0;
    this.swivelPitch = 0;
    this.update(camera, 1 / 60, { target, forward, lookAt, snap: true });
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} dt
   * @param {{
   *   target: THREE.Vector3,
   *   forward?: THREE.Vector3,
   *   velocity?: THREE.Vector3,
   *   lookAt?: THREE.Vector3,
   *   worldUp?: THREE.Vector3,
   *   onGround?: boolean,
   *   boosting?: boolean,
   *   lookRight?: number,
   *   lookUp?: number,
   *   ballCam?: boolean,
   *   snap?: boolean,
   * }} opts
   */
  update(camera, dt, opts) {
    const cfg = getCamera();
    const aspect = camera.aspect || 16 / 9;
    const vFov = horizontalFovToVertical(cfg.fov, aspect);
    if (Math.abs(camera.fov - vFov) > 0.05) {
      camera.fov = vFov;
      camera.updateProjectionMatrix();
    }

    const up = opts.worldUp ?? this.worldUp;
    const dist0 = cfg.distance * UU;
    const height = cfg.height * UU;
    const angleRad = THREE.MathUtils.degToRad(cfg.angle);
    const stiff = THREE.MathUtils.clamp(cfg.stiffness, 0, 1);
    const transition = Math.max(0.05, cfg.transitionSpeed);
    const swivelSpeed = cfg.swivelSpeed ?? RL_CAMERA.SWIVEL_SPEED;
    const ballCam = Boolean(opts.ballCam ?? cfg.ballCam);
    const shakeOn = Boolean(cfg.shake);

    // --- Follow forward: car nose flattened to world-up (no velocity lean) ---
    this.forward.set(0, 0, 1);
    if (opts.forward && opts.forward.lengthSq() > 1e-8) {
      this.forward.copy(opts.forward);
    }
    this.tmp.copy(this.forward).addScaledVector(up, -this.forward.dot(up));
    if (this.tmp.lengthSq() < 1e-6 && opts.velocity && opts.velocity.lengthSq() > 1e-4) {
      this.tmp.copy(opts.velocity).addScaledVector(up, -opts.velocity.dot(up));
    }
    if (this.tmp.lengthSq() < 1e-6) this.tmp.copy(this.smoothDir);
    this.tmp.normalize();

    // Stiffness → rotational linterp speed (higher = snappier arm).
    const rotSpeed =
      (RL_CAMERA.STIFF_ROT_SPEED_MIN +
        stiff * (RL_CAMERA.STIFF_ROT_SPEED_MAX - RL_CAMERA.STIFF_ROT_SPEED_MIN)) *
      transition;
    if (opts.snap || !this._ready) this.smoothDir.copy(this.tmp);
    else linterpDir(this.smoothDir, this.tmp, dt, rotSpeed);

    // --- Swivel (right stick) — CameraWrapper::GetDesiredSwivel / UpdateSwivel ---
    const lookRight = THREE.MathUtils.clamp(opts.lookRight ?? 0, -1, 1);
    const lookUp = THREE.MathUtils.clamp(opts.lookUp ?? 0, -1, 1);
    const desireYaw = lookRight * swivelSpeed * RL_CAMERA.SWIVEL_YAW_PER_SPEED;
    const desirePitch = lookUp * swivelSpeed * RL_CAMERA.SWIVEL_PITCH_PER_SPEED;
    const stickHeld = Math.abs(lookRight) + Math.abs(lookUp) > 0.02;
    if (opts.snap) {
      this.swivelYaw = 0;
      this.swivelPitch = 0;
    } else if (stickHeld) {
      const catchT = Math.min(1, dt * RL_CAMERA.SWIVEL_CATCH_RATE);
      this.swivelYaw += (desireYaw - this.swivelYaw) * catchT;
      this.swivelPitch += (desirePitch - this.swivelPitch) * catchT;
    } else {
      const die = Math.min(1, dt * RL_CAMERA.SWIVEL_DIE_RATE);
      this.swivelYaw *= 1 - die;
      this.swivelPitch *= 1 - die;
      if (Math.abs(this.swivelYaw) < 1e-4) this.swivelYaw = 0;
      if (Math.abs(this.swivelPitch) < 1e-4) this.swivelPitch = 0;
    }

    // Stiffness zoom-out toward max speed.
    const speedUu = opts.velocity ? opts.velocity.length() / UU : 0;
    const superFrac = THREE.MathUtils.clamp(
      speedUu / RL_CAMERA.STIFFNESS_ZOOM_SPEED,
      0,
      1,
    );
    const dist =
      dist0 + (1 - stiff) * superFrac * RL_CAMERA.STIFFNESS_ZOOM_UU * UU;

    // Focus (pre-swivel): angle pitch, or ball cam look-at.
    if (ballCam && opts.lookAt) {
      this.camLook.copy(opts.lookAt);
    } else {
      const lookLift = height + dist * Math.tan(angleRad);
      this.camLook.copy(opts.target).addScaledVector(up, lookLift);
      // Drill soft bias only when lookAt is provided without ball cam.
      if (opts.lookAt) this.camLook.lerp(opts.lookAt, 0.08);
    }

    // Base arm: behind car along lagged forward, up by height.
    this.camPos
      .copy(opts.target)
      .addScaledVector(this.smoothDir, -dist)
      .addScaledVector(up, height);

    // Apply CurrentSwivel as a rotation of the camera about the focus
    // (CameraWrapper swivel rotator), not a position fudge.
    if (Math.abs(this.swivelYaw) > 1e-6 || Math.abs(this.swivelPitch) > 1e-6) {
      this.tmp.copy(this.camPos).sub(this.camLook);
      // Yaw around world-up (negate so +lookRight looks right / orbits left).
      this.tmp.applyAxisAngle(up, -this.swivelYaw);
      // Pitch around camera-right.
      this.tmpRight.crossVectors(up, this.tmp);
      if (this.tmpRight.lengthSq() > 1e-10) {
        this.tmpRight.normalize();
        this.tmp.applyAxisAngle(this.tmpRight, this.swivelPitch);
      }
      this.camPos.copy(this.camLook).add(this.tmp);
    }

    // ClipToField — keep camera above the floor.
    const minY = RL_CAMERA.CLIP_MIN_Z_UU * UU;
    if (this.camPos.y < minY) this.camPos.y = minY;

    // Camera shake (CameraSave.CameraShake).
    if (shakeOn && !opts.snap) {
      this.shakePhase += dt * 38;
      const ampUu = opts.boosting
        ? RL_CAMERA.SHAKE_BOOST_UU
        : RL_CAMERA.SHAKE_IDLE_UU;
      if (ampUu > 0) {
        const a = ampUu * UU;
        this.camPos.x += Math.sin(this.shakePhase * 1.7) * a;
        this.camPos.y += Math.cos(this.shakePhase * 2.3) * a * 0.6;
        this.camPos.z += Math.sin(this.shakePhase * 1.1) * a;
      }
    }

    // TransitionSpeed → BakkesMod linterp speed for body + look.
    if (opts.snap || !this._ready) {
      this.smoothPos.copy(this.camPos);
      this.smoothLook.copy(this.camLook);
      this._ready = true;
    } else {
      linterp(this.smoothPos, this.smoothPos, this.camPos, dt, transition);
      linterp(this.smoothLook, this.smoothLook, this.camLook, dt, transition * 1.15);
    }

    camera.position.copy(this.smoothPos);
    camera.up.copy(up);
    camera.lookAt(this.smoothLook);
  }

  invalidate() {
    this._ready = false;
    this.swivelYaw = 0;
    this.swivelPitch = 0;
  }
}
