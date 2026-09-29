import * as THREE from "three";
import { getCamera } from "./settings.js";

/** Unreal units → Three.js (1 three-unit ≈ 1 m). */
export const UU = 0.01;

/**
 * Rocket League–style chase camera driven by Settings camera sliders.
 * Keeps world-up (no camera roll), sits behind a blend of look-direction /
 * car forward / velocity, and eases with stiffness / transition speed.
 */
export class ChaseCamera {
  constructor() {
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    this.smoothDir = new THREE.Vector3(0, 0, 1);
    this.tmp = new THREE.Vector3();
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
   *   snap?: boolean,
   * }} opts
   */
  update(camera, dt, opts) {
    const cfg = getCamera();
    if (camera.fov !== cfg.fov) {
      camera.fov = cfg.fov;
      camera.updateProjectionMatrix();
    }

    const dist = cfg.distance * UU;
    const height = cfg.height * UU;
    const angleRad = (cfg.angle * Math.PI) / 180;
    const stiff = THREE.MathUtils.clamp(cfg.stiffness, 0, 1);
    const posRate = (1.2 + stiff * 3.5) * cfg.transitionSpeed;
    const lookRate = (1.6 + stiff * 2.8) * cfg.transitionSpeed;
    const dirRate = 1.4 + stiff * 2.2;

    const up = opts.worldUp ?? this.worldUp;
    const focus = opts.lookAt ?? opts.target;

    // Preferred view direction: toward focus, blended with car forward / velocity.
    this.tmp.copy(focus).sub(opts.target);
    if (this.tmp.lengthSq() < 1e-6) {
      if (opts.forward && opts.forward.lengthSq() > 1e-6) {
        this.tmp.copy(opts.forward);
      } else {
        this.tmp.set(0, 0, 1);
      }
    } else {
      this.tmp.normalize();
    }

    if (opts.forward && opts.forward.lengthSq() > 1e-6) {
      this.forward.copy(opts.forward).normalize();
      this.tmp.multiplyScalar(0.55).addScaledVector(this.forward, 0.45).normalize();
    }
    if (opts.velocity && opts.velocity.lengthSq() > 4) {
      this.forward.copy(opts.velocity).normalize();
      this.tmp.multiplyScalar(0.75).addScaledVector(this.forward, 0.25).normalize();
    }

    if (opts.snap || !this._ready) {
      this.smoothDir.copy(this.tmp);
    } else {
      this.smoothDir.lerp(this.tmp, 1 - Math.exp(-dirRate * dt)).normalize();
    }

    this.camPos
      .copy(opts.target)
      .addScaledVector(this.smoothDir, -dist)
      .addScaledVector(up, height);

    this.camLook.copy(opts.target);
    if (opts.lookAt) {
      this.camLook.lerp(opts.lookAt, 0.45);
    }
    this.camLook.addScaledVector(up, Math.tan(angleRad) * dist * 0.35);

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
