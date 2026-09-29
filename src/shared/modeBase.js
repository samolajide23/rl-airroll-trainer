import * as THREE from "three";
import { makeCar } from "./car.js";
import { AerialBody, FixedStepClock } from "./carPhysics.js";
import { ChaseCamera } from "./chaseCamera.js";
import { inputSourceLabel, isActionDown, readControls } from "./input.js";
import { formatControlsHelp, onBindsChange } from "./settings.js";

/**
 * Shared setup for aerial drills (orientation-focused, pinned in place).
 * Air torque comes from the shared {@link AerialBody} in `carPhysics.js`.
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

    this.spaceLatch = false;
    this.rLatch = false;
    /** @type {null | (() => void)} */
    this._unbindHelp = null;

    /** @type {"both" | "left" | "right"} */
    this.airRollLock = "both";

    /** @type {ReturnType<typeof readControls> & { roll: number }} */
    this._lastInput = {
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      lookRight: 0,
      lookUp: 0,
      boost: false,
      jump: false,
      airLeft: false,
      airRight: false,
      usingPad: false,
    };
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
    let airLeft = input.airLeft;
    let airRight = input.airRight;
    if (this.airRollLock === "left") airRight = false;
    if (this.airRollLock === "right") airLeft = false;

    // Spec: +roll = roll right
    let roll = 0;
    if (airRight) roll += 1;
    if (airLeft) roll -= 1;
    roll = THREE.MathUtils.clamp(roll, -1, 1);

    this.aerial.step(this.car, roll, input.pitch, input.yaw, dt);

    const { hud } = this.ctx;
    hud.padStatus.textContent = inputSourceLabel(input);
    hud.padStatus.classList.toggle("on", input.usingPad || !!input.usingTouch);
    hud.arl.classList.toggle("on", airLeft);
    hud.arr.classList.toggle("on", airRight);

    this._lastInput = { ...input, airLeft, airRight, roll };
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
   * RL chase camera behind the car (Settings → Camera).
   * @param {number} dt
   * @param {THREE.Vector3} [lookAt]
   */
  updateCamera(dt, lookAt) {
    this.carAxes();
    const input = this._lastInput;
    this.chase.update(this.ctx.camera, dt, {
      target: this.car.position,
      forward: this.forward,
      lookAt,
      onGround: false,
      boosting: Boolean(input?.boost),
      lookRight: input?.lookRight ?? 0,
      lookUp: input?.lookUp ?? 0,
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
