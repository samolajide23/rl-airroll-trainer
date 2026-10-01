import * as THREE from "three";
import { BallContactMode } from "./ballContact.js";
import { generateMovementSetup, MOVEMENT_TRAINING } from "../shared/movementTraining.js";
import { ARENA_UU } from "../shared/soccarArena.js";
import { physToThree } from "../shared/carPhysics.js";
import { disposeScene } from "../shared/disposeScene.js";

export class MovementMode extends BallContactMode {
  constructor(ctx, options = {}) {
    super(ctx, { ...options, variant: options.variant ?? "driving" });
    this.targetGroup = new THREE.Group();
    this.root.add(this.targetGroup);
    this.targetMarkers = Array.from({ length: 3 }, () => {
      const marker = new THREE.Mesh(new THREE.RingGeometry(150 * ARENA_UU, 180 * ARENA_UU, 48), new THREE.MeshBasicMaterial({ color: 0x83cdec, side: THREE.DoubleSide }));
      marker.rotation.x = -Math.PI / 2;
      this.targetGroup.add(marker);
      return marker;
    });
  }

  setupRound() {
    this.masteryStep ??= 0;
    this.setAttempts ??= [];
    this.setupIndex ??= 0;
    this.setup = this.retrySetup || generateMovementSetup(this.variant, this.masteryStep, this.varied, this.setupIndex++);
    this.retrySetup = null;
    this.spawn([0, 0, this.hitbox.restZ], null, this.setup.yaw);
    this.physCar.vel.fromArray(this.setup.velocity);
    this.origin = this.physCar.pos.clone();
    this.nextTarget = 0;
    this.hold = 0;
    this.boostTime = 0;
    this.steerTime = 0;
    this.braked = false;
    this.jumped = false;
    this.doubleJumped = false;
    this.flipped = false;
    this.jumpHold = 0;
    this.maxHeight = 0;
    this.dodgeDirection = null;
    this.previousVelocity = this.physCar.vel.clone();
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.physCar.q);
    const right = new THREE.Vector3(0, -1, 0).applyQuaternion(this.physCar.q);
    this.requestedDirection = this.setup.dodge === "backward" ? forward.negate() : this.setup.dodge === "left" ? right.negate() : this.setup.dodge === "right" ? right : forward;
    this.prompt = MOVEMENT_TRAINING[this.variant].steps[this.masteryStep].title;
    this.refreshTargets();
  }

  refreshTargets() {
    this.targetMarkers?.forEach((marker, index) => {
      marker.visible = this.variant === "driving" && index < this.setup.targets.length;
      if (!marker.visible) return;
      physToThree(new THREE.Vector3(...this.setup.targets[index]), marker.position).multiplyScalar(ARENA_UU);
      marker.position.y = 0.035;
      marker.material.color.setHex(index < this.nextTarget ? 0x6cda9a : index === this.nextTarget ? 0xffd166 : 0x83cdec);
    });
  }

  evaluateStep(dt, controls) {
    if (this.variant === "driving") return this.evaluateDriving(dt, controls);
    return this.evaluateJump(dt, controls);
  }

  evaluateDriving(dt, controls) {
    const car = this.physCar;
    const step = this.masteryStep;
    const target = new THREE.Vector3(...this.setup.targets[this.nextTarget]);
    const position = car.pos.clone().setZ(0);
    const speed = Math.hypot(car.vel.x, car.vel.y);
    this.boostTime += car.isBoosting ? dt : 0;
    this.steerTime += Math.abs(controls.steer || 0) * dt;
    this.braked ||= controls.throttle < -0.1;
    if (controls.jump || car.hasJumped) return this.finishRound(false, "Keep the wheels down");
    if (step === 0 && car.isBoosting) return this.finishRound(false, "Throttle only");
    if (step === 0 && Math.abs(car.pos.x) > 180) return this.finishRound(false, "Left the lane");
    const distance = position.distanceTo(target);
    const wheelsDown = car.onGround && new THREE.Vector3(0, 0, 1).applyQuaternion(car.q).z >= 0.92;
    this.progress = Math.max(0, 1 - distance / 2000);
    this.prompt = step === 4 ? `Target ${this.nextTarget + 1} / 3` : step === 3 ? "Brake inside the yellow target" : "Reach the yellow target";
    if (step === 3 && car.pos.y > target.y + 350) return this.finishRound(false, "Overshot the stop");
    if (step === 3) {
      this.hold = wheelsDown && distance <= 180 && speed < 150 && this.braked ? this.hold + dt : 0;
      if (this.hold >= 0.25 - 1e-9) this.finishRound(true, "Controlled stop");
      return;
    }
    if (!wheelsDown || distance > 180) return;
    if (step === 1) {
      const start = this.nextTarget ? new THREE.Vector3(...this.setup.targets[this.nextTarget - 1]) : new THREE.Vector3();
      const direction = target.clone().sub(start).normalize();
      const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(car.q).setZ(0).normalize();
      if (this.steerTime < 0.1 || forward.dot(direction) < Math.cos(Math.PI / 6)) return;
    }
    if (step === 2 && (this.boostTime < 0.1 || speed < 1600)) return;
    this.nextTarget += 1;
    this.refreshTargets();
    if (this.nextTarget === this.setup.targets.length) this.finishRound(true, "Route complete");
  }

  evaluateJump(dt, controls) {
    const car = this.physCar;
    const step = this.masteryStep;
    if (car.isBoosting) return this.finishRound(false, "No boost in this stage");
    this.jumped ||= car.hasJumped;
    this.doubleJumped ||= car.hasDoubleJumped;
    if (car.hasFlipped && !this.flipped) {
      this.flipped = true;
      this.dodgeDirection = car.vel.clone().sub(this.previousVelocity).setZ(0).normalize();
      if (step >= 3 && this.dodgeDirection.dot(this.requestedDirection) < Math.cos(Math.PI / 6)) return this.finishRound(false, "Wrong dodge direction");
    }
    this.previousVelocity.copy(car.vel);
    this.jumpHold += car.jumping && controls.jump ? dt : 0;
    this.maxHeight = Math.max(this.maxHeight, car.pos.z - this.origin.z);
    if (step <= 1 && (this.doubleJumped || this.flipped)) return this.finishRound(false, "Single jump only");
    if (step === 2 && this.flipped) return this.finishRound(false, "Neutral second jump required");
    const height = [60, 180, 250, 0, 0][step];
    const travel = car.pos.clone().sub(this.origin).dot(this.requestedDirection);
    const qualified = this.jumped && this.maxHeight >= height && (step !== 1 || this.jumpHold >= 0.18 - 1e-9) && (step !== 2 || this.doubleJumped) && (step < 3 || this.flipped && travel >= (step === 3 ? 400 : 300));
    const upright = new THREE.Vector3(0, 0, 1).applyQuaternion(car.q).z >= 0.92;
    this.hold = qualified && car.onGround && upright && car.omega.length() < 0.6 ? this.hold + dt : 0;
    this.progress = step >= 3 ? Math.max(0, Math.min(1, travel / (step === 3 ? 400 : 300))) : Math.min(1, this.maxHeight / height);
    this.prompt = step >= 3 ? `Dodge ${this.setup.dodge}, then land wheels-down` : "Jump, then land wheels-down";
    if (this.hold >= 0.25 - 1e-9) this.finishRound(true, "Jump and landing complete");
  }

  updateDrillStatus() {
    super.updateDrillStatus();
    if (!this.physCar) return;
    this.ctx.hud.status.textContent = this.ctx.hud.status.textContent.replace(/ · \d+ touches/, '');
    this.ctx.hud.status.textContent += this.variant === "driving" ? ` · ${Math.round(Math.hypot(this.physCar.vel.x, this.physCar.vel.y))} uu/s` : ` · ${Math.round(this.maxHeight || 0)} uu peak height`;
  }

  stop() {
    disposeScene(this.targetGroup);
    super.stop();
  }
}