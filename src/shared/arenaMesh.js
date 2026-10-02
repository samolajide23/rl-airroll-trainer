import * as THREE from "three";
import { SOCCAR_TRI_COUNT, SOCCAR_TRIS, SOCCAR_MESH_ENDS, SOCCAR_QUERY_ORDER, SOCCAR_BT_TRIS } from "./soccarMeshData.js";
import { bulletAdd, bulletCross, bulletDot, bulletScale, bulletSubtract, normalizeSse } from "./bulletMath.js";

/**
 * Soccar arena collision — RocketSim SOCCAR layout:
 *   - Infinite planes: floor z=0, ceiling z=2048, side walls x=±4096
 *   - Triangle meshes: ramps, corners, goals (from .cmf dumps)
 *
 * End walls are mesh-only (goal mouths). Used for wheel rays + hitbox contacts.
 */

const EPS = 1e-8;
/**
 * RocketSim RLConst arena extents (uu).
 * Duplicated (not imported from RL) to avoid a cycle with rl-physics.js.
 * `tools/rocketsim-parity.mjs` asserts these match RL.HALF_W / RL.CEILING.
 */
export const ARENA_HALF_W = 4096;
export const ARENA_CEILING = 2048;
const HALF_W = ARENA_HALF_W;
const CEILING = ARENA_CEILING;

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
const QUERY_RANK = new Uint16Array(SOCCAR_TRI_COUNT);
SOCCAR_QUERY_ORDER.forEach((triangle, rank) => { QUERY_RANK[triangle] = rank; });

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
  let triangle = -1;
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
        triangle = node.tri;
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
  return { dist: bestT, point: bestP.clone(), normal: bestN.clone(), triangle };
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
const _meshP = new THREE.Vector3();
const _meshN = new THREE.Vector3();
let sharedEdges;

function adjustInternalEdgeNormal(triangle, point, normal, native = false) {
  if (!sharedEdges) {
    sharedEdges = new Map();
    const edges = new Map();
    for (let index = 0; index < ARENA_TRI_COUNT; index++) {
      const mesh = SOCCAR_MESH_ENDS.findIndex(end => index < end);
      const vertices = [0, 3, 6].map(offset => new THREE.Vector3().fromArray(TRI, index * 9 + offset));
      const face = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
      for (let edge = 0; edge < 3; edge++) {
        const start = vertices[edge], end = vertices[(edge + 1) % 3];
        const key = `${mesh}:` + [start.toArray().join(","), end.toArray().join(",")].sort().join(";");
        const previous = edges.get(key);
        if (previous) {
          const current = { index, start, end, face, interior: vertices[(edge + 2) % 3] };
          for (const [entry, neighbor] of [[previous, current], [current, previous]]) {
            const list = sharedEdges.get(entry.index) ?? [];
            list.push({ ...entry, neighbor });
            sharedEdges.set(entry.index, list);
          }
        } else edges.set(key, { index, start, end, face, interior: vertices[(edge + 2) % 3] });
      }
    }
  }
  let closest;
  let closestDistance = 5;
  for (const entry of sharedEdges.get(triangle) ?? []) {
    const { start, end } = entry;
    const direction = end.clone().sub(start);
    const amount = THREE.MathUtils.clamp(point.clone().sub(start).dot(direction) / direction.lengthSq(), 0, 1);
    const nearest = start.clone().addScaledVector(direction, amount);
    const distance = point.distanceTo(nearest);
    if (distance < closestDistance) {
      closest = entry;
      closestDistance = distance;
    }
  }
  if (!closest) return;
  const { start, end, face, neighbor } = closest;
  const planar = face.clone().cross(neighbor.face).lengthSq() < 0.0001;
  const convex = face.dot(neighbor.interior.clone().sub(start)) < 0;
  if (planar || !convex) {
    if (face.dot(normal) >= 0) {
      if (native) {
        const vertices = [0, 3, 6].map(offset => new THREE.Vector3().fromArray(SOCCAR_BT_TRIS, triangle * 9 + offset));
        normal.copy(normalizeSse(bulletCross(bulletSubtract(vertices[1], vertices[0]), bulletSubtract(vertices[2], vertices[0]))));
      } else normal.copy(face);
    }
    return;
  }
  const axis = start.clone().sub(end).normalize();
  const transverse = axis.clone().cross(face).normalize();
  const edgeAngle = Math.atan2(neighbor.face.dot(transverse), neighbor.face.dot(face));
  const contactAngle = Math.atan2(normal.dot(transverse), normal.dot(face));
  if (edgeAngle < 0 ? contactAngle < edgeAngle : contactAngle > edgeAngle) {
    const adjusted = normal.clone().applyAxisAngle(axis, edgeAngle - contactAngle);
    if (adjusted.dot(face) > 0) normal.copy(adjusted);
  }
}

/**
 * Sphere contacts against finite triangle features and arena planes.
 * Unlike the car's signed-distance approximation, a distant goal roof's
 * infinite plane must not collide with a ball passing through the goal mouth.
 * Triangle normals point from the closest feature toward the sphere, so goal
 * interiors do not depend on a global "toward arena centre" heuristic.
 */
function nativeSphereTriangle(center, radius, margin, triangle) {
  const round = Math.fround;
  const [first, second, third] = [0, 3, 6].map(offset => new THREE.Vector3().fromArray(SOCCAR_BT_TRIS, triangle * 9 + offset));
  const edgeSecond = bulletSubtract(second, first), edgeThird = bulletSubtract(third, first);
  const face = bulletCross(edgeSecond, edgeThird);
  const squared = bulletDot(face, face);
  if (squared < 1.1920928955078125e-7 ** 2) return null;
  const normal = bulletScale(face, round(1 / round(Math.sqrt(squared))));
  const relative = bulletSubtract(center, first);
  const planeDistance = Math.abs(bulletDot(relative, normal));
  const range = round(radius + margin);
  if (planeDistance >= range) return null;
  if (bulletDot(relative, normal) < 0) normal.negate();
  const gamma = round(bulletDot(bulletCross(edgeSecond, relative), face) / squared);
  const beta = round(bulletDot(bulletCross(relative, edgeThird), face) / squared);
  const alpha = round(round(1 - gamma) - beta);
  let point;
  if ([gamma, beta, alpha].every(value => value >= 0 && value <= 1)) {
    point = bulletSubtract(center, bulletScale(normal, planeDistance));
  } else {
    const fromSecond = bulletSubtract(center, second), fromThird = bulletSubtract(center, third);
    const firstSecond = bulletDot(edgeSecond, relative), firstThird = bulletDot(edgeThird, relative);
    const secondSecond = bulletDot(edgeSecond, fromSecond), secondThird = bulletDot(edgeThird, fromSecond);
    const thirdSecond = bulletDot(edgeSecond, fromThird), thirdThird = bulletDot(edgeThird, fromThird);
    const areaThird = round(round(firstSecond * secondThird) - round(secondSecond * firstThird));
    const areaSecond = round(round(thirdSecond * firstThird) - round(firstSecond * thirdThird));
    const areaFirst = round(round(secondSecond * thirdThird) - round(thirdSecond * secondThird));
    if (firstSecond <= 0 && firstThird <= 0) point = first;
    else if (secondSecond >= 0 && secondThird <= secondSecond) point = second;
    else if (thirdThird >= 0 && thirdSecond <= thirdThird) point = third;
    else if (areaThird <= 0 && firstSecond >= 0 && secondSecond <= 0)
      point = bulletAdd(first, bulletScale(edgeSecond, round(firstSecond / round(firstSecond - secondSecond))));
    else if (areaSecond <= 0 && firstThird >= 0 && thirdThird <= 0)
      point = bulletAdd(first, bulletScale(edgeThird, round(firstThird / round(firstThird - thirdThird))));
    else if (areaFirst <= 0 && round(secondThird - secondSecond) >= 0 && round(thirdSecond - thirdThird) >= 0)
      point = bulletAdd(second, bulletScale(bulletSubtract(third, second), round(round(secondThird - secondSecond) / round(round(secondThird - secondSecond) + round(thirdSecond - thirdThird)))));
    else {
      const inverse = round(1 / round(round(areaFirst + areaSecond) + areaThird));
      point = bulletAdd(bulletAdd(first, bulletScale(edgeSecond, round(areaSecond * inverse))), bulletScale(edgeThird, round(areaThird * inverse)));
    }
  }
  const offset = bulletSubtract(center, point);
  const distanceSquared = bulletDot(offset, offset);
  if (distanceSquared >= round(range * range)) return null;
  const distance = distanceSquared > 1.1920928955078125e-7 ? round(round(Math.sqrt(distanceSquared)) - radius) : -radius;
  if (distanceSquared > 1.1920928955078125e-7) normal.copy(normalizeSse(offset));
  const pointA = bulletAdd(point, bulletScale(normal, distance));
  return { normal, point, pointA, distance, rel: bulletSubtract(pointA, center) };
}

export function sphereArenaContacts(position, radius, margin = 1, { merge = true, manifold = false, bulletPosition } = {}) {
  const contacts = [];
  const { x, y, z } = position;
  for (const plane of PLANES) {
    const distance = position.clone().sub(plane.point).dot(plane.normal) - radius;
    if (distance < margin) contacts.push({ normal: plane.normal.clone(), distance, plane: true });
  }
  const rangeSq = (radius + margin) ** 2;
  let sp = 0;
  _stack[sp++] = BVH_ROOT;
  while (sp > 0) {
    const node = BVH[_stack[--sp]];
    if (pointAabbDistSq(x, y, z, node.min, node.max) > rangeSq) continue;
    if (node.tri < 0) {
      _stack[sp++] = node.right;
      _stack[sp++] = node.left;
      continue;
    }
    const native = manifold ? nativeSphereTriangle(bulletPosition ?? bulletScale(position, Math.fround(0.02)), Math.fround(radius * Math.fround(0.02)), Math.fround(margin / 50), node.tri) : null;
    if (manifold && !native) continue;
    const d2 = closestOnTri(x, y, z, node.tri, _cp, _cn);
    if (d2 >= rangeSq) continue;
    const normal = position.clone().sub(_cp);
    if (d2 > EPS) normal.multiplyScalar(1 / Math.sqrt(d2));
    else normal.copy(_cn);
    if (native) { normal.copy(native.normal); _cp.copy(native.point).multiplyScalar(50); }
    const rel = manifold ? normal.clone().multiplyScalar(-radius) : undefined;
    if (!merge) adjustInternalEdgeNormal(node.tri, _cp, normal, manifold);
    let distance = Math.sqrt(d2) - radius;
    if (native) {
      if (!normal.equals(native.normal)) native.point = bulletSubtract(native.pointA, bulletScale(normal, native.distance));
      native.distance = bulletDot(bulletSubtract(native.pointA, native.point), normal);
      rel.copy(native.rel).multiplyScalar(50);
      distance = native.distance * 50;
    }
    // Adjacent coplanar triangles describe one constraint, not repeated hits.
    const same = merge && contacts.find((c) => c.normal.dot(normal) > 0.9999);
    if (same) same.distance = Math.min(same.distance, distance);
    else contacts.push({ normal, distance, ...(manifold ? { rel, nativeRel: native.rel, nativeDistance: native.distance, triangle: node.tri, mesh: SOCCAR_MESH_ENDS.findIndex(end => node.tri < end) } : {}) });
  }
  if (manifold) {
    contacts.sort((first, second) => (QUERY_RANK[first.triangle] ?? -1) - (QUERY_RANK[second.triangle] ?? -1));
    const groups = new Map();
    for (const contact of contacts) {
      const key = contact.plane ? contact : contact.mesh;
      const points = groups.get(key) ?? [];
      if (points.length < 4) points.push(contact);
      else {
        let deepest = -1;
        let depth = contact.distance;
        points.forEach((point, index) => {
          if (point.distance < depth) { deepest = index; depth = point.distance; }
        });
        const areas = points.map((point, index) => {
          if (index === deepest) return 0;
          const remaining = points.filter((entry, other) => other !== index);
          return contact.rel.clone().sub(remaining[0].rel)
            .cross(remaining[2].rel.clone().sub(remaining[1].rel)).lengthSq();
        });
        points[areas.indexOf(Math.max(...areas))] = contact;
      }
      groups.set(key, points);
    }
    return [...groups.values()].flat();
  }
  // Resolve the deepest constraint first; edge contacts must not deflect the
  // sphere before the underlying face at a triangulated ramp seam.
  return contacts.sort((a, b) => a.distance - b.distance);
}

/**
 * Signed distance to the arena (planes + meshes). Positive = playable side,
 * negative = penetrating / outside. `outNormal` receives the contact normal
 * pointing into the playable space.
 * @param {number} x @param {number} y @param {number} z
 * @param {THREE.Vector3} [outNormal]
 */
export function boxTriangleGapContacts(center, axes, halfSize, margin, threshold = 2, includeMarginPenetration = false) {
  const contacts = [];
  const radius = Math.hypot(...halfSize) + margin + threshold;
  const stack = [BVH_ROOT];
  while (stack.length) {
    const node = BVH[stack.pop()];
    if (pointAabbDistSq(center.x, center.y, center.z, node.min, node.max) > radius * radius) continue;
    if (node.tri < 0) {
      stack.push(node.right, node.left);
      continue;
    }
    const vertices = [0, 3, 6].map(offset => new THREE.Vector3().fromArray(TRI, node.tri * 9 + offset).sub(center));
    const face = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    if (Math.abs(face.z) >= (includeMarginPenetration ? 0.9999 : 0.5)) continue;
    const support = direction => {
      const box = new THREE.Vector3();
      axes.forEach((axis, index) => box.addScaledVector(axis, (axis.dot(direction) >= 0 ? 1 : -1) * halfSize[index]));
      let triangle = vertices[0];
      for (const vertex of vertices) if (vertex.dot(direction) < triangle.dot(direction)) triangle = vertex;
      return { box, triangle, difference: box.clone().sub(triangle) };
    };
    let simplex = [];
    let closest = new THREE.Vector3(0, 1, 0);
    let weights;
    for (let iteration = 0; iteration < 64; iteration++) {
      const vertex = support(closest.clone().negate());
      if (simplex.some(entry => entry.difference.distanceToSquared(vertex.difference) < 1e-12)) break;
      const previousDistance = closest.lengthSq();
      if (simplex.length && previousDistance - closest.dot(vertex.difference) <= previousDistance * 1e-6) break;
      simplex.push(vertex);
      let best;
      for (let mask = 1; mask < 1 << simplex.length; mask++) {
        const indices = simplex.map((_, index) => index).filter(index => mask & (1 << index));
        const base = simplex[indices[0]].difference;
        const edges = indices.slice(1).map(index => simplex[index].difference.clone().sub(base));
        const matrix = edges.map(edge => [...edges.map(other => edge.dot(other)), -edge.dot(base)]);
        let valid = true;
        for (let column = 0; column < edges.length; column++) {
          let pivot = column;
          for (let row = column + 1; row < edges.length; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
          [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
          const divisor = matrix[column][column];
          if (Math.abs(divisor) < 1e-12) { valid = false; break; }
          for (let entry = column; entry <= edges.length; entry++) matrix[column][entry] /= divisor;
          for (let row = 0; row < edges.length; row++) {
            if (row === column) continue;
            const factor = matrix[row][column];
            for (let entry = column; entry <= edges.length; entry++) matrix[row][entry] -= factor * matrix[column][entry];
          }
        }
        if (!valid) continue;
        const amounts = matrix.map(row => row[edges.length]);
        amounts.unshift(1 - amounts.reduce((sum, amount) => sum + amount, 0));
        if (amounts.some(amount => amount < -1e-8)) continue;
        const point = new THREE.Vector3();
        indices.forEach((index, entry) => point.addScaledVector(simplex[index].difference, amounts[entry]));
        if (!best || point.lengthSq() < best.point.lengthSq()) best = { indices, amounts, point };
      }
      if (!best) break;
      simplex = best.indices.map(index => simplex[index]);
      weights = best.amounts;
      closest = best.point;
      if (closest.lengthSq() < 1e-10) break;
    }
    const distance = closest.length() - margin;
    if (!weights || distance <= (includeMarginPenetration ? -margin + 1e-5 : 0) || distance >= threshold) continue;
    const normal = closest.clone().normalize();
    const rawNormal = normal.clone();
    adjustInternalEdgeNormal(node.tri, center.clone().add(simplex.reduce((point, vertex, index) => point.addScaledVector(vertex.triangle, weights[index]), new THREE.Vector3())), normal);
    const point = simplex.reduce((point, vertex, index) => point.addScaledVector(vertex.box, weights[index]), center.clone()).addScaledVector(rawNormal, -margin);
    if (contacts.some(contact => contact.point.distanceToSquared(point) < 1 && contact.normal.dot(normal) > 0.9999)) continue;
    contacts.push({ point, normal, rawNormal, distance, triangle: node.tri });
  }
  return contacts;
}

export function arenaDistance(x, y, z, outNormal, referencePoint) {
  // Union of solids: playable SDF = min(signed distances). Using min-|d|
  // wrongly preferred a small inside-ramp distance with an inverted normal
  // over the floor/wall, so jump-into-wall sucked the car into the curve.
  let bestSigned = Infinity;
  const bestN = outNormal ?? new THREE.Vector3();

  for (const plane of PLANES) {
    const signed =
      (x - plane.point.x) * plane.normal.x +
      (y - plane.point.y) * plane.normal.y +
      (z - plane.point.z) * plane.normal.z;
    if (signed < bestSigned) {
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
        _meshP.copy(_cp);
        _meshN.copy(_cn);
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

  if (meshBest < Infinity) {
    if (referencePoint && (referencePoint.x - _meshP.x) * _meshN.x + (referencePoint.y - _meshP.y) * _meshN.y + (referencePoint.z - _meshP.z) * _meshN.z < 0) _meshN.negate();
    const side =
      (x - _meshP.x) * _meshN.x +
      (y - _meshP.y) * _meshN.y +
      (z - _meshP.z) * _meshN.z;
    const projectsOnFace = meshBest - side * side <= EPS;
    const signed = (side < -EPS && projectsOnFace ? -1 : 1) * Math.sqrt(meshBest);
    if (signed < bestSigned) {
      bestSigned = signed;
      bestN.copy(_meshN);
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
