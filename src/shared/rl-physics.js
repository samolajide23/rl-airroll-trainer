import * as THREE from "three";
import { arenaDistance, arenaNormal } from "./arenaMesh.js";
import { getHitboxPreset, HITBOX_PRESETS } from "./hitboxPresets.js";

/* =====================================================================
 *  Rocket League constants, hitbox / ball helpers and render mapping
 *  (units: uu = cm, seconds, radians). The car tick lives in `carSim.js`.
 *  Frame: X forward, Y right, Z up (RocketSim / Unreal). `axes()` returns
 *  `{ f, l, u }` where `l` is the local +Y basis vector — i.e. car right.
 *  Runs at a FIXED 120 Hz like the real game.
 *
 *  Every constant is tagged:
 *    [V] verified against RocketSim RLConst / published sources
 *    [A] approximation / from memory -> must be validated before trusting
 * ===================================================================== */

/** RocketSim: CAR_TORQUE_SCALE * CAR_AIR_CONTROL_{TORQUE,DAMPING} */
const RS_TORQUE_SCALE = 0.09587380290031433;

export const RL = {
  DT: 1 / 120, // [V] physics tick
  GRAVITY: 650, // [V]
  // --- car ---
  MAX_SPEED: 2300, // [V]
  MAX_DRIVE_SPEED: 1410, // [V] no boost (DRIVE_SPEED_TORQUE curve hits 0)
  MAX_ANG_VEL: 5.5, // [V]
  BOOST_ACCEL_AIR: 1058.3333740234375, // [V] RocketSim
  BOOST_ACCEL_GROUND: 991.6666870117188, // [V] RocketSim
  BOOST_USE: 33.33333206176758, // [V] per second
  BOOST_MAX: 100, // [V]
  AIR_THROTTLE: 66.66666412353516, // [V] RocketSim THROTTLE_AIR_ACCEL
  JUMP_IMPULSE: 291.6666564941406, // [V] RocketSim JUMP_IMMEDIATE_FORCE
  JUMP_HOLD_ACCEL: 1458.3333740234375, // [V] RocketSim JUMP_ACCEL
  JUMP_HOLD_MAX: 0.2, // [V]
  FLIP_WINDOW: 1.25, // [V] RocketSim DOUBLEJUMP_MAX_DELAY (after first jump ends)
  DODGE_DEADZONE: 0.5, // [V] Octane default
  FLIP_TORQUE_TIME: 0.65, // [V]
  FLIP_TORQUE_MIN_TIME: 0.41, // [V]
  FLIP_PITCHLOCK_TIME: 1.0, // [V] RLConst (Car.cpp uses TORQUE+EXTRA below)
  FLIP_PITCHLOCK_EXTRA: 0.3, // [V] after FLIP_TORQUE_TIME
  FLIP_Z_DAMP_120: 0.35, // [V]
  FLIP_Z_DAMP_START: 0.15, // [V]
  FLIP_Z_DAMP_END: 0.21, // [V]
  FLIP_INITIAL_VEL: 500, // [V]
  FLIP_TORQUE_X: 260, // [V] local about forward (side dodge)
  FLIP_TORQUE_Y: 224, // [V] local about right (forward/back dodge)
  FLIP_FWD_SPEED_SCALE: 1, // [V]
  FLIP_SIDE_SPEED_SCALE: 1.9, // [V]
  FLIP_BACK_SPEED_SCALE: 2.5, // [V]
  FLIP_BACK_IMPULSE_X: 16 / 15, // [V]
  BOOST_MIN_TIME: 0.1, // [V]
  SUPERSONIC_START: 2200, // [V]
  SUPERSONIC_KEEP: 2100, // [V]
  SUPERSONIC_KEEP_TIME: 1, // [V]
  POWERSLIDE_RISE: 5, // [V] per second
  POWERSLIDE_FALL: 2, // [V] per second
  REST_HEIGHT: HITBOX_PRESETS.octane.restZ, // [V] default Octane root height
  // Air-control (RocketSim): magnitudes are TORQUE/DAMPING * CAR_TORQUE_SCALE.
  // World-frame signs at identity (f=+X, right=+Y, u=+Z):
  //   +roll → −ω·f,  +pitch → −ω·right,  +yaw → +ω·up
  T_ROLL: 400 * RS_TORQUE_SCALE, // [V]
  T_PITCH: 130 * RS_TORQUE_SCALE, // [V]
  T_YAW: 95 * RS_TORQUE_SCALE, // [V]
  D_ROLL: -50 * RS_TORQUE_SCALE, // [V] always on
  D_PITCH: -30 * RS_TORQUE_SCALE, // [V] scaled by (1-|input|)
  D_YAW: -20 * RS_TORQUE_SCALE, // [V] scaled by (1-|input|)
  // Default Octane hitbox (OBB) — prefer `car.hitbox` from hitboxPresets.js
  HITBOX_SIZE: HITBOX_PRESETS.octane.size, // [V] RocketSim
  HITBOX_OFFSET: HITBOX_PRESETS.octane.offset, // [V] RocketSim
  // --- ball ---
  BALL_RADIUS: 91.25, // [V]
  BALL_MASS: 30, // [V] CAR_MASS / 6
  CAR_MASS: 180, // [V]
  BALL_MAX_SPEED: 6000, // [V]
  BALL_MAX_SPIN: 6, // [V]
  BALL_RESTITUTION: 0.6, // [V] ball↔world
  BALL_FRICTION: 0.35, // [V] ball↔world
  BALL_DRAG: 0.03, // [V] RocketSim BALL_DRAG
  BALL_REST_Z: 93.15, // [V]
  // Car↔ball (RocketSim CARBALL_COLLISION_*)
  CARBALL_FRICTION: 2.0, // [V]
  CARBALL_RESTITUTION: 0.0, // [V]
  // Psyonix extra ball impulse (RocketSim BALL_CAR_EXTRA_IMPULSE_*)
  EXTRA_IMPULSE_Z: 0.35, // [V] Z scale of hitDir before normalize
  // Fraction of forward component *kept* after adjustment (RocketSim FORWARD_SCALE).
  // Implementation removes `(1 - FWD) * forward` from hitDir — see collideCarBall.
  EXTRA_IMPULSE_FWD: 0.65, // [V]
  EXTRA_IMPULSE_MAX_DV: 4600, // [V] clamp |Δv| before curve
  // RocketSim: next extra impulse when tickCount > last + 1
  EXTRA_COOLDOWN_TICKS: 1, // [V]
  /** MutatorConfig.ball_hit_extra_force_scale (default 1) */
  EXTRA_FORCE_SCALE: 1, // [V]
  BOOST_SPAWN: 33.33333206176758, // [V] RocketSim BOOST_SPAWN_AMOUNT (float32 100/3)
  CAR_SPAWN_REST_Z: 17, // [V] kickoff root Z
  CAR_RESPAWN_Z: 36, // [V] demo-respawn drop height
  // --- field ---
  HALF_W: 4096, // [V]
  HALF_L: 5120, // [V]
  CEILING: 2048, // [V]
  GOAL_HALF_W: 892.755, // [V] Arena.cpp APPROX_GOAL_HALF_WIDTH
  GOAL_HEIGHT: 642.775, // [V] Arena.cpp APPROX_GOAL_HEIGHT
  GOAL_SCORE_Y: 5124.25, // [V] SOCCAR_GOAL_SCORE_BASE_THRESHOLD_Y
  // Soft backstop behind goal mouth — soccar mesh |Y| max ≈ 6000, so depth 880.
  GOAL_DEPTH: 880, // [V] mesh AABB (HALF_L + depth ≈ 6000)
  ARENA_FRICTION: 0.3, // [V] CARWORLD_COLLISION_FRICTION
  ARENA_RESTITUTION: 0.3, // [V] CARWORLD_COLLISION_RESTITUTION
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
  const pts = [
    [0, 0.65],
    [500, 0.65],
    [2300, 0.55],
    [4600, 0.3],
  ];
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
 * @param {number} [scale=0.01]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 */
export function carHitboxYUp(rootPos, quaternion, scale = 0.01, preset) {
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
 * @param {number} [scale=0.01]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 */
export function rootFromWheelsYUp(wheelPos, quaternion, scale = 0.01, preset) {
  const hb = preset ?? getHitboxPreset("octane");
  const u = V(0, 1, 0).applyQuaternion(quaternion);
  return wheelPos.clone().addScaledVector(u, hb.restZ * scale);
}

/**
 * @param {THREE.Vector3} wheelPos
 * @param {THREE.Quaternion} quaternion
 * @param {number} [scale=0.01]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 */
export function carHitboxYUpFromWheels(wheelPos, quaternion, scale = 0.01, preset) {
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
 * @param {number} [scale=0.01]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 * @returns {{ penetrated: boolean, wheelsDown: boolean }}
 */
export function resolveHitboxPlaneY(
  object,
  vel,
  omega,
  planeY,
  restitution = RL.ARENA_RESTITUTION,
  scale = 0.01,
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
 * @param {number} [scale=0.01]
 */
export function syncHitboxHelper(helper, car, scale = 0.01) {
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
 * @param {number} [scale=0.01]
 * @param {import("./hitboxPresets.js").HitboxPreset} [preset]
 */
export function syncHitboxHelperYUp(helper, object, scale = 0.01, preset) {
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

export function stepBall(ball, dt = RL.DT) {
  const R = RL.BALL_RADIUS;
  ball.vel.z -= RL.GRAVITY * dt;
  ball.vel.addScaledVector(ball.vel, -RL.BALL_DRAG * dt);
  if (ball.vel.length() > RL.BALL_MAX_SPEED) ball.vel.setLength(RL.BALL_MAX_SPEED);
  ball.pos.addScaledVector(ball.vel, dt);
  const e = RL.BALL_RESTITUTION;
  // Arena planes + soccar meshes. Coulomb friction with spin coupling
  // (Bullet sphere vs static: denom_t = 1/m + R²/I).
  const n = V();
  const clearance = arenaDistance(ball.pos.x, ball.pos.y, ball.pos.z, n);
  const pen = R - clearance;
  if (pen > 0) {
    ball.pos.addScaledVector(n, pen);
    const vn = ball.vel.dot(n);
    if (vn < 0) {
      // Normal restitution (sphere: no angular contribution on n).
      const dvn = -(1 + e) * vn;
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
      if (Math.abs(ball.vel.dot(n)) < 25 && n.z > 0.9) {
        ball.vel.z = 0;
      }
    }
  }
  // Soft goal backstops (meshes cover the mouth; keep a deep back plane).
  const back = RL.HALF_L + RL.GOAL_DEPTH;
  if (Math.abs(ball.pos.y) > back - R) {
    const sign = Math.sign(ball.pos.y);
    ball.pos.y = sign * (back - R);
    if (ball.vel.y * sign > 0) ball.vel.y *= -e;
  }
  if (ball.omega.length() > RL.BALL_MAX_SPIN) ball.omega.setLength(RL.BALL_MAX_SPIN);
}

/* --------------------------- car <-> ball hit --------------------------- */

/** Returns contact info or null. Applies engine-style inelastic impulse + Psyonix extra impulse. */
export function collideCarBall(car, ball, tick) {
  const { f, l, u, center, half } = carHitbox(car);
  const [sx, sy, sz] = half;
  const rel = ball.pos.clone().sub(center);
  const loc = V(rel.dot(f), rel.dot(l), rel.dot(u));
  const near = V(clamp(loc.x, -sx, sx), clamp(loc.y, -sy, sy), clamp(loc.z, -sz, sz));
  const diff = loc.clone().sub(near);
  const dist = diff.length();
  if (dist > RL.BALL_RADIUS) return null;

  const nearW = center.clone().addScaledVector(f, near.x).addScaledVector(l, near.y).addScaledVector(u, near.z);
  const n = dist > 1e-6 ? ball.pos.clone().sub(nearW).normalize() : rel.clone().normalize();
  ball.pos.addScaledVector(n, RL.BALL_RADIUS - dist); // resolve penetration

  const dv0 = ball.vel.clone().sub(car.vel); // pre-impulse relative velocity
  const carPoint = nearW.clone().sub(car.pos);
  const carPointVel = car.vel.clone().add(car.omega.clone().cross(carPoint));
  // Ball contact point relative to ball centre ≈ −R n
  const ballR = n.clone().multiplyScalar(-RL.BALL_RADIUS);
  const ballPointVel = ball.vel.clone().add(ball.omega.clone().cross(ballR));
  const vn = ballPointVel.clone().sub(carPointVel).dot(n);
  if (vn < 0) {
    // RocketSim CARBALL_RESTITUTION = 0 → kill relative normal speed.
    // Friction uses Bullet-style Coulomb with ball spin (sphere inertia 2/5 mr²).
    // Car angular response on the manifold is omitted (RocketSim's Psyonix
    // extra impulse is also ball-only; car hitbox inertia coupling here is
    // a much smaller residual than the ball spin term).
    const invSum = 1 / RL.BALL_MASS + 1 / RL.CAR_MASS;
    const J = (-(1 + RL.CARBALL_RESTITUTION) * vn) / invSum;
    ball.vel.addScaledVector(n, J / RL.BALL_MASS);
    car.vel.addScaledVector(n, -J / RL.CAR_MASS);
    const ballPointAfter = ball.vel.clone().add(ball.omega.clone().cross(ballR));
    const relAfter = ballPointAfter.sub(carPointVel);
    const vt = relAfter.addScaledVector(n, -relAfter.dot(n));
    const vtLen = vt.length();
    if (vtLen > 1e-6) {
      const invMBall = 1 / RL.BALL_MASS;
      const invIBall = ballInvInertia();
      const R = RL.BALL_RADIUS;
      const denomT = invMBall + 1 / RL.CAR_MASS + R * R * invIBall;
      const maxJf = RL.CARBALL_FRICTION * Math.abs(J);
      const jfMag = Math.min(vtLen / denomT, maxJf);
      const jf = vt.multiplyScalar(-jfMag / vtLen);
      ball.vel.addScaledVector(jf, invMBall);
      car.vel.addScaledVector(jf, -1 / RL.CAR_MASS);
      ball.omega.add(ballR.clone().cross(jf).multiplyScalar(invIBall));
    }
  }
  // Psyonix extra impulse on the ball only (RocketSim Ball::_OnHit).
  // Once applied, wait until tickCount > last + 1 before applying again.
  if (tick - ball.lastExtraTick > RL.EXTRA_COOLDOWN_TICKS) {
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
      ball.vel.addScaledVector(hitDir, impulse);
      ball.lastExtraTick = tick;
    }
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
 * @param {number} [scale=0.01]
 */
export function applyToCarModel(car, group, scale = 0.01) {
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
 * Scale + offset a visual car so its length matches the hitbox and its bbox
 * centre sits on the hitbox centre (RocketSim root→offset placement).
 *
 * When used with {@link applyToCarModel}, parent +X = physics left and the
 * painted `visual` child is X-mirrored there. Y-up aerial drills call this
 * without applyToCarModel and keep an unmirrored mesh (+X = right).
 * Physics offset is (fwd, right, up).
 *
 * @param {THREE.Object3D} carMesh `makeCar()` group
 * @param {import("./hitboxPresets.js").HitboxPreset} preset
 * @param {number} [uu=0.01]
 */
export function alignCarVisualToHitbox(carMesh, preset, uu = 0.01) {
  const refLen = carMesh.userData.refLength ?? 3.2;
  const visualScale = (preset.size[0] * uu) / Math.max(refLen, 1e-6);
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
  visual.position.set(-oy * k, oz * k, ox * k);
  return visualScale;
}
