import * as THREE from "three";
import { getCamera } from "./settings.js";
import { UU } from "./rl-units.js";

export { UU };

/**
 * Rocket League `ProfileCameraSettings` defaults (Psyonix) + engine camera constants.
 * Source: BakkesMod `ProfileCameraSettings` / `CameraWrapper` / in-game camera sliders.
 * Ball-cam model: Psyonix engineer (r/unrealengine) — Focus / Rotation / Distance.
 *
 * Honest parity note: slider defaults/ranges match RL. Runtime rates marked [A] are
 * approximated (car-cam stiffness internals / exact TransitionSpeed scale are not
 * public). Transition itself uses BakkesMod `linterp` timing (elapsed × speed).
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
   * Rotational lag rate range for stiffness (car cam only).
   * Exponential approach on yaw: `dYaw *= exp(-rate*dt)`.
   * Tuned so default stiffness 0.5 settles a hard 90° turn in ~100ms
   * (RL "slight give"), stiffness 1 is a metal pole (~2 frames), and
   * stiffness 0 is soft but still usable (~0.35s) — not a multi-second crawl.
   * [A] — exact Psyonix curve not public.
   */
  STIFF_ROT_RATE_MIN: 10, // [A]
  STIFF_ROT_RATE_MAX: 120, // [A]
  /** Maps slider → rate with more weight on the snappy end of the range. */
  STIFF_ROT_POWER: 0.55, // [A]
  /**
   * BakkesMod CameraWrapper::linterp is `t = min(1, elapsed * speed)`.
   * In-game TransitionSpeed 1–2 alone is too slow as raw 1/speed seconds
   * (players treat 2.0 as near hard-cut). Scale so:
   *   1.0 → ~0.17s, 1.5 → ~0.11s, 2.0 → ~0.08s.
   * [A] exact internal multiplier unknown; shape matches player reports.
   */
  TRANSITION_SPEED_SCALE: 6, // [A]
  /** Camera shake amplitude (uu) when boosting with shake enabled. */
  SHAKE_BOOST_UU: 4.5, // [A]
  SHAKE_IDLE_UU: 0, // [V]
  /** Soft floor clip — BakkesMod CameraWrapper::ClipToField analogue. */
  CLIP_MIN_Z_UU: 20, // [V]
  /**
   * Ball-cam max pitch (rad). Psyonix clamps look-at-ball pitch to a
   * "reasonable value"; keep aerials readable without flipping over.
   */
  BALL_CAM_MAX_PITCH: (80 * Math.PI) / 180, // [A]
  /**
   * |carForward·worldUp| above this → nose is too vertical to derive a
   * stable chase yaw (forward flip mid-tumble). RL car-cam does not whip
   * 180° here — hold last yaw or fall back to horizontal velocity.
   */
  FLAT_FORWARD_MAX_UP: 0.9, // [A]
  /** Min horizontal speed (three m/s ≈ uu/s×UU) to trust velocity follow. */
  AIR_FOLLOW_VEL_MIN: 1.5, // [A] 150 uu/s
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
 * `t = saturate(elapsed * speed)`; then lerp(start, end, t).
 * @param {number} start
 * @param {number} end
 * @param {number} elapsed seconds since blend began
 * @param {number} speed
 * @returns {number}
 */
export function linterpScalar(start, end, elapsed, speed) {
  const t = Math.min(1, Math.max(0, elapsed * speed));
  return start + (end - start) * t;
}

/**
 * BakkesMod `CameraWrapper::linterp` for vectors.
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
 * Shortest-path lerp for yaw angles (radians).
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Build a unit forward from yaw (about world-up) and pitch (signed: +up).
 * @param {THREE.Vector3} out
 * @param {number} yawRad
 * @param {number} pitchRad
 * @param {THREE.Vector3} up
 * @param {THREE.Vector3} tmpRight
 */
function forwardFromYawPitch(out, yawRad, pitchRad, up, tmpRight) {
  // Yaw 0 → +Z in our Three Y-up arena (car spawn faces +Z).
  // Pitch: +look up. Right-handed rotate-about-right uses −pitch.
  out.set(Math.sin(yawRad), 0, Math.cos(yawRad));
  tmpRight.crossVectors(up, out);
  if (tmpRight.lengthSq() > 1e-10) {
    tmpRight.normalize();
    out.applyAxisAngle(tmpRight, -pitchRad);
  } else {
    out.set(0, Math.sin(pitchRad), Math.cos(pitchRad));
  }
  out.normalize();
  return out;
}

/**
 * Rocket League car-cam / ball-cam chase.
 *
 * Car-cam arm (ProfileCameraSettings):
 *   camLoc  = carLoc − forward·Distance + up·Height
 *   focusZ  = Height + Distance·tan(Pitch)
 *   focus   = carLoc + up·focusZ
 *
 * Ball-cam (Psyonix Focus / Rotation / Distance model):
 *   Focus   = carLoc + up·Height
 *   Rotation = look Focus→ball, pitch clamped to ≥ Angle (stable near ground)
 *   camLoc  = Focus − Rot.Forward·Distance
 *
 * TransitionSpeed: BakkesMod linterp on the Focus/Rotation view (not a
 * world-space position crawl, and not stiffness).
 */
export class ChaseCamera {
  constructor() {
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    /** Lagged horizontal follow direction (car-forward on world-up plane). */
    this.smoothDir = new THREE.Vector3(0, 0, 1);
    /** Lagged follow yaw (rad); source of truth for smoothDir. */
    this._followYaw = 0;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.tmpRight = new THREE.Vector3();
    this.tmpBallFwd = new THREE.Vector3();
    this.carCamPos = new THREE.Vector3();
    this.carCamLook = new THREE.Vector3();
    this.ballCamPos = new THREE.Vector3();
    this.ballCamLook = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.swivelYaw = 0;
    this.swivelPitch = 0;
    this.shakePhase = 0;
    this._ready = false;
    /** 0 = car cam, 1 = ball cam after current transition completes. */
    this.ballCamBlend = 0;
    /** Elapsed seconds in the current car↔ball transition. */
    this._transitionElapsed = 0;
    /** Blend value when the current transition started. */
    this._transitionFrom = 0;
    /** Last desired ball-cam target (0/1) — detects toggles. */
    this._ballTarget = 0;
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
    this.ballCamBlend = 0;
    this._transitionElapsed = 0;
    this._transitionFrom = 0;
    this._ballTarget = 0;
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
   *   lookBehind?: boolean,
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
    const stiff = THREE.MathUtils.clamp(
      Number.isFinite(cfg.stiffness) ? cfg.stiffness : RL_CAMERA.STIFFNESS,
      0,
      1,
    );
    const transition = Math.max(
      0.05,
      Number.isFinite(cfg.transitionSpeed)
        ? cfg.transitionSpeed
        : RL_CAMERA.TRANSITION_SPEED,
    );
    const swivelSpeed = cfg.swivelSpeed ?? RL_CAMERA.SWIVEL_SPEED;
    const ballCam = Boolean(opts.ballCam ?? cfg.ballCam);
    const shakeOn = Boolean(cfg.shake);

    // --- Follow forward: stable horizontal chase yaw ---
    // RL car-cam does not tumble with the nose through a flip. On the ground
    // we track flattened car-forward; in air / when the nose is near vertical
    // we prefer horizontal velocity (momentum), else hold the last yaw.
    this.forward.set(0, 0, 1);
    if (opts.forward && opts.forward.lengthSq() > 1e-8) {
      this.forward.copy(opts.forward);
    }
    const noseUp = Math.abs(this.forward.dot(up));
    this.tmp.copy(this.forward).addScaledVector(up, -this.forward.dot(up));
    const flatFwdSq = this.tmp.lengthSq();
    const noseUnstable =
      noseUp > RL_CAMERA.FLAT_FORWARD_MAX_UP || flatFwdSq < 1e-4;

    let velFlatSq = 0;
    if (opts.velocity && opts.velocity.lengthSq() > 1e-8) {
      this.tmp2.copy(opts.velocity).addScaledVector(up, -opts.velocity.dot(up));
      velFlatSq = this.tmp2.lengthSq();
    }
    const velMin = RL_CAMERA.AIR_FOLLOW_VEL_MIN;
    const velOk = velFlatSq > velMin * velMin;
    const airborne = opts.onGround === false;

    // Prefer momentum in air (RL car-cam). Never track tumbling nose while
    // airborne without velocity — that reverses yaw when the car faces back
    // mid-flip and whips the camera even with FLAT_FORWARD_MAX_UP.
    if (velOk && (airborne || noseUnstable)) {
      this.tmp.copy(this.tmp2).normalize();
    } else if (!airborne && !noseUnstable && flatFwdSq > 1e-6) {
      this.tmp.normalize();
    } else if (velOk) {
      this.tmp.copy(this.tmp2).normalize();
    } else {
      this.tmp.copy(this.smoothDir);
    }

    // Stiffness → how fast the arm yaw tracks the car (car cam only).
    // TransitionSpeed must NOT scale this — it only blends car↔ball views.
    // Body translation is NEVER lagged: focus = car every frame; only yaw softens.
    const stiffT = Math.pow(stiff, RL_CAMERA.STIFF_ROT_POWER);
    const rotRate =
      RL_CAMERA.STIFF_ROT_RATE_MIN +
      stiffT * (RL_CAMERA.STIFF_ROT_RATE_MAX - RL_CAMERA.STIFF_ROT_RATE_MIN);
    const targetYaw = Math.atan2(this.tmp.x, this.tmp.z);
    if (opts.snap || !this._ready) {
      this._followYaw = targetYaw;
    } else {
      // Shortest-path exponential yaw catch-up (constant angular rate feel).
      let dYaw = targetYaw - this._followYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      // During a tumble the desired yaw can still glitch; ignore near-reversals
      // in a single frame so stiffness can't whip the arm around the car.
      if (Math.abs(dYaw) > Math.PI * 0.75 && noseUnstable) {
        dYaw = 0;
      }
      this._followYaw += dYaw * (1 - Math.exp(-rotRate * Math.max(dt, 0)));
    }
    this.smoothDir.set(
      Math.sin(this._followYaw),
      0,
      Math.cos(this._followYaw),
    );

    // --- Swivel (right stick) ---
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

    // Stiffness zoom-out toward max speed (also applies in ball cam per RL).
    const speedUu = opts.velocity ? opts.velocity.length() / UU : 0;
    const superFrac = THREE.MathUtils.clamp(
      speedUu / RL_CAMERA.STIFFNESS_ZOOM_SPEED,
      0,
      1,
    );
    const dist =
      dist0 + (1 - stiff) * superFrac * RL_CAMERA.STIFFNESS_ZOOM_UU * UU;

    // Focus pivot shared by both views (vehicle + Height).
    this.tmp2.copy(opts.target).addScaledVector(up, height);

    // ========== Car-cam rotation (yaw from stiffness arm, pitch = Angle) ==========
    // Rear View (look behind) flips the chase arm 180° around the car.
    const lookBehind = Boolean(opts.lookBehind);
    const rearFlip = lookBehind ? Math.PI : 0;
    const baseCarYaw =
      Math.atan2(this.smoothDir.x, this.smoothDir.z) + rearFlip;
    const carYaw = baseCarYaw - this.swivelYaw;
    const carPitch = angleRad + this.swivelPitch;

    // ProfileCameraSettings arm: horizontal back + Height, look via tan(Angle).
    // Keep this exact endpoint for blend=0 so car cam matches prior parity.
    const carLookLift = height + dist * Math.tan(angleRad);
    this.carCamLook.copy(opts.target).addScaledVector(up, carLookLift);
    // When looking behind, place the camera on the opposite side of the car.
    const armSign = lookBehind ? 1 : -1;
    this.carCamPos
      .copy(opts.target)
      .addScaledVector(this.smoothDir, armSign * dist)
      .addScaledVector(up, height);
    if (Math.abs(this.swivelYaw) > 1e-6 || Math.abs(this.swivelPitch) > 1e-6) {
      this.tmp.copy(this.carCamPos).sub(this.carCamLook);
      this.tmp.applyAxisAngle(up, -this.swivelYaw);
      this.tmpRight.crossVectors(up, this.tmp);
      if (this.tmpRight.lengthSq() > 1e-10) {
        this.tmpRight.normalize();
        this.tmp.applyAxisAngle(this.tmpRight, this.swivelPitch);
      }
      this.carCamPos.copy(this.carCamLook).add(this.tmp);
    }

    // ========== Ball-cam (Focus − Forward×Distance) ==========
    // Rear View overrides ball cam while held (RL: show behind the car).
    let baseBallYaw = baseCarYaw;
    let baseBallPitch = angleRad;
    if (opts.lookAt && !lookBehind) {
      this.tmp.copy(opts.lookAt).sub(this.tmp2);
      const horizSq = this.tmp.x * this.tmp.x + this.tmp.z * this.tmp.z;
      const horiz = Math.sqrt(horizSq);
      if (horizSq > 1e-8) {
        baseBallYaw = Math.atan2(this.tmp.x, this.tmp.z);
      }
      if (horiz > 1e-5 || Math.abs(this.tmp.y) > 1e-5) {
        const rawPitch = Math.atan2(this.tmp.y, Math.max(horiz, 1e-6));
        // Only pitch *up* from Angle toward the ball (stable near ground).
        baseBallPitch = THREE.MathUtils.clamp(
          Math.max(angleRad, rawPitch),
          angleRad,
          RL_CAMERA.BALL_CAM_MAX_PITCH,
        );
      }
    }
    const ballYaw = baseBallYaw - this.swivelYaw;
    const ballPitch = THREE.MathUtils.clamp(
      baseBallPitch + this.swivelPitch,
      angleRad - RL_CAMERA.SWIVEL_PITCH_PER_SPEED * 10,
      RL_CAMERA.BALL_CAM_MAX_PITCH,
    );
    forwardFromYawPitch(
      this.tmpBallFwd,
      ballYaw,
      ballPitch,
      up,
      this.tmpRight,
    );
    this.ballCamPos.copy(this.tmp2).addScaledVector(this.tmpBallFwd, -dist);
    this.ballCamLook.copy(this.tmp2).addScaledVector(this.tmpBallFwd, dist);

    // ========== TransitionSpeed: timed linterp on Focus/Rotation view ==========
    const ballTarget = ballCam && opts.lookAt ? 1 : 0;
    if (opts.snap) {
      this._ballTarget = ballTarget;
      this._transitionFrom = ballTarget;
      this._transitionElapsed = 1;
      this.ballCamBlend = ballTarget;
    } else if (ballTarget !== this._ballTarget) {
      // Restart blend from the current visual blend (supports mid-transition toggle).
      this._transitionFrom = this.ballCamBlend;
      this._ballTarget = ballTarget;
      this._transitionElapsed = dt;
    } else {
      this._transitionElapsed += dt;
    }
    const blendSpeed = transition * RL_CAMERA.TRANSITION_SPEED_SCALE;
    this.ballCamBlend = linterpScalar(
      this._transitionFrom,
      this._ballTarget,
      this._transitionElapsed,
      blendSpeed,
    );
    const b = this.ballCamBlend;

    if (b <= 1e-4) {
      this.camPos.copy(this.carCamPos);
      this.camLook.copy(this.carCamLook);
    } else if (b >= 1 - 1e-4) {
      this.camPos.copy(this.ballCamPos);
      this.camLook.copy(this.ballCamLook);
    } else {
      // Blend rotation around Focus (Psyonix view model), not world-space
      // positions — world lerp tunnels through the car on ~180° flips.
      const yaw = lerpAngle(carYaw, ballYaw, b);
      const pitch = carPitch + (ballPitch - carPitch) * b;
      forwardFromYawPitch(this.tmp, yaw, pitch, up, this.tmpRight);
      this.camPos.copy(this.tmp2).addScaledVector(this.tmp, -dist);
      // Look: car elevated focus → along blended forward through Focus.
      this.ballCamLook.copy(this.tmp2).addScaledVector(this.tmp, dist);
      this.camLook.copy(this.carCamLook).lerp(this.ballCamLook, b);
    }

    // Camera shake (CameraSave.CameraShake), then ClipToField so shake
    // cannot push the lens under the floor.
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
    const minY = RL_CAMERA.CLIP_MIN_Z_UU * UU;
    if (this.camPos.y < minY) this.camPos.y = minY;

    // Body + look snap to the derived view. RL does not add a second look lag
    // on top of TransitionSpeed / stiffness.
    this.smoothPos.copy(this.camPos);
    this.smoothLook.copy(this.camLook);
    this._ready = true;

    camera.position.copy(this.smoothPos);
    camera.up.copy(up);
    camera.lookAt(this.smoothLook);
  }

  invalidate() {
    this._ready = false;
    this.swivelYaw = 0;
    this.swivelPitch = 0;
    this._followYaw = 0;
    this.smoothDir.set(0, 0, 1);
    this.ballCamBlend = 0;
    this._transitionElapsed = 0;
    this._transitionFrom = 0;
    this._ballTarget = 0;
  }
}
