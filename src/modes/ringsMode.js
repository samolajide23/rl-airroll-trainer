import * as THREE from "three";
import { AerialBody, FixedStepClock, RL } from "../shared/aerial.js";
import { BoostTrail } from "../shared/boostTrail.js";
import { makeCar } from "../shared/car.js";
import { inputSourceLabel, isActionDown, readControls } from "../shared/input.js";
import { formatConsistency, recordAttempt } from "../shared/metrics.js";
import { ChaseCamera, UU } from "../shared/chaseCamera.js";
import {
  formatControlsHelp,
  getCamera,
  onBindsChange,
} from "../shared/settings.js";

/** Workshop-style Rings: ocean + sky, blue hoops on pillars, boost trail. */
/** GLB/procedural cars are ~3.2 long; 0.4× ≈ RL Octane (~118 uu). */
const CAR_SCALE = 0.4;
const GRAVITY = RL.GRAVITY * UU;
const BOOST_ACCEL = RL.BOOST_ACCEL_AIR * UU;
const AIR_THROTTLE = RL.AIR_THROTTLE * UU;
const MAX_SPEED = RL.MAX_SPEED * UU;
const RING_MAJOR = 2.55;
const RING_TUBE = 0.22;
const RING_PASS_R = 2.15;
const WATER_Y = 0;
const PLATFORM_TOP_Y = 4.2;
/** Sit height above pad / water for the scaled car. */
const CAR_CLEARANCE = CAR_SCALE * 0.7;
const RING_BLUE = 0x4da3e6;
const RING_BLUE_NEXT = 0x7ec8ff;
const RING_BLUE_DONE = 0x9ad4a8;

/**
 * @typedef {{
 *   mesh: THREE.Mesh,
 *   pillar: THREE.Mesh | null,
 *   center: THREE.Vector3,
 *   normal: THREE.Vector3,
 *   cleared: boolean,
 * }} Ring
 */

export class RingsMode {
  /** @param {object} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.title = "Rings";
    this.modeId = "rings";
    this.root = new THREE.Group();
    this.aerial = new AerialBody();
    this.clock = new FixedStepClock();
    this.car = makeCar(0xffffff);
    this.car.scale.setScalar(CAR_SCALE);
    this.root.add(this.car);

    this.vel = new THREE.Vector3();
    this.boost = RL.BOOST_MAX;
    this.onPlatform = true;
    this.boosting = false;
    this.forward = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.chase = new ChaseCamera();

    /** @type {Ring[]} */
    this.rings = [];
    this.ringGroup = new THREE.Group();
    this.root.add(this.ringGroup);

    this.pillarMat = new THREE.MeshStandardMaterial({
      color: RING_BLUE,
      roughness: 0.55,
      metalness: 0.2,
    });
    this.matNext = this.makeRingMat(RING_BLUE_NEXT, 0x2a6fa8, 0.35);
    this.matSoon = this.makeRingMat(RING_BLUE, 0x1a4a72, 0.15);
    this.matDone = this.makeRingMat(RING_BLUE_DONE, 0x1a5a40, 0.12, 0.55);

    this.env = this.makeEnvironment();
    this.root.add(this.env);
    this.platform = this.makePlatform();
    this.root.add(this.platform);
    this.trail = new BoostTrail(this.root);
    this.trail.attachFlames(this.car);

    this.nextIndex = 0;
    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.courseDone = false;
    this.spaceLatch = false;
    this.rLatch = false;
    /** @type {null | (() => void)} */
    this._unbindHelp = null;
    /** @type {null | { bg: number, fog: number, fogNear: number, fogFar: number, far: number }} */
    this._prevScene = null;
  }

  /**
   * @param {number} color
   * @param {number} emissive
   * @param {number} emissiveIntensity
   * @param {number} [opacity=1]
   */
  makeRingMat(color, emissive, emissiveIntensity, opacity = 1) {
    return new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity,
      roughness: 0.45,
      metalness: 0.15,
      side: THREE.DoubleSide,
      transparent: opacity < 1,
      opacity,
    });
  }

  makeEnvironment() {
    const g = new THREE.Group();
    const waterGeo = new THREE.PlaneGeometry(800, 800, 48, 48);
    const pos = waterGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.08) * 0.15 + Math.cos(y * 0.07) * 0.12);
    }
    pos.needsUpdate = true;
    waterGeo.computeVertexNormals();
    const water = new THREE.Mesh(
      waterGeo,
      new THREE.MeshStandardMaterial({
        color: 0x3a9fd8,
        roughness: 0.25,
        metalness: 0.35,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    g.add(water);
    this.water = water;

    const haze = new THREE.Mesh(
      new THREE.CircleGeometry(380, 48),
      new THREE.MeshBasicMaterial({
        color: 0xb8d4f0,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = WATER_Y + 0.05;
    g.add(haze);

    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(18, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfff5d6,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    sun.position.set(-80, 55, -120);
    sun.lookAt(0, 20, 40);
    g.add(sun);

    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    for (const [x, y, z, s] of [
      [-40, 48, 60, 22],
      [50, 55, 90, 28],
      [-20, 62, 140, 18],
      [70, 50, 180, 26],
      [-60, 58, 220, 20],
    ]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), cloudMat);
      c.scale.set(s, s * 0.35, s * 0.6);
      c.position.set(x, y, z);
      g.add(c);
    }
    return g;
  }

  makePlatform() {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 5.8, 0.5, 32),
      new THREE.MeshStandardMaterial({
        color: 0x5a6a7a,
        roughness: 0.7,
        metalness: 0.2,
      }),
    );
    deck.position.y = PLATFORM_TOP_Y - 0.25;
    g.add(deck);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(5.5, 0.12, 8, 40),
      new THREE.MeshStandardMaterial({
        color: RING_BLUE,
        emissive: RING_BLUE,
        emissiveIntensity: 0.2,
        roughness: 0.5,
      }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = PLATFORM_TOP_Y + 0.02;
    g.add(rim);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, PLATFORM_TOP_Y, 12),
      this.pillarMat,
    );
    post.position.y = PLATFORM_TOP_Y / 2;
    g.add(post);

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.3, 3),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }),
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, PLATFORM_TOP_Y + 0.1, 3.5);
    g.add(arrow);
    return g;
  }

  applyMapTheme() {
    const { scene, camera, arena } = this.ctx;
    this._prevScene = {
      bg: scene.background?.getHex?.() ?? 0x0b1220,
      fog: scene.fog?.color?.getHex?.() ?? 0x0b1220,
      fogNear: scene.fog?.near ?? 40,
      fogFar: scene.fog?.far ?? 120,
      far: camera.far,
    };
    scene.background = new THREE.Color(0x6eb6e8);
    scene.fog = new THREE.Fog(0x9ec9e8, 80, 420);
    camera.far = 500;
    camera.updateProjectionMatrix();
    if (arena) arena.visible = false;
  }

  restoreMapTheme() {
    const { scene, camera, arena } = this.ctx;
    if (!this._prevScene) return;
    scene.background = new THREE.Color(this._prevScene.bg);
    scene.fog = new THREE.Fog(
      this._prevScene.fog,
      this._prevScene.fogNear,
      this._prevScene.fogFar,
    );
    camera.far = this._prevScene.far;
    camera.updateProjectionMatrix();
    if (arena) arena.visible = true;
    this._prevScene = null;
  }

  start() {
    const { hud } = this.ctx;
    hud.modeTitle.textContent = this.title;
    hud.root.classList.remove("hidden");
    if (hud.alignMeter) hud.alignMeter.classList.add("hidden");
    if (hud.boostMeter) hud.boostMeter.classList.remove("hidden");
    if (hud.help) hud.help.textContent = formatControlsHelp();
    this.applyMapTheme();
    this.ctx.scene.add(this.root);
    this._unbindHelp = onBindsChange(() => {
      if (hud.help) hud.help.textContent = formatControlsHelp();
    });
    this.hits = 0;
    this.streak = 0;
    this.best = 0;
    this.beginCourse();
    this.setScoreRow(0, 0, 0, formatConsistency(this.modeId));
    this.updateBoostMeter();
  }

  stop() {
    const { hud } = this.ctx;
    hud.root.classList.add("hidden");
    if (hud.alignMeter) hud.alignMeter.classList.add("hidden");
    if (hud.boostMeter) hud.boostMeter.classList.add("hidden");
    this.restoreMapTheme();
    this.ctx.scene.remove(this.root);
    if (this._unbindHelp) {
      this._unbindHelp();
      this._unbindHelp = null;
    }
  }

  beginCourse() {
    this.clearRings();
    this.buildCourse();
    this.nextIndex = 0;
    this.courseDone = false;
    this.boost = RL.BOOST_MAX;
    this.onPlatform = true;
    this.boosting = false;
    this.vel.set(0, 0, 0);
    this.car.position.set(0, PLATFORM_TOP_Y + CAR_CLEARANCE, 0);
    this.car.quaternion.identity();
    this.aerial.reset();
    this.clock.reset();
    this.prevPos.copy(this.car.position);
    this.chase.invalidate();
    this.ctx.camera.up.set(0, 1, 0);
    const camCfg = getCamera();
    this.ctx.camera.fov = camCfg.fov;
    this.ctx.camera.updateProjectionMatrix();
    this.ctx.camera.position.set(0, PLATFORM_TOP_Y + 3.5, -6);
    this.ctx.camera.lookAt(0, PLATFORM_TOP_Y + 0.6, 5);
    this.refreshRingLooks();
    this.updateBoostMeter();
    this.ctx.hud.status.textContent =
      "On the pad — Jump or Boost to launch through the rings";
  }

  clearRings() {
    for (const r of this.rings) {
      this.ringGroup.remove(r.mesh);
      r.mesh.geometry.dispose();
      const mat = r.mesh.material;
      if (
        mat &&
        mat !== this.matNext &&
        mat !== this.matSoon &&
        mat !== this.matDone
      ) {
        mat.dispose();
      }
      if (r.pillar) {
        this.ringGroup.remove(r.pillar);
        r.pillar.geometry.dispose();
      }
    }
    this.rings = [];
  }

  buildCourse() {
    const path = [
      { x: 0, y: 9, z: 24, roll: 0 },
      { x: 6, y: 11, z: 44, roll: 0.3 },
      { x: 12, y: 14, z: 64, roll: -0.45 },
      { x: 8, y: 17, z: 86, roll: 0.75 },
      { x: -2, y: 15, z: 106, roll: -0.35 },
      { x: -12, y: 12, z: 126, roll: 0.55 },
      { x: -10, y: 10, z: 148, roll: -0.7 },
      { x: 0, y: 13, z: 168, roll: 0.2 },
      { x: 10, y: 16, z: 190, roll: -0.4 },
      { x: 4, y: 20, z: 214, roll: 0.1 },
    ];
    const spawn = new THREE.Vector3(0, PLATFORM_TOP_Y + 2, 6);

    for (let i = 0; i < path.length; i++) {
      const pt = path[i];
      const center = new THREE.Vector3(pt.x, pt.y, pt.z);
      const prev =
        i === 0
          ? spawn
          : new THREE.Vector3(path[i - 1].x, path[i - 1].y, path[i - 1].z);
      const next =
        i === path.length - 1
          ? center.clone().add(new THREE.Vector3(0, 1, 18))
          : new THREE.Vector3(path[i + 1].x, path[i + 1].y, path[i + 1].z);
      const dir = next.clone().sub(prev).normalize();
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);

      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(RING_MAJOR, RING_TUBE, 16, 56),
        this.matSoon.clone(),
      );
      mesh.position.copy(center);
      const xAxis = new THREE.Vector3()
        .crossVectors(this.worldUp, dir)
        .normalize();
      if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0);
      const yAxis = new THREE.Vector3().crossVectors(dir, xAxis).normalize();
      mesh.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(xAxis, yAxis, dir),
      );
      if (pt.roll) {
        mesh.quaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            pt.roll,
          ),
        );
      }
      mesh.updateMatrixWorld(true);
      const normal = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(mesh.quaternion)
        .normalize();

      // Pillar meets the underside of the hoop (workshop style), not the center.
      const pillarTop = Math.max(WATER_Y + 0.4, center.y - RING_MAJOR + RING_TUBE);
      const pillarH = Math.max(0.5, pillarTop - WATER_Y);
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.2, pillarH, 10),
        this.pillarMat,
      );
      pillar.position.set(center.x, WATER_Y + pillarH / 2, center.z);

      this.ringGroup.add(mesh, pillar);
      this.rings.push({
        mesh,
        pillar,
        center: center.clone(),
        normal,
        cleared: false,
      });
    }
  }

  refreshRingLooks() {
    this.rings.forEach((ring, i) => {
      const src = ring.cleared
        ? this.matDone
        : i === this.nextIndex
          ? this.matNext
          : this.matSoon;
      const mat = /** @type {THREE.MeshStandardMaterial} */ (ring.mesh.material);
      mat.color.copy(src.color);
      mat.emissive.copy(src.emissive);
      mat.emissiveIntensity = src.emissiveIntensity;
      mat.opacity = src.opacity;
      mat.transparent = src.transparent;
      ring.mesh.scale.setScalar(
        i === this.nextIndex && !ring.cleared ? 1.04 : 1,
      );
    });
  }

  updateBoostMeter() {
    const el = this.ctx.hud.boostValue;
    const fill = this.ctx.hud.boostFill;
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

  /** @param {Ring} ring */
  tryPassRing(ring) {
    const n = ring.normal;
    const c = ring.center;
    const da = this.tmp.copy(this.prevPos).sub(c).dot(n);
    const db = this.tmp2.copy(this.car.position).sub(c).dot(n);
    if (da * db > 0) return false;
    const denom = da - db;
    if (Math.abs(denom) < 1e-8) return false;
    const t = THREE.MathUtils.clamp(da / denom, 0, 1);
    const hitPoint = this.tmp.lerpVectors(this.prevPos, this.car.position, t);
    const offset = this.tmp2.copy(hitPoint).sub(c);
    return offset.addScaledVector(n, -offset.dot(n)).length() <= RING_PASS_R;
  }

  /** @param {number} dt */
  _stepOnce(dt) {
    const input = readControls();
    if (this.onPlatform) {
      this.car.position.set(0, PLATFORM_TOP_Y + CAR_CLEARANCE, 0);
      this.vel.set(0, 0, 0);
      this.aerial.reset();
      this.aerial.step(this.car, input.roll, input.pitch, input.yaw, dt);
      if (input.boost || input.jump) {
        this.onPlatform = false;
        this.forward.set(0, 0, 1).applyQuaternion(this.car.quaternion);
        this.up.set(0, 1, 0).applyQuaternion(this.car.quaternion);
        this.vel.set(0, 0, 0);
        if (input.jump) {
          this.vel.addScaledVector(this.up, RL.JUMP_IMPULSE * UU);
          this.vel.addScaledVector(this.forward, RL.JUMP_IMPULSE * UU * 0.15);
        }
        if (input.boost) {
          this.vel.addScaledVector(this.forward, BOOST_ACCEL * 0.05);
        }
        if (!input.jump && input.boost) {
          this.vel.addScaledVector(this.up, RL.JUMP_IMPULSE * UU * 0.08);
        }
      }
      this.boosting = false;
      this.syncHud(input);
      this.prevPos.copy(this.car.position);
      return;
    }

    this.aerial.step(this.car, input.roll, input.pitch, input.yaw, dt);
    this.forward.set(0, 0, 1).applyQuaternion(this.car.quaternion);
    this.vel.y -= GRAVITY * dt;
    this.boosting = Boolean(input.boost);
    if (this.boosting) {
      this.vel.addScaledVector(this.forward, BOOST_ACCEL * dt);
      this.boost = RL.BOOST_MAX;
    }
    if (!input.usingPad && Math.abs(input.throttle) > 0.01) {
      const sign = input.throttle >= 0 ? 1 : 0.5;
      this.vel.addScaledVector(
        this.forward,
        AIR_THROTTLE * sign * input.throttle * dt,
      );
    }
    if (this.vel.length() > MAX_SPEED) this.vel.setLength(MAX_SPEED);
    this.prevPos.copy(this.car.position);
    this.car.position.addScaledVector(this.vel, dt);
    const waterMin = WATER_Y + CAR_CLEARANCE;
    if (this.car.position.y < waterMin) {
      this.car.position.y = waterMin;
      if (this.vel.y < 0) this.vel.y *= -0.2;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
    }
    this.syncHud(input);
    this.car.userData.setBoost?.(this.boosting);
  }

  /** @param {ReturnType<typeof readControls>} input */
  syncHud(input) {
    const { hud } = this.ctx;
    hud.padStatus.textContent = inputSourceLabel(input);
    hud.padStatus.classList.toggle("on", input.usingPad || !!input.usingTouch);
    hud.arl.classList.toggle("on", input.airLeft);
    hud.arr.classList.toggle("on", input.airRight);
  }

  checkRings() {
    if (
      this.courseDone ||
      this.onPlatform ||
      this.nextIndex >= this.rings.length
    ) {
      return;
    }
    const ring = this.rings[this.nextIndex];
    if (!this.tryPassRing(ring)) return;
    ring.cleared = true;
    this.nextIndex += 1;
    this.hits += 1;
    this.streak += 1;
    this.best = Math.max(this.best, this.streak);
    recordAttempt(this.modeId, { success: true });
    this.setScoreRow(
      this.hits,
      this.streak,
      this.best,
      formatConsistency(this.modeId),
    );
    this.refreshRingLooks();
    this.updateBoostMeter();
    if (this.nextIndex >= this.rings.length) {
      this.courseDone = true;
      this.ctx.hud.status.textContent =
        "Course clear! Reset / skip for another run";
    }
  }

  pollUtilityKeys() {
    let skipped = false;
    let reset = false;
    const nt = isActionDown("newTarget");
    if (nt && !this.spaceLatch) {
      this.spaceLatch = true;
      skipped = true;
    }
    if (!nt) this.spaceLatch = false;
    const rd = isActionDown("resetCar");
    if (rd && !this.rLatch) {
      this.rLatch = true;
      reset = true;
    }
    if (!rd) this.rLatch = false;
    return { skipped, reset };
  }

  /** @param {number} dt */
  updateCamera(dt) {
    if (this.nextIndex < this.rings.length) {
      this.tmp2.copy(this.rings[this.nextIndex].center);
    } else if (this.rings.length > 0) {
      this.tmp2
        .copy(this.rings[this.rings.length - 1].center)
        .addScaledVector(this.worldUp, 2);
      this.tmp2.z += 24;
    } else {
      this.tmp2.copy(this.car.position);
      this.tmp2.z += 20;
      this.tmp2.y += 2;
    }

    if (this.onPlatform) {
      // Fixed pad view; invalidate chase so takeoff snaps cleanly.
      const cfg = getCamera();
      if (this.ctx.camera.fov !== cfg.fov) {
        this.ctx.camera.fov = cfg.fov;
        this.ctx.camera.updateProjectionMatrix();
      }
      const dist = cfg.distance * UU;
      const height = cfg.height * UU;
      this.ctx.camera.position.set(
        0,
        PLATFORM_TOP_Y + height + 2,
        -dist - 2,
      );
      this.tmp.set(0, PLATFORM_TOP_Y + 2, 4).lerp(this.tmp2, 0.55);
      this.ctx.camera.up.copy(this.worldUp);
      this.ctx.camera.lookAt(this.tmp);
      this.chase.invalidate();
      return;
    }

    this.forward.set(0, 0, 1).applyQuaternion(this.car.quaternion);
    this.chase.update(this.ctx.camera, dt, {
      target: this.car.position,
      forward: this.forward,
      velocity: this.vel,
      lookAt: this.tmp2,
      worldUp: this.worldUp,
    });
  }

  /**
   * @param {number} dt
   * @param {number} now
   */
  update(dt, now) {
    const { skipped, reset } = this.pollUtilityKeys();
    if (skipped || reset) {
      if (skipped && !this.courseDone && !this.onPlatform) {
        recordAttempt(this.modeId, { success: false });
        this.streak = 0;
        this.setScoreRow(
          this.hits,
          this.streak,
          this.best,
          formatConsistency(this.modeId),
        );
      }
      this.beginCourse();
    }

    this.clock.advance(dt, (tickDt) => {
      this._stepOnce(tickDt);
      this.checkRings();
    });
    this.trail.update(this.car, this.boosting, dt);
    this.updateBoostMeter();

    if (!this.courseDone && !this.onPlatform) {
      this.ctx.hud.status.textContent = `Ring ${Math.min(this.nextIndex + 1, this.rings.length)}/${this.rings.length}`;
    } else if (this.onPlatform) {
      this.ctx.hud.status.textContent =
        "On the pad — Jump or Boost to launch through the rings";
    }

    if (
      this.nextIndex < this.rings.length &&
      !this.rings[this.nextIndex].cleared
    ) {
      this.rings[this.nextIndex].mesh.scale.setScalar(
        1.04 + Math.sin(now * 0.007) * 0.025,
      );
    }
    if (this.water) this.water.rotation.z = Math.sin(now * 0.00015) * 0.002;
    this.updateCamera(dt);
  }
}
