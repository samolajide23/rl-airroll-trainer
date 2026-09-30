import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RL } from "./rl-physics.js";
import { UU } from "./rl-units.js";

/** Render scale: 1 three-unit ≈ 100 uu (1 m). Spec §6. */
export const UU_SCALE = UU;

const BALL_URL = "/ball/rocket-league-ball.glb";

/** @type {THREE.Group | null} Template normalized so visual radius ≈ 1. */
let ballTemplate = null;
/** @type {Promise<void> | null} */
let preloadPromise = null;

/**
 * Scale/center a GLB so its bounding box fits a unit-radius sphere (diameter 2),
 * and apply texture colorSpace like carAssets.
 * @param {THREE.Object3D} root
 * @returns {THREE.Group}
 */
function normalizeBallModel(root) {
  const wrapper = new THREE.Group();
  wrapper.add(root);

  root.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  // The imported sphere is slightly squashed. Normalize all three diameters,
  // not only the longest, so its silhouette agrees with the collision sphere.
  root.scale.set(2 / Math.max(size.x, 0.001), 2 / Math.max(size.y, 0.001), 2 / Math.max(size.z, 0.001));
  root.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  box.getCenter(center);
  root.position.sub(center);

  wrapper.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.material) {
        const mats = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          if ("envMapIntensity" in m) m.envMapIntensity = 0.85;
        }
      }
    }
  });

  return wrapper;
}

/**
 * Preload the Rocket League ball GLB once at boot.
 * Falls back silently; PracticeBall uses a procedural sphere if unavailable.
 * @returns {Promise<void>}
 */
export function preloadBall() {
  if (preloadPromise) return preloadPromise;
  const loader = new GLTFLoader();
  preloadPromise = loader
    .loadAsync(BALL_URL)
    .then((gltf) => {
      const template = normalizeBallModel(gltf.scene);
      template.name = "ball-template-rl";
      ballTemplate = template;
    })
    .catch((err) => {
      console.warn("Failed to load rocket league ball GLB:", err);
    });
  return preloadPromise;
}

/**
 * @returns {boolean}
 */
export function isBallReady() {
  return ballTemplate != null;
}

/**
 * Clone the prepared GLB template (deep clone with materials).
 * @returns {THREE.Group | null}
 */
export function cloneBallMesh() {
  if (!ballTemplate) return null;
  const clone = ballTemplate.clone(true);
  clone.userData.sharedAssets = true;
  clone.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => m.clone());
      } else {
        obj.material = obj.material.clone();
      }
    }
  });
  return clone;
}

/**
 * Procedural sphere used when the GLB is not ready or failed to load.
 * @param {number} radius
 * @returns {THREE.Mesh}
 */
function makeProceduralBallMesh(radius) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0xe8eefc,
      roughness: 0.55,
      metalness: 0.15,
    }),
  );
  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.98, 0.03, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0xff8a4c, roughness: 0.4 }),
  );
  mesh.add(seam);
  const seam2 = seam.clone();
  seam2.rotation.y = Math.PI / 2;
  mesh.add(seam2);
  return mesh;
}

/**
 * Practice ball using RL gravity / drag / restitution (scaled to Three units).
 */
export class PracticeBall {
  /**
   * @param {number} [radius]
   */
  constructor(radius = RL.BALL_RADIUS * UU_SCALE) {
    this.radius = radius;
    this.velocity = new THREE.Vector3();
    const glb = cloneBallMesh();
    if (glb) {
      // Template is unit-radius; scale to match drill / physics radius.
      glb.scale.setScalar(radius);
      this.mesh = glb;
    } else {
      this.mesh = makeProceduralBallMesh(radius);
    }
  }

  /** @param {THREE.Vector3 | number[]} p */
  setPosition(p) {
    if (Array.isArray(p)) this.mesh.position.set(p[0], p[1], p[2]);
    else this.mesh.position.copy(p);
  }

  freeze() {
    this.velocity.set(0, 0, 0);
  }

  /**
   * @param {number} dt
   * @param {{ gravity?: number, drag?: number }} [opts]
   */
  step(dt, opts = {}) {
    // Default gravity = RL 650 uu/s² → Three Y-up
    const gravity = opts.gravity ?? RL.GRAVITY * UU_SCALE;
    const drag = opts.drag ?? RL.BALL_DRAG;
    this.velocity.y -= gravity * dt;
    this.velocity.addScaledVector(this.velocity, -drag * dt);
    const maxSpeed = RL.BALL_MAX_SPEED * UU_SCALE;
    if (this.velocity.length() > maxSpeed) this.velocity.setLength(maxSpeed);
    this.mesh.position.addScaledVector(this.velocity, dt);
    if (this.mesh.position.y < this.radius) {
      this.mesh.position.y = this.radius;
      const e = RL.BALL_RESTITUTION;
      this.velocity.y =
        Math.abs(this.velocity.y) < 0.25 * UU_SCALE
          ? 0
          : -this.velocity.y * e;
      // Tangential kill ≈ RocketSim BALL_FRICTION Coulomb clamp on bounce.
      const slip = 1 - RL.BALL_FRICTION;
      this.velocity.x *= slip;
      this.velocity.z *= slip;
    }
  }

  /**
   * Impulse from car contact (Three-space direction).
   * @param {THREE.Vector3} direction
   * @param {number} strength
   */
  hit(direction, strength) {
    const dir = direction.clone().normalize();
    this.velocity.addScaledVector(dir, strength);
  }
}
