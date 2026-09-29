import * as THREE from "three";
import { AerialBody, FixedStepClock } from "../shared/aerial.js";
import { makeCar, makeTargetGuide } from "../shared/car.js";
import { ChaseCamera } from "../shared/chaseCamera.js";
import { inputSourceLabel, isActionDown, readControls } from "../shared/input.js";
import {
  angleErrorDeg,
  formatConsistency,
  recordAttempt,
} from "../shared/metrics.js";
import { formatControlsHelp, onBindsChange } from "../shared/settings.js";

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   alignThreshold: number,
 *   holdTime: number,
 *   pitchSpan: number,
 *   rollSpan: number,
 *   keepUpright: boolean,
 *   poseMode: "noseUp" | "random",
 * }} GhostAlignDifficulty
 */

/** @type {GhostAlignDifficulty[]} */
export const GHOST_ALIGN_DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    description: "Nose pointed skyward — practice DAR while flying straight up.",
    alignThreshold: 0.82,
    holdTime: 0.2,
    // Unused when poseMode is noseUp; kept for API consistency
    pitchSpan: 0,
    rollSpan: Math.PI * 2,
    keepUpright: false,
    poseMode: "noseUp",
  },
  {
    id: "medium",
    label: "Medium",
    description: "Balanced precision — tipped and sideways poses.",
    alignThreshold: 0.92,
    holdTime: 0.35,
    pitchSpan: Math.PI * 0.85,
    rollSpan: Math.PI * 0.85,
    keepUpright: false,
    poseMode: "random",
  },
  {
    id: "hard",
    label: "Hard",
    description: "Tight match, longer hold, full random (incl. inverted).",
    alignThreshold: 0.97,
    holdTime: 0.55,
    pitchSpan: Math.PI,
    rollSpan: Math.PI,
    keepUpright: false,
    poseMode: "random",
  },
];

/**
 * Game mode 1: match a ghost car's orientation using directional air roll.
 */
export class GhostAlignMode {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   camera: THREE.Camera,
   *   hud: {
   *     modeTitle: HTMLElement,
   *     hits: HTMLElement,
   *     streak: HTMLElement,
   *     best: HTMLElement,
   *     avg: HTMLElement,
   *     status: HTMLElement,
   *     padStatus: HTMLElement,
   *     arl: HTMLElement,
   *     arr: HTMLElement,
   *     alignFill: HTMLElement,
   *     alignMeter: HTMLElement,
   *     root: HTMLElement,
   *     help?: HTMLElement,
   *   }
   * }} ctx
   * @param {{ difficulty?: GhostAlignDifficulty }} [options]
   */
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.difficulty =
      options.difficulty ??
      GHOST_ALIGN_DIFFICULTIES.find((d) => d.id === "medium") ??
      GHOST_ALIGN_DIFFICULTIES[1];

    this.root = new THREE.Group();
    this.aerial = new AerialBody();
    this.clock = new FixedStepClock();
    this.car = makeCar(0xffffff);
    // Cyan outlined reference — parked to the side so it never hides your car
    this.ghost = makeCar(0x5eead4, 0.32, { ghost: true });
    this.ghost.position.set(3.5, 0, 0);
    // Local target frame around the player (same orientation as ghost)
    this.guide = makeTargetGuide();
    this.root.add(this.car, this.ghost, this.guide);

    this.ghostOffset = new THREE.Vector3(3.5, 0, 0);
    this.chase = new ChaseCamera();
    this.midpoint = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.ghostForward = new THREE.Vector3();
    this.ghostUp = new THREE.Vector3();

    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.alignHold = 0;
    /** @type {"both" | "left" | "right"} */
    this.airRollLock = "both";
    /** @type {ReturnType<typeof readControls>} */
    this._lastInput = readControls();
    this.roundStart = 0;
    this.times = [];
    this.spaceLatch = false;
    this.rLatch = false;
    /** @type {null | (() => void)} */
    this._unbindHelp = null;
  }

  start() {
    const { hud } = this.ctx;
    const diff = this.difficulty;
    hud.modeTitle.textContent = `Ghost Align · ${diff.label}`;
    hud.root.classList.remove("hidden");
    hud.alignMeter.classList.remove("hidden");
    if (hud.help) hud.help.textContent = formatControlsHelp();
    this.ctx.scene.add(this.root);

    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.times = [];
    this.spaceLatch = false;
    this.rLatch = false;
    hud.avg.textContent = "—";

    this._unbindHelp = onBindsChange(() => {
      if (hud.help) hud.help.textContent = formatControlsHelp();
    });

    this.resetCar();
    this.randomTarget();
    this.forward.set(0, 0, 1).applyQuaternion(this.car.quaternion);
    this.midpoint
      .copy(this.car.position)
      .add(this.ghost.position)
      .multiplyScalar(0.5);
    this.chase.snap(
      this.ctx.camera,
      this.car.position,
      this.forward,
      this.midpoint,
    );
  }

  stop() {
    const { hud } = this.ctx;
    hud.root.classList.add("hidden");
    hud.alignMeter.classList.add("hidden");
    this.ctx.scene.remove(this.root);
    if (this._unbindHelp) {
      this._unbindHelp();
      this._unbindHelp = null;
    }
    this.chase.invalidate();
  }

  randomTarget() {
    const { pitchSpan, rollSpan, poseMode } = this.difficulty;
    const q = new THREE.Quaternion();

    if (poseMode === "noseUp") {
      // Nose toward world +Y (flying vertically up), free roll around that axis,
      // with a little aim wobble so every target isn't identical.
      const nose = new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        1,
        (Math.random() - 0.5) * 0.35,
      ).normalize();
      const roll = Math.random() * Math.PI * 2;

      // Default forward is +Z; rotate so +Z maps onto nose
      const align = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        nose,
      );
      const twist = new THREE.Quaternion().setFromAxisAngle(nose, roll);
      q.copy(twist).multiply(align);
    } else {
      q.setFromEuler(
        new THREE.Euler(
          (Math.random() - 0.5) * pitchSpan,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * rollSpan,
          "YXZ",
        ),
      );
    }

    this.ghost.quaternion.copy(q);
    this.ghost.position.copy(this.ghostOffset);
    this.guide.quaternion.copy(q);
    this.roundStart = performance.now();
    this.alignHold = 0;
    this.ctx.hud.status.textContent =
      poseMode === "noseUp"
        ? "Match the cyan ghost / glowing axes — nose skyward"
        : "Match the cyan ghost on the right (axes show the target on you)";
  }

  resetCar() {
    this.car.position.set(0, 0, 0);
    this.car.quaternion.identity();
    this.aerial.reset();
    this.clock.reset();
    this.alignHold = 0;
    this.chase.invalidate();
    this.ctx.hud.status.textContent =
      "Car reset. Hold air roll and steer into the ghost.";
  }

  /**
   * One 120 Hz tick of aerial control.
   * @param {number} tickDt
   */
  stepPhysics(tickDt) {
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

    this.aerial.step(this.car, roll, input.pitch, input.yaw, tickDt);
    this._lastInput = { ...input, airLeft, airRight, roll };
    return this._lastInput;
  }

  getAlign() {
    this.forward.set(0, 0, 1).applyQuaternion(this.car.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.car.quaternion);
    this.ghostForward.set(0, 0, 1).applyQuaternion(this.ghost.quaternion);
    this.ghostUp.set(0, 1, 0).applyQuaternion(this.ghost.quaternion);
    const f = THREE.MathUtils.clamp(
      this.forward.dot(this.ghostForward),
      -1,
      1,
    );
    const u = THREE.MathUtils.clamp(this.up.dot(this.ghostUp), -1, 1);
    const score = ((f + 1) / 2) * 0.55 + ((u + 1) / 2) * 0.45;
    const t = this.difficulty.alignThreshold;
    const matched = f >= t && u >= t;
    return { score, matched };
  }

  onHit() {
    const elapsed = (performance.now() - this.roundStart) / 1000;
    this.times.push(elapsed);
    if (this.times.length > 20) this.times.shift();
    this.hits += 1;
    this.streak += 1;
    this.best = Math.max(this.best, this.streak);
    this.forward.set(0, 0, 1).applyQuaternion(this.car.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.car.quaternion);
    this.ghostForward.set(0, 0, 1).applyQuaternion(this.ghost.quaternion);
    this.ghostUp.set(0, 1, 0).applyQuaternion(this.ghost.quaternion);
    const err =
      (angleErrorDeg(this.forward, this.ghostForward) +
        angleErrorDeg(this.up, this.ghostUp)) /
      2;
    recordAttempt("ghost-align", {
      success: true,
      angleErrorDeg: err,
      timeOnTarget: this.alignHold,
      duration: elapsed,
    });
    this.ctx.hud.status.textContent = `Hit! ${elapsed.toFixed(2)}s — new target`;
    this.ctx.hud.avg.textContent = formatConsistency("ghost-align");
    this.randomTarget();
  }

  updateHud(input, align) {
    const { hud } = this.ctx;
    hud.padStatus.textContent = inputSourceLabel(input);
    hud.padStatus.classList.toggle("on", input.usingPad || !!input.usingTouch);
    hud.arl.classList.toggle("on", input.airLeft);
    hud.arr.classList.toggle("on", input.airRight);
    hud.alignFill.style.width = `${Math.round(align * 100)}%`;
    hud.hits.textContent = String(this.hits);
    hud.streak.textContent = String(this.streak);
    hud.best.textContent = String(this.best);
    hud.avg.textContent = formatConsistency("ghost-align");
  }

  updateCamera(dt) {
    // Chase the player; bias look toward the side reference ghost.
    this.midpoint
      .copy(this.car.position)
      .add(this.ghost.position)
      .multiplyScalar(0.5);
    this.forward.set(0, 0, 1).applyQuaternion(this.car.quaternion);
    this.chase.update(this.ctx.camera, dt, {
      target: this.car.position,
      forward: this.forward,
      lookAt: this.midpoint,
    });
  }

  /**
   * @param {number} dt
   * @param {number} now
   */
  update(dt, now) {
    const newTargetDown = isActionDown("newTarget");
    if (newTargetDown && !this.spaceLatch) {
      this.spaceLatch = true;
      this.streak = 0;
      recordAttempt("ghost-align", { success: false });
      this.randomTarget();
      this.ctx.hud.status.textContent = "Skipped — streak reset";
      this.ctx.hud.avg.textContent = formatConsistency("ghost-align");
    }
    if (!newTargetDown) this.spaceLatch = false;

    const resetDown = isActionDown("resetCar");
    if (resetDown && !this.rLatch) {
      this.rLatch = true;
      this.resetCar();
    }
    if (!resetDown) this.rLatch = false;

    this.clock.advance(dt, (tickDt) => {
      this.stepPhysics(tickDt);
    });
    const input = this._lastInput;

    const { score, matched } = this.getAlign();
    if (matched) {
      this.alignHold += dt;
      this.ctx.hud.status.textContent = "Hold it…";
      if (this.alignHold >= this.difficulty.holdTime) this.onHit();
    } else {
      this.alignHold = Math.max(0, this.alignHold - dt * 2);
    }

    const pulse = 1 + Math.sin(now * 0.008) * 0.015 * score;
    this.ghost.scale.setScalar(pulse);
    // Guide stays locked to target orientation (already set in randomTarget / onHit)
    this.guide.quaternion.copy(this.ghost.quaternion);
    this.guide.scale.setScalar(0.95 + score * 0.12);

    this.updateCamera(dt);
    this.updateHud(input, score);
  }
}
