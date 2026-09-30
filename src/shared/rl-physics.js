import * as THREE from "three";
import { arenaDistance, arenaNormal, sphereArenaContacts } from "./arenaMesh.js";
import { getHitboxPreset, HITBOX_PRESETS } from "./hitboxPresets.js";
import { CAR_TORQUE_SCALE, RL_CONST as C, RL_CURVES } from "./rlConst.js";
import { UU } from "./rl-units.js";

/* =====================================================================
 *  Rocket League constants, hitbox / ball helpers and render mapping
 *  (units: uu = cm, seconds, radians). The car tick lives in `carSim.js`.
 *  Frame: X forward, Y right, Z up (RocketSim / Unreal). `axes()` returns
 *  `{ f, l, u }` where `l` is the local +Y basis vector — i.e. car right.
 *  Runs at a FIXED 120 Hz like the real game.
 *
 *  Scalars come from `rlConst.js` (RocketSim RLConst as float32).
 * ===================================================================== */

const T = C.CAR_AIR_CONTROL_TORQUE;
const D = C.CAR_AIR_CONTROL_DAMPING;

export const RL = {
  DT: 1 / 120, // [V] physics tick (120 Hz schedule; keep exact 1/120)
  GRAVITY: C.GRAVITY_Z, // [V]
  // --- car ---
  MAX_SPEED: C.CAR_MAX_SPEED, // [V]
  MAX_DRIVE_SPEED: 1410, // [V] no boost (DRIVE_SPEED_TORQUE curve hits 0)
  MAX_ANG_VEL: C.CAR_MAX_ANG_SPEED, // [V]
  BOOST_ACCEL_AIR: C.BOOST_ACCEL_AIR, // [V]
  BOOST_ACCEL_GROUND: C.BOOST_ACCEL_GROUND, // [V]
  BOOST_USE: C.BOOST_USED_PER_SECOND, // [V]
  BOOST_MAX: C.BOOST_MAX, // [V]
  AIR_THROTTLE: C.THROTTLE_AIR_ACCEL, // [V]
  JUMP_IMPULSE: C.JUMP_IMMEDIATE_FORCE, // [V]
  JUMP_HOLD_ACCEL: C.JUMP_ACCEL, // [V]
  JUMP_HOLD_MAX: C.JUMP_MAX_TIME, // [V]
  FLIP_WINDOW: C.DOUBLEJUMP_MAX_DELAY, // [V]
  DODGE_DEADZONE: 0.5, // [V] Octane default
  FLIP_TORQUE_TIME: C.FLIP_TORQUE_TIME, // [V]
  FLIP_TORQUE_MIN_TIME: C.FLIP_TORQUE_MIN_TIME, // [V]
  FLIP_PITCHLOCK_TIME: C.FLIP_PITCHLOCK_TIME, // [V]
  FLIP_PITCHLOCK_EXTRA: C.FLIP_PITCHLOCK_EXTRA_TIME, // [V]
  FLIP_Z_DAMP_120: C.FLIP_Z_DAMP_120, // [V]
  FLIP_Z_DAMP_START: C.FLIP_Z_DAMP_START, // [V]
  FLIP_Z_DAMP_END: C.FLIP_Z_DAMP_END, // [V]
  FLIP_INITIAL_VEL: C.FLIP_INITIAL_VEL_SCALE, // [V]
  FLIP_TORQUE_X: C.FLIP_TORQUE_X, // [V] local about forward (side dodge)
  FLIP_TORQUE_Y: C.FLIP_TORQUE_Y, // [V] local about right (forward/back dodge)
  FLIP_FWD_SPEED_SCALE: C.FLIP_FORWARD_IMPULSE_MAX_SPEED_SCALE, // [V]
  FLIP_SIDE_SPEED_SCALE: C.FLIP_SIDE_IMPULSE_MAX_SPEED_SCALE, // [V]
  FLIP_BACK_SPEED_SCALE: C.FLIP_BACKWARD_IMPULSE_MAX_SPEED_SCALE, // [V]
  FLIP_BACK_IMPULSE_X: C.FLIP_BACKWARD_IMPULSE_SCALE_X, // [V]
  BOOST_MIN_TIME: C.BOOST_MIN_TIME, // [V]
  SUPERSONIC_START: C.SUPERSONIC_START_SPEED, // [V]
  SUPERSONIC_KEEP: C.SUPERSONIC_MAINTAIN_MIN_SPEED, // [V]
  SUPERSONIC_KEEP_TIME: C.SUPERSONIC_MAINTAIN_MAX_TIME, // [V]
  POWERSLIDE_RISE: C.POWERSLIDE_RISE_RATE, // [V]
  POWERSLIDE_FALL: C.POWERSLIDE_FALL_RATE, // [V]
  REST_HEIGHT: HITBOX_PRESETS.octane.restZ, // [V] default Octane root height
  // Air-control (RocketSim): magnitudes are TORQUE/DAMPING * CAR_TORQUE_SCALE.
  // World-frame signs at identity (f=+X, right=+Y, u=+Z):
  //   +roll → −ω·f,  +pitch → −ω·right,  +yaw → +ω·up
  T_ROLL: T.roll * CAR_TORQUE_SCALE, // [V]
  T_PITCH: T.pitch * CAR_TORQUE_SCALE, // [V]
  T_YAW: T.yaw * CAR_TORQUE_SCALE, // [V]
  D_ROLL: -D.roll * CAR_TORQUE_SCALE, // [V] always on
  D_PITCH: -D.pitch * CAR_TORQUE_SCALE, // [V] scaled by (1-|input|)
  D_YAW: -D.yaw * CAR_TORQUE_SCALE, // [V] scaled by (1-|input|)
  // Default Octane hitbox (OBB) — prefer `car.hitbox` from hitboxPresets.js
  HITBOX_SIZE: HITBOX_PRESETS.octane.size, // [V] RocketSim
  HITBOX_OFFSET: HITBOX_PRESETS.octane.offset, // [V] RocketSim
  // --- ball ---
  BALL_RADIUS: C.BALL_COLLISION_RADIUS_SOCCAR, // [V]
  BALL_MASS: C.BALL_MASS, // [V]
  CAR_MASS: C.CAR_MASS, // [V]
  BALL_MAX_SPEED: C.BALL_MAX_SPEED, // [V]
  BALL_MAX_SPIN: C.BALL_MAX_ANG_SPEED, // [V]
  BALL_RESTITUTION: C.BALL_RESTITUTION, // [V]
  BALL_FRICTION: C.BALL_FRICTION, // [V]
  BALL_DRAG: C.BALL_DRAG, // [V]
  BALL_REST_Z: C.BALL_REST_Z, // [V]
  // Car↔ball (RocketSim CARBALL_COLLISION_*)
  CARBALL_FRICTION: C.CARBALL_COLLISION_FRICTION, // [V]
  CARBALL_RESTITUTION: C.CARBALL_COLLISION_RESTITUTION, // [V]
  // Psyonix extra ball impulse (RocketSim BALL_CAR_EXTRA_IMPULSE_*)
  EXTRA_IMPULSE_Z: C.BALL_CAR_EXTRA_IMPULSE_Z_SCALE, // [V]
  // Fraction of forward component *kept* after adjustment (RocketSim FORWARD_SCALE).
  // Implementation removes `(1 - FWD) * forward` from hitDir — see collideCarBall.
  EXTRA_IMPULSE_FWD: C.BALL_CAR_EXTRA_IMPULSE_FORWARD_SCALE, // [V]
  EXTRA_IMPULSE_MAX_DV: C.BALL_CAR_EXTRA_IMPULSE_MAXDELTAVEL_UU, // [V]
  // RocketSim: next extra impulse when tickCount > last + 1
  EXTRA_COOLDOWN_TICKS: 1, // [V]
  /** MutatorConfig.ball_hit_extra_force_scale (default 1) */
  EXTRA_FORCE_SCALE: 1, // [V]
  BOOST_SPAWN: C.BOOST_SPAWN_AMOUNT, // [V]
  CAR_SPAWN_REST_Z: C.CAR_SPAWN_REST_Z, // [V]
  CAR_RESPAWN_Z: C.CAR_RESPAWN_Z, // [V]
  // --- field ---
  HALF_W: C.ARENA_EXTENT_X, // [V]
  HALF_L: C.ARENA_EXTENT_Y, // [V]
  CEILING: C.ARENA_HEIGHT, // [V]
  GOAL_HALF_W: 892.755, // [V] Arena.cpp APPROX_GOAL_HALF_WIDTH
  GOAL_HEIGHT: 642.775, // [V] Arena.cpp APPROX_GOAL_HEIGHT
  GOAL_SCORE_Y: C.SOCCAR_GOAL_SCORE_BASE_THRESHOLD_Y, // [V]
  // Soft backstop behind goal mouth — soccar mesh |Y| max ≈ 6000, so depth 880.
  GOAL_DEPTH: 880, // [V] mesh AABB (HALF_L + depth ≈ 6000)
  ARENA_FRICTION: C.CARWORLD_COLLISION_FRICTION, // [V]
  ARENA_RESTITUTION: C.CARWORLD_COLLISION_RESTITUTION, // [V]
  // Car↔car (RocketSim CARCAR_COLLISION_* / CAR_COLLISION_*)
  CARCAR_FRICTION: C.CARCAR_COLLISION_FRICTION, // [V]
  CARCAR_RESTITUTION: C.CARCAR_COLLISION_RESTITUTION, // [V]
  CAR_COLLISION_FRICTION: C.CAR_COLLISION_FRICTION, // [V]
  CAR_COLLISION_RESTITUTION: C.CAR_COLLISION_RESTITUTION, // [V]
  // Bump / demo (RocketSim RLConst + MutatorConfig defaults)
  BUMP_COOLDOWN_TIME: C.BUMP_COOLDOWN_TIME, // [V]
  BUMP_MIN_FORWARD_DIST: C.BUMP_MIN_FORWARD_DIST, // [V]
  DEMO_RESPAWN_TIME: C.DEMO_RESPAWN_TIME, // [V]
  BUMP_FORCE_SCALE: 1.0, // [V] MutatorConfig.bump_force_scale
  /**
   * Blue-team soccar kickoff slots (RocketSim CAR_SPAWN_LOCATIONS_SOCCAR).
   * Flip X/Y and add π to yaw for orange.
   */
  SOCCAR_SPAWNS: [
    { x: -2048, y: -2560, yaw: Math.PI / 4 },
    { x: 2048, y: -2560, yaw: (3 * Math.PI) / 4 },
    { x: -256, y: -3840, yaw: Math.PI / 2 },
    { x: 256, y: -3840, yaw: Math.PI / 2 },
    { x: 0, y: -4608, yaw: Math.PI / 2 },
  ],
  /** Blue-team demo respawn slots (RocketSim CAR_RESPAWN_LOCATIONS_SOCCAR). */
  SOCCAR_RESPAWNS: [
    { x: -2304, y: -4608, yaw: Math.PI / 2 },
    { x: -2688, y: -4608, yaw: Math.PI / 2 },
    { x: 2304, y: -4608, yaw: Math.PI / 2 },
    { x: 2688, y: -4608, yaw: Math.PI / 2 },
  ],
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * RocketSim `BALL_CAR_EXTRA_IMPULSE_FACTOR_CURVE` (piecewise-linear).
 * @param {number} dv relative speed (uu/s), already clamped to EXTRA_IMPULSE_MAX_DV
 */
export function extraImpulseScale(dv) {
  const pts = RL_CURVES.ballCarExtraImpulse;
  if (dv <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (dv <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (dv - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/** Local basis. `l` is local +Y = car **right** (RocketSim), not left. */
export function axes(q) {
  return { f: V(1, 0, 0).applyQuaternion(q), l: V(0, 1, 0).applyQuaternion(q), u: V(0, 0, 1).applyQuaternion(q) };
}

/* --------------------------- state factories --------------------------- */

export function makeBall(pos = V(0, 1500, 500)) {
  return { pos: pos.clone(), vel: V(), omega: V(), lastExtraTick: -99 };
}

/* --------------------- Octane OBB ↔ arena solids --------------------- */

/**
 * World-space car hitbox (OBB) for a physics car (Z-up).
 * Uses `car.hitbox` (RocketSim preset) when present.
 * @param {import("./carSim.js").SimCar} car
 */
export function carHitbox(car) {
  const { f, l, u } = axes(car.q);
  const hb = car.hitbox ?? getHitboxPreset("octane");
  const [ox, oy, oz] = hb.offset;
  /** @type {[number, number, number]} */
  const half = [hb.size[0] * 0.5, hb.size[1] * 0.5, hb.size[2] * 0.5];
  const center = car.pos
    .clone()
    .addScaledVector(f, ox)
    .addScaledVector(l, oy)
    .addScaledVector(u, oz);
  return { f, l, u, center, half, preset: hb };
}

/**
 * Half-extent of an OBB projected onto a unit world axis.
 * @param {{ f: THREE.Vector3, l: THREE.Vector3, u: THREE.Vector3, half: [number, number, number] }} hb
 * @param {THREE.Vector3} axis
 */
export function hitboxExtentOnAxis(hb, axis) {
  return (
    hb.half[0] * Math.abs(hb.f.dot(axis)) +
    hb.half[1] * Math.abs(hb.l.dot(axis)) +
    hb.half[2] * Math.abs(hb.u.dot(axis))
  );
}

/**
 * Car OBB for a Three.js car (Y-up, local +Z forward, +X right).
 * `rootPos` is the RL root joint in metres (same units as `scale` uu→m).
 * @param {THREE.Vector3} rootPos
 * @param {THREE.Quaternion} quaternion
 * @param {number} [scale=UU]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 */
export function carHitboxYUp(rootPos, quaternion, scale = UU, preset) {
  const hb = preset ?? getHitboxPreset("octane");
  const f = V(0, 0, 1).applyQuaternion(quaternion);
  const r = V(1, 0, 0).applyQuaternion(quaternion);
  const u = V(0, 1, 0).applyQuaternion(quaternion);
  const [ox, oy, oz] = hb.offset;
  /** @type {[number, number, number]} */
  const half = [
    hb.size[0] * 0.5 * scale,
    hb.size[1] * 0.5 * scale,
    hb.size[2] * 0.5 * scale,
  ];
  const center = rootPos
    .clone()
    .addScaledVector(f, ox * scale)
    .addScaledVector(r, oy * scale)
    .addScaledVector(u, oz * scale);
  return { f, l: r, u, center, half, preset: hb };
}

/**
 * Procedural/GLB cars sit on the wheels; the RL root joint is restZ along car-up.
 * @param {THREE.Vector3} wheelPos
 * @param {THREE.Quaternion} quaternion
 * @param {number} [scale=UU]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 */
export function rootFromWheelsYUp(wheelPos, quaternion, scale = UU, preset) {
  const hb = preset ?? getHitboxPreset("octane");
  const u = V(0, 1, 0).applyQuaternion(quaternion);
  return wheelPos.clone().addScaledVector(u, hb.restZ * scale);
}

/**
 * @param {THREE.Vector3} wheelPos
 * @param {THREE.Quaternion} quaternion
 * @param {number} [scale=UU]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 */
export function carHitboxYUpFromWheels(wheelPos, quaternion, scale = UU, preset) {
  return carHitboxYUp(
    rootFromWheelsYUp(wheelPos, quaternion, scale, preset),
    quaternion,
    scale,
    preset,
  );
}

/**
 * Push a Y-up car out of an infinite horizontal plane using the car OBB.
 * `object.userData.physicsOrigin === "root"` → position is the RL root joint;
 * otherwise position is treated as the wheel contact point.
 * @param {THREE.Object3D} object
 * @param {THREE.Vector3} vel
 * @param {THREE.Vector3} [omega]
 * @param {number} planeY
 * @param {number} [restitution=0.35]
 * @param {number} [scale=UU]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 * @returns {{ penetrated: boolean, wheelsDown: boolean }}
 */
export function resolveHitboxPlaneY(
  object,
  vel,
  omega,
  planeY,
  restitution = RL.ARENA_RESTITUTION,
  scale = UU,
  preset,
) {
  const hit =
    preset ??
    object.userData?.hitboxPreset ??
    getHitboxPreset("octane");
  const isRoot = object.userData?.physicsOrigin === "root";
  const hb = isRoot
    ? carHitboxYUp(object.position, object.quaternion, scale, hit)
    : carHitboxYUpFromWheels(object.position, object.quaternion, scale, hit);
  const up = V(0, 1, 0);
  const wheelsDown = hb.u.y > 0.55;
  const minHitY = hb.center.y - hitboxExtentOnAxis(hb, up);
  const wheelY = isRoot
    ? object.position.y - hit.restZ * scale
    : object.position.y;
  const contactY = wheelsDown ? Math.min(minHitY, wheelY) : minHitY;
  if (contactY >= planeY) {
    return { penetrated: false, wheelsDown };
  }
  const pen = planeY - contactY;
  object.position.y += pen;
  const vn = vel.dot(up);
  if (vn < 0) {
    vel.addScaledVector(up, -(1 + restitution) * vn);
  }
  if (omega) omega.multiplyScalar(0.85);
  return { penetrated: true, wheelsDown };
}

/**
 * Wireframe helper for the car hitbox (Three Y-up). Update each frame with
 * {@link syncHitboxHelper}.
 * @returns {THREE.LineSegments}
 */
export function createHitboxHelper() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(geo);
  const mat = new THREE.LineBasicMaterial({
    color: 0x7CFFB2,
    transparent: true,
    opacity: 0.85,
  });
  const lines = new THREE.LineSegments(edges, mat);
  lines.name = "car-hitbox";
  geo.dispose();
  return lines;
}

/**
 * @param {THREE.Object3D} helper
 * @param {import("./carSim.js").SimCar} car
 * @param {number} [scale=UU]
 */
export function syncHitboxHelper(helper, car, scale = UU) {
  const hb = carHitbox(car);
  const front = physToThree(hb.f).normalize();
  const up = physToThree(hb.u).normalize();
  const left = up.clone().cross(front).normalize();
  helper.position.copy(physToThree(hb.center)).multiplyScalar(scale);
  helper.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(left, up, front),
  );
  // Model axes: X = width, Y = height, Z = length
  helper.scale.set(hb.half[1] * 2 * scale, hb.half[2] * 2 * scale, hb.half[0] * 2 * scale);
}

/**
 * Sync wireframe to a Three.js Y-up car whose `position` is the wheel origin.
 * @param {THREE.Object3D} helper
 * @param {THREE.Object3D} object
 * @param {number} [scale=UU]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 */
export function syncHitboxHelperYUp(helper, object, scale = UU, preset) {
  const hit =
    preset ??
    object.userData?.hitboxPreset ??
    getHitboxPreset("octane");
  const isRoot = object.userData?.physicsOrigin === "root";
  const hb = isRoot
    ? carHitboxYUp(object.position, object.quaternion, scale, hit)
    : carHitboxYUpFromWheels(object.position, object.quaternion, scale, hit);
  helper.position.copy(hb.center);
  helper.quaternion.copy(object.quaternion);
  helper.scale.set(hb.half[1] * 2, hb.half[2] * 2, hb.half[0] * 2);
}

/* ------------------------------ ball step ------------------------------ */

/** Bullet `btSphereShape::calculateLocalInertia` → (2/5) m r². */
function ballInvInertia(radius = RL.BALL_RADIUS) {
  return 1 / (0.4 * RL.BALL_MASS * radius * radius);
}

export function stepBall(ball, dt = RL.DT, { arena = true, deferTransform = false } = {}) {
  const R = RL.BALL_RADIUS;
  // RocketSim Arena::Step explicitly sleeps a ball with exactly zero linear
  // and angular velocity (including the kickoff ball). Contact impulses wake it.
  const sleeping = ball.vel.lengthSq() === 0 && ball.omega.lengthSq() === 0;
  if (sleeping && !deferTransform) return;
  // Bullet applies exponential damping before gravity, not Euler drag after it.
  if (!sleeping) ball.vel.multiplyScalar(Math.pow(1 - RL.BALL_DRAG, dt));
  const preGravity = ball.vel.clone();
  if (!sleeping) ball.vel.z -= RL.GRAVITY * dt;
  const e = RL.BALL_RESTITUTION;
  const push = V();
  // Contacts are generated at the pre-integration transform, as in Bullet.
  // This is still a sequential sphere solver, not Bullet's persistent manifold.
  for (const { normal: n, distance } of arena ? sphereArenaContacts(ball.pos, R) : []) {
    if (distance < 0) push.addScaledVector(n, Math.max(0, -distance * 0.8 - push.dot(n)));
    const vn = ball.vel.dot(n);
    if (vn < 0) {
      const incoming = preGravity.dot(n);
      const bounce = incoming < -10 ? -e * incoming : 0;
      const dvn = bounce - vn;
      ball.vel.addScaledVector(n, dvn);
      // Contact-point velocity including spin: v + ω × (−R n).
      const r = n.clone().multiplyScalar(-R);
      const vContact = ball.vel.clone().add(ball.omega.clone().cross(r));
      const vt = vContact.clone().addScaledVector(n, -vContact.dot(n));
      const vtLen = vt.length();
      if (vtLen > 1e-6) {
        const invM = 1 / RL.BALL_MASS;
        const invI = ballInvInertia(R);
        const denomT = invM + R * R * invI;
        // Coulomb: |Jf| ≤ μ |Jn| with Jn = m · dvn
        const maxJf = RL.BALL_FRICTION * RL.BALL_MASS * Math.abs(dvn);
        const jfMag = Math.min(vtLen / denomT, maxJf);
        const jf = vt.clone().multiplyScalar(-jfMag / vtLen);
        ball.vel.addScaledVector(jf, invM);
        // τ = r × Jf → Δω = (r × Jf) / I
        ball.omega.add(r.clone().cross(jf).multiplyScalar(invI));
      }
    }
  }
  const finish = () => {
    ball.pos.addScaledVector(ball.vel, dt).add(push);
    if (ball.extraVelocityCache) {
      ball.vel.add(ball.extraVelocityCache);
      ball.extraVelocityCache.set(0, 0, 0);
    }
    // RocketSim clamps after integrating, not before (important for hard hits).
    if (ball.vel.length() > RL.BALL_MAX_SPEED) ball.vel.setLength(RL.BALL_MAX_SPEED);
    if (ball.omega.length() > RL.BALL_MAX_SPIN) ball.omega.setLength(RL.BALL_MAX_SPIN);
  };
  if (deferTransform) return finish;
  finish();
}

/* --------------------------- car <-> ball hit --------------------------- */

/** Returns contact info or null. Applies engine-style inelastic impulse + Psyonix extra impulse. */
export function collideCarBall(car, ball, tick, { deferred = false } = {}) {
  const { f, l, u, center, half } = carHitbox(car);
  const [sx, sy, sz] = half;
  const rel = ball.pos.clone().sub(center);
  const loc = V(rel.dot(f), rel.dot(l), rel.dot(u));
  const near = V(clamp(loc.x, -sx, sx), clamp(loc.y, -sy, sy), clamp(loc.z, -sz, sz));
  const diff = loc.clone().sub(near);
  const dist = diff.length();
  if (dist > RL.BALL_RADIUS) return null;

  let penetration = RL.BALL_RADIUS - dist;
  const localNormal = diff.clone();
  if (dist > 1e-6) localNormal.multiplyScalar(1 / dist);
  else {
    // Sphere centre inside the box: choose the nearest exit face, including
    // its depth. Centre-to-centre normalization is zero at exact coincidence.
    const depths = [sx - Math.abs(loc.x), sy - Math.abs(loc.y), sz - Math.abs(loc.z)];
    const axis = depths.indexOf(Math.min(...depths));
    const sign = loc.getComponent(axis) < 0 ? -1 : 1;
    near.setComponent(axis, sign * half[axis]);
    localNormal.set(0, 0, 0).setComponent(axis, sign);
    penetration += depths[axis];
  }
  const nearW = center.clone().addScaledVector(f, near.x).addScaledVector(l, near.y).addScaledVector(u, near.z);
  const n = V().addScaledVector(f, localNormal.x).addScaledVector(l, localNormal.y).addScaledVector(u, localNormal.z);
  if (!deferred) ball.pos.addScaledVector(n, penetration);
  else {
    // Split positional correction between dynamic bodies by inverse mass.
    // Without this, lingering overlap produces spurious extra hits two ticks later.
    const correction = Math.max(0, penetration) * 0.8;
    car.pos.addScaledVector(n, -correction * RL.BALL_MASS / (RL.CAR_MASS + RL.BALL_MASS));
    ball.pos.addScaledVector(n, correction * RL.CAR_MASS / (RL.CAR_MASS + RL.BALL_MASS));
  }

  const dv0 = ball.vel.clone().sub(car.vel); // pre-impulse relative velocity
  const carPoint = nearW.clone().sub(car.pos);
  const carPointVel = car.vel.clone().add(car.omega.clone().cross(carPoint));
  // Ball contact point relative to ball centre ≈ −R n
  const ballR = n.clone().multiplyScalar(-RL.BALL_RADIUS);
  const ballPointVel = ball.vel.clone().add(ball.omega.clone().cross(ballR));
  const vn = ballPointVel.clone().sub(carPointVel).dot(n);
  if (vn < 0) {
    // RocketSim CARBALL_RESTITUTION = 0 → kill relative normal speed.
    // Friction uses Bullet-style Coulomb with ball spin (sphere inertia 2/5 mr²)
    // and car hitbox angular response about the contact (box inertia).
    const { f: cf, l: cl, u: cu } = axes(car.q);
    const hb = car.hitbox ?? getHitboxPreset("octane");
    const lx = hb.size[0];
    const ly = hb.size[1];
    const lz = hb.size[2];
    const invI =
      car.invInertiaLocal ??
      V(
        12 / (RL.CAR_MASS * (ly * ly + lz * lz)),
        12 / (RL.CAR_MASS * (lx * lx + lz * lz)),
        12 / (RL.CAR_MASS * (lx * lx + ly * ly)),
      );
    const invInertiaWorld = (v) =>
      V()
        .addScaledVector(cf, v.dot(cf) * invI.x)
        .addScaledVector(cl, v.dot(cl) * invI.y)
        .addScaledVector(cu, v.dot(cu) * invI.z);
    const impulseDenom = (dir) => {
      const c = carPoint.clone().cross(dir);
      return (
        1 / RL.BALL_MASS +
        1 / RL.CAR_MASS +
        ballR.clone().cross(dir).lengthSq() * ballInvInertia() +
        c.dot(invInertiaWorld(c))
      );
    };
    const J = (-(1 + RL.CARBALL_RESTITUTION) * vn) / impulseDenom(n);
    const jn = n.clone().multiplyScalar(J);
    ball.vel.addScaledVector(jn, 1 / RL.BALL_MASS);
    car.vel.addScaledVector(jn, -1 / RL.CAR_MASS);
    ball.omega.add(ballR.clone().cross(jn).multiplyScalar(ballInvInertia()));
    car.omega.sub(invInertiaWorld(carPoint.clone().cross(jn)));
    const ballPointAfter = ball.vel.clone().add(ball.omega.clone().cross(ballR));
    const carPointAfter = car.vel.clone().add(car.omega.clone().cross(carPoint));
    const relAfter = ballPointAfter.sub(carPointAfter);
    const vt = relAfter.addScaledVector(n, -relAfter.dot(n));
    const vtLen = vt.length();
    if (vtLen > 1e-6) {
      const maxJf = RL.CARBALL_FRICTION * Math.abs(J);
      const tDir = vt.clone().multiplyScalar(1 / vtLen);
      const jfMag = Math.min(vtLen / impulseDenom(tDir), maxJf);
      const jf = tDir.multiplyScalar(-jfMag);
      ball.vel.addScaledVector(jf, 1 / RL.BALL_MASS);
      car.vel.addScaledVector(jf, -1 / RL.CAR_MASS);
      ball.omega.add(ballR.clone().cross(jf).multiplyScalar(ballInvInertia()));
      car.omega.sub(invInertiaWorld(carPoint.clone().cross(jf)));
    }
  }
  // Psyonix extra impulse on the ball only (RocketSim Ball::_OnHit).
  // Once applied, wait until tickCount > last + 1 before applying again.
  const lastExtraTick = deferred ? (car.lastExtraBallTick ?? -99) : ball.lastExtraTick;
  if (tick - lastExtraTick > RL.EXTRA_COOLDOWN_TICKS) {
    const relPos = ball.pos.clone().sub(car.pos);
    // hitDir = normalize(relPos * (1,1,zScale))
    const hitDir = V(relPos.x, relPos.y, relPos.z * RL.EXTRA_IMPULSE_Z);
    if (hitDir.lengthSq() > 1e-12) hitDir.normalize();
    else hitDir.copy(n);
    // Remove (1 − FORWARD_SCALE) of the forward component, then re-normalize.
    const forwardKeep = RL.EXTRA_IMPULSE_FWD;
    hitDir.sub(f.clone().multiplyScalar(hitDir.dot(f) * (1 - forwardKeep)));
    if (hitDir.lengthSq() > 1e-12) hitDir.normalize();
    const relSpeed = Math.min(dv0.length(), RL.EXTRA_IMPULSE_MAX_DV);
    if (relSpeed > 0) {
      const impulse =
        relSpeed * extraImpulseScale(relSpeed) * RL.EXTRA_FORCE_SCALE;
      if (deferred) {
        ball.extraVelocityCache ??= V();
        ball.extraVelocityCache.addScaledVector(hitDir, impulse);
      } else ball.vel.addScaledVector(hitDir, impulse);
      ball.lastExtraTick = tick;
      if (deferred) car.lastExtraBallTick = tick;
    }
  }
  // Contact impulses occur after the standalone body steps in Free Play.
  // Finalize their limits here too; no completed tick may expose over-cap state.
  if (!deferred) {
    if (ball.vel.length() > RL.BALL_MAX_SPEED) ball.vel.setLength(RL.BALL_MAX_SPEED);
    if (ball.omega.length() > RL.BALL_MAX_SPIN) ball.omega.setLength(RL.BALL_MAX_SPIN);
    if (car.vel.length() > RL.MAX_SPEED) car.vel.setLength(RL.MAX_SPEED);
    if (car.omega.length() > RL.MAX_ANG_VEL) car.omega.setLength(RL.MAX_ANG_VEL);
  }
  return { normal: n, point: nearW, speed: dv0.length() };
}

/**
 * Physics Z-up → Three.js Y-up: `(x, y, z) → (x, z, y)`.
 *
 * This permutation is a reflection (handedness flip). That is intentional:
 * a pure rotation would put physics right on chase-cam screen-left.
 * {@link applyToCarModel} builds a valid RH basis with parent +X = physics
 * left (`P(u) × P(f)`), then X-mirrors the painted mesh so geometry right
 * sits on physics right.
 */
export function physToThree(v, out = V()) {
  return out.set(v.x, v.z, v.y);
}

/**
 * Map a Z-up physics car onto a Y-up Three.js car group.
 *
 * `physToThree` flips handedness, so a pure (right, up, front) basis is a
 * reflection. We build a valid RH basis with +X = physics left, then mirror
 * the painted mesh on X so geometry right sits on physics right — otherwise
 * air roll left/right looks inverted and feels like the car is thrown around.
 *
 * @param {import("./carSim.js").SimCar} car
 * @param {THREE.Object3D} group
 * @param {number} [scale=UU]
 */
export function applyToCarModel(car, group, scale = UU) {
  const { f, u } = axes(car.q);
  const front = physToThree(f).normalize();
  const up = physToThree(u).normalize();
  // up × front = physics left after the physToThree handedness flip.
  const left = up.clone().cross(front).normalize();
  group.position.copy(physToThree(car.pos)).multiplyScalar(scale);
  group.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(left, up, front),
  );
  const visual = group.userData?.visual;
  if (visual) {
    const sx = Math.abs(visual.scale.x) || 1;
    visual.scale.x = -sx;
  }
}

/**
 * Uniformly scale the measured body length and align its lowest geometry with
 * the nominal wheel plane. Body proportions are retained, not stretched to the
 * hitbox; this is visual calibration, not verified asset-to-game body parity.
 *
 * When used with {@link applyToCarModel}, parent +X = physics left and the
 * painted `visual` child is X-mirrored there. Y-up aerial drills call this
 * without applyToCarModel and keep an unmirrored mesh (+X = right).
 * Physics offset is (fwd, right, up).
 *
 * @param {THREE.Object3D} carMesh `makeCar()` group
 * @param {import("./hitboxPresets.js").HitboxPreset} preset
 * @param {number} [uu=UU]
 */
export function alignCarVisualToHitbox(carMesh, preset, uu = UU) {
  const refLen = carMesh.userData.refLength ?? 3.2;
  const calibration = carMesh.userData.visual?.userData.calibration;
  const visualScale = calibration ? calibration.metersPerUnit * uu / UU : (preset.size[0] * uu) / Math.max(refLen, 1e-6);
  carMesh.scale.setScalar(visualScale);

  const visual = carMesh.userData.visual;
  if (!visual) return visualScale;

  // Convert hitbox offset (uu) into pre-scale parent-local units.
  // Parent +X is treated as left (−right) for the offset sign so Free Play
  // (applyToCarModel) and mirrored visual stay aligned with the hitbox.
  // Aerial drills use a symmetric visual scale and the same formula; the
  // lateral offset is tiny relative to the body.
  const k = uu / visualScale;
  const [ox, oy, oz] = preset.offset;
  const bounds = carMesh.userData.visualBounds;
  if (bounds) {
    const center = bounds.getCenter(V());
    visual.position.set(-oy * k - center.x, -preset.restZ * k - bounds.min.y,
      calibration ? calibration.rearUU * k - calibration.rearCenter : ox * k - center.z);
  } else {
    visual.position.set(-oy * k, oz * k, ox * k);
  }
  return visualScale;
}
