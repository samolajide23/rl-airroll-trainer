import * as THREE from "three";
import { RL } from "./rl-physics.js";
import { UU } from "./rl-units.js";

/** Thin disc height for pad meshes (uu) — pickup uses {@link BOOST_PAD.CYL_HEIGHT}. */
const PAD_VIS_H_UU = 12;

/**
 * Soccar boost pad layout from RocketSim RLConst::BoostPads (uu, Z-up).
 * Pickup uses a cylinder around the pad; pads respawn on cooldown.
 */

/** @typedef {{ x: number, y: number, z: number, big: boolean }} PadLoc */

/** @type {PadLoc[]} */
export const SOCCAR_SMALL_PADS = [
  { x: 0, y: -4240, z: 70, big: false },
  { x: -1792, y: -4184, z: 70, big: false },
  { x: 1792, y: -4184, z: 70, big: false },
  { x: -940, y: -3308, z: 70, big: false },
  { x: 940, y: -3308, z: 70, big: false },
  { x: 0, y: -2816, z: 70, big: false },
  { x: -3584, y: -2484, z: 70, big: false },
  { x: 3584, y: -2484, z: 70, big: false },
  { x: -1788, y: -2300, z: 70, big: false },
  { x: 1788, y: -2300, z: 70, big: false },
  { x: -2048, y: -1036, z: 70, big: false },
  { x: 0, y: -1024, z: 70, big: false },
  { x: 2048, y: -1036, z: 70, big: false },
  { x: -1024, y: 0, z: 70, big: false },
  { x: 1024, y: 0, z: 70, big: false },
  { x: -2048, y: 1036, z: 70, big: false },
  { x: 0, y: 1024, z: 70, big: false },
  { x: 2048, y: 1036, z: 70, big: false },
  { x: -1788, y: 2300, z: 70, big: false },
  { x: 1788, y: 2300, z: 70, big: false },
  { x: -3584, y: 2484, z: 70, big: false },
  { x: 3584, y: 2484, z: 70, big: false },
  { x: 0, y: 2816, z: 70, big: false },
  { x: -940, y: 3308, z: 70, big: false },
  { x: 940, y: 3308, z: 70, big: false },
  { x: -1792, y: 4184, z: 70, big: false },
  { x: 1792, y: 4184, z: 70, big: false },
  { x: 0, y: 4240, z: 70, big: false },
];

/** @type {PadLoc[]} */
export const SOCCAR_BIG_PADS = [
  { x: -3584, y: 0, z: 73, big: true },
  { x: 3584, y: 0, z: 73, big: true },
  { x: -3072, y: 4096, z: 73, big: true },
  { x: 3072, y: 4096, z: 73, big: true },
  { x: -3072, y: -4096, z: 73, big: true },
  { x: 3072, y: -4096, z: 73, big: true },
];

export const BOOST_PAD = {
  SMALL_AMOUNT: 12, // [V]
  BIG_AMOUNT: 100, // [V]
  SMALL_COOLDOWN: 4, // [V] seconds
  BIG_COOLDOWN: 10, // [V]
  SMALL_RADIUS: 144, // [V] CYL_RAD_SMALL
  BIG_RADIUS: 208, // [V] CYL_RAD_BIG
  CYL_HEIGHT: 95, // [V]
  // Alternate AABB pickup volumes (RocketSim BoostPads::BOX_*)
  BOX_HEIGHT: 64, // [V]
  BOX_RAD_SMALL: 120, // [V]
  BOX_RAD_BIG: 160, // [V]
};

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   z: number,
 *   big: boolean,
 *   amount: number,
 *   cooldown: number,
 *   radius: number,
 *   timer: number,
 *   active: boolean,
 *   mesh: THREE.Object3D | null,
 * }} BoostPad
 */

/**
 * @returns {BoostPad[]}
 */
export function createSoccarBoostPads() {
  /** @type {BoostPad[]} */
  const pads = [];
  for (const loc of SOCCAR_SMALL_PADS) {
    pads.push({
      x: loc.x,
      y: loc.y,
      z: loc.z,
      big: false,
      amount: BOOST_PAD.SMALL_AMOUNT,
      cooldown: BOOST_PAD.SMALL_COOLDOWN,
      radius: BOOST_PAD.SMALL_RADIUS,
      timer: 0,
      active: true,
      mesh: null,
    });
  }
  for (const loc of SOCCAR_BIG_PADS) {
    pads.push({
      x: loc.x,
      y: loc.y,
      z: loc.z,
      big: true,
      amount: BOOST_PAD.BIG_AMOUNT,
      cooldown: BOOST_PAD.BIG_COOLDOWN,
      radius: BOOST_PAD.BIG_RADIUS,
      timer: 0,
      active: true,
      mesh: null,
    });
  }
  return pads;
}

/**
 * Visual pads parented under `parent` (Three Y-up). Physics pads keep uu coords.
 * @param {THREE.Object3D} parent
 * @param {BoostPad[]} pads
 * @returns {THREE.Group}
 */
export function createBoostPadMeshes(parent, pads) {
  const group = new THREE.Group();
  group.name = "boost-pads";
  const smallMat = new THREE.MeshStandardMaterial({
    color: 0xd4a017,
    emissive: 0x5a3a00,
    emissiveIntensity: 0.4,
    roughness: 0.45,
  });
  const bigMat = smallMat.clone();
  bigMat.color = new THREE.Color(0xffc94a);
  bigMat.emissiveIntensity = 0.65;

  for (const pad of pads) {
    const r = pad.radius * UU;
    const h = PAD_VIS_H_UU * UU;
    const mat = (pad.big ? bigMat : smallMat).clone();
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, pad.big ? 28 : 20),
      mat,
    );
    // Same mapping as physToThree: physics (x, y, z) → Three (x, z, y)
    mesh.position.set(pad.x * UU, h * 0.5, pad.y * UU);
    mesh.userData.pad = pad;
    pad.mesh = mesh;
    group.add(mesh);
  }
  parent.add(group);
  return group;
}

/**
 * Tick pad cooldowns and collect boost when the car centre is inside a pad cylinder.
 * @param {BoostPad[]} pads
 * @param {{ pos: THREE.Vector3, boost: number }} car
 * @param {number} dt
 * @returns {number} boost collected this tick
 */
export function stepBoostPads(pads, car, dt) {
  let gained = 0;
  for (const pad of pads) {
    if (!pad.active) {
      pad.timer -= dt;
      if (pad.timer <= 0) {
        pad.active = true;
        pad.timer = 0;
        if (pad.mesh) {
          pad.mesh.visible = true;
          pad.mesh.material.opacity = 1;
        }
      } else if (pad.mesh) {
        pad.mesh.visible = pad.timer < 0.15;
        if (pad.mesh.material) {
          pad.mesh.material.transparent = true;
          pad.mesh.material.opacity = 0.25;
        }
      }
      continue;
    }

    const dx = car.pos.x - pad.x;
    const dy = car.pos.y - pad.y;
    const dz = car.pos.z - pad.z;
    if (dx * dx + dy * dy > pad.radius * pad.radius) continue;
    if (Math.abs(dz) > BOOST_PAD.CYL_HEIGHT * 0.5 + 40) continue;

    const before = car.boost;
    car.boost = Math.min(RL.BOOST_MAX, car.boost + pad.amount);
    gained += car.boost - before;
    pad.active = false;
    pad.timer = pad.cooldown;
    if (pad.mesh) {
      pad.mesh.material.transparent = true;
      pad.mesh.material.opacity = 0.2;
    }
  }
  return gained;
}

/**
 * @param {BoostPad[]} pads
 */
export function resetBoostPads(pads) {
  for (const pad of pads) {
    pad.active = true;
    pad.timer = 0;
    if (pad.mesh) {
      pad.mesh.visible = true;
      if (pad.mesh.material) {
        pad.mesh.material.transparent = false;
        pad.mesh.material.opacity = 1;
      }
    }
  }
}
