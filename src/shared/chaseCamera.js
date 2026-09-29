import * as THREE from "three";
import { getCamera } from "./settings.js";

/** Unreal units → Three.js (1 three-unit ≈ 1 m). */
export const UU = 0.01;

/** Max extra distance (uu) pulled at supersonic when stiffness = 0. */
const STIFFNESS_ZOOM_UU = 100;

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
 * Rocket League car-cam chase.
 *
 * Matches in-game sliders:
 * - FOV is **horizontal** (converted for Three.js)
 * - Distance / height in uu behind & above the car
 * - Angle pitches the look-at (negative = look down)
 * - Stiffness lags follow direction and reduces speed zoom-out
 * - Transition speed scales how fast position/look catch up
 */
export class ChaseCamera {
  constructor() {
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    /** Lagged horizontal follow direction (car-forward projected on ground plane). */
    this.smoothDir = new THREE.Vector3(0, 0, 1);
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this._ready = false;
  }

  /**
   * Snap without easing (mode start / reset).
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Vector3} target
   * @param {THREE.Vector3} [forward]
   * @param {THREE.Vector3} [lookAt]
   */
  snap(camera, target, forward, lookAt) {
    this._ready = false;
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

    // --- Desired follow direction: car forward, flattened to world-up plane ---
    // RL car-cam stays upright and orbits behind the nose.
    this.forward.set(0, 0, 1);
    if (opts.forward && opts.forward.lengthSq() > 1e-8) {
      this.forward.copy(opts.forward);
    }
    this.tmp.copy(this.forward).addScaledVector(up, -this.forward.dot(up));
    if (this.tmp.lengthSq() < 1e-6 && opts.velocity && opts.velocity.lengthSq() > 1e-4) {
      this.tmp.copy(opts.velocity).addScaledVector(up, -opts.velocity.dot(up));
    }
    if (this.tmp.lengthSq() < 1e-6) {
      this.tmp.copy(this.smoothDir);
    }
    this.tmp.normalize();

    // Light velocity lean (RL softens with motion); keep car forward dominant.
    if (opts.velocity && opts.velocity.lengthSq() > 1e-4) {
      this.tmp2.copy(opts.velocity).addScaledVector(up, -opts.velocity.dot(up));
      if (this.tmp2.lengthSq() > 1e-6) {
        this.tmp2.normalize();
        const lean = opts.onGround === false ? 0.12 : 0.2;
        this.tmp.multiplyScalar(1 - lean).addScaledVector(this.tmp2, lean).normalize();
      }
    }

    // Stiffness: how quickly the camera arm tracks car yaw (higher = snappier).
    const dirRate = (1.5 + stiff * 18) * transition;
    if (opts.snap || !this._ready) {
      this.smoothDir.copy(this.tmp);
    } else {
      this.smoothDir.lerp(this.tmp, 1 - Math.exp(-dirRate * dt)).normalize();
    }

    // Low stiffness zooms out toward supersonic (up to +100 uu).
    const speedUu = opts.velocity ? opts.velocity.length() / UU : 0;
    const superFrac = THREE.MathUtils.clamp(speedUu / 2300, 0, 1);
    const dist = dist0 + (1 - stiff) * superFrac * STIFFNESS_ZOOM_UU * UU;

    // Arm: behind car along lagged forward, up by height (world-up).
    this.camPos
      .copy(opts.target)
      .addScaledVector(this.smoothDir, -dist)
      .addScaledVector(up, height);

    // Angle: pitch look so the view matches the in-game angle slider.
    // lookLift = height + dist * tan(angle); angle < 0 → look below camera height.
    const lookLift = height + dist * Math.tan(angleRad);
    this.camLook.copy(opts.target).addScaledVector(up, lookLift);

    // Optional focus bias (ball / ghost) — keep subtle so car-cam stays primary.
    if (opts.lookAt) {
      this.camLook.lerp(opts.lookAt, 0.12);
    }

    // Transition speed: how fast the camera body catches the arm.
    const posRate = (2.5 + stiff * 10) * transition;
    const lookRate = (3.5 + stiff * 8) * transition;

    if (opts.snap || !this._ready) {
      this.smoothPos.copy(this.camPos);
      this.smoothLook.copy(this.camLook);
      this._ready = true;
    } else {
      this.smoothPos.lerp(this.camPos, 1 - Math.exp(-posRate * dt));
      this.smoothLook.lerp(this.camLook, 1 - Math.exp(-lookRate * dt));
    }

    camera.position.copy(this.smoothPos);
    camera.up.copy(up);
    camera.lookAt(this.smoothLook);
  }

  /** Call when leaving a mode so the next start snaps cleanly. */
  invalidate() {
    this._ready = false;
  }
}
