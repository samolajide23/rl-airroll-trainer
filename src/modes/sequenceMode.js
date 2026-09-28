import * as THREE from "three";
import { makeCar, makeTargetGuide } from "../shared/car.js";
import {
  angleErrorDeg,
  formatConsistency,
  recordAttempt,
} from "../shared/metrics.js";
import { AerialDrillBase } from "../shared/modeBase.js";

/**
 * Tetris-style DAR: endless random move queue.
 * Current target + upcoming pieces shown on the left so you can plan.
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   short: string,
 *   tint: string,
 *   makeQuat: (prev: THREE.Quaternion) => THREE.Quaternion
 * }} SeqMove
 */

const HOLD_TIME = 0.32;
const QUEUE_LEN = 4; // upcoming pieces shown below NOW
const ALIGN_DOT = 0.9;

/**
 * @param {THREE.Vector3} axis
 * @param {number} angle
 * @param {THREE.Quaternion} prev
 */
function twistAbout(axis, angle, prev) {
  return new THREE.Quaternion()
    .setFromAxisAngle(axis.normalize(), angle)
    .multiply(prev.clone());
}

/** @type {SeqMove[]} */
const MOVES = [
  {
    id: "rollL",
    label: "Roll left 90°",
    short: "ROLL L",
    tint: "#5eead4",
    makeQuat: (prev) => {
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(prev);
      return twistAbout(f, -Math.PI / 2, prev);
    },
  },
  {
    id: "rollR",
    label: "Roll right 90°",
    short: "ROLL R",
    tint: "#3dd6c6",
    makeQuat: (prev) => {
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(prev);
      return twistAbout(f, Math.PI / 2, prev);
    },
  },
  {
    id: "pitchUp",
    label: "Pitch nose up 90°",
    short: "PITCH ↑",
    tint: "#ffd166",
    makeQuat: (prev) => {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(prev);
      return twistAbout(right, -Math.PI / 2, prev);
    },
  },
  {
    id: "pitchDown",
    label: "Pitch nose down 90°",
    short: "PITCH ↓",
    tint: "#ff8a4c",
    makeQuat: (prev) => {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(prev);
      return twistAbout(right, Math.PI / 2, prev);
    },
  },
  {
    id: "yawL",
    label: "Yaw left 90°",
    short: "YAW L",
    tint: "#6dff9a",
    makeQuat: (prev) => {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(prev);
      return twistAbout(up, Math.PI / 2, prev);
    },
  },
  {
    id: "yawR",
    label: "Yaw right 90°",
    short: "YAW R",
    tint: "#9b8cff",
    makeQuat: (prev) => {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(prev);
      return twistAbout(up, -Math.PI / 2, prev);
    },
  },
];

/**
 * @returns {SeqMove}
 */
function randomMove() {
  return MOVES[Math.floor(Math.random() * MOVES.length)];
}

/**
 * Avoid repeating the same move back-to-back when possible.
 * @param {SeqMove | null} last
 * @returns {SeqMove}
 */
function nextMove(last) {
  let m = randomMove();
  if (last && MOVES.length > 1) {
    let guard = 0;
    while (m.id === last.id && guard++ < 8) m = randomMove();
  }
  return m;
}

export class SequenceMode extends AerialDrillBase {
  /** @param {object} ctx */
  constructor(ctx) {
    super(ctx, "DAR Sequences");
    this.ghost = makeCar(0x5eead4, 0.32, { ghost: true });
    this.ghostOffset = new THREE.Vector3(3.4, 0, 0);
    this.ghost.position.copy(this.ghostOffset);
    this.guide = makeTargetGuide();
    this.root.add(this.ghost, this.guide);

    /** @type {SeqMove[]} */
    this.queue = [];
    /** @type {SeqMove | null} */
    this.current = null;
    this.hold = 0;
    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.modeId = "dar-sequences";
    this.camOffset.set(-0.6, 4, -11);
    this._gF = new THREE.Vector3();
    this._gU = new THREE.Vector3();
    this._targetQ = new THREE.Quaternion();

    this.queueEl = document.getElementById("seq-queue");
    this.queueListEl = document.getElementById("seq-queue-list");
  }

  start() {
    super.start();
    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.hold = 0;
    this.ghost.quaternion.identity();
    this._targetQ.identity();
    this.queue = [];
    this.current = null;
    this.fillQueue();
    this.popNext();
    this.setScoreRow(0, 0, 0, formatConsistency(this.modeId));
    if (this.queueEl) this.queueEl.classList.remove("hidden");
    this.renderQueue();
  }

  stop() {
    if (this.queueEl) this.queueEl.classList.add("hidden");
    super.stop();
  }

  fillQueue() {
    while (this.queue.length < QUEUE_LEN) {
      const last =
        this.queue.length > 0
          ? this.queue[this.queue.length - 1]
          : this.current;
      this.queue.push(nextMove(last));
    }
  }

  popNext() {
    this.fillQueue();
    this.current = this.queue.shift() ?? nextMove(null);
    this.fillQueue();

    const prev = this._targetQ.clone();
    const q = this.current.makeQuat(prev);
    this._targetQ.copy(q);
    this.ghost.quaternion.copy(q);
    this.ghost.position.copy(this.ghostOffset);
    this.guide.quaternion.copy(q);
    this.hold = 0;
    this.ctx.hud.status.textContent = `NOW: ${this.current.label}`;
    this.renderQueue();
  }

  renderQueue() {
    if (!this.queueListEl || !this.current) return;
    this.queueListEl.replaceChildren();

    const pieces = [this.current, ...this.queue];
    pieces.forEach((move, i) => {
      const el = document.createElement("div");
      el.className = `seq-piece${i === 0 ? " now" : ""}`;
      el.style.setProperty("--seq-tint", move.tint);

      const tag = document.createElement("span");
      tag.className = "seq-piece-tag";
      tag.textContent = i === 0 ? "NOW" : `+${i}`;

      const name = document.createElement("span");
      name.className = "seq-piece-name";
      name.textContent = move.short;

      el.append(tag, name);
      this.queueListEl.append(el);
    });
  }

  /**
   * @param {number} dt
   * @param {number} now
   */
  update(dt, now) {
    const { skipped } = this.pollUtilityKeys();
    if (skipped) {
      recordAttempt(this.modeId, { success: false });
      this.streak = 0;
      this.setScoreRow(
        this.hits,
        this.streak,
        this.best,
        formatConsistency(this.modeId),
      );
      // Skip current piece — keep queue continuity from current target
      this.popNext();
    }

    this.stepCar(dt);
    const { forward, up } = this.carAxes();
    this._gF.set(0, 0, 1).applyQuaternion(this.ghost.quaternion);
    this._gU.set(0, 1, 0).applyQuaternion(this.ghost.quaternion);
    const avgErr =
      (angleErrorDeg(forward, this._gF) + angleErrorDeg(up, this._gU)) / 2;
    const matched =
      forward.dot(this._gF) > ALIGN_DOT && up.dot(this._gU) > ALIGN_DOT;

    if (matched) {
      this.hold += dt;
      this.ctx.hud.status.textContent = `Hold · ${this.current?.label ?? ""}`;
      if (this.hold >= HOLD_TIME) {
        this.hits += 1;
        this.streak += 1;
        this.best = Math.max(this.best, this.streak);
        recordAttempt(this.modeId, {
          success: true,
          angleErrorDeg: avgErr,
          timeOnTarget: this.hold,
        });
        this.setScoreRow(
          this.hits,
          this.streak,
          this.best,
          formatConsistency(this.modeId),
        );
        this.popNext();
      }
    } else {
      this.hold = Math.max(0, this.hold - dt);
    }

    this.guide.quaternion.copy(this.ghost.quaternion);
    this.guide.scale.setScalar(0.95 + (matched ? 0.12 : 0));
    this.ghost.scale.setScalar(1 + Math.sin(now * 0.008) * 0.01);
    this.ctx.hud.alignFill.style.width = `${Math.round(Math.max(0, 1 - avgErr / 90) * 100)}%`;

    const mid = this.car.position
      .clone()
      .add(this.ghost.position)
      .multiplyScalar(0.5);
    this.updateCamera(dt, mid);
  }
}
