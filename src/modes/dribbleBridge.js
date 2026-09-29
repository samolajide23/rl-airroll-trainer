import * as THREE from "three";
import { PracticeBall } from "../shared/ball.js";
import { RL } from "../shared/carPhysics.js";
import { applyModeChaseCamera, UU } from "../shared/chaseCamera.js";
import { formatConsistency, recordAttempt } from "../shared/metrics.js";
import { AerialDrillBase } from "../shared/modeBase.js";

const BOOST_ACCEL = RL.BOOST_ACCEL_AIR * UU;
const MAX_SPEED = RL.MAX_SPEED * UU;

/**
 * Phase 3 bridge drills.
 * variant: popChase | boostTap | hover | wallAir | steerDribble
 *
 * Orientation uses shared {@link AerialBody}; boost translation uses the same
 * RocketSim air-boost accel / use-rate / max-speed as Free Play & Rings.
 */
export class DribbleBridgeMode extends AerialDrillBase {
  /**
   * @param {object} ctx
   * @param {{ variant?: string }} [options]
   */
  constructor(ctx, options = {}) {
    const titles = {
      popChase: "Pop & Chase",
      boostTap: "Boost Tapping",
      hover: "Hover & Hold",
      wallAir: "Wall-to-Air",
      steerDribble: "Side-Steer Dribble",
    };
    const variant = options.variant ?? "popChase";
    super(ctx, titles[variant] ?? "Air Dribble Bridge");
    this.variant = variant;
    this.modeId = `dribble-${variant}`;
    this.ball = new PracticeBall(0.85);
    this.root.add(this.ball.mesh);

    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.touches = 0;
    this.boostHeld = 0;
    this.boost = RL.BOOST_MAX;
    this.boosting = false;
    this.vel = new THREE.Vector3();
    this.hoverTime = 0;
    this.touchCooldown = 0;
    this.tmp = new THREE.Vector3();

    if (variant === "wallAir") {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(16, 10, 0.4),
        new THREE.MeshStandardMaterial({
          color: 0x1a2744,
          roughness: 0.85,
        }),
      );
      wall.position.set(0, 5, 6);
      this.root.add(wall);
    }
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
    this.touches = 0;
    this.boostHeld = 0;
    this.boost = RL.BOOST_MAX;
    this.boosting = false;
    this.vel.set(0, 0, 0);
    this.hoverTime = 0;
    this.touchCooldown = 0;
    this.resetCar();
    this.ball.freeze();

    if (this.variant === "wallAir") {
      this.ball.setPosition([0, 3.5, 5.2]);
      this.car.position.set(0, 0.5, 2);
      this.ctx.hud.status.textContent =
        "Carry up the wall, pop off, follow with air roll";
    } else if (this.variant === "boostTap") {
      this.ball.setPosition([0, 2.5, 4]);
      this.ctx.hud.status.textContent =
        "Pulse boost to reach the ball — don't hold it";
    } else if (this.variant === "hover") {
      this.ball.setPosition([0, 2.2, 1.8]);
      this.ctx.hud.status.textContent = "Keep the ball near your nose (~3s)";
    } else if (this.variant === "steerDribble") {
      this.ball.setPosition([0, 2.0, 1.6]);
      this.ctx.hud.status.textContent =
        "Keep ball on nose; steer with DAR (yaw + roll)";
    } else {
      this.ball.setPosition([0, 2.0, 2.2]);
      this.ctx.hud.status.textContent =
        "Pop the ball, then chase for 2–3 touches";
    }
  }

  /**
   * @param {number} dt
   */
  updateCamera(dt) {
    this.carAxes();
    const input = this._lastInput;
    applyModeChaseCamera(this.chase, this.ctx.camera, dt, {
      target: this.car.position,
      forward: this.forward,
      velocity: this.vel,
      worldUp: this.worldUp,
      onGround: false,
      boosting: this.boosting,
      lookRight: input?.lookRight ?? 0,
      lookUp: input?.lookUp ?? 0,
      lookBehind: Boolean(input?.lookBehind),
      ballCam: false,
    });
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    const { skipped } = this.pollUtilityKeys();
    if (skipped) {
      recordAttempt(this.modeId, { success: false, touches: this.touches });
      this.streak = 0;
      this.beginRound();
    }

    const input = this.stepCar(dt);
    this.touchCooldown = Math.max(0, this.touchCooldown - dt);

    // Same air-boost params as Free Play / Rings (settings bind, not hardcoded Shift).
    this.boosting = Boolean(input.boost) && this.boost > 0;
    if (this.boosting) {
      this.boostHeld += dt;
      const { forward } = this.carAxes();
      this.vel.addScaledVector(forward, BOOST_ACCEL * dt);
      this.boost = Math.max(0, this.boost - RL.BOOST_USE * dt);
      this.car.userData.setBoost?.(true);
    } else {
      this.car.userData.setBoost?.(false);
    }
    if (this.vel.length() > MAX_SPEED) this.vel.setLength(MAX_SPEED);
    this.car.position.addScaledVector(this.vel, dt);

    // RL practice-ball gravity / drag (defaults match Free Play scale).
    this.ball.step(dt);

    const nose = this.tmp
      .set(0, 0.1, 1.15)
      .applyQuaternion(this.car.quaternion)
      .add(this.car.position);
    const dist = nose.distanceTo(this.ball.mesh.position);

    if (dist < this.ball.radius + 0.4 && this.touchCooldown <= 0) {
      const away = this.ball.mesh.position.clone().sub(nose).normalize();
      const power =
        this.variant === "hover" || this.variant === "steerDribble" ? 1.6 : 4.2;
      this.ball.hit(away, power);
      this.touches += 1;
      this.touchCooldown = 0.35;
      this.ctx.hud.status.textContent = `Touches: ${this.touches}`;
    }

    if (this.variant === "popChase" && this.touches >= 3) this.onSuccess();

    if (this.variant === "boostTap") {
      if (this.touches >= 1 && this.boostHeld < 1.35) {
        this.onSuccess();
      } else if (this.boostHeld > 2.2) {
        this.ctx.hud.status.textContent = "Boost held too long — tap it";
        this.streak = 0;
        recordAttempt(this.modeId, { success: false, touches: this.touches });
        this.beginRound();
      }
    }

    if (this.variant === "hover") {
      if (dist < 1.6) {
        this.hoverTime += dt;
        this.ctx.hud.alignFill.style.width = `${Math.min(100, Math.round((this.hoverTime / 3) * 100))}%`;
        if (this.hoverTime >= 3) this.onSuccess();
      } else {
        this.hoverTime = Math.max(0, this.hoverTime - dt);
      }
    }

    if (this.variant === "steerDribble") {
      const steering =
        Math.abs(input.yaw) + (input.airLeft || input.airRight ? 1 : 0);
      if (dist < 1.8 && steering > 0.2) {
        this.hoverTime += dt;
        this.ctx.hud.alignFill.style.width = `${Math.min(100, Math.round((this.hoverTime / 2.5) * 100))}%`;
        if (this.hoverTime >= 2.5) this.onSuccess();
      }
    }

    if (this.variant === "wallAir" && this.touches >= 2) this.onSuccess();

    if (this.variant !== "hover" && this.variant !== "steerDribble") {
      this.ctx.hud.alignFill.style.width = `${Math.round(Math.max(0, 1 - dist / 5) * 100)}%`;
    }

    this.updateCamera(dt);
  }

  onSuccess() {
    this.hits += 1;
    this.streak += 1;
    this.best = Math.max(this.best, this.streak);
    recordAttempt(this.modeId, { success: true, touches: this.touches });
    this.setScoreRow(
      this.hits,
      this.streak,
      this.best,
      formatConsistency(this.modeId),
    );
    this.beginRound();
  }
}
