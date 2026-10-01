import * as THREE from "three";
import { ArenaDrillBase } from "../shared/arenaDrill.js";
import { RL } from "../shared/carPhysics.js";
import { applyFreePlayBallControl } from "../shared/freePlayBallControls.js";

export class DribbleBridgeMode extends ArenaDrillBase {
  constructor(ctx, options = {}) {
    const variant = options.variant ?? "popChase";
    const titles = { popChase: "Pop & Chase", boostTap: "Boost Tapping", hover: "Hover & Hold", wallAir: "Wall-to-Air", steerDribble: "Side-Steer Dribble" };
    super(ctx, titles[variant] ?? titles.popChase);
    this.variant = variant;
    this.modeId = `dribble-${variant}`;
    this.holdTime = 0;
    this.boostTime = 0;
    this.airTouches = 0;
    this.startPosition = new THREE.Vector3();
  }

  setupRound() {
    this.holdTime = 0;
    this.boostTime = 0;
    this.airTouches = 0;
    this.spawn([0, -1000, this.hitbox.restZ], [0, -800, RL.BALL_REST_Z]);
    this.physBall = applyFreePlayBallControl("startDribble", this.physCar, this.physBall);
    this.prompt = "Pop the ball and follow for two aerial touches";
    if (this.variant !== "popChase") {
      this.spawn([0, -600, 650], [0, -410, 790]);
      this.physCar.onGround = false;
      this.physCar.vel.set(0, 400, 150);
      this.physBall.vel.set(0, 400, 150);
      this.physCar.q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.55));
    }
    if (this.variant === "boostTap") this.prompt = "Meet the ball with less than 1.35 s of boost";
    if (this.variant === "hover") this.prompt = "Stay close in the air for 3 s after a touch";
    if (this.variant === "steerDribble") this.prompt = "Carry through a 250 uu sideways change";
    if (this.variant === "wallAir") {
      this.spawn([RL.HALF_W - this.hitbox.restZ, -1000, 500], [RL.HALF_W - RL.BALL_RADIUS - 10, -850, 680]);
      const forward = new THREE.Vector3(0, 0, 1);
      const right = new THREE.Vector3(0, 1, 0);
      const up = new THREE.Vector3(-1, 0, 0);
      this.physCar.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, right, up));
      this.physCar.onGround = false;
      this.physCar.vel.set(0, 0, 500);
      this.physBall.vel.set(0, 0, 550);
      this.prompt = "Leave the wall and make an aerial touch";
    }
    this.startPosition.copy(this.physCar.pos);
  }

  evaluateStep(dt, controls, newContact) {
    if (this.physCar.isBoosting) this.boostTime += dt;
    const airborne = !this.physCar.onGround && this.physCar.pos.z > 200;
    if (newContact && airborne) this.airTouches += 1;
    const close = this.physCar.pos.distanceTo(this.physBall.pos) < 300;
    const matching = this.physCar.vel.distanceTo(this.physBall.vel) < 500;
    if (this.variant === "popChase") {
      this.progress = this.airTouches / 2;
      if (this.airTouches >= 2) this.finishRound(true, "Pop and chase complete");
    } else if (this.variant === "boostTap") {
      if (newContact && airborne) this.finishRound(this.boostTime <= 1.35, this.boostTime <= 1.35 ? "Controlled boost touch" : "Boost budget exceeded");
      else if (this.boostTime > 1.35) this.finishRound(false, "Boost budget exceeded");
      this.progress = this.boostTime / 1.35;
    } else if (this.variant === "hover") {
      this.holdTime = this.airTouches > 0 && airborne && close && matching ? this.holdTime + dt : 0;
      this.progress = this.holdTime / 3;
      if (this.holdTime >= 3) this.finishRound(true, "Aerial hold complete");
    } else if (this.variant === "steerDribble") {
      const lateral = Math.abs(this.physCar.pos.x - this.startPosition.x);
      this.progress = lateral / 250;
      if (this.airTouches > 0 && airborne && close && matching && lateral >= 250) this.finishRound(true, "Sideways carry complete");
    } else if (this.variant === "wallAir") {
      const offWall = this.physCar.pos.x < RL.HALF_W - 250;
      this.progress = Math.max(0, (RL.HALF_W - this.physCar.pos.x) / 250);
      if (newContact && airborne && offWall && !this.physCar.wheelsContact) this.finishRound(true, "Wall-to-air touch complete");
    }
  }
}