import * as THREE from "three";
import { PracticeBall } from "../shared/ball.js";
import { AerialDrillBase } from "../shared/modeBase.js";
import { formatConsistency, recordAttempt } from "../shared/metrics.js";

const CONTACT_PARTS = [
  { id: "nose", label: "nose", local: new THREE.Vector3(0, 0, 1.2) },
  { id: "roof", label: "roof", local: new THREE.Vector3(0, 0.7, 0) },
  { id: "side", label: "side", local: new THREE.Vector3(0.85, 0, 0) },
];

/**
 * Phase 2 drills using a practice ball.
 * variant: static | rollTouch | soft | recovery
 */
export class BallContactMode extends AerialDrillBase {
  /**
   * @param {object} ctx
   * @param {{ variant?: "static" | "rollTouch" | "soft" | "recovery" }} [options]
   */
  constructor(ctx, options = {}) {
    const titles = {
      static: "Static Ball Contact",
      rollTouch: "Roll-to-Touch",
      soft: "Soft Touches",
      recovery: "Recovery",
    };
    const variant = options.variant ?? "static";
    super(ctx, titles[variant] ?? "Ball Contact");
    this.variant = variant;
    this.modeId = `ball-${variant}`;
    this.ball = new PracticeBall(0.85);
    this.root.add(this.ball.mesh);
    this.part = CONTACT_PARTS[0];
    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.touched = false;
    this.recoverHold = 0;
    this.retryDelay = 0;
    this.contactPoint = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
  }

  start() {
    super.start();
    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.beginRound();
    this.setScoreRow(0, 0, 0, formatConsistency(this.modeId));
  }

  beginRound() {
    this.touched = false;
    this.recoverHold = 0;
    this.retryDelay = 0;
    this.resetCar();
    this.part =
      CONTACT_PARTS[Math.floor(Math.random() * CONTACT_PARTS.length)];

    if (this.variant === "rollTouch") {
      this.ball.setPosition([1.6, 2.2, 2.4]);
      this.car.quaternion.setFromEuler(new THREE.Euler(0.2, 0, 0.9, "YXZ"));
    } else if (this.variant === "soft" || this.variant === "recovery") {
      this.ball.setPosition([0, 2.5, 2.8]);
    } else {
      this.ball.setPosition([0, 2.2, 2.6]);
    }
    this.ball.freeze();

    this.ctx.hud.status.textContent = `Hit the ball with your ${this.part.label}`;
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    if (this.retryDelay > 0) {
      this.retryDelay -= dt;
      if (this.retryDelay <= 0) this.beginRound();
      this.updateCamera(dt);
      return;
    }

    const { skipped } = this.pollUtilityKeys();
    if (skipped) {
      recordAttempt(this.modeId, { success: false, touches: 0 });
      this.streak = 0;
      this.beginRound();
    }

    this.stepCar(dt);

    if (this.variant !== "static") {
      // PracticeBall defaults = RL.GRAVITY / RL.BALL_DRAG (same as Free Play scale).
      this.ball.step(dt);
    }

    this.contactPoint
      .copy(this.part.local)
      .applyQuaternion(this.car.quaternion)
      .add(this.car.position);

    const dist = this.contactPoint.distanceTo(this.ball.mesh.position);
    const hitRange = this.ball.radius + 0.35;

    if (!this.touched && dist < hitRange) {
      this.touched = true;
      const away = this.tmp
        .subVectors(this.ball.mesh.position, this.contactPoint)
        .normalize();
      const strength =
        this.variant === "soft" ? 2.2 + Math.random() * 0.8 : 5.5;
      this.ball.hit(away, strength);

      if (this.variant === "recovery") {
        this.ctx.hud.status.textContent = "Touched! Recover wheels-down";
      } else if (this.variant === "soft") {
        const speed = this.ball.velocity.length();
        if (speed < 4.5) {
          this.onSuccess(1);
        } else {
          this.ctx.hud.status.textContent = "Too hard — try a softer touch";
          this.streak = 0;
          recordAttempt(this.modeId, { success: false, touches: 1 });
          this.retryDelay = 0.85;
        }
      } else {
        this.onSuccess(1);
      }
    }

    if (this.variant === "recovery" && this.touched) {
      const { up } = this.carAxes();
      const worldUp = new THREE.Vector3(0, 1, 0);
      if (up.dot(worldUp) > 0.92 && this.aerial.omega.length() < 0.6) {
        this.recoverHold += dt;
        if (this.recoverHold >= 0.35) this.onSuccess(1);
      } else {
        this.recoverHold = 0;
      }
    }

    const align = Math.max(0, 1 - dist / 4);
    this.ctx.hud.alignFill.style.width = `${Math.round(align * 100)}%`;

    this.updateCamera(dt);
  }

  /** @param {number} touches */
  onSuccess(touches) {
    this.hits += 1;
    this.streak += 1;
    this.best = Math.max(this.best, this.streak);
    recordAttempt(this.modeId, { success: true, touches });
    this.setScoreRow(
      this.hits,
      this.streak,
      this.best,
      formatConsistency(this.modeId),
    );
    this.beginRound();
  }
}
