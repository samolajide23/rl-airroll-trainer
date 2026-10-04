import * as THREE from "three";
import { FreePlayMode } from "./freePlay.js";
import { NextoBot } from "../shared/nextoBot.js";
import { stepRocketSimMatch, syncRocketSimPads, releaseRocketSimWorld } from "../shared/rocketSimRuntime.js";
import { makeCar, disposeCarVisual } from "../shared/car.js";
import { makePhysCar, RL, applyToCarModel, alignCarVisualToHitbox, withFreeAirRoll } from "../shared/carPhysics.js";
import { syncCarWheels } from "../shared/carVisualCalibration.js";
import { ARENA_UU } from "../shared/soccarArena.js";
import { getPad } from "../shared/settings.js";
import { physToThree } from "../shared/rl-physics.js";

export class Arena1v1Mode extends FreePlayMode {
  constructor(ctx) {
    super(ctx, { diagnostics: false, training: true });
    this.title = "Arena 1v1 | Nexto";
    this.modeId = "arena-1v1";
    this.nexto = new NextoBot();
    this.opponentMesh = makeCar(0xff7043, 1, { carId: this.carId, markers: false });
    this.opponentMesh.traverse(object => {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material?.color && /(^paint$|body)/i.test(material.name)) material.color.setHex(0xffa047);
      }
    });
    this.opponentMesh.userData.physicsOrigin = "root";
    this.root.add(this.opponentMesh);
    this.score = [0, 0];
    this.matchElapsed = 0;
    this.goalPause = 0;
    this.finished = false;
  }

  resetState() {
    this.score = [0, 0];
    this.matchElapsed = 0;
    this.finished = false;
    this.resetKickoff();
  }

  resetKickoff() {
    releaseRocketSimWorld(this);
    super.resetState();
    this.physCar.team = 0;
    this.opponent = makePhysCar(new THREE.Vector3(0, 4608, 17), -Math.PI / 2, this.hitbox);
    this.opponent.team = 1;
    this.opponent.id = 2;
    this.opponent.boost = RL.BOOST_SPAWN;
    this.nexto.reset();
    this.goalPause = 0;
    this.syncOpponent();
  }

  _stepOnce(dt, input = {}) {
    if (this.finished || this.goalPause > 0 || !this.nexto.ready || this.nexto.error || this.nexto.pending || this.nexto.remaining <= 0) return;
    this.physCar.dodgeDeadzone = getPad().dodgeDeadzone;
    const controls = withFreeAirRoll(input, this.physCar);
    const contacts = stepRocketSimMatch(this, [this.physCar, this.opponent], this.physBall, [controls, this.nexto.input], dt);
    const contact = contacts.find(Boolean);
    if (contact && !this.effectContactHeld) {
      this.contactEffects.hit(physToThree(contact.point, new THREE.Vector3()).multiplyScalar(ARENA_UU));
    }
    this.effectContactHeld = Boolean(contact);
    const spin = physToThree(this.physBall.omega, this.ballSpin).negate();
    if (spin.lengthSq() > 1e-10) {
      const angle = spin.length() * dt;
      this.ballSpinRotation.setFromAxisAngle(spin.normalize(), angle);
      this.ballVisual.quaternion.premultiply(this.ballSpinRotation);
    }
    syncRocketSimPads(this.pads, this);
    this.nexto.remaining -= 1;
    this.boosting = Boolean(this.physCar.isBoosting);
    this.sliding = Boolean(controls.handbrake ?? controls.powerslide) && this.physCar.onGround;
    syncCarWheels(this.carMesh, this.physCar, dt);
    syncCarWheels(this.opponentMesh, this.opponent, dt);
    this.tick += 1;
    this.matchElapsed += dt;
    if (Math.abs(this.physBall.pos.y) > 5120 + RL.BALL_RADIUS && Math.abs(this.physBall.pos.x) < 893 && this.physBall.pos.z < 642) {
      this.score[this.physBall.pos.y > 0 ? 0 : 1] += 1;
      this.goalPause = 1.5;
    }
    if (this.matchElapsed >= 300 && this.score[0] !== this.score[1]) this.finished = true;
    if (!this.finished && this.goalPause <= 0) this.nexto.request(this.opponent, this.physCar, this.physBall, this.pads);
  }

  syncOpponent() {
    if (!this.opponent) return;
    applyToCarModel(this.opponent, this.opponentMesh, ARENA_UU);
    alignCarVisualToHitbox(this.opponentMesh, this.opponent.hitbox, ARENA_UU);
    this.opponentMesh.userData.setBoost?.(Boolean(this.opponent.isBoosting));
  }

  update(dt, now) {
    if (this.goalPause > 0) {
      this.goalPause -= dt;
      if (this.goalPause <= 0 && !this.finished) this.resetKickoff();
    }
    if (!this.finished && this.goalPause <= 0) this.nexto.request(this.opponent, this.physCar, this.physBall, this.pads);
    const paused = this.finished || this.goalPause > 0 || !this.nexto.ready || this.nexto.error || this.nexto.pending;
    super.update(dt, now, paused ? 0 : dt);
    this.syncOpponent();
  }

  updateDrillStatus() {
    const remaining = Math.max(0, 300 - this.matchElapsed);
    const minutes = Math.floor(remaining / 60);
    const seconds = String(Math.floor(remaining % 60)).padStart(2, "0");
    this.ctx.hud.status.textContent = this.nexto.error ? `Nexto unavailable: ${this.nexto.error}`
      : !this.nexto.ready ? "Loading Nexto" : this.finished ? (this.score[0] > this.score[1] ? "You win" : "Nexto wins")
      : this.goalPause > 0 ? "Goal" : `You ${this.score[0]} : ${this.score[1]} Nexto | ${this.matchElapsed >= 300 ? "Overtime" : `${minutes}:${seconds}`}`;
    this.setScoreRow(this.score[0], this.score[1], `${minutes}:${seconds}`, "Nexto");
  }

  stop() {
    this.nexto.dispose();
    releaseRocketSimWorld(this);
    disposeCarVisual(this.opponentMesh);
    super.stop();
  }
}