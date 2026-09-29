import * as THREE from "three";
import { FixedStepClock } from "../shared/aerial.js";
import { BoostTrail } from "../shared/boostTrail.js";
import { makeCar } from "../shared/car.js";
import { ChaseCamera } from "../shared/chaseCamera.js";
import {
  inputSourceLabel,
  isActionDown,
  readControls,
} from "../shared/input.js";
import { formatControlsHelp, onBindsChange } from "../shared/settings.js";
import {
  RL,
  applyToCarModel,
  collideCarBall,
  makeBall,
  makeCar as makePhysCar,
  stepBall,
  stepCar,
} from "../shared/rl-physics.js";
import { ARENA_UU, createSoccarArena } from "../shared/soccarArena.js";

/** Visual car scale so GLB/procedural length ≈ Octane at UU mapping. */
const CAR_SCALE = 0.4;
const BALL_VIS_R = RL.BALL_RADIUS * ARENA_UU;

/**
 * Free drive around a soccar arena — ground + aerials + ball.
 */
export class FreePlayMode {
  /** @param {object} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.title = "Free Play";
    this.modeId = "free-play";
    this.root = new THREE.Group();

    this.arenaMesh = createSoccarArena();
    this.root.add(this.arenaMesh);

    this.carMesh = makeCar(0xffffff);
    this.carMesh.scale.setScalar(CAR_SCALE);
    this.root.add(this.carMesh);

    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_VIS_R, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0xd8dde8,
        roughness: 0.45,
        metalness: 0.15,
      }),
    );
    this.root.add(this.ballMesh);

    this.physCar = makePhysCar(
      new THREE.Vector3(0, -2560, RL.REST_HEIGHT),
      Math.PI / 2,
    );
    this.physBall = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
    this.tick = 0;
    this.boosting = false;

    this.clock = new FixedStepClock();
    this.chase = new ChaseCamera();
    this.trail = new BoostTrail(this.root);
    this.trail.attachFlames(this.carMesh);

    this.forward = new THREE.Vector3();
    this.velThree = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);

    this.spaceLatch = false;
    this.rLatch = false;
    /** @type {null | (() => void)} */
    this._unbindHelp = null;
    /** @type {null | { bg: number, fogNear: number, fogFar: number, far: number }} */
    this._prevScene = null;
  }

  start() {
    const { hud, scene, arena, camera } = this.ctx;
    hud.modeTitle.textContent = this.title;
    hud.root.classList.remove("hidden");
    if (hud.alignMeter) hud.alignMeter.classList.add("hidden");
    if (hud.boostMeter) hud.boostMeter.classList.remove("hidden");
    if (hud.help) {
      hud.help.textContent = `${formatControlsHelp()} · Skip resets the ball`;
    }
    this.setScoreRow(0, 0, 0, "Free");
    hud.status.textContent =
      "Drive the arena — WASD / stick to drive, jump, boost, air roll";

    this._prevScene = {
      bg: scene.background?.getHex?.() ?? 0x0b1220,
      fogNear: scene.fog?.near ?? 40,
      fogFar: scene.fog?.far ?? 120,
      far: camera.far,
    };
    scene.background = new THREE.Color(0x87b5d9);
    if (scene.fog) {
      scene.fog.color.set(0x87b5d9);
      scene.fog.near = 80;
      scene.fog.far = 220;
    }
    camera.far = 400;
    camera.updateProjectionMatrix();
    if (arena) arena.visible = false;

    scene.add(this.root);
    this._unbindHelp = onBindsChange(() => {
      if (hud.help) {
        hud.help.textContent = `${formatControlsHelp()} · Skip resets the ball`;
      }
    });
    this.resetState();
  }

  stop() {
    const { hud, scene, arena, camera } = this.ctx;
    hud.root.classList.add("hidden");
    if (hud.alignMeter) hud.alignMeter.classList.add("hidden");
    if (hud.boostMeter) hud.boostMeter.classList.add("hidden");
    scene.remove(this.root);
    if (this._unbindHelp) {
      this._unbindHelp();
      this._unbindHelp = null;
    }
    if (this._prevScene) {
      scene.background = new THREE.Color(this._prevScene.bg);
      if (scene.fog) {
        scene.fog.color.set(this._prevScene.bg);
        scene.fog.near = this._prevScene.fogNear;
        scene.fog.far = this._prevScene.fogFar;
      }
      camera.far = this._prevScene.far;
      camera.updateProjectionMatrix();
      this._prevScene = null;
    }
    if (arena) arena.visible = true;
    this.chase.invalidate();
  }

  resetState() {
    this.physCar = makePhysCar(
      new THREE.Vector3(0, -2560, RL.REST_HEIGHT),
      Math.PI / 2,
    );
    this.physBall = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
    this.physBall.vel.set(0, 0, 0);
    this.tick = 0;
    this.boosting = false;
    this.clock.reset();
    this.chase.invalidate();
    this.syncMeshes();
    this.forward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    this.chase.snap(this.ctx.camera, this.carMesh.position, this.forward);
    this.updateBoostMeter();
    this.ctx.hud.status.textContent =
      "Reset — blue half. Drive, jump, boost, air roll.";
  }

  syncMeshes() {
    applyToCarModel(this.physCar, this.carMesh, ARENA_UU);
    this.carMesh.scale.setScalar(CAR_SCALE);
    // Mesh origin is near the wheels; physics pos is CoM at REST_HEIGHT.
    this.carMesh.position.y -= RL.REST_HEIGHT * ARENA_UU;
    this.ballMesh.position.set(
      this.physBall.pos.x * ARENA_UU,
      this.physBall.pos.z * ARENA_UU,
      -this.physBall.pos.y * ARENA_UU,
    );
  }

  updateBoostMeter() {
    const el = this.ctx.hud.boostValue;
    const fill = this.ctx.hud.boostFill;
    // Trainer physics keeps boost topped up while boosting.
    if (el) el.textContent = "∞";
    if (fill) {
      fill.style.setProperty("--boost-pct", "100");
      fill.classList.remove("empty");
    }
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

  /** Map pitch/yaw keys onto throttle/steer like a single RL stick. */
  driveControls() {
    const c = readControls();
    return {
      throttle: c.throttle || c.pitch,
      steer: c.steer || c.yaw,
      pitch: c.pitch,
      yaw: c.yaw,
      roll: c.roll,
      boost: c.boost,
      jump: c.jump,
      airLeft: c.airLeft,
      airRight: c.airRight,
      usingPad: c.usingPad,
      usingTouch: c.usingTouch,
    };
  }

  /** Soft wall bounce beyond the hard clamp in stepCar. */
  bounceField() {
    const margin = 80;
    const e = 0.35;
    const xMax = RL.HALF_W - margin;
    const yMax = RL.HALF_L - margin;
    const car = this.physCar;
    if (car.pos.x > xMax) {
      car.pos.x = xMax;
      if (car.vel.x > 0) car.vel.x *= -e;
    } else if (car.pos.x < -xMax) {
      car.pos.x = -xMax;
      if (car.vel.x < 0) car.vel.x *= -e;
    }
    const inGoal =
      Math.abs(car.pos.x) < 892 && car.pos.z < 642 + RL.REST_HEIGHT;
    const yLimit = inGoal ? RL.HALF_L + 400 : yMax;
    if (car.pos.y > yLimit) {
      car.pos.y = yLimit;
      if (car.vel.y > 0) car.vel.y *= -e;
    } else if (car.pos.y < -yLimit) {
      car.pos.y = -yLimit;
      if (car.vel.y < 0) car.vel.y *= -e;
    }
  }

  /** @param {number} dt */
  _stepOnce(dt) {
    const input = this.driveControls();
    this.boosting = Boolean(input.boost);
    stepCar(this.physCar, input, dt);
    this.bounceField();
    stepBall(this.physBall, dt);
    collideCarBall(this.physCar, this.physBall, this.tick);
    this.tick += 1;

    const { hud } = this.ctx;
    hud.padStatus.textContent = inputSourceLabel(input);
    hud.padStatus.classList.toggle("on", input.usingPad || !!input.usingTouch);
    hud.arl.classList.toggle("on", input.airLeft);
    hud.arr.classList.toggle("on", input.airRight);

    this.carMesh.userData.setBoost?.(this.boosting);
    this.syncMeshes();
  }

  pollUtilityKeys() {
    const nt = isActionDown("newTarget");
    if (nt && !this.spaceLatch) {
      this.spaceLatch = true;
      this.physBall = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
      this.ctx.hud.status.textContent = "Ball reset to centre";
    }
    if (!nt) this.spaceLatch = false;

    const rd = isActionDown("resetCar");
    if (rd && !this.rLatch) {
      this.rLatch = true;
      this.resetState();
    }
    if (!rd) this.rLatch = false;
  }

  /** @param {number} dt */
  updateCamera(dt) {
    this.forward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    this.velThree.set(
      this.physCar.vel.x * ARENA_UU,
      this.physCar.vel.z * ARENA_UU,
      -this.physCar.vel.y * ARENA_UU,
    );
    this.chase.update(this.ctx.camera, dt, {
      target: this.carMesh.position,
      forward: this.forward,
      velocity: this.velThree,
      worldUp: this.worldUp,
      onGround: this.physCar.onGround,
    });
  }

  /**
   * @param {number} dt
   * @param {number} _now
   */
  update(dt, _now) {
    this.pollUtilityKeys();
    this.clock.advance(dt, (tickDt) => {
      this._stepOnce(tickDt);
    });
    this.updateBoostMeter();
    this.trail.update(this.carMesh, this.boosting, dt);
    this.updateCamera(dt);

    const speed = this.physCar.vel.length();
    const state = this.physCar.onGround ? "Ground" : "Air";
    this.ctx.hud.status.textContent = `${state} · ${speed.toFixed(0)} uu/s · boost ${Math.round(this.physCar.boost)}`;
  }
}
