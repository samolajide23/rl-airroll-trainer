import * as THREE from "three";
import { RL_CONST as C } from "./rlConst.js";
import { RL, carHitbox, hitboxExtentOnAxis } from "./rl-physics.js";
import { UU } from "./rl-units.js";

/** Thin disc height for pad meshes (uu) — pickup uses {@link BOOST_PAD.CYL_HEIGHT}. */
export const BOOST_PAD_VISUAL = Object.freeze({
  // Distinct from the 144/208 uu pickup cylinders. Approximate standard-map
  // render footprints, informed by local export bounds, not collision sizes.
  SMALL_RADIUS: 48,
  BIG_RADIUS: 84,
  SMALL_HEIGHT: 6,
  BIG_HEIGHT: 12,
});

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
  SMALL_AMOUNT: C.BOOST_PAD_SMALL_AMOUNT, // [V]
  BIG_AMOUNT: C.BOOST_PAD_BIG_AMOUNT, // [V]
  SMALL_COOLDOWN: C.BOOST_PAD_SMALL_COOLDOWN, // [V] seconds
  BIG_COOLDOWN: C.BOOST_PAD_BIG_COOLDOWN, // [V]
  SMALL_RADIUS: C.BOOST_PAD_CYL_RAD_SMALL, // [V]
  BIG_RADIUS: C.BOOST_PAD_CYL_RAD_BIG, // [V]
  CYL_HEIGHT: C.BOOST_PAD_CYL_HEIGHT, // [V]
  // Alternate AABB pickup volumes (RocketSim BoostPads::BOX_*)
  BOX_HEIGHT: C.BOOST_PAD_BOX_HEIGHT, // [V]
  BOX_RAD_SMALL: C.BOOST_PAD_BOX_RAD_SMALL, // [V]
  BOX_RAD_BIG: C.BOOST_PAD_BOX_RAD_BIG, // [V]
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
 *   _lockedCarId: number | null,
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
      _lockedCarId: null,
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
      _lockedCarId: null,
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
    roughness: 0.28,
    metalness: 0.72,
  });
  const bigMat = smallMat.clone();
  bigMat.color = new THREE.Color(0xffc94a);
  bigMat.emissiveIntensity = 0.65;

  for (const pad of pads) {
    const r = (pad.big ? BOOST_PAD_VISUAL.BIG_RADIUS : BOOST_PAD_VISUAL.SMALL_RADIUS) * UU;
    const h = (pad.big ? BOOST_PAD_VISUAL.BIG_HEIGHT : BOOST_PAD_VISUAL.SMALL_HEIGHT) * UU;
    const mat = (pad.big ? bigMat : smallMat).clone();
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.94, r, h, 48),
      mat,
    );
    // Same mapping as physToThree: physics (x, y, z) → Three (x, z, y)
    mesh.position.set(pad.x * UU, h * 0.5, pad.y * UU);
    mesh.userData.pad = pad;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.7, r * 0.86, 32),
      new THREE.MeshBasicMaterial({ color: pad.big ? 0xffc45b : 0xffdc88, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = h * 0.52;
    halo.name = "boost-active-halo";
    mesh.add(halo);
    const inset = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.65, r * 0.65, h * 0.12, 48),
      new THREE.MeshStandardMaterial({ color: 0x292d32, roughness: 0.42, metalness: 0.8 }),
    );
    inset.position.y = h * 0.48;
    inset.name = "boost-active-inset";
    mesh.add(inset);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(r * 0.91, h * 0.12, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0x737980, roughness: 0.28, metalness: 0.9 }));
    bezel.rotation.x = -Math.PI / 2;
    bezel.position.y = h * 0.48;
    bezel.name = "boost-active-bezel";
    mesh.add(bezel);
    if (pad.big) {
      const pickup = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 24, 16),
        new THREE.MeshStandardMaterial({ color: 0xffdc96, emissive: 0xffa329, emissiveIntensity: 1.8,
          roughness: 0.22, metalness: 0.35 }),
      );
      pickup.position.y = 0.48;
      pickup.name = "boost-active-pickup";
      mesh.add(pickup);
    }
    pad.mesh = mesh;
    group.add(mesh);
  }
  // Templates are not used directly by a mesh; dispose the unused originals.
  smallMat.dispose();
  bigMat.dispose();
  parent.add(group);
  return group;
}

/** Keep the permanent base visible while every luminous element goes dark. */
function syncPadVisual(pad) {
  if (!pad.mesh) return;
  pad.mesh.visible = true;
  const material = pad.mesh.material;
  material.transparent = false;
  material.opacity = 1;
  material.color.setHex(pad.active ? (pad.big ? 0xffc94a : 0xd4a017) : 0x313947);
  material.emissiveIntensity = pad.active ? (pad.big ? 0.65 : 0.4) : 0;
  for (const child of pad.mesh.children) child.visible = pad.active;
}

/**
 * Tick pad cooldowns and collect boost (RocketSim cylinder / locked AABB).
 * @param {BoostPad[]} pads
 * @param {{ pos: THREE.Vector3, boost: number, id?: number }} car
 * @param {number} dt
 * @returns {number} boost collected this tick
 */
export function stepBoostPads(pads, car, dt) {
  let gained = 0;
  // Version-matched BoostPadGrid::CheckCollision skips full/demoed/high cars.
  // Eligibility is sampled once, before any pad's post-tick boost addition.
  const eligible = !car.isDemoed && car.boost < RL.BOOST_MAX && car.pos.z <= BOOST_PAD.CYL_HEIGHT + 250;
  for (const pad of pads) {
    // RocketSim stores cooldown and tickTime as float32 and updates cooldown
    // before contact checks. An expiring pad can be collected on that same tick.
    if (pad.timer > 0) pad.timer = Math.max(0, Math.fround(Math.fround(pad.timer) - Math.fround(dt)));
    pad.active = pad.timer === 0;
    if (!eligible) {
      pad._lockedCarId = null;
      syncPadVisual(pad);
      continue;
    }

    // RocketSim BoostPad::_CheckCollide:
    // - unlocked: cylinder (rad, height CYL_HEIGHT) about pad origin
    // - locked (prev car): AABB box BOX_RAD × BOX_HEIGHT
    const dx = car.pos.x - pad.x;
    const dy = car.pos.y - pad.y;
    const dz = car.pos.z - pad.z;
    const locked = pad._lockedCarId != null && pad._lockedCarId === (car.id ?? 0);
    let hit = false;
    if (locked) {
      const boxRad = pad.big ? BOOST_PAD.BOX_RAD_BIG : BOOST_PAD.BOX_RAD_SMALL;
      if (car.q) {
        const hb = carHitbox(car);
        const extent = new THREE.Vector3(
          hitboxExtentOnAxis(hb, new THREE.Vector3(1, 0, 0)),
          hitboxExtentOnAxis(hb, new THREE.Vector3(0, 1, 0)),
          hitboxExtentOnAxis(hb, new THREE.Vector3(0, 0, 1)),
        );
        hit = hb.center.x - extent.x < pad.x + boxRad && hb.center.x + extent.x > pad.x - boxRad &&
          hb.center.y - extent.y < pad.y + boxRad && hb.center.y + extent.y > pad.y - boxRad &&
          hb.center.z - extent.z < pad.z + BOOST_PAD.BOX_HEIGHT && hb.center.z + extent.z > pad.z;
      } else {
        hit = Math.abs(dx) < boxRad && Math.abs(dy) < boxRad && dz > 0 && dz < BOOST_PAD.BOX_HEIGHT;
      }
    } else {
      // Cylinder: horizontal radius + |dz| < CYL_HEIGHT (RocketSim, not half-height).
      hit =
        dx * dx + dy * dy < pad.radius * pad.radius &&
        Math.abs(dz) < BOOST_PAD.CYL_HEIGHT;
    }
    if (!hit) {
      if (pad._lockedCarId === (car.id ?? 0)) pad._lockedCarId = null;
      syncPadVisual(pad);
      continue;
    }
    pad._lockedCarId = car.id ?? 0;
    if (!pad.active) {
      syncPadVisual(pad);
      continue;
    }

    const before = car.boost;
    car.boost = Math.min(RL.BOOST_MAX, car.boost + pad.amount);
    gained += car.boost - before;
    pad.active = false;
    pad.timer = pad.cooldown;
    syncPadVisual(pad);
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
    pad._lockedCarId = null;
    syncPadVisual(pad);
  }
}
