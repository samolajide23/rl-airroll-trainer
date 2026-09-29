import * as THREE from "three";
import { SOCCAR_TRI_COUNT, SOCCAR_TRIS } from "./soccarMeshData.js";

/**
 * Soccar arena collision — RocketSim SOCCAR layout:
 *   - Infinite planes: floor z=0, ceiling z=2048, side walls x=±4096
 *   - Triangle meshes: ramps, corners, goals (from .cmf dumps)
 *
 * End walls are mesh-only (goal mouths). Used for wheel rays + hitbox contacts.
 */

const EPS = 1e-8;
/** RocketSim RLConst arena extents (uu) — kept local to avoid import cycles. */
const HALF_W = 4096;
const CEILING = 2048;

/** @type {{ point: THREE.Vector3, normal: THREE.Vector3 }[]} */
const PLANES = [
  { point: new THREE.Vector3(0, 0, 0), normal: new THREE.Vector3(0, 0, 1) },
  { point: new THREE.Vector3(0, 0, CEILING), normal: new THREE.Vector3(0, 0, -1) },
  { point: new THREE.Vector3(-HALF_W, 0, CEILING / 2), normal: new THREE.Vector3(1, 0, 0) },
  { point: new THREE.Vector3(HALF_W, 0, CEILING / 2), normal: new THREE.Vector3(-1, 0, 0) },
];

/** @typedef {{ min: THREE.Vector3, max: THREE.Vector3, left: number, right: number, tri: number }} BvhNode */

/** Packed triangles: 9 floats per tri (ax,ay,az,bx,by,bz,cx,cy,cz) */
const TRI = SOCCAR_TRIS;

export const ARENA_TRI_COUNT = SOCCAR_TRI_COUNT;

/** @type {BvhNode[]} */
const BVH = [];
/** @type {number[]} */
const ORDER = Array.from({ length: ARENA_TRI_COUNT }, (_, i) => i);

function triBounds(i, min, max) {
  const o = i * 9;
  min.set(
    Math.min(TRI[o], TRI[o + 3], TRI[o + 6]),
    Math.min(TRI[o + 1], TRI[o + 4], TRI[o + 7]),
    Math.min(TRI[o + 2], TRI[o + 5], TRI[o + 8]),
  );
  max.set(
    Math.max(TRI[o], TRI[o + 3], TRI[o + 6]),
    Math.max(TRI[o + 1], TRI[o + 4], TRI[o + 7]),
    Math.max(TRI[o + 2], TRI[o + 5], TRI[o + 8]),
  );
}

function buildBvh(start, end) {
  const nodeIndex = BVH.length;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const tmin = new THREE.Vector3();
  const tmax = new THREE.Vector3();
  for (let i = start; i < end; i++) {
    triBounds(ORDER[i], tmin, tmax);
    min.min(tmin);
    max.max(tmax);
  }
  BVH.push({ min, max, left: -1, right: -1, tri: -1 });

  const count = end - start;
  if (count === 1) {
    BVH[nodeIndex].tri = ORDER[start];
    return nodeIndex;
  }

  const ext = max.clone().sub(min);
  const axis = ext.x >= ext.y && ext.x >= ext.z ? 0 : ext.y >= ext.z ? 1 : 2;
  const mid = (start + end) >> 1;
  const slice = ORDER.slice(start, end);
  slice.sort((a, b) => {
    const oa = a * 9;
    const ob = b * 9;
    const ca = (TRI[oa + axis] + TRI[oa + 3 + axis] + TRI[oa + 6 + axis]) / 3;
    const cb = (TRI[ob + axis] + TRI[ob + 3 + axis] + TRI[ob + 6 + axis]) / 3;
    return ca - cb;
  });
  for (let i = 0; i < slice.length; i++) ORDER[start + i] = slice[i];

  BVH[nodeIndex].left = buildBvh(start, mid);
  BVH[nodeIndex].right = buildBvh(mid, end);
  return nodeIndex;
}

const BVH_ROOT = buildBvh(0, ARENA_TRI_COUNT);

function rayAabb(origin, invDir, min, max, tMax) {
  let t0 = 0;
  let t1 = tMax;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? origin.x : a === 1 ? origin.y : origin.z;
    const id = a === 0 ? invDir.x : a === 1 ? invDir.y : invDir.z;
    const mn = a === 0 ? min.x : a === 1 ? min.y : min.z;
    const mx = a === 0 ? max.x : a === 1 ? max.y : max.z;
    const tNear = (mn - o) * id;
    const tFar = (mx - o) * id;
    const lo = Math.min(tNear, tFar);
    const hi = Math.max(tNear, tFar);
    t0 = Math.max(t0, lo);
    t1 = Math.min(t1, hi);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Möller–Trumbore. Returns t or -1. Normal points toward the side the ray hits
 * from (flipped if needed so n·dir < 0).
 */
function rayTriangle(origin, dir, tri, tMax, hitPoint, hitNormal) {
  const o = tri * 9;
  const ax = TRI[o];
  const ay = TRI[o + 1];
  const az = TRI[o + 2];
  const e1x = TRI[o + 3] - ax;
  const e1y = TRI[o + 4] - ay;
  const e1z = TRI[o + 5] - az;
  const e2x = TRI[o + 6] - ax;
  const e2y = TRI[o + 7] - ay;
  const e2z = TRI[o + 8] - az;

  const hx = dir.y * e2z - dir.z * e2y;
  const hy = dir.z * e2x - dir.x * e2z;
  const hz = dir.x * e2y - dir.y * e2x;
  const a = e1x * hx + e1y * hy + e1z * hz;
  if (a > -EPS && a < EPS) return -1;
  const f = 1 / a;
  const sx = origin.x - ax;
  const sy = origin.y - ay;
  const sz = origin.z - az;
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (dir.x * qx + dir.y * qy + dir.z * qz);
  if (v < 0 || u + v > 1) return -1;
  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  if (t <= EPS || t > tMax) return -1;

  hitPoint.set(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
  // Geometric normal; flip so it faces the ray origin (into playable space for walls/floor).
  hitNormal.set(
    e1y * e2z - e1z * e2y,
    e1z * e2x - e1x * e2z,
    e1x * e2y - e1y * e2x,
  );
  if (hitNormal.lengthSq() < EPS) return -1;
  hitNormal.normalize();
  if (hitNormal.dot(dir) > 0) hitNormal.negate();
  return t;
}

const _invDir = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _hn = new THREE.Vector3();
const _stack = new Int32Array(128);

function raycastPlanes(origin, dir, maxLen, bestP, bestN) {
  let bestT = maxLen;
  let hit = false;
  for (const plane of PLANES) {
    const denom = dir.dot(plane.normal);
    if (denom >= -EPS) continue; // must hit the front face
    const t = plane.point.clone().sub(origin).dot(plane.normal) / denom;
    if (t > EPS && t < bestT) {
      bestT = t;
      bestP.copy(origin).addScaledVector(dir, t);
      bestN.copy(plane.normal);
      hit = true;
    }
  }
  return hit ? bestT : -1;
}

/**
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} dir unit direction
 * @param {number} maxLen
 * @returns {null | { dist: number, point: THREE.Vector3, normal: THREE.Vector3 }}
 */
export function raycastArena(origin, dir, maxLen) {
  const bestP = new THREE.Vector3();
  const bestN = new THREE.Vector3();
  let bestT = maxLen;
  let hit = false;

  const planeT = raycastPlanes(origin, dir, bestT, bestP, bestN);
  if (planeT > 0) {
    bestT = planeT;
    hit = true;
  }

  _invDir.set(
    Math.abs(dir.x) > EPS ? 1 / dir.x : dir.x >= 0 ? 1e15 : -1e15,
    Math.abs(dir.y) > EPS ? 1 / dir.y : dir.y >= 0 ? 1e15 : -1e15,
    Math.abs(dir.z) > EPS ? 1 / dir.z : dir.z >= 0 ? 1e15 : -1e15,
  );

  let sp = 0;
  _stack[sp++] = BVH_ROOT;
  while (sp > 0) {
    const ni = _stack[--sp];
    const node = BVH[ni];
    if (!rayAabb(origin, _invDir, node.min, node.max, bestT)) continue;
    if (node.tri >= 0) {
      const t = rayTriangle(origin, dir, node.tri, bestT, _hp, _hn);
      if (t > 0 && t < bestT) {
        bestT = t;
        bestP.copy(_hp);
        bestN.copy(_hn);
        hit = true;
      }
      continue;
    }
    if (node.right >= 0) _stack[sp++] = node.right;
    if (node.left >= 0) _stack[sp++] = node.left;
  }
  if (!hit) return null;
  return { dist: bestT, point: bestP.clone(), normal: bestN.clone() };
}

/** Closest point on triangle to p. Returns squared distance. */
function closestOnTri(px, py, pz, tri, outPoint, outNormal) {
  const o = tri * 9;
  const ax = TRI[o];
  const ay = TRI[o + 1];
  const az = TRI[o + 2];
  const bx = TRI[o + 3];
  const by = TRI[o + 4];
  const bz = TRI[o + 5];
  const cx = TRI[o + 6];
  const cy = TRI[o + 7];
  const cz = TRI[o + 8];

  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    outPoint.set(ax, ay, az);
  } else {
    const bpx = px - bx;
    const bpy = py - by;
    const bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) {
      outPoint.set(bx, by, bz);
    } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        outPoint.set(ax + abx * v, ay + aby * v, az + abz * v);
      } else {
        const cpx = px - cx;
        const cpy = py - cy;
        const cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz;
        const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) {
          outPoint.set(cx, cy, cz);
        } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            outPoint.set(ax + acx * w, ay + acy * w, az + acz * w);
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
              outPoint.set(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w);
            } else {
              const denom = 1 / (va + vb + vc);
              const v = vb * denom;
              const w = vc * denom;
              outPoint.set(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
            }
          }
        }
      }
    }
  }

  outNormal.set(
    aby * acz - abz * acy,
    abz * acx - abx * acz,
    abx * acy - aby * acx,
  );
  if (outNormal.lengthSq() < EPS) outNormal.set(0, 0, 1);
  else outNormal.normalize();
  // Flip so normal points toward query point (into free space).
  const dx = px - outPoint.x;
  const dy = py - outPoint.y;
  const dz = pz - outPoint.z;
  if (outNormal.x * dx + outNormal.y * dy + outNormal.z * dz < 0) outNormal.negate();

  const ex = px - outPoint.x;
  const ey = py - outPoint.y;
  const ez = pz - outPoint.z;
  return ex * ex + ey * ey + ez * ez;
}

function pointAabbDistSq(px, py, pz, min, max) {
  const dx = px < min.x ? min.x - px : px > max.x ? px - max.x : 0;
  const dy = py < min.y ? min.y - py : py > max.y ? py - max.y : 0;
  const dz = pz < min.z ? min.z - pz : pz > max.z ? pz - max.z : 0;
  return dx * dx + dy * dy + dz * dz;
}

const _cp = new THREE.Vector3();
const _cn = new THREE.Vector3();

/**
 * Signed distance to the arena (planes + meshes). Positive = playable side,
 * negative = penetrating / outside. `outNormal` receives the contact normal
 * pointing into the playable space.
 * @param {number} x @param {number} y @param {number} z
 * @param {THREE.Vector3} [outNormal]
 */
export function arenaDistance(x, y, z, outNormal) {
  let bestAbs = Infinity;
  let bestSigned = Infinity;
  const bestN = outNormal ?? new THREE.Vector3();

  for (const plane of PLANES) {
    const signed =
      (x - plane.point.x) * plane.normal.x +
      (y - plane.point.y) * plane.normal.y +
      (z - plane.point.z) * plane.normal.z;
    const abs = Math.abs(signed);
    if (abs < bestAbs) {
      bestAbs = abs;
      bestSigned = signed;
      bestN.copy(plane.normal);
    }
  }

  let meshBest = Infinity;
  let sp = 0;
  _stack[sp++] = BVH_ROOT;
  while (sp > 0) {
    const ni = _stack[--sp];
    const node = BVH[ni];
    if (pointAabbDistSq(x, y, z, node.min, node.max) >= meshBest) continue;
    if (node.tri >= 0) {
      const d2 = closestOnTri(x, y, z, node.tri, _cp, _cn);
      if (d2 < meshBest) {
        meshBest = d2;
        const dist = Math.sqrt(d2);
        const cx = 0 - _cp.x;
        const cy = 0 - _cp.y;
        const cz = CEILING / 2 - _cp.z;
        const towardCenter = _cn.x * cx + _cn.y * cy + _cn.z * cz;
        const signed = towardCenter >= 0 ? dist : -dist;
        if (Math.abs(signed) < bestAbs) {
          bestAbs = Math.abs(signed);
          bestSigned = signed;
          bestN.copy(_cn);
        }
      }
      continue;
    }
    const ld = pointAabbDistSq(x, y, z, BVH[node.left].min, BVH[node.left].max);
    const rd = pointAabbDistSq(x, y, z, BVH[node.right].min, BVH[node.right].max);
    if (ld < rd) {
      if (rd < meshBest) _stack[sp++] = node.right;
      if (ld < meshBest) _stack[sp++] = node.left;
    } else {
      if (ld < meshBest) _stack[sp++] = node.left;
      if (rd < meshBest) _stack[sp++] = node.right;
    }
  }

  if (outNormal && outNormal.lengthSq() < EPS) outNormal.set(0, 0, 1);
  return bestSigned;
}

/**
 * @param {THREE.Vector3} p
 * @param {THREE.Vector3} [out]
 */
export function arenaNormal(p, out = new THREE.Vector3()) {
  arenaDistance(p.x, p.y, p.z, out);
  if (out.lengthSq() < EPS) out.set(0, 0, 1);
  return out;
}
