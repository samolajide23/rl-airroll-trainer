import * as THREE from "three";
import { RL } from "./rl-physics.js";

/**
 * Soccar arena collision shape (uu, Z-up) as an interior distance field.
 *
 * The real arena is a triangle mesh; here it is the union of a rounded box
 * (floor, walls, ceiling with curved transitions so cars can drive up walls)
 * and one rounded box per goal. Positive distance = inside the playable space.
 */
export const ARENA_SHAPE = {
  HALF_W: RL.HALF_W, // [V]
  HALF_L: RL.HALF_L, // [V]
  HEIGHT: RL.CEILING, // [V]
  EDGE_RADIUS: 256, // [A] floor/wall/ceiling transition radius
  GOAL_HALF_W: RL.GOAL_HALF_W, // [V]
  GOAL_HEIGHT: RL.GOAL_HEIGHT, // [V]
  GOAL_DEPTH: RL.GOAL_DEPTH, // [V] mesh AABB
  GOAL_EDGE_RADIUS: 16, // [A]
  /** Goal box starts this far in front of the back wall so it cuts the ramp at the mouth. */
  GOAL_LIP: 300,
};

/**
 * Distance from p to the boundary of a rounded box, positive inside.
 * @param {number} px @param {number} py @param {number} pz
 * @param {number} cx @param {number} cy @param {number} cz
 * @param {number} hx @param {number} hy @param {number} hz
 * @param {number} r
 */
function roundedBoxInterior(px, py, pz, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(px - cx) - (hx - r);
  const qy = Math.abs(py - cy) - (hy - r);
  const qz = Math.abs(pz - cz) - (hz - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, qy, qz), 0);
  return r - (outside + inside);
}

const A = ARENA_SHAPE;
const GOAL_Y0 = A.HALF_L - A.GOAL_LIP;
const GOAL_Y1 = A.HALF_L + A.GOAL_DEPTH;

/**
 * @param {number} x @param {number} y @param {number} z
 * @returns {number} uu to the nearest arena surface (negative = outside / penetrating)
 */
export function arenaDistance(x, y, z) {
  const field = roundedBoxInterior(
    x, y, z,
    0, 0, A.HEIGHT / 2,
    A.HALF_W, A.HALF_L, A.HEIGHT / 2,
    A.EDGE_RADIUS,
  );
  const goal = roundedBoxInterior(
    x, Math.abs(y), z,
    0, (GOAL_Y0 + GOAL_Y1) / 2, A.GOAL_HEIGHT / 2,
    A.GOAL_HALF_W, (GOAL_Y1 - GOAL_Y0) / 2, A.GOAL_HEIGHT / 2,
    A.GOAL_EDGE_RADIUS,
  );
  return Math.max(field, goal);
}

const NORMAL_EPS = 0.5;

/**
 * Surface normal (pointing into the playable space) near p.
 * @param {THREE.Vector3} p
 * @param {THREE.Vector3} [out]
 */
export function arenaNormal(p, out = new THREE.Vector3()) {
  const e = NORMAL_EPS;
  out.set(
    arenaDistance(p.x + e, p.y, p.z) - arenaDistance(p.x - e, p.y, p.z),
    arenaDistance(p.x, p.y + e, p.z) - arenaDistance(p.x, p.y - e, p.z),
    arenaDistance(p.x, p.y, p.z + e) - arenaDistance(p.x, p.y, p.z - e),
  );
  const len = out.length();
  if (len < 1e-9) return out.set(0, 0, 1);
  return out.multiplyScalar(1 / len);
}

const HIT_EPS = 0.01;
const MAX_MARCH_STEPS = 128;

/**
 * Sphere-traced ray cast against the arena (exact for this convex-union field).
 * Rays starting outside the playable space report no hit, like back-face
 * culled mesh rays.
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} dir unit direction
 * @param {number} maxLen
 * @returns {null | { dist: number, point: THREE.Vector3, normal: THREE.Vector3 }}
 */
export function raycastArena(origin, dir, maxLen) {
  if (arenaDistance(origin.x, origin.y, origin.z) <= 0) return null;
  let t = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i < MAX_MARCH_STEPS; i++) {
    p.copy(origin).addScaledVector(dir, t);
    const d = arenaDistance(p.x, p.y, p.z);
    if (d < HIT_EPS) {
      return { dist: t, point: p, normal: arenaNormal(p) };
    }
    t += d;
    if (t > maxLen) return null;
  }
  return null;
}
