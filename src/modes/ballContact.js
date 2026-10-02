import * as THREE from "three";
import { formatSpeed } from "../shared/rl-units.js";
import { ArenaDrillBase } from "../shared/arenaDrill.js";
import { RL } from "../shared/carPhysics.js";
import { physToThree } from "../shared/carPhysics.js";
import { ARENA_UU } from "../shared/soccarArena.js";
import { disposeScene } from "../shared/disposeScene.js";
import { STATIC_BALL_MASTERY, SOFT_TOUCH_MASTERY } from "./catalog.js";
import { generateStaticBallSetup, classifyStaticContact, staticGateCrossing, recordStaticBallSet, staticBallSummary } from "../shared/staticBallTraining.js";
import { generateSoftBallSetup, softExitOffset, recordSoftBallSet, softBallSummary } from "../shared/softBallTraining.js";
import { generateRollTouchSetup, ROLL_TOUCH_MASTERY, recordRollTouchSet, rollTouchSummary } from "../shared/rollTouchTraining.js";
import { generateRecoverySetup, RECOVERY_MASTERY, recordRecoverySet, recoverySummary } from "../shared/recoveryTraining.js";
import { MOVEMENT_TRAINING } from "../shared/movementTraining.js";
import { DrillCoach } from "../shared/drillCoach.js";
import { DrillCoachView } from "../shared/drillCoachView.js";

const training = {
  static: { steps: STATIC_BALL_MASTERY, record: recordStaticBallSet, summary: staticBallSummary },
  soft: { steps: SOFT_TOUCH_MASTERY, record: recordSoftBallSet, summary: softBallSummary },
  rollTouch: { steps: ROLL_TOUCH_MASTERY, record: recordRollTouchSet, summary: rollTouchSummary },
  recovery: { steps: RECOVERY_MASTERY, record: recordRecoverySet, summary: recoverySummary },
  ...Object.fromEntries(Object.entries(MOVEMENT_TRAINING).map(([id, entry]) => [id, { steps: entry.steps, record: entry.history.record, summary: entry.history.summary }])),
};

export class BallContactMode extends ArenaDrillBase {
  constructor(ctx, options = {}) {
    const variant = options.variant ?? "static";
    const titles = { static: "Static Ball Contact", rollTouch: "Roll-to-Touch", soft: "Soft Touches", recovery: "Recovery" };
    super(ctx, titles[variant] ?? titles.static);
    this.variant = variant;
    this.modeId = `ball-${variant}`;
    this.recoverHold = 0;
    this.upAxis = new THREE.Vector3();
    this.masteryStep = Math.max(0, Math.min(4, Math.trunc(options.masteryStep || 0)));
    this.varied = options.varied !== false;
    this.setAttempts = [];
    this.practiceRetry = false;
    this.setupIndex = 0;
    if (training[variant]) {
      this.coach = new DrillCoach();
      this.modeId = `ball-${variant}-${this.masteryStep}-${this.varied}`;
      this.title = training[variant].steps[this.masteryStep].title;
    }
    if (variant === "static" || variant === "soft") {
      this.gate = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0x83cdec, emissive: 0x83cdec, emissiveIntensity: 0.5 });
      for (const offset of [-300, 300]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(8 * ARENA_UU, 8 * ARENA_UU, 240 * ARENA_UU, 8), material);
        post.position.set(offset * ARENA_UU, 120 * ARENA_UU, 0);
        this.gate.add(post);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(616 * ARENA_UU, 8 * ARENA_UU, 8 * ARENA_UU), material);
      bar.position.y = 240 * ARENA_UU;
      this.gate.add(bar);
      this.root.add(this.gate);
    }
  }

  start() {
    super.start();
    if (!training[this.variant]) return;
    this.coachView = new DrillCoachView(this.ctx.hud.root, {
      retry: () => this.result?.success ? this.resetState() : this.retrySameSetup(),
      next: () => this.resetState(),
      nextDrill: this.ctx.nextDrill,
      previousDrill: this.ctx.previousDrill,
      stages: training[this.variant].steps,
      variant: this.variant,
      currentStage: this.masteryStep,
      selectStage: this.ctx.selectStage,
    });
    this.refreshCoaching({}, 0);
    this.retryPanel = document.createElement("div");
    this.retryPanel.className = "static-ball-actions";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Retry Same Setup";
    retry.addEventListener("click", () => this.retrySameSetup());
    this.retryPanel.append(retry);
    this.ctx.hud.root.append(this.retryPanel);
    this.retryButton = retry;
    this.updateDrillStatus();
  }

  retrySameSetup() {
    if (!this.lastMissSetup) return;
    const savedSetup = structuredClone(this.lastMissSetup);
    if (!this.result && this.elapsed > 0) this.finishRound(false, "Skipped");
    this.lastMissSetup = savedSetup;
    this.retrySetup = savedSetup;
    this.practiceRetry = true;
    this.resetState();
  }

  resetState() {
    this.coachView?.closeFailure();
    if (training[this.variant] && this.elapsed > 0 && !this.result) this.finishRound(false, "Skipped");
    if (training[this.variant] && !this.retrySetup) this.practiceRetry = false;
    super.resetState();
  }

  setupRound() {
    if (this.variant === "rollTouch" || this.variant === "recovery") {
      this.masteryStep ??= 0;
      this.setAttempts ??= [];
      this.setupIndex ??= 0;
      this.setup = this.retrySetup || (this.variant === "recovery" ? generateRecoverySetup : generateRollTouchSetup)(this.masteryStep, this.varied, this.setupIndex++);
      this.retrySetup = null;
      this.spawn(this.setup.position, this.setup.ballPosition, this.setup.yaw);
      this.physCar.onGround = false;
      this.physCar.vel.fromArray(this.setup.carVelocity);
      this.physCar.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.setup.roll));
      if (this.physBall) this.physBall.vel.z = 0.01;
      this.rollInput = 0;
      this.rollTravel = 0;
      this.firstTouchTime = null;
      this.receivedSpeed = null;
      this.recoverHold = 0;
      this.landingTime = null;
      this.landingOrigin = null;
      this.prompt = training[this.variant].steps[this.masteryStep].title;
      return;
    }
    if (this.variant === "soft") {
      this.masteryStep ??= 0;
      this.setAttempts ??= [];
      this.setupIndex ??= 0;
      this.setup = this.retrySetup || generateSoftBallSetup(this.masteryStep, this.varied, this.setupIndex++);
      this.retrySetup = null;
      this.spawn([this.setup.position[0], this.setup.position[1], this.hitbox.restZ], [this.setup.ballPosition[0], this.setup.ballPosition[1], RL.BALL_REST_Z], this.setup.yaw);
      this.physBall.vel.fromArray(this.setup.ballVelocity);
      this.physCar.vel.fromArray(this.setup.carVelocity);
      this.previousIncomingSpeed = Math.hypot(this.physBall.vel.x, this.physBall.vel.y);
      this.incomingSpeed = null;
      this.receivedSpeed = null;
      this.firstTouchTime = null;
      this.receptionReady = false;
      this.closeHold = 0;
      this.receptionOrigin = null;
      this.targetDirection = new THREE.Vector3(...this.setup.direction);
      this.prompt = SOFT_TOUCH_MASTERY[this.masteryStep].title;
      if (this.gate) {
        this.gate.visible = this.masteryStep === 2;
        this.placeSoftTarget(this.physCar.pos);
      }
      return;
    }
    if (this.variant === "static") {
      this.masteryStep ??= 0;
      this.setAttempts ??= [];
      this.setupIndex ??= 0;
      this.setup = this.retrySetup || generateStaticBallSetup(this.masteryStep, this.varied, this.setupIndex++);
      this.retrySetup = null;
      this.spawn([this.setup.position[0], this.setup.position[1], this.hitbox.restZ], [0, 0, RL.BALL_REST_Z], this.setup.yaw);
      this.targetDirection = new THREE.Vector3(...this.setup.direction);
      this.previousBall = this.physBall.pos.clone();
      this.gateHit = false;
      this.gateSpeed = null;
      this.firstTouchTime = null;
      this.followHold = 0;
      this.followElapsed = 0;
      this.prompt = STATIC_BALL_MASTERY[this.masteryStep].title;
      if (this.gate) {
        this.gate.visible = this.masteryStep >= 2;
        physToThree(this.targetDirection.clone().multiplyScalar(1400), this.gate.position).multiplyScalar(ARENA_UU);
        this.gate.rotation.y = Math.atan2(this.targetDirection.x, this.targetDirection.y);
      }
      return;
    }
    this.recoverHold = 0;
    this.spawn([0, -650, this.hitbox.restZ], [0, 0, RL.BALL_REST_Z]);
    this.prompt = "Meet the stationary ball";
    if (this.variant === "recovery") {
      this.spawn([0, -300, 350], [0, 0, 350]);
      this.physCar.onGround = false;
      this.physCar.vel.set(0, 400, 0);
      this.physBall.vel.z = 0.01;
      this.prompt = "Touch, then land wheels down";
    }
  }

  evaluateStep(dt, controls, newContact) {
    if (this.variant === "static") return this.evaluateMastery(dt, newContact);
    if (this.variant === "soft") return this.evaluateReception(dt, newContact);
    if (this.variant === "rollTouch") return this.evaluateRollTouch(dt, controls, newContact);
    if (this.variant === "recovery") return this.evaluateRecovery(dt, newContact);
    const upright = this.upAxis.set(0, 0, 1).applyQuaternion(this.physCar.q).z > 0.92;
    this.progress = Math.max(0, 1 - this.physCar.pos.distanceTo(this.physBall.pos) / 800);
    if (newContact) {
      if (this.variant === "rollTouch") {
        const controlled = upright && !this.physCar.onGround;
        this.finishRound(controlled, controlled ? "Controlled aerial touch" : "Touch before aerial alignment");
      } else if (this.variant === "static") this.finishRound(true, "Ball contacted");
    }
    if (this.variant === "recovery" && this.touches > 0) {
      this.prompt = "Land wheels down";
      this.recoverHold = this.physCar.onGround && upright && this.physCar.omega.length() < 0.6 ? this.recoverHold + dt : 0;
      this.progress = this.recoverHold / 0.35;
      if (this.recoverHold >= 0.35) this.finishRound(true, "Touch and recovery complete");
    }
  }

  onPhysicsStep(dt, controls, contact) {
    this.stepContact = contact;
    super.onPhysicsStep(dt, controls, contact);
    this.refreshCoaching(controls, dt);
    if (this.variant === "soft" && !this.touches) this.previousIncomingSpeed = Math.hypot(this.physBall.vel.x, this.physBall.vel.y);
  }

  refreshCoaching(controls, dt) {
    if (!this.coach || !training[this.variant]) return;
    const step = training[this.variant].steps[this.masteryStep];
    this.coaching = this.coach.update(this, controls, dt, `${step.goal} ${step.success}`);
  }

  evaluateRollTouch(dt, controls, newContact) {
    const upright = this.upAxis.set(0, 0, 1).applyQuaternion(this.physCar.q).z >= 0.92;
    if (this.firstTouchTime === null) {
      this.rollInput += Math.abs(controls.roll || 0) * dt;
      const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.physCar.q);
      this.rollTravel += Math.abs(this.physCar.omega.dot(forward)) * dt;
      this.progress = Math.max(0, 1 - this.physCar.pos.distanceTo(this.physBall.pos) / 600);
    }
    if (newContact) {
      if (this.touches > 1) return this.finishRound(false, "Extra touch");
      this.firstTouchTime = this.elapsed;
      if (this.physCar.onGround) return this.finishRound(false, "Grounded contact");
      if (this.rollInput < 0.05 || this.rollTravel < 0.15) return this.finishRound(false, "No deliberate air roll");
      if (this.masteryStep >= 1 && !upright) return this.finishRound(false, "Touch before alignment");
      if (this.masteryStep >= 2) {
        const label = classifyStaticContact(this.physCar, this.stepContact);
        if (label !== "Front contact") return this.finishRound(false, label);
      }
      if (this.masteryStep < 3) return this.finishRound(true, "Aligned aerial touch");
    }
    if (this.firstTouchTime !== null) {
      const sinceTouch = this.elapsed - this.firstTouchTime;
      if (this.receivedSpeed === null && sinceTouch >= 0.1 - 1e-9) {
        this.receivedSpeed = this.physBall.vel.length();
        if (this.receivedSpeed < 300 || this.receivedSpeed > 900) return this.finishRound(false, this.receivedSpeed < 300 ? "Too soft" : "Too hard");
        if (this.masteryStep === 3) return this.finishRound(true, "Controlled aerial release");
      }
      if (this.masteryStep === 4) {
        this.recoverHold = this.physCar.onGround && upright && this.physCar.omega.length() < 0.6 ? this.recoverHold + Math.min(dt, sinceTouch) : 0;
        this.progress = this.recoverHold / 0.35;
        this.prompt = "Land wheels down and settle";
        if (this.receivedSpeed !== null && this.recoverHold >= 0.35 - 1e-9) return this.finishRound(true, "Aerial touch and recovery complete");
        if (sinceTouch >= 3 - 1e-9) return this.finishRound(false, "Recovery timeout");
      }
    } else if (this.elapsed >= this.roundLimit) this.finishRound(false, "No contact");
  }

  evaluateRecovery(dt, newContact) {
    const needsTouch = this.masteryStep >= 3;
    if (needsTouch && newContact) {
      if (this.touches > 1) return this.finishRound(false, "Extra touch");
      if (this.physCar.onGround) return this.finishRound(false, "Grounded contact");
      this.firstTouchTime = this.elapsed;
    }
    if (needsTouch && this.firstTouchTime === null) {
      if (this.elapsed >= this.roundLimit) this.finishRound(false, "No contact");
      return;
    }
    const sinceStart = needsTouch ? this.elapsed - this.firstTouchTime : this.elapsed;
    const upright = this.upAxis.set(0, 0, 1).applyQuaternion(this.physCar.q).z >= 0.92;
    const velocity = this.physCar.vel.clone().setZ(0);
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.physCar.q).setZ(0).normalize();
    const speed = velocity.length();
    const aligned = speed >= 300 && forward.dot(velocity.normalize()) >= Math.cos(Math.PI / 6);
    const needsAlignment = [1, 2, 4].includes(this.masteryStep);
    const stable = this.physCar.onGround && upright && this.physCar.omega.length() < 0.6;
    if (this.landingTime === null) {
      if (sinceStart > (needsTouch ? 3 : 4) + 1e-9) return this.finishRound(false, "Landing timeout");
      this.recoverHold = stable && (!needsAlignment || aligned) ? this.recoverHold + Math.min(dt, sinceStart) : 0;
      this.progress = this.recoverHold / 0.35;
      this.prompt = needsAlignment ? "Land along your momentum" : "Land wheels down and settle";
      if (this.recoverHold < 0.35 - 1e-9) return;
      if (this.masteryStep !== 2 && this.masteryStep !== 4) return this.finishRound(true, "Stable landing complete");
      this.landingTime = this.elapsed;
      this.landingOrigin = this.physCar.pos.clone();
      this.exitDirection = forward.clone();
    }
    const distance = this.physCar.pos.clone().sub(this.landingOrigin).dot(this.exitDirection);
    this.prompt = "Drive forward out of the landing";
    this.progress = distance / 150;
    if (this.elapsed - this.landingTime > 1.5 + 1e-9) return this.finishRound(false, "Exit timeout");
    if (stable && aligned && distance >= 150) return this.finishRound(true, "Forward recovery complete");
  }

  placeSoftTarget(origin) {
    const right = new THREE.Vector3(-this.targetDirection.y, this.targetDirection.x, 0);
    const center = origin.clone().addScaledVector(right, this.setup.exitSide * 300);
    center.z = 0;
    physToThree(center, this.gate.position).multiplyScalar(ARENA_UU);
    this.gate.rotation.y = Math.atan2(-this.targetDirection.x, -this.targetDirection.y);
    this.gate.scale.set(0.5, 1, 1);
  }

  evaluateReception(dt, newContact) {
    if (newContact && this.touches === 1) {
      this.firstTouchTime = this.elapsed;
      this.incomingSpeed = this.previousIncomingSpeed;
      this.receptionOrigin = this.physBall.pos.clone();
      if (this.gate) this.placeSoftTarget(this.receptionOrigin);
    } else if (newContact && this.touches > 1) {
      if (this.masteryStep === 4 && this.receptionReady && this.elapsed - this.firstTouchTime <= 3 && this.physCar.pos.distanceTo(this.physBall.pos) <= 450 && this.physBall.pos.z <= 200) return this.finishRound(true, "Controlled second touch");
      return this.finishRound(false, "Extra touch before reception");
    }
    if (this.firstTouchTime === null) {
      this.progress = Math.max(0, 1 - this.physCar.pos.distanceTo(this.physBall.pos) / 1400);
      if (this.elapsed >= this.roundLimit) this.finishRound(false, "No contact");
      return;
    }
    const sinceTouch = this.elapsed - this.firstTouchTime;
    if (this.physBall.pos.z > 200) return this.finishRound(false, "Reception too high");
    if (this.masteryStep >= 1) {
      if (this.physCar.pos.distanceTo(this.physBall.pos) > 450) return this.finishRound(false, "Too far away");
      this.closeHold += Math.min(dt, sinceTouch);
    }
    if (this.receivedSpeed === null && sinceTouch >= 0.1 - 1e-9) {
      this.receivedSpeed = Math.hypot(this.physBall.vel.x, this.physBall.vel.y);
      if (!(this.incomingSpeed > 0) || this.receivedSpeed > this.incomingSpeed * 0.6 + 1e-9) return this.finishRound(false, "Not cushioned enough");
      if (this.masteryStep === 0) return this.finishRound(true, "Arrival cushioned");
    }
    if (this.receivedSpeed !== null && this.closeHold >= 0.5 - 1e-9) {
      this.receptionReady = true;
      if (this.masteryStep === 1 || this.masteryStep === 3) return this.finishRound(true, "Close reception");
      if (this.masteryStep === 2) {
        const offset = softExitOffset(this.physBall.pos, this.receptionOrigin, this.targetDirection);
        const exit = offset.lateral * this.setup.exitSide;
        if (exit >= 150 && exit <= 450 && Math.abs(offset.forward) <= 450) return this.finishRound(true, "Requested exit reached");
      }
    }
    this.prompt = this.masteryStep === 4 && this.receptionReady ? "Make a separate second touch" : this.masteryStep === 2 ? `${this.setup.exitSide > 0 ? "Left" : "Right"} exit, stay within 450 uu` : "Cushion and stay within 450 uu";
    this.progress = this.closeHold / 0.5;
    if (sinceTouch >= 3 - 1e-9) this.finishRound(false, this.masteryStep === 4 ? "Second touch timeout" : "Exit missed");
  }

  evaluateMastery(dt, newContact) {
    if (newContact) {
      this.firstTouchTime ??= this.elapsed;
      if (this.masteryStep === 0) return this.finishRound(true, "Ball contacted");
      if (this.touches === 1) {
        this.contactLabel = classifyStaticContact(this.physCar, this.stepContact);
        if (this.contactLabel !== "Front contact") return this.finishRound(false, this.contactLabel);
        if (this.masteryStep === 1) return this.finishRound(true, "Front contact");
      } else if (!this.gateHit) return this.finishRound(false, "Extra touch");
    }
    if (this.touches && !this.gateHit) {
      const crossing = staticGateCrossing(this.previousBall, this.physBall.pos, this.targetDirection);
      if (crossing) {
        if (!crossing.hit) return this.finishRound(false, crossing.label);
        this.gateHit = true;
        this.gateSpeed = Math.hypot(this.physBall.vel.x, this.physBall.vel.y);
        if (this.masteryStep === 2) return this.finishRound(true, "Target hit");
        if (this.masteryStep === 3) return this.finishRound(this.gateSpeed >= 800 && this.gateSpeed <= 1200, this.gateSpeed < 800 ? "Too soft" : this.gateSpeed > 1200 ? "Too hard" : "Target and pace matched");
      }
    }
    this.previousBall.copy(this.physBall.pos);
    if (this.masteryStep === 4 && this.gateHit) {
      this.followElapsed += dt;
      const offset = this.physBall.pos.clone().sub(this.physCar.pos);
      offset.z = 0;
      const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(this.physCar.q);
      facing.z = 0;
      const aligned = facing.normalize().dot(offset.clone().normalize()) >= Math.cos(Math.PI / 6);
      const grounded = this.physCar.onGround && this.upAxis.set(0, 0, 1).applyQuaternion(this.physCar.q).z >= 0.92;
      const close = this.physCar.pos.distanceTo(this.physBall.pos) <= 600;
      this.followHold = close && aligned && grounded ? this.followHold + dt : 0;
      this.prompt = "Follow within 600 uu, wheels-down";
      this.progress = this.followHold / 0.5;
      this.followMiss = !close ? "Too far away" : !aligned ? "Facing away" : "Not wheels-down";
      if (this.followHold >= 0.5) return this.finishRound(true, "Controlled follow-through");
      if (this.followElapsed >= 3) return this.finishRound(false, this.followMiss);
    }
    if (this.elapsed >= this.roundLimit) this.finishRound(false, !this.touches ? "No contact" : this.gateHit ? this.followMiss || "Follow-through timeout" : "Target timeout");
  }

  finishRound(success, message) {
    if (!training[this.variant]) return super.finishRound(success, message);
    if (this.result) return;
    if (!success && !this.practiceRetry) this.lastMissSetup = structuredClone(this.setup);
    if (this.practiceRetry) {
      this.result = { success, message: `Practice: ${message}` };
      this.resultTime = 0;
      this.stopRoundCar();
      return;
    }
    super.finishRound(success, message);
    this.setAttempts.push({ success, label: message, skipped: message === "Skipped", firstTouchTime: this.firstTouchTime, gateSpeed: this.gateSpeed, incomingSpeed: this.incomingSpeed, receivedSpeed: this.receivedSpeed });
    if (this.setAttempts.length === 10) {
      training[this.variant].record(this.masteryStep, this.varied, this.setAttempts);
      this.setAttempts = [];
    }
  }

  updateDrillStatus() {
    super.updateDrillStatus();
    if (!training[this.variant]) return;
    if (this.coach && this.coach.setup !== this.setup) this.refreshCoaching({}, 0);
    this.coachView?.render(this.coaching);
    const summary = training[this.variant].summary(this.masteryStep, this.varied);
    const score = this.setAttempts?.filter(attempt => attempt.success).length || 0;
    const detail = MOVEMENT_TRAINING[this.variant] ? `${this.varied ? "Varied" : "Fixed"} setup` : this.variant === "recovery" ? `${this.varied ? "Varied" : "Fixed"} recovery / ${formatSpeed(Math.hypot(this.physCar.vel.x, this.physCar.vel.y))}` : this.variant === "rollTouch" ? `${this.varied ? "Varied" : "Fixed"} aerial approach` : this.variant === "soft" ? `${this.varied ? "Varied" : "Fixed"} arrival · ${this.receivedSpeed == null ? "Reduce speed 40%" : `${formatSpeed(this.incomingSpeed)} → ${formatSpeed(this.receivedSpeed)}`}` : this.result ? `${this.firstTouchTime?.toFixed(2) || "-"} s to touch${this.gateSpeed === null ? "" : ` / ${formatSpeed(this.gateSpeed)} at gate`}` : this.masteryStep === 3 ? "Gate pace 28.8-43.2 km/h" : this.varied ? "Varied setup" : "Fixed setup";
    this.ctx.hud.status.textContent += ` · ${this.practiceRetry ? "Unscored retry" : `Set ${this.setAttempts.length}/10, ${score} hits`} · ${detail}${summary.mastered ? " · Mastery milestone reached" : ""}`;
    if (this.variant === "rollTouch") this.ctx.hud.status.textContent += ` · ${this.receivedSpeed == null ? "Roll, align, touch" : `${formatSpeed(this.receivedSpeed)} release`}`;
    if (this.retryButton) this.retryButton.disabled = !this.lastMissSetup;
  }

  stop() {
    if (training[this.variant] && this.elapsed > 0 && !this.result) this.finishRound(false, "Skipped");
    if (training[this.variant] && this.setAttempts?.length) training[this.variant].record(this.masteryStep, this.varied, this.setAttempts);
    this.retryPanel?.remove();
    this.coachView?.dispose();
    if (this.gate) disposeScene(this.gate);
    super.stop();
  }
}