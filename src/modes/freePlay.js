import * as THREE from "three";
import { createIcons, icons } from "lucide";
import "./freePlay.css";
import { releaseRocketSimWorld } from "../shared/rocketSimRuntime.js";
import { RenderPose } from "../shared/renderPose.js";
import { formatSpeed } from "../shared/rl-units.js";
import { BoostTrail } from "../shared/boostTrail.js";
import { SurfaceEffects, ContactEffects, updateGroundShadow } from "../shared/surfaceEffects.js";
import { cloneBallMesh, preloadBall } from "../shared/ball.js";
import { preloadCars, isCarReady } from "../shared/carAssets.js";
import { syncCarWheels, syncCarExhaust, syncCarJump } from "../shared/carVisualCalibration.js";
import { SkybotDiagnostic } from "../shared/skybot.js";
import { KamaelBot } from "../shared/kamaelBot.js";
import { applyFreePlayBallControl } from "../shared/freePlayBallControls.js";
import { disposeCarVisual, makeCar } from "../shared/car.js";
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
  makeSoccarKickoffCar,
  physToThree,
  resetBoostPads,
  stepBoostPads,
  stepCar,
  stepCarBall,
  syncHitboxHelper,
  withFreeAirRoll,
} from "../shared/carPhysics.js";
import { applyModeChaseCamera, ChaseCamera } from "../shared/chaseCamera.js";
import {
  inputSourceLabel,
  isActionDown,
  pollBallCamToggle,
  pollActionEdge,
  readControls,
  readPhysicsControls,
  resetJumpTransitions,
} from "../shared/input.js";
import { getSelectedCarId } from "../shared/loadout.js";
import {
  formatControlsHelp,
  FREEPLAY_BALL_ACTIONS,
  BIND_LABELS,
  getCamera,
  getPad,
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
  constructor(ctx, { diagnostics = true, training = false } = {}) {
    this.ctx = ctx;
    this.diagnostics = diagnostics;
    this.training = training;
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
      this.ballVisual.visible = Boolean(this.physBall);
    };
    preloadBall().then(upgradeBall);

    // Contact shadows are inexpensive, stable, and do not require a huge
    // stadium-wide realtime shadow map. They also help read aerial altitude.
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 64;
    const shadowCtx = shadowCanvas.getContext("2d");
    const gradient = shadowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(0,0,0,.9)");
    gradient.addColorStop(0.35, "rgba(0,0,0,.65)");
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

    this.physCar = makeSoccarKickoffCar(this.hitbox);
    this.physCar.id = 1;
    this.physCar.boost = RL.BOOST_SPAWN;
    this.physBall = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
    this.tick = 0;
    this.boosting = false;
    this.bot = new SkybotDiagnostic();
    this.botEnabled = false;
    this.botLines = [0x39ff14, 0x83cdec].map(color => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(601 * 3), 3));
      geometry.setDrawRange(0, 0);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, depthTest: false }));
      line.frustumCulled = false;
      line.visible = false;
      this.root.add(line);
      return line;
    });
    this.botTarget = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0x39ff14, wireframe: true, depthTest: false }));
    this.botTarget.visible = false;
    this.root.add(this.botTarget);

    this.clock = new FixedStepClock();
    this.carRenderPose = new RenderPose();
    this.ballRenderPose = new RenderPose();
    this.chase = new ChaseCamera();
    this.trail = new BoostTrail(this.root, { exhaustLocal: new THREE.Vector3(0, 0.08, -0.65) });
    this.surfaceEffects = new SurfaceEffects(this.root);
    this.contactEffects = new ContactEffects(this.root);
    this.sliding = false;
    this.effectContactHeld = false;
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
      disposeCarVisual(old);
      this.syncMeshes();
    });

    this.forward = new THREE.Vector3();
    this.velThree = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);

    this.spaceLatch = false;
    this.rLatch = false;
    this.ballControlLatches = Object.fromEntries(FREEPLAY_BALL_ACTIONS.map(action => [action, { wasDown: isActionDown(action) }]));
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
      disposeCarVisual(this.carMesh);
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
    if (this.modeId === "free-play" && !this.training) {
      hud.root.classList.add("freeplay-studio");
      this.studioControls = document.createElement("section");
      this.studioControls.className = "freeplay-controls";
      this.studioControls.setAttribute("aria-label", "Free play controls");
      this.studioControls.innerHTML = `<h2><small>01</small>Session</h2>
        <button type="button" data-reset title="Reset car and ball" aria-label="Reset car and ball"><i data-lucide="rotate-ccw"></i>Reset session</button>
        <label>Camera<select data-camera aria-label="Camera"><option value="car">Car follow</option><option value="ball">Ball follow</option></select></label>
        <h2><small>02</small>Ball</h2>
        <div class="freeplay-ball-actions">${FREEPLAY_BALL_ACTIONS.map(action => `<button type="button" data-ball-action="${action}">${BIND_LABELS[action]}</button>`).join("")}</div>`;
      hud.root.append(this.studioControls);
      createIcons({ icons, root: this.studioControls });
      this.studioControls.querySelector("[data-reset]").onclick = () => this.resetState();
      this.studioCamera = this.studioControls.querySelector("[data-camera]");
      this.studioCamera.onchange = () => setCamera("ballCam", this.studioCamera.value === "ball");
      for (const button of this.studioControls.querySelectorAll("[data-ball-action]")) {
        button.onclick = () => {
          if (this.botEnabled) return;
          this.physBall = applyFreePlayBallControl(button.dataset.ballAction, this.physCar, this.physBall);
          this.ballVisual.quaternion.identity();
        };
      }
    }
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
    if (this.diagnostics) {
      this.botPanel = document.createElement("div");
      this.botPanel.className = "bot-diagnostic";
      this.botPanel.innerHTML = '<label><input type="checkbox"> Bot control</label><select data-bot-mode aria-label="Bot mode"><option value="skybot">Skybot ground intercept</option><option value="kamael">Kamael</option><option value="wyrm">Kamael / Wyrm dribbler</option></select><div class="bot-actions"><button type="button" class="btn-ghost" data-bot-reset>Restart run</button><button type="button" class="btn-ghost" data-bot-export disabled>Export replay</button></div><output aria-live="off"></output><small><span style="color:#39ff14">Predicted</span> / <span style="color:#83cdec">observed</span></small>';
      hud.root.append(this.botPanel);
      this.botPanel.querySelector("input").addEventListener("change", event => {
        this.botEnabled = event.target.checked;
        this.resetState();
      });
      this.botPanel.querySelector("[data-bot-mode]").addEventListener("change", event => {
        this.bot.dispose?.();
        this.bot = event.target.value === "skybot" ? new SkybotDiagnostic() : new KamaelBot(this.pads);
        if (this.bot instanceof KamaelBot) this.bot.mode = event.target.value;
        this.resetState();
      });
      this.botPanel.querySelector("[data-bot-reset]").addEventListener("click", () => this.resetState());
      this.botPanel.querySelector("[data-bot-export]").addEventListener("click", () => {
        const blob = new Blob([JSON.stringify(this.bot.recording, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${this.bot.recording.scenarios[0].id}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }
    this._unbindHelp = onBindsChange(() => {
      if (hud.help) {
        hud.help.textContent = `${formatControlsHelp()} · Skip resets the ball`;
      }
    });
    this.resetState();
  }

  stop() {
    releaseRocketSimWorld(this.physCar);
    resetJumpTransitions();
    const { hud, scene, arena, camera } = this.ctx;
    this._stopped = true;
    this.botPanel?.remove();
    this.studioControls?.remove();
    this.studioControls = null;
    this.studioCamera = null;
    hud.root.classList.remove("freeplay-studio");
    this.bot.dispose?.();
    for (const visual of [...this.botLines, this.botTarget]) {
      visual.geometry.dispose();
      visual.material.dispose();
    }
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
    this.surfaceEffects.dispose();
    this.contactEffects.dispose();
    disposeCarVisual(this.carMesh);
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
    releaseRocketSimWorld(this.physCar);
    this.surfaceEffects.reset();
    this.contactEffects.reset();
    this.sliding = false;
    this.effectContactHeld = false;
    resetJumpTransitions();
    this.hitbox = getHitboxForCarId(this.carId);
    // RocketSim center kickoff slot (CAR_SPAWN_LOCATIONS_SOCCAR[4]).
    this.physCar = makeSoccarKickoffCar(this.hitbox);
    this.physCar.id = 1;
    this.physCar.infiniteBoost = false;
    this.physCar.boost = RL.BOOST_SPAWN;
    this.physBall = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
    this.physBall.vel.set(0, 0, 0);
    this.ballVisual.quaternion.identity();
    for (const action of FREEPLAY_BALL_ACTIONS) this.ballControlLatches[action].wasDown = isActionDown(action);
    this.tick = 0;
    this.boosting = false;
    this.bot.reset();
    if (this.botEnabled) this.bot.begin(this.physCar, this.physBall);
    for (const line of this.botLines) line.visible = false;
    this.botTarget.visible = false;
    resetBoostPads(this.pads);
    this.clock.reset();
    this.carRenderPose.reset();
    this.ballRenderPose.reset();
    this.chase.invalidate();
    this.syncMeshes();
    syncCarJump(this.carMesh, this.physCar);
    this.forward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    this.chase.snap(this.ctx.camera, this.carMesh.position, this.forward);
    this.updateBoostMeter();
    this.setScoreRow(0, 0, 0, this.hitbox.label);
    this.ctx.hud.status.textContent = `Reset — ${this.hitbox.label} hitbox · blue half`;
  }

  syncMeshes(syncWheels = true, renderCar = this.physCar, renderBall = this.physBall) {
    applyToCarModel(renderCar, this.carMesh, ARENA_UU);
    alignCarVisualToHitbox(this.carMesh, this.physCar.hitbox, ARENA_UU);
    if (syncWheels) syncCarWheels(this.carMesh, this.physCar);
    if (this._exhaustCar !== this.carMesh || this._exhaustScale !== this.carMesh.scale.x) {
      syncCarExhaust(this.carMesh, this.trail);
      this._exhaustCar = this.carMesh;
      this._exhaustScale = this.carMesh.scale.x;
    }
    this.ballMesh.visible = Boolean(this.physBall) && this.ballVisual.children.length === 0;
    this.ballVisual.visible = Boolean(this.physBall);
    this.ballShadow.visible = Boolean(this.physBall);
    if (this.physBall) {
      physToThree(renderBall.pos, this.ballMesh.position).multiplyScalar(ARENA_UU);
      this.ballVisual.position.copy(this.ballMesh.position);
      this.updateShadow(this.ballShadow, this.ballMesh.position, BALL_VIS_R * 2.1, BALL_VIS_R * 2.1, BALL_VIS_R);
    }
    this.updateShadow(this.carShadow, this.carMesh.position, this.physCar.hitbox.size[1] * ARENA_UU * 1.2, this.physCar.hitbox.size[0] * ARENA_UU * 1.2);
    // Project the car-forward vector onto the ground for a correctly oriented
    // footprint, without altering the chase camera or simulation orientation.
    const projectedForward = this.shadowForward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    this.carShadow.rotation.set(-Math.PI / 2, 0, Math.atan2(-projectedForward.x, projectedForward.z));
    if (this.hitboxHelper.visible) syncHitboxHelper(this.hitboxHelper, renderCar, ARENA_UU);
  }

  updateShadow(shadow, position, width, depth, restHeight = 0.17) {
    updateGroundShadow(shadow, position, width, depth, restHeight);
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
    this.physCar.dodgeDeadzone = getPad().dodgeDeadzone;
    const controls = this.botEnabled ? this.bot.controls(this.physCar, this.physBall) : withFreeAirRoll(input, this.physCar);
    const contact = this.physBall ? stepCarBall(this.physCar, this.physBall, controls, this.tick, dt) : (stepCar(this.physCar, controls, dt), null);
    this.sliding = Boolean(controls.handbrake ?? controls.powerslide) && this.physCar.onGround;
    if (contact && !this.effectContactHeld) {
      this.contactEffects.hit(physToThree(contact.point, new THREE.Vector3()).multiplyScalar(ARENA_UU));
    }
    this.effectContactHeld = Boolean(contact);
    stepBoostPads(this.pads, this.physCar, dt);
    if (this.botEnabled) this.bot.observe(this.physCar, this.physBall, controls, Boolean(contact));
    this.boosting = Boolean(this.physCar.isBoosting);
    const spin = this.physBall ? physToThree(this.physBall.omega, this.ballSpin).negate() : this.ballSpin.set(0, 0, 0);
    if (spin.lengthSq() > 1e-10) {
      const angle = spin.length() * dt;
      this.ballSpinRotation.setFromAxisAngle(spin.normalize(), angle);
      this.ballVisual.quaternion.premultiply(this.ballSpinRotation);
    }
    this.tick += 1;

    syncCarWheels(this.carMesh, this.physCar, dt);
    this.onPhysicsStep?.(dt, controls, contact);
  }

  pollUtilityKeys() {
    for (const action of FREEPLAY_BALL_ACTIONS) {
      if (this.training) break;
      if (!pollActionEdge(action, this.ballControlLatches[action])) continue;
      if (this.botEnabled) continue;
      this.physBall = applyFreePlayBallControl(action, this.physCar, this.physBall);
      this.ballVisual.quaternion.identity();
      this.ctx.hud.status.textContent = BIND_LABELS[action];
    }
    const nt = isActionDown("newTarget");
    if (nt && !this.spaceLatch) {
      this.spaceLatch = true;
      if (this.botEnabled || this.training) this.resetState();
      else this.physBall = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
      if (!this.training) this.ctx.hud.status.textContent = "Ball reset to centre";
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
    const ballCam = Boolean(this.physBall) && (
      (camCfg.ballCamMode ?? "toggle") === "hold"
        ? isActionDown("toggleBallCam")
        : Boolean(camCfg.ballCam));
    if (this.studioCamera) {
      this.studioCamera.value = ballCam ? "ball" : "car";
      this.studioCamera.disabled = (camCfg.ballCamMode ?? "toggle") === "hold";
    }
    // Keep feeding the ball while TransitionSpeed blends in/out of ball cam.
    const feedBall = Boolean(this.physBall) && (ballCam || this.chase.ballCamBlend > 0.001);
    this.forward.set(0, 0, 1).applyQuaternion(this.carMesh.quaternion);
    physToThree(this.renderVelocity ?? this.physCar.vel, this.velThree).multiplyScalar(ARENA_UU);
    applyModeChaseCamera(this.chase, this.ctx.camera, dt, {
      target: this.carMesh.position,
      forward: this.forward,
      velocity: this.velThree,
      lookAt: feedBall ? this.ballMesh.position : undefined,
      worldUp: this.worldUp,
      onGround: this.physCar.onGround,
      groundNormal: physToThree(this.physCar.contactNormal, this.chase.contactInput),
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
  update(dt, _now, simulationDt = dt) {
    this.pollUtilityKeys();
    const input = readControls();
    const step = (tickDt, controls) => {
      this.carRenderPose.capture(this.physCar);
      if (this.physBall) this.ballRenderPose.capture(this.physBall, this.ballVisual.quaternion);
      this._stepOnce(tickDt, controls);
    };
    if (this.physBall && this.ballRenderPose.source === this.physBall) {
      this.ballVisual.quaternion.copy(this.ballRenderPose.currentRotation ?? this.ballVisual.quaternion);
    }
    if (this.botEnabled && this.bot instanceof KamaelBot) {
      this.bot.advance(this.clock, simulationDt, this.physCar, this.physBall, tickDt => step(tickDt));
    } else {
      this.clock.advance(simulationDt, (tickDt) => {
        step(tickDt, readPhysicsControls());
      });
    }
    const { hud } = this.ctx;
    const source = inputSourceLabel(input);
    if (hud.padStatus.textContent !== source) hud.padStatus.textContent = source;
    hud.padStatus.classList.toggle("on", input.usingPad || !!input.usingTouch);
    hud.arl.classList.toggle("on", input.airLeft);
    hud.arr.classList.toggle("on", input.airRight);
    this.carMesh.userData.setBoost?.(this.boosting);
    const alpha = this.clock.acc / RL.DT;
    const carPose = this.carRenderPose.sample(this.physCar, alpha);
    const renderCar = { ...this.physCar, pos: carPose.position, q: carPose.rotation, vel: carPose.velocity };
    this.renderVelocity = carPose.velocity;
    let renderBall = this.physBall;
    if (this.physBall) {
      this.ballRenderPose.currentRotation ??= new THREE.Quaternion();
      this.ballRenderPose.currentRotation.copy(this.ballVisual.quaternion);
      const ballPose = this.ballRenderPose.sample(this.physBall, alpha, this.ballVisual.quaternion);
      renderBall = { ...this.physBall, pos: ballPose.position };
      this.ballVisual.quaternion.copy(ballPose.rotation);
    }
    this.syncMeshes(false, renderCar, renderBall);
    this.updateBoostMeter();
    this.trail.update(this.carMesh, this.boosting, dt, this.physCar.vel.length() * 0.01);
    this.surfaceEffects.update(this.carMesh, this.sliding && this.physCar.onGround, this.physCar.vel.length(), dt);
    this.contactEffects.update(dt);
    syncCarJump(this.carMesh, this.physCar, dt);
    this.updateCamera(dt, input);
    this.updateBotDiagnostic();

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
    const status = `${state} · ${formatSpeed(speed)} · ${this.hitbox.label} · ${flip}${ss}`;
    if (this.training) this.updateDrillStatus?.();
    else if (hud.status.textContent !== status) hud.status.textContent = status;
  }

  updateBotDiagnostic() {
    if (this.studioControls) {
      for (const button of this.studioControls.querySelectorAll("[data-ball-action]")) button.disabled = this.botEnabled;
    }
    if (!this.botPanel) return;
    this.botPanel.querySelector("[data-bot-export]").disabled = !this.bot.recording?.scenarios[0].ticks;
    if (!this.botEnabled) {
      this.botPanel.querySelector("output").textContent = "Manual control";
      return;
    }
    if (this.bot instanceof KamaelBot) {
      this.botPanel.querySelector("output").textContent = this.bot.errorMessage
        ? `Kamael stopped: ${this.bot.errorMessage.split("\n")[0]}`
        : `${this.bot.action} · Run ${(this.bot.tick / 120).toFixed(1)} s`;
      return;
    }
    const paths = [this.bot.prediction, this.bot.actual];
    paths.forEach((points, index) => {
      const line = this.botLines[index];
      const attribute = line.geometry.getAttribute("position");
      points.slice(0, 601).forEach((point, pointIndex) => attribute.setXYZ(pointIndex, point[0] * ARENA_UU, point[2] * ARENA_UU, point[1] * ARENA_UU));
      attribute.needsUpdate = true;
      line.geometry.setDrawRange(0, Math.min(points.length, 601));
      line.visible = true;
    });
    const target = this.bot.target;
    this.botTarget.visible = Boolean(target);
    if (target) this.botTarget.position.set(target[0] * ARENA_UU, target[2] * ARENA_UU, target[1] * ARENA_UU);
    const contact = this.bot.lastContact;
    const error = this.bot.error == null ? "—" : `${this.bot.error.toFixed(1)} uu`;
    const timing = contact?.timingError == null ? "—" : `${(contact.timingError * 1000).toFixed(0)} ms`;
    const miss = contact?.positionError == null ? "—" : `${contact.positionError.toFixed(1)} uu`;
    this.botPanel.querySelector("output").textContent = `${this.bot.action ? `${this.bot.action} · ` : ""}Ball error ${error} · Run ${(this.bot.tick / 120).toFixed(1)} s\nFirst contact ${contact ? `${contact.time.toFixed(2)} s` : "pending"} · Timing Δ ${timing} · Position Δ ${miss}${this.bot.tick >= 7200 ? "\nRecording full (60 s)" : ""}`;
  }
}
