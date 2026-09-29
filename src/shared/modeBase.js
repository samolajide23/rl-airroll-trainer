import * as THREE from "three";
import { makeCar } from "./car.js";
import { AerialBody, FixedStepClock, aerialControlAxes } from "./carPhysics.js";
import { applyModeChaseCamera, ChaseCamera } from "./chaseCamera.js";
import { inputSourceLabel, isActionDown, readControls } from "./input.js";
import { formatControlsHelp, onBindsChange } from "./settings.js";

/**
 * Shared setup for aerial drills (orientation-focused, pinned in place).
 * Air torque comes from the shared {@link AerialBody} in `carPhysics.js`.
 * Camera uses the same ProfileCameraSettings chase as Free Play / Rings.
 */
export class AerialDrillBase {
  /**
   * @param {object} ctx
   * @param {string} title
   */
  constructor(ctx, title) {
    this.ctx = ctx;
    this.title = title;
    this.root = new THREE.Group();
    this.aerial = new AerialBody();
    this.clock = new FixedStepClock();
    this.car = makeCar(0xffffff);
    this.root.add(this.car);

    this.chase = new ChaseCamera();
    this.forward = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    /** Zero velocity — pinned drills; keeps stiffness-zoom path consistent. */
    this.velZero = new THREE.Vector3(0, 0, 0);

    this.spaceLatch = false;
    this.rLatch = false;
    /** @type {null | (() => void)} */
    this._unbindHelp = null;

    /** @type {"both" | "left" | "right"} */
    this.airRollLock = "both";

    /** @type {ReturnType<typeof readControls>} */
    this._lastInput = readControls();
  }

  start() {
    const { hud } = this.ctx;
    hud.modeTitle.textContent = this.title;
    hud.root.classList.remove("hidden");
    if (hud.alignMeter) hud.alignMeter.classList.remove("hidden");
    if (hud.help) hud.help.textContent = formatControlsHelp();
    this.ctx.scene.add(this.root);
    this._unbindHelp = onBindsChange(() => {
      if (hud.help) hud.help.textContent = formatControlsHelp();
    });
    this.resetCar();
    this.carAxes();
    this.chase.snap(this.ctx.camera, this.car.position, this.forward);
  }

  stop() {
    const { hud } = this.ctx;
    hud.root.classList.add("hidden");
    if (hud.alignMeter) hud.alignMeter.classList.add("hidden");
    this.ctx.scene.remove(this.root);
    if (this._unbindHelp) {
      this._unbindHelp();
      this._unbindHelp = null;
    }
    this.chase.invalidate();
  }

  resetCar() {
    this.car.position.set(0, 0, 0);
    this.car.quaternion.identity();
    this.aerial.reset();
    this.clock.reset();
    this.chase.invalidate();
  }

  /**
   * One physics tick of aerial control (dt should be RL.DT).
   * @param {number} dt
   */
  _stepOnce(dt) {
    const input = readControls();
    // Pinned aerial drills are always "airborne" — apply RL free air-roll
    // (Air Roll remaps yaw→roll) so DAR practice matches Free Play / RL.
    const axes = aerialControlAxes(input, {
      onGround: false,
      airRollLock: this.airRollLock,
    });

    this.aerial.step(this.car, axes.roll, axes.pitch, axes.yaw, dt);

    const { hud } = this.ctx;
    hud.padStatus.textContent = inputSourceLabel(input);
    hud.padStatus.classList.toggle("on", input.usingPad || !!input.usingTouch);
    hud.arl.classList.toggle("on", axes.airLeft);
    hud.arr.classList.toggle("on", axes.airRight);

    this._lastInput = {
      ...input,
      airLeft: axes.airLeft,
      airRight: axes.airRight,
      roll: axes.roll,
      yaw: axes.yaw,
      pitch: axes.pitch,
    };
    return this._lastInput;
  }

  /**
   * Advance aerial physics at fixed 120 Hz from a render-frame dt.
   * @param {number} dt
   */
  stepCar(dt) {
    this.clock.advance(dt, (tickDt) => {
      this._stepOnce(tickDt);
    });
    return this._lastInput;
  }

  /**
   * Same ProfileCameraSettings chase as Free Play / Rings (car-cam only).
   * @param {number} dt
   */
  updateCamera(dt) {
    this.carAxes();
    const input = this._lastInput;
    applyModeChaseCamera(this.chase, this.ctx.camera, dt, {
      target: this.car.position,
      forward: this.forward,
      velocity: this.velZero,
      worldUp: this.worldUp,
      onGround: false,
      boosting: Boolean(input?.boost),
      lookRight: input?.lookRight ?? 0,
      lookUp: input?.lookUp ?? 0,
      lookBehind: Boolean(input?.lookBehind),
      ballCam: false,
    });
  }

  carAxes() {
    this.forward.set(0, 0, 1).applyQuaternion(this.car.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.car.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.car.quaternion);
    return { forward: this.forward, up: this.up, right: this.right };
  }

  /**
   * Handle common reset / skip latches. Returns { skipped, reset }.
   */
  pollUtilityKeys() {
    let skipped = false;
    let reset = false;
    const newTargetDown = isActionDown("newTarget");
    if (newTargetDown && !this.spaceLatch) {
      this.spaceLatch = true;
      skipped = true;
    }
    if (!newTargetDown) this.spaceLatch = false;

    const resetDown = isActionDown("resetCar");
    if (resetDown && !this.rLatch) {
      this.rLatch = true;
      reset = true;
      this.resetCar();
    }
    if (!resetDown) this.rLatch = false;
    return { skipped, reset };
  }

  /**
   * @param {number} hits
   * @param {number} streak
   * @param {number} best
   * @param {string} [extra]
   */
  setScoreRow(hits, streak, best, extra = "—") {
    const { hud } = this.ctx;
    hud.hits.textContent = String(hits);
    hud.streak.textContent = String(streak);
    hud.best.textContent = String(best);
    hud.avg.textContent = extra;
  }
}
