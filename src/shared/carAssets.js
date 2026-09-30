import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CARS } from "./loadout.js";

/** @type {Map<string, THREE.Object3D>} */
const templates = new Map();

const pendingLoads = new Map();

/**
 * Normalize a GLB so nose ≈ +Z, upright ≈ +Y, length ≈ targetLength,
 * and local origin sits near the visual center (aerial CoM).
 * @param {THREE.Object3D} root
 * @param {number} [targetLength=3.2]
 * @returns {THREE.Group}
 */
function normalizeModel(root, targetLength = 3.2) {
  const wrapper = new THREE.Group();
  wrapper.add(root);

  // Most Sketchfab vehicle exports use Y-up; RL trainer nose is +Z.
  // Heuristic: after bounding-box, if Z is shortest, yaw 90° so length runs along Z.
  root.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.x > size.z * 1.15) {
    root.rotation.y = -Math.PI / 2;
    root.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(root);
    box.getSize(size);
  }

  const length = Math.max(size.z, 0.001);
  const scale = targetLength / length;
  root.scale.setScalar(scale);
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
 * Load requested bodies once; omitting IDs loads every glTF body.
 * @param {string[]} [ids]
 * @returns {Promise<void>}
 */
export function preloadCars(ids = CARS.map(car => car.id)) {
  const jobs = CARS.filter((car) => ids.includes(car.id) && car.kind === "glb" && car.url).map(
    (def) => {
      if (templates.has(def.id)) return Promise.resolve();
      if (pendingLoads.has(def.id)) return pendingLoads.get(def.id);
      const job = (async () => {
        try {
          const gltf = await new GLTFLoader().loadAsync(def.url);
          const template = normalizeModel(
            gltf.scene,
            def.targetLength ?? 3.2,
          );
          template.name = `car-template-${def.id}`;
          templates.set(def.id, template);
        } catch (err) {
          console.warn(`Failed to load car "${def.id}":`, err);
        }
      })();
      pendingLoads.set(def.id, job);
      return job;
    },
  );
  return Promise.all(jobs).then(() => undefined);
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isCarReady(id) {
  const def = CARS.find((c) => c.id === id);
  if (!def) return false;
  if (def.kind === "procedural") return true;
  return templates.has(id);
}

/**
 * Clone a prepared GLB template (deep clone with materials).
 * @param {string} id
 * @returns {THREE.Group | null}
 */
export function cloneGlbCar(id) {
  const template = templates.get(id);
  if (!template) return null;
  const clone = template.clone(true);
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
