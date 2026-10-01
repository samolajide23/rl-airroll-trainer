import * as THREE from "three";
import { FreePlayMode } from "../modes/freePlay.js";
import { makePhysCar, makeBall, RL } from "./carPhysics.js";
import { formatConsistency, recordAttempt } from "./metrics.js";
import { formatControlsHelp, onBindsChange } from "./settings.js";

export class ArenaDrillBase extends FreePlayMode {
  constructor(ctx, title) {
    super(ctx, { diagnostics: false, training: true });
    this.title = title;
    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.round = 0;
    this.elapsed = 0;
    this.touches = 0;
    this.contactHeld = false;
    this.result = null;
    this.resultTime = 0;
    this.progress = 0;
    this.prompt = "";
    this.roundLimit = 15;
  }

  start() {
    super.start();
    this.ctx.hud.root.classList.remove("freeplay-hud");
    this.ctx.hud.alignMeter?.classList.remove("hidden");
    this.updateDrillStatus();
    this._unbindHelp?.();
    const updateHelp = () => {
      if (this.ctx.hud.help) this.ctx.hud.help.textContent = formatControlsHelp();
    };
    updateHelp();
    this._unbindHelp = onBindsChange(updateHelp);
  }

  resetState() {
    if (this.elapsed > 0 && !this.result) this.finishRound(false, "Round restarted");
    super.resetState();
    this.round += 1;
    this.elapsed = 0;
    this.touches = 0;
    this.contactHeld = false;
    this.result = null;
    this.resultTime = 0;
    this.progress = 0;
    this.setupRound();
    this.syncMeshes();
    this.forward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    this.chase.snap(this.ctx.camera, this.carMesh.position, this.forward);
    this.updateBoostMeter();
    this.updateDrillStatus();
  }

  spawn(carPosition, ballPosition, yaw = Math.PI / 2) {
    this.physCar = makePhysCar(new THREE.Vector3(...carPosition), yaw, this.hitbox);
    this.physCar.id = 1;
    this.physCar.boost = RL.BOOST_MAX;
    this.physBall = ballPosition ? makeBall(new THREE.Vector3(...ballPosition)) : null;
  }

  onPhysicsStep(dt, controls, contact) {
    if (this.result) {
      this.resultTime += dt;
      return;
    }
    this.elapsed += dt;
    const newContact = Boolean(contact) && !this.contactHeld;
    if (newContact) this.touches += 1;
    this.contactHeld = Boolean(contact);
    this.evaluateStep(dt, controls, newContact);
    if (!this.result && this.elapsed >= this.roundLimit) this.finishRound(false, "Time expired");
  }

  update(dt, now) {
    if (this.resultTime >= 1.2) this.resetState();
    super.update(dt, now);
  }

  finishRound(success, message) {
    if (this.result) return;
    this.result = { success, message };
    this.resultTime = 0;
    if (success) {
      this.hits += 1;
      this.streak += 1;
      this.best = Math.max(this.best, this.streak);
    } else this.streak = 0;
    recordAttempt(this.modeId, { success, touches: this.touches, duration: this.elapsed });
  }

  updateDrillStatus() {
    this.setScoreRow(this.hits, this.streak, this.best, formatConsistency(this.modeId));
    this.ctx.hud.status.textContent = this.result?.message ?? `${this.prompt} · ${this.touches} touches · ${Math.max(0, this.roundLimit - this.elapsed).toFixed(1)} s`;
    if (this.ctx.hud.alignFill) this.ctx.hud.alignFill.style.width = `${Math.round(THREE.MathUtils.clamp(this.progress, 0, 1) * 100)}%`;
  }
}