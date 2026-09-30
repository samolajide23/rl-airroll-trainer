import * as THREE from "three";
import { BoostTrail } from "../shared/boostTrail.js";
import { cloneBallMesh, preloadBall } from "../shared/ball.js";
import { preloadCars, isCarReady } from "../shared/carAssets.js";
import { syncCarWheels, syncCarExhaust } from "../shared/carVisualCalibration.js";
import { stepCarBall } from "../shared/carSim.js";
import { makeCar } from "../shared/car.js";
import {
  FixedStepClock,
  RL,
  alignCarVisualToHitbox,
  applyToCarModel,
  canFlipOrJump,
  createBoostPadMeshes,
  createHitboxHelper,
  createSoccarBoostPads,
  getHitboxForCarId,
  makeBall,
  makePhysCar,
  physToThree,
  resetBoostPads,
  stepBoostPads,
  syncHitboxHelper,
  withFreeAirRoll,
} from "../shared/carPhysics.js";
import { applyModeChaseCamera, ChaseCamera } from "../shared/chaseCamera.js";
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
    this.carMesh = makeCar(0xffffff, 1, { carId: this.carId, markers: false });
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
    this.ballMesh.castShadow = true;
    this._stopped = false;
    this.ballVisual = new THREE.Group();
    this.ballSpin = new THREE.Vector3();
    this.ballSpinRotation = new THREE.Quaternion();
    this.shadowForward = new THREE.Vector3();
    this.root.add(this.ballVisual);
    const upgradeBall = () => {
      if (this._stopped) return;
      const model = cloneBallMesh();
      if (!model) return;
      model.scale.setScalar(BALL_VIS_R);
      this.ballVisual.add(model);
      this.ballMesh.visible = false;
    };
    preloadBall().then(upgradeBall);

    // Contact shadows are inexpensive, stable, and do not require a huge
    // stadium-wide realtime shadow map. They also help read aerial altitude.
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 64;
    const shadowCtx = shadowCanvas.getContext("2d");
    const gradient = shadowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(0,0,0,.55)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    shadowCtx.fillStyle = gradient; shadowCtx.fillRect(0, 0, 64, 64);
    this._shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const createShadow = () => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this._shadowTexture, transparent: true, depthWrite: false, opacity: 0.65 }));
      mesh.rotation.x = -Math.PI / 2; this.root.add(mesh); return mesh;
    };
    this.carShadow = createShadow();
    this.ballShadow = createShadow();

    this.hitboxHelper = createHitboxHelper();
    this.hitboxHelper.visible = false;
    this.root.add(this.hitboxHelper);

    const spawn0 = RL.SOCCAR_SPAWNS[4];
    this.physCar = makePhysCar(
      new THREE.Vector3(spawn0.x, spawn0.y, this.hitbox.restZ),
      spawn0.yaw,
      this.hitbox,
    );
    this.physCar.id = 1;
    this.physCar.boost = RL.BOOST_SPAWN;
    this.physBall = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
    this.tick = 0;
    this.boosting = false;

    this.clock = new FixedStepClock();
    this.chase = new ChaseCamera();
    this.trail = new BoostTrail(this.root, { exhaustLocal: new THREE.Vector3(0, 0.08, -0.65) });
    this.trail.attachFlames(this.carMesh);
    for (const flame of this.trail.flames.children) {
      flame.position.set(flame.position.x * 0.7, 0.08, -0.65);
      flame.scale.setScalar(0.55);
    }
    // Starting immediately must not permanently retain the procedural fallback.
    const initialCarWasReady = isCarReady(this.carId);
    preloadCars([this.carId]).then(() => {
      if (this._stopped || initialCarWasReady || !isCarReady(this.carId)) return;
      const old = this.carMesh;
      this.carMesh = makeCar(0xffffff, 1, { carId: this.carId, markers: false });
      this.carMesh.userData.physicsOrigin = "root";
      this.root.add(this.carMesh);
      this.trail.attachFlames(this.carMesh);
      old.removeFromParent();
      this.syncMeshes();
    });

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
      this.carMesh = makeCar(0xffffff, 1, { carId, markers: false });
      this.carMesh.userData.physicsOrigin = "root";
      this.root.add(this.carMesh);
      this.trail.attachFlames(this.carMesh);
    }

    hud.modeTitle.textContent = this.title;
    hud.root.classList.add("freeplay-hud");
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
    scene.background = new THREE.Color(0x243047);
    if (scene.fog) {
      scene.fog.color.set(0x243047);
      scene.fog.near = 100;
      scene.fog.far = 280;
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
    this._stopped = true;
    hud.root.classList.remove("freeplay-hud");
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
    this.arenaMesh.userData.dispose?.();
    this.trail.dispose();
    this._shadowTexture.dispose();
    for (const mesh of [this.carShadow, this.ballShadow, this.ballMesh, this.hitboxHelper]) {
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    // Loaded GLB geometry belongs to the shared asset cache; only cloned
    // instance materials are owned by this mode.
    this.ballVisual.traverse(obj => {
      if (obj.isMesh) for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) mat.dispose();
    });
    this.padMeshes.traverse(obj => {
      if (obj.isMesh) { obj.geometry.dispose(); obj.material.dispose(); }
    });
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
    this.physCar.id = 1;
    this.physCar.infiniteBoost = false;
    this.physCar.boost = RL.BOOST_SPAWN;
    this.physBall = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
    this.physBall.vel.set(0, 0, 0);
    this.ballVisual.quaternion.identity();
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

  syncMeshes(syncWheels = true) {
    applyToCarModel(this.physCar, this.carMesh, ARENA_UU);
    alignCarVisualToHitbox(this.carMesh, this.physCar.hitbox, ARENA_UU);
    if (syncWheels) syncCarWheels(this.carMesh, this.physCar);
    if (this._exhaustCar !== this.carMesh || this._exhaustScale !== this.carMesh.scale.x) {
      syncCarExhaust(this.carMesh, this.trail);
      this._exhaustCar = this.carMesh;
      this._exhaustScale = this.carMesh.scale.x;
    }
    physToThree(this.physBall.pos, this.ballMesh.position).multiplyScalar(ARENA_UU);
    this.ballVisual.position.copy(this.ballMesh.position);
    this.updateShadow(this.carShadow, this.carMesh.position, this.physCar.hitbox.size[1] * ARENA_UU * 1.2, this.physCar.hitbox.size[0] * ARENA_UU * 1.2);
    this.updateShadow(this.ballShadow, this.ballMesh.position, BALL_VIS_R * 2.1, BALL_VIS_R * 2.1);
    // Project the car-forward vector onto the ground for a correctly oriented
    // footprint, without altering the chase camera or simulation orientation.
    const projectedForward = this.shadowForward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    this.carShadow.rotation.set(-Math.PI / 2, 0, Math.atan2(-projectedForward.x, projectedForward.z));
    if (this.hitboxHelper.visible) syncHitboxHelper(this.hitboxHelper, this.physCar, ARENA_UU);
  }

  updateShadow(shadow, position, width, depth) {
    const altitude = Math.max(0, position.y);
    shadow.position.set(position.x, 0.025, position.z);
    shadow.scale.set(width * (1 + altitude * 0.025), depth * (1 + altitude * 0.025), 1);
    shadow.material.opacity = 0.6 / (1 + altitude * 0.18);
  }

  updateBoostMeter() {
    const el = this.ctx.hud.boostValue;
    const fill = this.ctx.hud.boostFill;
    const amt = Math.max(0, Math.min(100, this.physCar?.boost ?? 0));
    if (this._displayedBoost === amt) return;
    this._displayedBoost = amt;
    const label = String(Math.round(amt));
    if (el && el.textContent !== label) el.textContent = label;
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
  _stepOnce(dt, input = readControls()) {
    stepCarBall(this.physCar, this.physBall, withFreeAirRoll(input, this.physCar), this.tick, dt);
    stepBoostPads(this.pads, this.physCar, dt);
    this.boosting = Boolean(this.physCar.isBoosting);
    const spin = physToThree(this.physBall.omega, this.ballSpin).negate();
    if (spin.lengthSq() > 1e-10) {
      const angle = spin.length() * dt;
      this.ballSpinRotation.setFromAxisAngle(spin.normalize(), angle);
      this.ballVisual.quaternion.premultiply(this.ballSpinRotation);
    }
    this.tick += 1;

    syncCarWheels(this.carMesh, this.physCar, dt);
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

    const camCfg = getCamera();
    // Toggle persists via settings. Hold is live button only in updateCamera
    // (do not write held state into settings — that leaked ball-cam into Rings).
    if ((camCfg.ballCamMode ?? "toggle") !== "hold") {
      if (pollBallCamToggle(this.ballCamLatch)) {
        const next = !camCfg.ballCam;
        setCamera("ballCam", next);
        this.ctx.hud.status.textContent = next ? "Ball cam on" : "Ball cam off";
      }
    }
  }

  /** @param {number} dt */
  updateCamera(dt, input = readControls()) {
    const camCfg = getCamera();
    // Hold mode: effective ball cam is the live button state (avoid storage lag).
    const ballCam =
      (camCfg.ballCamMode ?? "toggle") === "hold"
        ? isActionDown("toggleBallCam")
        : Boolean(camCfg.ballCam);
    // Keep feeding the ball while TransitionSpeed blends in/out of ball cam.
    const feedBall = ballCam || this.chase.ballCamBlend > 0.001;
    this.forward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    physToThree(this.physCar.vel, this.velThree).multiplyScalar(ARENA_UU);
    applyModeChaseCamera(this.chase, this.ctx.camera, dt, {
      target: this.carMesh.position,
      forward: this.forward,
      velocity: this.velThree,
      lookAt: feedBall ? this.ballMesh.position : undefined,
      worldUp: this.worldUp,
      onGround: this.physCar.onGround,
      boosting: this.boosting,
      lookRight: input.lookRight,
      lookUp: input.lookUp,
      lookBehind: input.lookBehind,
      ballCam,
    });
  }

  /**
   * @param {number} dt
   * @param {number} _now
   */
  update(dt, _now) {
    this.pollUtilityKeys();
    const input = readControls();
    this.clock.advance(dt, (tickDt) => {
      this._stepOnce(tickDt, input);
    });
    const { hud } = this.ctx;
    const source = inputSourceLabel(input);
    if (hud.padStatus.textContent !== source) hud.padStatus.textContent = source;
    hud.padStatus.classList.toggle("on", input.usingPad || !!input.usingTouch);
    hud.arl.classList.toggle("on", input.airLeft);
    hud.arr.classList.toggle("on", input.airRight);
    this.carMesh.userData.setBoost?.(this.boosting);
    this.syncMeshes(false);
    this.updateBoostMeter();
    this.trail.update(this.carMesh, this.boosting, dt);
    this.updateCamera(dt, input);

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
    const status = `${state} · ${speed.toFixed(0)} uu/s · ${this.hitbox.label} · ${flip}${ss}`;
    if (hud.status.textContent !== status) hud.status.textContent = status;
  }
}
