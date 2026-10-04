import * as THREE from "three";
import { getCamera } from "./settings.js";
import { UU } from "./rl-units.js";
import { RL_CONST as C } from "./rlConst.js";
import { raycastArena } from "./arenaMesh.js";

export { UU };

/**
 * Rocket League `ProfileCameraSettings` defaults (Psyonix) + engine camera constants.
 * Source: BakkesMod `ProfileCameraSettings` / `CameraWrapper` / in-game camera sliders.
 * Ball-cam model: Psyonix engineer (r/unrealengine) — Focus / Rotation / Distance.
 *
 * Honest parity note: slider defaults/ranges match RL. Runtime rates marked [A] are
 * approximated. Native automated captures establish transition duration,
 * quadratic ease-out and the 25 degree/second setting FOV response.
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
  SWIVEL_PITCH_PER_SPEED: Math.PI / 15,
  /**
   * BakkesMod CameraWrapper::SwivelDieRate — return-to-center rate (1/s)
   * when the right stick is released.
   */
  SWIVEL_DIE_RATE: 2,
  /** How fast CurrentSwivel catches DesiredSwivel while stick held. */
  SWIVEL_CATCH_RATE: 1,
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
  SURFACE_YAW_RATE: 10,
  SURFACE_PITCH_RATE: 10,
  SURFACE_YAW_MIN_HORIZONTAL: 0.15,
  SURFACE_YAW_FULL_HORIZONTAL: 0.65,
  WALL_RELEASE_RATE: 4,
  WALL_PITCH_RELEASE_RATE: 1,
  LANDING_RECOVERY_RATE: 8,
  LANDING_YAW_STIFFNESS: [0, 0.1, 0.25, 0.35, 0.5, 0.75, 0.9, 1],
  LANDING_YAW_RATES: [13.39, 16.63, 21.42, 24.76, 29.5, 37.33, 41.92, 45],
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
 * Grounded car cam uses a surface-relative height and pitched distance arm.
 * Yaw confidence falls near vertical; pitch and contact normal stay independent.
 * Wall flight retains that view and releases toward world-up without following
 * body rotation through flips. Floor jumps retain their takeoff heading.
 *
 * Ball-cam (Psyonix Focus / Rotation / Distance model):
 *   Focus   = carLoc + up·Height
 *   Rotation = look Focus→ball, pitch clamped to ≥ Angle (stable near ground)
 *   camLoc  = Focus − Rot.Forward·Distance
 *
 * TransitionSpeed: native quadratic ease-out on the Focus/Rotation view (not a
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
    this.surfaceForward = new THREE.Vector3(0, 0, 1);
    this.surfaceUp = new THREE.Vector3(0, 1, 0);
    this.contactInput = new THREE.Vector3(0, 1, 0);
    this.surfaceReady = false;
    this.surfaceYaw = null;
    this.surfacePitch = 0;
    this.wallFlight = false;
    this.wasAirborne = false;
    this.landingRecovery = false;
    this.landingYawRate = 0;
    this.normalRotation = new THREE.Quaternion();
    this.identityRotation = new THREE.Quaternion();
    this.obstructionOrigin = new THREE.Vector3();
    this.obstructionDirection = new THREE.Vector3();
    this.armLength = null;
    this.ballCamPos = new THREE.Vector3();
    this.ballCamLook = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.swivelYaw = 0;
    this.swivelPitch = 0;
    this.shakePhase = 0;
    this.desiredSwivelPitch = 0;
    this.horizontalFov = null;
    this.profileHeight = null;
    this.profileDistance = null;
    this._ready = false;
    /** 0 = car cam, 1 = ball cam after current transition completes. */
    this.ballCamBlend = 0;
    /** Elapsed seconds in the current car↔ball transition. */
    this._transitionElapsed = 0;
    /** Blend value when the current transition started. */
    this._transitionFrom = 0;
    /** Last desired ball-cam target (0/1) — detects toggles. */
    this._ballTarget = 0;
    this._ballYaw = null;
    this._ballPitch = null;
    this.rearYaw = 0;
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
    // Car-cam unless a mode explicitly opts into ball cam (Free Play only).
    this.update(camera, 1 / 60, {
      target,
      forward,
      lookAt,
      ballCam: false,
      snap: true,
    });
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
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    const cfg = opts.settings ?? getCamera();
    const speedFraction = THREE.MathUtils.clamp((opts.velocity?.length() ?? 0) / (2300 * UU), 0, 1);
    const targetFov = cfg.fov + 5 * speedFraction;
    if (opts.snap || !this._ready || this.horizontalFov === null) this.horizontalFov = targetFov;
    else this.horizontalFov += THREE.MathUtils.clamp(targetFov - this.horizontalFov, -25 * dt, 25 * dt);
    const vFov = horizontalFovToVertical(this.horizontalFov, 16 / 9);
    if (Math.abs(camera.fov - vFov) > 0.0001) {
      camera.fov = vFov;
      camera.updateProjectionMatrix();
    }

    const up = opts.worldUp ?? this.worldUp;
    if (opts.snap || !this._ready || this.profileHeight === null) {
      this.profileHeight = cfg.height;
      this.profileDistance = cfg.distance;
    } else {
      this.profileHeight += (cfg.height - this.profileHeight) * (1 - Math.exp(-2.03 * dt));
      this.profileDistance += (cfg.distance - this.profileDistance) * (1 - Math.exp(-4.14 * dt));
    }
    const dist0 = this.profileDistance * UU;
    const height = this.profileHeight * UU;
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
    // Default OFF — Free Play must pass ballCam explicitly. Prevents Settings
    // ballCam / Free Play toggle leaking into Rings / drills via lookAt.
    const ballCam = Boolean(opts.ballCam);
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
    if (opts.snap || !this._ready || airborne) {
      this.landingRecovery = false;
      this.landingYawRate = 0;
    } else if (this.wasAirborne) {
      this.landingRecovery = true;
      this.landingYawRate = 0;
    }

    // Wall departures recover toward momentum; floor jumps retain takeoff yaw.
    if (airborne && this.wallFlight && velOk && !opts.snap) {
      this.tmp.copy(this.tmp2).normalize();
    } else if (airborne && this._ready && !opts.snap) {
      this.tmp.copy(this.smoothDir);
    } else if (velOk && (airborne || noseUnstable)) {
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
      const followRate = airborne && this.wallFlight ? RL_CAMERA.WALL_RELEASE_RATE : rotRate;
      this._followYaw += dYaw * (1 - Math.exp(-followRate * Math.max(dt, 0)));
    }
    this.smoothDir.set(
      Math.sin(this._followYaw),
      0,
      Math.cos(this._followYaw),
    );

    // --- Swivel (right stick) ---
    const lookRight = THREE.MathUtils.clamp(opts.lookRight ?? 0, -1, 1);
    const lookUp = THREE.MathUtils.clamp(opts.lookUp ?? 0, -1, 1);
    const desireYaw = lookRight * RL_CAMERA.SWIVEL_SPEED * RL_CAMERA.SWIVEL_YAW_PER_SPEED;
    const pitchMagnitude = Math.abs(lookUp);
    const halfPitch = lookUp < 0 ? 5353 : 3291;
    const fullPitch = lookUp < 0 ? 8900 : 5500;
    const desirePitch = Math.trunc(Math.sign(lookUp) * (pitchMagnitude <= 0.5 ?
      pitchMagnitude * 2 * halfPitch : halfPitch + (pitchMagnitude - 0.5) * 2 * (fullPitch - halfPitch)));
    const stickHeld = Math.abs(lookRight) + Math.abs(lookUp) > 0.02;
    if (opts.snap) {
      this.swivelYaw = 0;
      this.swivelPitch = 0;
      this.desiredSwivelPitch = 0;
    } else if (stickHeld) {
      const catchRate = RL_CAMERA.SWIVEL_CATCH_RATE * swivelSpeed;
      const catchT = 1 - Math.exp(-Math.max(0, dt) * catchRate);
      this.swivelYaw += (desireYaw - this.swivelYaw) * catchT;
    } else {
      const die = 1 - Math.exp(-Math.max(0, dt) * RL_CAMERA.SWIVEL_DIE_RATE * swivelSpeed);
      this.swivelYaw *= 1 - die;
      if (Math.abs(this.swivelYaw) < 1e-4) this.swivelYaw = 0;
    }
    if (!opts.snap && dt > 0) {
      const pitchUnits = Math.round(this.swivelPitch * 32768 / Math.PI);
      const pitchRate = swivelSpeed * (this.desiredSwivelPitch !== 0 ? 1 : 2);
      this.swivelPitch = Math.trunc(pitchUnits + (this.desiredSwivelPitch - pitchUnits) *
        Math.min(1, dt * pitchRate)) * Math.PI / 32768;
      this.desiredSwivelPitch = desirePitch;
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
    const rearTarget = lookBehind ? Math.PI : 0;
    const immediateFloorRear = !this.wallFlight && (!opts.groundNormal || opts.groundNormal.y > 0.99);
    this.rearYaw = opts.snap || !this._ready || immediateFloorRear ? rearTarget : this.rearYaw + THREE.MathUtils.clamp(rearTarget - this.rearYaw, -Math.PI * dt * 2, Math.PI * dt * 2);
    const rearFlip = this.rearYaw;
    const rearForwardHorizontal = Math.hypot(this.forward.x, this.forward.z);
    const baseCarYaw =
      (lookBehind && airborne && rearForwardHorizontal > 0.15 ?
        Math.atan2(this.forward.x, this.forward.z) : Math.atan2(this.smoothDir.x, this.smoothDir.z)) + rearFlip;

    // ProfileCameraSettings arm: horizontal back + Height, look via tan(Angle).
    // Keep this exact endpoint for blend=0 so car cam matches prior parity.
    const carLookLift = height + dist * Math.tan(angleRad);
    this.carCamLook.copy(opts.target).addScaledVector(up, carLookLift);
    // When looking behind, place the camera on the opposite side of the car.
    this.tmpBallFwd.set(Math.sin(baseCarYaw), 0, Math.cos(baseCarYaw));
    this.carCamPos
      .copy(opts.target)
      .addScaledVector(this.tmpBallFwd, -dist)
      .addScaledVector(up, height);
    if (opts.onGround && opts.groundNormal?.lengthSq() > 0.5) {
      const surfaceUp = this.tmp.copy(opts.groundNormal).normalize();
      const surfaceForward = this.tmpBallFwd.copy(this.forward).addScaledVector(surfaceUp, -this.forward.dot(surfaceUp));
      if (surfaceForward.lengthSq() > 1e-6) {
        surfaceForward.normalize();
        if (!this.surfaceReady && this._ready && !opts.snap) {
          this.surfaceUp.copy(up);
          this.surfaceYaw = this._followYaw;
          this.surfacePitch = angleRad;
          this.surfaceReady = true;
        }
        const surfaceRate = this.landingRecovery ? RL_CAMERA.LANDING_RECOVERY_RATE : Math.abs(surfaceUp.dot(up)) < 0.7 ? Math.min(rotRate, 10) : rotRate;
        const blend = opts.snap || !this.surfaceReady ? 1 : 1 - Math.exp(-surfaceRate * Math.max(0, dt));
        if (blend === 1) this.surfaceUp.copy(surfaceUp);
        else {
          this.normalRotation.setFromUnitVectors(this.surfaceUp, surfaceUp);
          this.normalRotation.slerp(this.identityRotation, 1 - blend);
          this.surfaceUp.applyQuaternion(this.normalRotation).normalize();
        }
        this.surfaceForward.copy(surfaceForward);
        const vertical = surfaceForward.dot(up);
        const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
        this.tmpRight.crossVectors(surfaceUp, surfaceForward).normalize();
        surfaceForward.applyAxisAngle(this.tmpRight, -angleRad);
        const desiredYaw = Math.atan2(surfaceForward.x, surfaceForward.z);
        if (opts.snap || this.surfaceYaw === null) this.surfaceYaw = desiredYaw;
        else {
          const yawRate = Math.abs(surfaceUp.dot(up)) < 0.7 ? RL_CAMERA.SURFACE_YAW_RATE : rotRate;
          const confidence = THREE.MathUtils.smoothstep(horizontal, RL_CAMERA.SURFACE_YAW_MIN_HORIZONTAL, RL_CAMERA.SURFACE_YAW_FULL_HORIZONTAL);
          const landingRates = RL_CAMERA.LANDING_YAW_RATES;
          const landingStiffness = RL_CAMERA.LANDING_YAW_STIFFNESS;
          let landingRate = landingRates[landingRates.length - 1];
          for (let index = 1; index < landingStiffness.length; index++) {
            if (stiff <= landingStiffness[index]) {
              const fraction = (stiff - landingStiffness[index - 1]) / (landingStiffness[index] - landingStiffness[index - 1]);
              landingRate = THREE.MathUtils.lerp(landingRates[index - 1], landingRates[index], fraction);
              break;
            }
          }
          if (this.landingRecovery) this.landingYawRate += stiff === 1 ? 2 : 2 * (1 - Math.exp(-landingRate * Math.max(0, dt)));
          const yawBlend = this.landingRecovery ? Math.min(1, this.landingYawRate * confidence * Math.max(0, dt)) : 1 - Math.exp(-yawRate * confidence * Math.max(0, dt));
          this.surfaceYaw = lerpAngle(this.surfaceYaw, desiredYaw, yawBlend);
        }
        const desiredPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(surfaceForward.dot(up), -1, 1)), -65 * Math.PI / 180, 65 * Math.PI / 180);
        const pitchRate = this.landingRecovery ? RL_CAMERA.LANDING_RECOVERY_RATE : Math.abs(surfaceUp.dot(up)) < 0.7 ? RL_CAMERA.SURFACE_PITCH_RATE : rotRate;
        this.surfacePitch = opts.snap || !this.surfaceReady || (!this.landingRecovery && surfaceUp.dot(up) > 0.99) ? desiredPitch : this.surfacePitch + (desiredPitch - this.surfacePitch) * (1 - Math.exp(-pitchRate * Math.max(0, dt)));
        if (this.landingRecovery && Math.abs(lerpAngle(this.surfaceYaw, desiredYaw, 1) - this.surfaceYaw) < 0.001 && Math.abs(this.surfacePitch - desiredPitch) < 0.001 && this.surfaceUp.dot(surfaceUp) > 0.9999) this.landingRecovery = false;
        this.surfaceReady = true;
        this.wallFlight = Math.abs(surfaceUp.dot(up)) < 0.7;
        this.tmpBallFwd.copy(this.forward).addScaledVector(surfaceUp, -this.forward.dot(surfaceUp)).normalize().negate();
        this.tmpRight.crossVectors(surfaceUp, this.tmpBallFwd).normalize();
        this.tmpBallFwd.applyAxisAngle(this.tmpRight, -angleRad);
        let viewPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(this.tmpBallFwd.dot(up), -1, 1)), -65 * Math.PI / 180, 65 * Math.PI / 180);
        const rearViewYaw = Math.atan2(this.tmpBallFwd.x, this.tmpBallFwd.z);
        const rearBlend = this.rearYaw / Math.PI;
        const viewYaw = lerpAngle(this.surfaceYaw, rearViewYaw, rearBlend);
        viewPitch = this.surfacePitch + (viewPitch - this.surfacePitch) * rearBlend;
        forwardFromYawPitch(this.tmpBallFwd, viewYaw, viewPitch, up, this.tmpRight);
        this.carCamPos.copy(opts.target).addScaledVector(this.surfaceUp, height).addScaledVector(this.tmpBallFwd, -dist);
        this.carCamLook.copy(this.carCamPos).addScaledVector(this.tmpBallFwd, dist);
      }
    } else if (airborne && this.wallFlight && this.surfaceReady && !opts.snap) {
      const release = 1 - Math.exp(-RL_CAMERA.WALL_RELEASE_RATE * Math.max(0, dt));
      this.normalRotation.setFromUnitVectors(this.surfaceUp, up);
      this.normalRotation.slerp(this.identityRotation, 1 - release);
      this.surfaceUp.applyQuaternion(this.normalRotation).normalize();
      this.surfaceYaw = lerpAngle(this.surfaceYaw, this._followYaw, release);
      const desiredPitch = angleRad;
      this.surfacePitch += (desiredPitch - this.surfacePitch) * (1 - Math.exp(-RL_CAMERA.WALL_PITCH_RELEASE_RATE * Math.max(0, dt)));
      const airborneRearYaw = (rearForwardHorizontal > 0.15 ? Math.atan2(this.forward.x, this.forward.z) : this._followYaw) + Math.PI;
      forwardFromYawPitch(this.tmpBallFwd, lerpAngle(this.surfaceYaw, airborneRearYaw, this.rearYaw / Math.PI), this.surfacePitch * (1 - 2 * this.rearYaw / Math.PI), up, this.tmpRight);
      this.carCamPos.copy(opts.target).addScaledVector(this.surfaceUp, height).addScaledVector(this.tmpBallFwd, -dist);
      this.carCamLook.copy(this.carCamPos).addScaledVector(this.tmpBallFwd, dist);
      if (this.surfaceUp.dot(up) > 0.9999 && Math.abs(this.surfacePitch - angleRad) < 0.003 && Math.abs(lerpAngle(this.surfaceYaw, this._followYaw, 1) - this.surfaceYaw) < 0.003) {
        this.surfaceReady = false;
        this.surfaceYaw = null;
        this.wallFlight = false;
      }
    } else {
      this.surfaceReady = false;
      this.surfaceYaw = null;
      this.wallFlight = false;
    }
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
    const minimumBallPitch = airborne ? -RL_CAMERA.BALL_CAM_MAX_PITCH : angleRad;
    if (opts.lookAt) {
      this.tmp.copy(opts.lookAt).sub(this.tmp2);
      const floorBallView = !airborne && (!opts.groundNormal || opts.groundNormal.y > 0.99);
      if (floorBallView) this.tmp.y -= C.BALL_COLLISION_RADIUS_SOCCAR * UU;
      const horizSq = this.tmp.x * this.tmp.x + this.tmp.z * this.tmp.z;
      const horiz = Math.sqrt(horizSq);
      if (horizSq > 1e-8) {
        baseBallYaw = Math.atan2(this.tmp.x, this.tmp.z);
      }
      if (horiz > 1e-5 || Math.abs(this.tmp.y) > 1e-5) {
        const rawPitch = Math.atan2(this.tmp.y, Math.max(horiz, 1e-6));
        baseBallPitch = THREE.MathUtils.clamp(
          Math.max(minimumBallPitch, rawPitch),
          minimumBallPitch,
          RL_CAMERA.BALL_CAM_MAX_PITCH,
        );
      }
    }
    if (opts.snap || !this._ready || this.ballCamBlend <= 0.001 || this._ballYaw === null) {
      this._ballYaw = baseBallYaw;
      this._ballPitch = baseBallPitch;
    } else if (opts.lookAt) {
      const horizontalDistance = Math.hypot(opts.lookAt.x - this.tmp2.x, opts.lookAt.z - this.tmp2.z);
      const trackingDt = Math.max(0, dt);
      const trackingBlend = 1 - Math.exp(-10 * trackingDt);
      const yawDelta = lerpAngle(this._ballYaw, baseBallYaw, 1) - this._ballYaw;
      const yawConfidence = THREE.MathUtils.smoothstep(horizontalDistance, 10 * UU, 20 * UU);
      this._ballYaw += THREE.MathUtils.clamp(yawDelta * trackingBlend * yawConfidence, -3 * Math.PI * trackingDt, 3 * Math.PI * trackingDt);
      this._ballPitch += THREE.MathUtils.clamp(
        (baseBallPitch - this._ballPitch) * trackingBlend,
        -Math.PI / 2 * trackingDt,
        Math.PI / 2 * trackingDt,
      );
    }
    const ballYaw = (lookBehind ? baseCarYaw : this._ballYaw) - this.swivelYaw;
    const ballPitch = THREE.MathUtils.clamp(
      (lookBehind ? angleRad : this._ballPitch) + this.swivelPitch,
      minimumBallPitch - RL_CAMERA.SWIVEL_PITCH_PER_SPEED * 10,
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
    const duration = Math.max(0, (2 - transition) / 2);
    const progress = duration > 0 ? Math.min(1, this._transitionElapsed / duration) : 1;
    const blend = 1 - (1 - progress) ** 2;
    this.ballCamBlend = this._transitionFrom + (this._ballTarget - this._transitionFrom) * blend;
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
      this.tmp.copy(this.carCamLook).sub(this.carCamPos).normalize();
      const yaw = lerpAngle(Math.atan2(this.tmp.x, this.tmp.z), ballYaw, b);
      const actualCarPitch = Math.asin(THREE.MathUtils.clamp(this.tmp.dot(up), -1, 1));
      const pitch = actualCarPitch + (ballPitch - actualCarPitch) * b;
      forwardFromYawPitch(this.tmp, yaw, pitch, up, this.tmpRight);
      this.camLook.copy(this.carCamPos).addScaledVector(this.tmpBallFwd.copy(this.carCamLook).sub(this.carCamPos).normalize(), dist).lerp(this.tmp2, b);
      this.camPos.copy(this.camLook).addScaledVector(this.tmp, -dist);
      this.camLook.addScaledVector(this.tmp, dist);
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

    if (opts.arenaCollision) {
      this.tmp.copy(opts.target).addScaledVector(up, height);
      this.tmp2.copy(this.camPos).sub(this.tmp);
      const desiredLength = this.tmp2.length();
      if (desiredLength > 1e-6) {
        this.tmp2.divideScalar(desiredLength);
        this.obstructionOrigin.set(this.tmp.x / UU, this.tmp.z / UU, this.tmp.y / UU);
        this.obstructionDirection.set(this.tmp2.x, this.tmp2.z, this.tmp2.y);
        const hit = raycastArena(this.obstructionOrigin, this.obstructionDirection, desiredLength / UU + 12);
        const allowedLength = hit ? Math.max(0.1, hit.dist * UU - 12 * UU) : desiredLength;
        if (opts.snap || this.armLength === null || allowedLength < this.armLength) this.armLength = allowedLength;
        else this.armLength += (allowedLength - this.armLength) * (1 - Math.exp(-8 * Math.max(0, dt)));
        this.camPos.copy(this.tmp).addScaledVector(this.tmp2, Math.min(desiredLength, this.armLength));
      }
    } else this.armLength = null;

    // Body + look snap to the derived view. RL does not add a second look lag
    // on top of TransitionSpeed / stiffness.
    this.smoothPos.copy(this.camPos);
    this.smoothLook.copy(this.camLook);
    this._ready = true;
    this.wasAirborne = airborne;

    camera.position.copy(this.smoothPos);
    camera.up.copy(up);
    camera.lookAt(this.smoothLook);
  }

  invalidate() {
    this._ready = false;
    this.surfaceReady = false;
    this.surfaceYaw = null;
    this.surfacePitch = 0;
    this.wallFlight = false;
    this.armLength = null;
    this._ballYaw = null;
    this._ballPitch = null;
    this.swivelYaw = 0;
    this.swivelPitch = 0;
    this._followYaw = 0;
    this.desiredSwivelPitch = 0;
    this.smoothDir.set(0, 0, 1);
    this.ballCamBlend = 0;
    this._transitionElapsed = 0;
    this._transitionFrom = 0;
    this._ballTarget = 0;
    this.rearYaw = 0;
  }
}

const DEFAULT_WORLD_UP = new THREE.Vector3(0, 1, 0);
const ZERO_VEL = new THREE.Vector3(0, 0, 0);

/**
 * Shared chase update used by every mode so camera opts stay one contract.
 * ProfileCameraSettings (FOV/distance/height/angle/stiffness/swivel/transition)
 * always come from {@link getCamera} inside {@link ChaseCamera.update}.
 *
 * @param {ChaseCamera} chase
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
export function applyModeChaseCamera(chase, camera, dt, opts) {
  chase.update(camera, dt, {
    target: opts.target,
    forward: opts.forward,
    velocity: opts.velocity ?? ZERO_VEL,
    lookAt: opts.lookAt,
    worldUp: opts.worldUp ?? DEFAULT_WORLD_UP,
    onGround: Boolean(opts.onGround),
    groundNormal: opts.groundNormal,
    arenaCollision: opts.arenaCollision,
    boosting: Boolean(opts.boosting),
    lookRight: opts.lookRight ?? 0,
    lookUp: opts.lookUp ?? 0,
    lookBehind: Boolean(opts.lookBehind),
    ballCam: Boolean(opts.ballCam),
    snap: Boolean(opts.snap),
  });
}
