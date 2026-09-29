import * as THREE from "three";
import { BoostTrail } from "../shared/boostTrail.js";
import { makeCar } from "../shared/car.js";
import {
  FixedStepClock,
  RL,
  alignCarVisualToHitbox,
  applyToCarModel,
  canFlipOrJump,
  collideCarBall,
  createBoostPadMeshes,
  createHitboxHelper,
  createSoccarBoostPads,
  getHitboxForCarId,
  makeBall,
  makePhysCar,
  physToThree,
  resetBoostPads,
  stepBall,
  stepBoostPads,
  stepCar,
  syncHitboxHelper,
} from "../shared/carPhysics.js";
import { ChaseCamera } from "../shared/chaseCamera.js";
import {
  inputSourceLabel,
  isActionDown,
  pollBallCamToggle,
  readControls,
} from "../shared/input.js";
import { getSelectedCarId } from "../shared/loadout.js";
import {
  formatControlsHelp,
  getCamera,
  onBindsChange,
  setCamera,
} from "../shared/settings.js";
import { ARENA_UU, createSoccarArena } from "../shared/soccarArena.js";

const BALL_VIS_R = RL.BALL_RADIUS * ARENA_UU;

/**
 * RL's free air-roll bind: holding powerslide while airborne turns the yaw
 * axis into roll (unless a directional air-roll button is already held).
 * @param {ReturnType<typeof readControls>} input
 * @param {{ onGround: boolean }} car
 */
function withFreeAirRoll(input, car) {
  if (car.onGround || !input.powerslide || input.roll !== 0) return input;
  return { ...input, roll: input.yaw, yaw: 0 };
}

/**
 * Free drive around a soccar arena — ground + aerials + ball.
 * Car / hitbox motion uses the shared {@link stepCar} from `carPhysics.js`.
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

    this.pads = createSoccarBoostPads();
    this.padMeshes = createBoostPadMeshes(this.root, this.pads);

    this.carId = getSelectedCarId();
    this.hitbox = getHitboxForCarId(this.carId);
    this.carMesh = makeCar(0xffffff, 1, { carId: this.carId });
    this.carMesh.userData.physicsOrigin = "root";
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

    this.hitboxHelper = createHitboxHelper();
    this.root.add(this.hitboxHelper);

    const spawn0 = RL.SOCCAR_SPAWNS[4];
    this.physCar = makePhysCar(
      new THREE.Vector3(spawn0.x, spawn0.y, this.hitbox.restZ),
      spawn0.yaw,
      this.hitbox,
    );
    this.physCar.boost = RL.BOOST_SPAWN;
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
    /** @type {{ wasDown: boolean }} */
    this.ballCamLatch = { wasDown: false };
    /** @type {null | (() => void)} */
    this._unbindHelp = null;
    /** @type {null | { bg: number, fogNear: number, fogFar: number, far: number }} */
    this._prevScene = null;
  }

  start() {
    const { hud, scene, arena, camera } = this.ctx;
    const carId = getSelectedCarId();
    if (carId !== this.carId) {
      this.root.remove(this.carMesh);
      this.carId = carId;
      this.hitbox = getHitboxForCarId(carId);
      this.carMesh = makeCar(0xffffff, 1, { carId });
      this.carMesh.userData.physicsOrigin = "root";
      this.root.add(this.carMesh);
      this.trail.attachFlames(this.carMesh);
    }

    hud.modeTitle.textContent = this.title;
    hud.root.classList.remove("hidden");
    if (hud.alignMeter) hud.alignMeter.classList.add("hidden");
    if (hud.boostMeter) hud.boostMeter.classList.remove("hidden");
    if (hud.help) {
      hud.help.textContent = `${formatControlsHelp()} · Skip resets the ball`;
    }
    this.setScoreRow(0, 0, 0, this.hitbox.label);
    hud.status.textContent =
      "Drive the arena — WASD moves the car & hitbox";

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
    this.hitbox = getHitboxForCarId(this.carId);
    // RocketSim center kickoff slot (CAR_SPAWN_LOCATIONS_SOCCAR[4]).
    const spawn = RL.SOCCAR_SPAWNS[4];
    this.physCar = makePhysCar(
      new THREE.Vector3(spawn.x, spawn.y, this.hitbox.restZ),
      spawn.yaw,
      this.hitbox,
    );
    this.physCar.infiniteBoost = false;
    this.physCar.boost = RL.BOOST_SPAWN;
    this.physBall = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
    this.physBall.vel.set(0, 0, 0);
    this.tick = 0;
    this.boosting = false;
    resetBoostPads(this.pads);
    this.clock.reset();
    this.chase.invalidate();
    this.syncMeshes();
    this.forward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    this.chase.snap(this.ctx.camera, this.carMesh.position, this.forward);
    this.updateBoostMeter();
    this.setScoreRow(0, 0, 0, this.hitbox.label);
    this.ctx.hud.status.textContent = `Reset — ${this.hitbox.label} hitbox · blue half`;
  }

  syncMeshes() {
    applyToCarModel(this.physCar, this.carMesh, ARENA_UU);
    alignCarVisualToHitbox(this.carMesh, this.physCar.hitbox, ARENA_UU);
    physToThree(this.physBall.pos, this.ballMesh.position).multiplyScalar(ARENA_UU);
    syncHitboxHelper(this.hitboxHelper, this.physCar, ARENA_UU);
  }

  updateBoostMeter() {
    const el = this.ctx.hud.boostValue;
    const fill = this.ctx.hud.boostFill;
    const amt = Math.max(0, Math.min(100, this.physCar?.boost ?? 0));
    if (el) el.textContent = String(Math.round(amt));
    if (fill) {
      fill.style.setProperty("--boost-pct", String(amt));
      fill.classList.toggle("empty", amt < 0.5);
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

  /** @param {number} dt */
  _stepOnce(dt) {
    const input = readControls();
    stepCar(this.physCar, withFreeAirRoll(input, this.physCar), dt);
    if (!this.physCar.id) this.physCar.id = 1;
    stepBoostPads(this.pads, this.physCar, dt);
    this.boosting = Boolean(this.physCar.isBoosting);
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

    if (pollBallCamToggle(this.ballCamLatch)) {
      const next = !getCamera().ballCam;
      setCamera("ballCam", next);
      this.ctx.hud.status.textContent = next ? "Ball cam on" : "Ball cam off";
    }
  }

  /** @param {number} dt */
  updateCamera(dt) {
    const input = readControls();
    const ballCam = Boolean(getCamera().ballCam);
    this.forward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    physToThree(this.physCar.vel, this.velThree).multiplyScalar(ARENA_UU);
    this.chase.update(this.ctx.camera, dt, {
      target: this.carMesh.position,
      forward: this.forward,
      velocity: this.velThree,
      // Only feed ball position when ball cam is on — car-cam must not bias.
      lookAt: ballCam ? this.ballMesh.position : undefined,
      worldUp: this.worldUp,
      onGround: this.physCar.onGround,
      boosting: this.boosting,
      lookRight: input.lookRight,
      lookUp: input.lookUp,
      ballCam,
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
    const state = this.physCar.onGround
      ? "Ground"
      : this.physCar.wheelsContact
        ? "Wheels"
        : this.physCar.isFlipping
          ? "Flip"
          : "Air";
    const flip = canFlipOrJump(this.physCar) ? "flip✓" : "flip✗";
    const ss = this.physCar.isSupersonic ? " · SS" : "";
    this.ctx.hud.status.textContent = `${state} · ${speed.toFixed(0)} uu/s · ${this.hitbox.label} · ${flip}${ss}`;
  }
}
