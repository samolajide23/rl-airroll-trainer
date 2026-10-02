import * as THREE from "three";
import { normalizeSse } from "./bulletMath.js";
import { ContactManifold } from "./contactManifold.js";
import { arenaDistance, arenaNormal, boxTriangleGapContacts, raycastArena } from "./arenaMesh.js";
import { SOCCAR_TRIS } from "./soccarMeshData.js";
import {
  cloneHitbox,
  getHitboxForCarId,
  getHitboxPreset,
  HITBOX_PRESETS,
} from "./hitboxPresets.js";
import { CAR_TORQUE_SCALE, RL_CONST as C, RL_CURVES } from "./rlConst.js";
import {
  RL,
  axes,
  carHitbox,
  collideCarBall,
  hitboxExtentOnAxis,
  makeBall,
  stepBall,
  synchronizeBallBulletState,
} from "./rl-physics.js";

/* =====================================================================
 *  Car simulation — a port of RocketSim's Car + btVehicleRL tick
 *  (ZealanL/RocketSim, MIT: src/Sim/Car/Car.cpp, src/Sim/btVehicleRL).
 *
 *  Forces and contacts run in uu with the RocketSim constants unchanged.
 *  Translation retains a float32 Bullet-unit origin between ticks.
 *  Frame: X forward, Y right, Z up.
 *
 *  Tick order matches Car::_PreTickUpdate → btDiscreteDynamicsWorld step →
 *  Car::_PostTickUpdate / _FinishPhysicsTick.
 * ===================================================================== */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const CAR_MASS = RL.CAR_MASS;
const INV_MASS = 1 / CAR_MASS;
const BT_TO_UU = 50;
const NATIVE_FREE_FLIGHT_GRAVITY = 649.2;
const NATIVE_FREE_FLIGHT_THROTTLE_ACCEL = 66;
const translationState = new WeakMap();
const velocityState = new WeakMap();
const orientationState = new WeakMap();
const f32 = Math.fround;
const nativeLength = value => f32(value * f32(1 / BT_TO_UU));
const nativeDot = (first, second) => f32(f32(f32(first.x * second.x) + f32(first.y * second.y)) + f32(first.z * second.z));
const nativeVector = vector => V(nativeLength(vector.x), nativeLength(vector.y), nativeLength(vector.z));

function nativePointVelocity(car, rel) {
  const velocity = nativeVelocity(car).value;
  const angular = [car.omega.x, car.omega.y, car.omega.z].map(f32);
  return V(
    f32(f32(f32(angular[1] * rel.z) - f32(angular[2] * rel.y)) + velocity.x),
    f32(f32(f32(angular[2] * rel.x) - f32(angular[0] * rel.z)) + velocity.y),
    f32(f32(f32(angular[0] * rel.y) - f32(angular[1] * rel.x)) + velocity.z),
  );
}

function basisFromQuaternion(q) {
  const components = [q.x, q.y, q.z, q.w].map(f32);
  const [qx, qy, qz, qw] = components;
  const squares = components.map(value => f32(value * value));
  const scale = f32(2 / f32(f32(squares[0] + squares[2]) + f32(squares[1] + squares[3])));
  const pair = (first, second) => f32(first * second);
  const scaled = value => f32(value * scale);
  return [
    [f32(1 + scaled(f32(-pair(qy, qy) - pair(qz, qz)))), scaled(f32(pair(qx, qy) - pair(qz, qw))), scaled(f32(pair(qx, qz) + pair(qy, qw)))],
    [scaled(f32(pair(qx, qy) + pair(qz, qw))), f32(1 + scaled(f32(-pair(qx, qx) - pair(qz, qz)))), scaled(f32(pair(qy, qz) - pair(qx, qw)))],
    [scaled(f32(pair(qx, qz) - pair(qy, qw))), scaled(f32(pair(qy, qz) + pair(qx, qw))), f32(1 + scaled(f32(-pair(qx, qx) - pair(qy, qy))))],
  ];
}

function nativeOrientation(q) {
  let state = orientationState.get(q);
  if (!state || !state.published.equals(q)) {
    state = { basis: basisFromQuaternion(q), published: q.clone() };
    orientationState.set(q, state);
  }
  return state;
}

export function setCarOrientation(car, yaw = 0, pitch = 0, roll = 0) {
  const ci = f32(Math.cos(-f32(roll)));
  const cj = f32(Math.cos(-f32(pitch)));
  const ch = f32(Math.cos(f32(yaw)));
  const si = f32(Math.sin(-f32(roll)));
  const sj = f32(Math.sin(-f32(pitch)));
  const sh = f32(Math.sin(f32(yaw)));
  const cc = f32(ci * ch);
  const cs = f32(ci * sh);
  const sc = f32(si * ch);
  const ss = f32(si * sh);
  const basis = [
    [f32(cj * ch), f32(f32(sj * sc) - cs), f32(f32(sj * cc) + ss)],
    [f32(cj * sh), f32(f32(sj * ss) + cc), f32(f32(sj * cs) - sc)],
    [-sj, f32(cj * si), f32(cj * ci)],
  ];
  car.q.copy(quaternionFromBasis(basis));
  orientationState.set(car.q, { basis, published: car.q.clone() });
}

function quaternionFromBasis(basis) {
  const trace = f32(f32(basis[0][0] + basis[1][1]) + basis[2][2]);
  const values = [0, 0, 0, 0];
  let diagonal;
  if (trace > 0) {
    diagonal = f32(trace + 1);
    values[0] = f32(basis[2][1] - basis[1][2]);
    values[1] = f32(basis[0][2] - basis[2][0]);
    values[2] = f32(basis[1][0] - basis[0][1]);
    values[3] = diagonal;
  } else {
    const index = basis[0][0] < basis[1][1] ? (basis[1][1] < basis[2][2] ? 2 : 1) : (basis[0][0] < basis[2][2] ? 2 : 0);
    const next = (index + 1) % 3;
    const last = (index + 2) % 3;
    diagonal = f32(f32(f32(basis[index][index] - basis[next][next]) - basis[last][last]) + 1);
    values[3] = f32(basis[last][next] - basis[next][last]);
    values[next] = f32(basis[next][index] + basis[index][next]);
    values[last] = f32(basis[last][index] + basis[index][last]);
    values[index] = diagonal;
  }
  const scale = f32(0.5 / f32(Math.sqrt(diagonal)));
  return new THREE.Quaternion(...values.map(value => f32(value * scale)));
}

function nativeVelocity(car) {
  let state = velocityState.get(car);
  if (!state || !state.published.equals(car.vel)) {
    state = { value: car.vel.clone(), published: car.vel.clone() };
    for (const axis of ["x", "y", "z"]) state.value[axis] = Math.fround(car.vel[axis] * Math.fround(1 / BT_TO_UU));
    velocityState.set(car, state);
  }
  return state;
}

function publishVelocity(car, state) {
  for (const axis of ["x", "y", "z"]) car.vel[axis] = Math.fround(state.value[axis] * BT_TO_UU);
  state.published.copy(car.vel);
}

function integrateVelocity(car, accel, dt) {
  const state = nativeVelocity(car);
  for (const axis of ["x", "y", "z"]) {
    const force = accel[axis];
    const calibratedFreeFlight = car.physicsProfile === "native" && !car.hasJumped && !car.hasFlipped && !car.onGround;
    const gravityAcceleration = calibratedFreeFlight ? NATIVE_FREE_FLIGHT_GRAVITY : RL.GRAVITY;
    const gravity = axis === "z" ? Math.fround(Math.fround(-gravityAcceleration * Math.fround(1 / BT_TO_UU)) / Math.fround(INV_MASS)) : 0;
    const totalForce = Math.fround(force + gravity);
    const delta = Math.fround(Math.fround(totalForce * Math.fround(INV_MASS)) * Math.fround(dt));
    state.value[axis] = Math.fround(state.value[axis] + delta);
  }
  publishVelocity(car, state);
}

function addNativeForce(total, direction, ...scales) {
  for (const axis of ["x", "y", "z"]) {
    let component = direction[axis];
    for (const scale of scales) component = f32(component * f32(scale));
    total[axis] = f32(total[axis] + component);
  }
}

function applyCentralVelocityImpulse(car, direction, scale = 1) {
  const impulse = V();
  addNativeForce(impulse, direction, scale, 1 / BT_TO_UU, CAR_MASS);
  const state = nativeVelocity(car);
  for (const axis of ["x", "y", "z"]) state.value[axis] = f32(state.value[axis] + f32(impulse[axis] * f32(INV_MASS)));
  publishVelocity(car, state);
}

function integratePosition(car, push, dt) {
  const linearVelocity = nativeVelocity(car).value;
  let state = translationState.get(car);
  if (!state || !state.published.equals(car.pos)) {
    state = { origin: car.pos.clone().multiplyScalar(Math.fround(1 / BT_TO_UU)), published: car.pos.clone() };
    for (const axis of ["x", "y", "z"]) state.origin[axis] = Math.fround(state.origin[axis]);
    translationState.set(car, state);
  }
  for (const axis of ["x", "y", "z"]) {
    const velocity = Math.fround(linearVelocity[axis] + nativeLength(push[axis]));
    const displacement = Math.fround(velocity * Math.fround(dt));
    state.origin[axis] = Math.fround(state.origin[axis] + displacement);
    car.pos[axis] = Math.fround(state.origin[axis] * BT_TO_UU);
  }
  state.published.copy(car.pos);
}

/** RocketSim `LinearPieceCurve::GetOutput` (clamped piecewise-linear). */
function linearPieceCurve(points, defaultOutput = 1) {
  return (input) => {
    if (points.length === 0) return defaultOutput;
    if (input <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] > input) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        return f32(y0 + f32(f32(f32(y1 - y0) * f32(input - x0)) / f32(x1 - x0)));
      }
    }
    return points[points.length - 1][1];
  };
}

/** RocketSim RLConst curves (float32 control points from `rlConst.js`). */
export const RS_CURVES = {
  steerAngle: linearPieceCurve(RL_CURVES.steerAngle),
  powerslideSteerAngle: linearPieceCurve(RL_CURVES.powerslideSteerAngle),
  driveSpeedTorque: linearPieceCurve(RL_CURVES.driveSpeedTorque),
  nonStickyFriction: linearPieceCurve(RL_CURVES.nonStickyFriction),
  latFriction: linearPieceCurve(RL_CURVES.latFriction),
  longFriction: linearPieceCurve([]),
  handbrakeLatFriction: linearPieceCurve(RL_CURVES.handbrakeLatFriction),
  handbrakeLongFriction: linearPieceCurve(RL_CURVES.handbrakeLongFriction),
  bumpVelGround: linearPieceCurve(RL_CURVES.bumpVelGround),
  bumpVelAir: linearPieceCurve(RL_CURVES.bumpVelAir),
  bumpVelUp: linearPieceCurve(RL_CURVES.bumpVelUp),
};

/** RocketSim RLConst / Bullet solver constants used by the car tick. */
export const RS = {
  EXPERIMENTAL_PERSISTENT_CONTACTS: false,
  THROTTLE_TORQUE_AMOUNT: C.THROTTLE_TORQUE_AMOUNT,
  BRAKE_TORQUE_AMOUNT: C.BRAKE_TORQUE_AMOUNT,
  STOPPING_FORWARD_VEL: C.STOPPING_FORWARD_VEL,
  COASTING_BRAKE_FACTOR: C.COASTING_BRAKE_FACTOR,
  BRAKING_NO_THROTTLE_SPEED_THRESH: C.BRAKING_NO_THROTTLE_SPEED_THRESH,
  THROTTLE_DEADZONE: C.THROTTLE_DEADZONE,
  THROTTLE_AIR_ACCEL: C.THROTTLE_AIR_ACCEL,
  JUMP_MIN_TIME: C.JUMP_MIN_TIME,
  JUMP_RESET_TIME_PAD: C.JUMP_RESET_TIME_PAD,
  JUMP_PRE_MIN_ACCEL_SCALE: C.JUMP_PRE_MIN_ACCEL_SCALE,
  AUTOFLIP_IMPULSE: C.CAR_AUTOFLIP_IMPULSE,
  AUTOFLIP_TORQUE: C.CAR_AUTOFLIP_TORQUE,
  AUTOFLIP_TIME: C.CAR_AUTOFLIP_TIME,
  AUTOFLIP_NORMZ_THRESH: C.CAR_AUTOFLIP_NORMZ_THRESH,
  AUTOFLIP_ROLL_THRESH: C.CAR_AUTOFLIP_ROLL_THRESH,
  AUTOROLL_FORCE: C.CAR_AUTOROLL_FORCE,
  AUTOROLL_TORQUE: C.CAR_AUTOROLL_TORQUE,
  CAR_TORQUE_SCALE,
  AIR_CONTROL_TORQUE: { ...C.CAR_AIR_CONTROL_TORQUE },
  AIR_CONTROL_DAMPING: { ...C.CAR_AIR_CONTROL_DAMPING },
  SUSPENSION_FORCE_SCALE_FRONT: C.SUSPENSION_FORCE_SCALE_FRONT,
  SUSPENSION_FORCE_SCALE_BACK: C.SUSPENSION_FORCE_SCALE_BACK,
  SUSPENSION_STIFFNESS: C.SUSPENSION_STIFFNESS,
  WHEELS_DAMPING_COMPRESSION: C.WHEELS_DAMPING_COMPRESSION,
  WHEELS_DAMPING_RELAXATION: C.WHEELS_DAMPING_RELAXATION,
  MAX_SUSPENSION_TRAVEL: C.MAX_SUSPENSION_TRAVEL,
  SUSPENSION_SUBTRACTION: C.SUSPENSION_SUBTRACTION_BT * BT_TO_UU,
  ROLLING_FRICTION_SCALE_MAGIC: C.ROLLING_FRICTION_SCALE_MAGIC,
  /** Bullet `resolveSingleBilateral` contact damping */
  SIDE_FRICTION_DAMPING: 0.2,
  /** Bullet btContactSolverInfo defaults (RocketSim sets erp2 = 0.8) */
  SOLVER_ERP: 0.2,
  SOLVER_ERP2: 0.8,
  SOLVER_ITERATIONS: 10,
  RESTITUTION_VELOCITY_THRESHOLD: 0.2 * BT_TO_UU,
  CONTACT_BREAKING_THRESHOLD: 0.02 * BT_TO_UU,
  CARWORLD_FRICTION: C.CARWORLD_COLLISION_FRICTION,
  CARWORLD_RESTITUTION: C.CARWORLD_COLLISION_RESTITUTION,
  /**
   * When exactly two OBB corners share the deepest penetration on one normal
   * (edge flush with a plane), blend toward the +local-Y corner (car right).
   * Tuned with CONTACT_*_INSET_UU on `ground_flip_forward` vs RocketSim.
   * 1 = pure +Y corner; 0 = edge midpoint.
   * Face contacts (3+ tied corners, e.g. nose into a wall) always use the
   * patch centroid — a single offset corner invents yaw/spin Bullet does not.
   */
  CONTACT_EDGE_CORNER_BLEND: 1,
  /**
   * Pull edge-contact impulse points along the contact normal (uu). Combined
   * with CONTACT_CORNER_INSET_UU this recreates Bullet's manifold lever arm on
   * floor-scraping flips. Not applied to face (3+) or steep wall contacts.
   */
  CONTACT_NORMAL_INSET_UU: 7,
  /**
   * Pull edge-contact points toward the hitbox centre along car axes (uu).
   */
  CONTACT_CORNER_INSET_UU: 5,
  /**
   * |contact normal · world up| above this → floor/ceiling edge insets apply.
   * Below → treat as wall/steep; use centroid, no scrape insets.
   */
  CONTACT_FLOOR_NORMAL_Z: 0.55,
};

/* --------------------------- state factories --------------------------- */

/**
 * @param {string | import("./hitboxPresets.js").HitboxPreset | undefined} hitboxOrCarId
 * @returns {import("./hitboxPresets.js").HitboxPreset}
 */
function resolveHitbox(hitboxOrCarId) {
  if (typeof hitboxOrCarId === "string") {
    return cloneHitbox(
      HITBOX_PRESETS[hitboxOrCarId]
        ? getHitboxPreset(hitboxOrCarId)
        : getHitboxForCarId(hitboxOrCarId),
    );
  }
  return cloneHitbox(hitboxOrCarId ?? getHitboxPreset("octane"));
}

/**
 * Wheels in RocketSim order: 0 front-right, 1 front-left, 2 back-right, 3 back-left.
 * @param {import("./hitboxPresets.js").HitboxPreset} hitbox
 */
function makeWheels(hitbox) {
  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    const left = i % 2 === 1;
    const cfg = front ? hitbox.wheels.front : hitbox.wheels.back;
    const suspensionRest = f32(cfg.suspensionRest);
    const restLength = f32(suspensionRest - f32(RS.MAX_SUSPENSION_TRAVEL));
    wheels.push({
      front,
      left,
      radius: f32(cfg.radius),
      suspensionRest,
      restLength,
      connection: V(f32(cfg.offset[0]), f32(left ? -cfg.offset[1] : cfg.offset[1]), f32(cfg.offset[2])),
      forceScale: front ? RS.SUSPENSION_FORCE_SCALE_FRONT : RS.SUSPENSION_FORCE_SCALE_BACK,
      steerAngle: 0,
      engineForce: 0,
      brake: 0,
      latFriction: 0,
      longFriction: 0,
      inContact: false,
      hardPoint: V(),
      /** Steered wheel right axis (world). */
      axle: V(),
      contactPoint: V(),
      contactNormal: V(0, 0, 1),
      suspensionLength: restLength,
      suspensionRelVel: 0,
      clippedInvContactDotSuspension: 1,
      extraPushback: 0,
      suspensionForce: 0,
      impulse: V(),
    });
  }
  return wheels;
}

/**
 * @param {THREE.Vector3} [pos] root position (uu); defaults to resting on the floor
 * @param {number} [yaw]
 * @param {string | import("./hitboxPresets.js").HitboxPreset} [hitboxOrCarId]
 *   Preset id (`"octane"`), garage car id (`"fennec"`), or a preset object.
 */
export function makeCar(pos, yaw = Math.PI / 2, hitboxOrCarId = "octane") {
  const hitbox = resolveHitbox(hitboxOrCarId);
  const spawn = pos?.clone?.() ?? V(0, 0, hitbox.restZ);
  const margin = Math.min(2, Math.min(...hitbox.size) * 0.05);
  const [lx, ly, lz] = hitbox.size.map(length => length - 4 + 2 * margin);
  return {
    pos: spawn,
    vel: V(),
    /** World angular velocity (rad/s). */
    omega: V(),
    q: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), yaw),
    boost: RL.BOOST_SPAWN,
    physicsProfile: "rocketsim",
    /** When true, boost never depletes (orientation drills). */
    infiniteBoost: false,
    /** Disable only arena contacts for RocketSim THE_VOID reference scenarios. */
    arenaCollisions: true,
    /** RocketSim `isOnGround`: ≥ 3 wheels touching. */
    onGround: true,
    /** Any wheel touching. */
    wheelsContact: true,
    numWheelsInContact: 4,
    prevJump: false,
    lastControls: sanitizeControls({}),
    /** RocketSim `isJumping` */
    jumping: false,
    jumpTime: 0,
    hasJumped: false,
    hasDoubleJumped: false,
    hasFlipped: false,
    isFlipping: false,
    flipTime: 0,
    flipRelTorque: V(),
    airTime: 0,
    airTimeSinceJump: 0,
    isAutoFlipping: false,
    autoFlipTimer: 0,
    autoFlipTorqueScale: 0,
    isBoosting: false,
    boostingTime: 0,
    isSupersonic: false,
    supersonicTime: 0,
    handbrakeVal: 0,
    dodgeDeadzone: RL.DODGE_DEADZONE,
    /** Hitbox ↔ arena contact from the previous physics step. */
    worldContact: { hasContact: false, normal: V() },
    /** Averaged wheel contact normal (car up when airborne). */
    contactNormal: V(0, 0, 1),
    /** Stable id for car↔car bump cooldown (RocketSim `Car::id`). */
    id: 0,
    team: 0,
    isDemoed: false,
    demoRespawnTimer: 0,
    /** RocketSim `carContact` — bumper bump cooldown against another car. */
    carContact: { otherCarId: 0, cooldownTimer: 0 },
    /** Deferred Δv from bumps (applied next tick like RocketSim impulse cache). */
    velocityImpulseCache: V(),
    hitbox,
    /** Box inertia about the root (Bullet `btBoxShape::calculateLocalInertia`), inverted. */
    invInertiaLocal: V(
      12 / (CAR_MASS * (ly * ly + lz * lz)),
      12 / (CAR_MASS * (lx * lx + lz * lz)),
      12 / (CAR_MASS * (lx * lx + ly * ly)),
    ),
    wheels: makeWheels(hitbox),
  };
}

export function makeSoccarKickoffCar(hitboxOrCarId = "octane") {
  const spawn = RL.SOCCAR_SPAWNS[4];
  return makeCar(
    V(spawn.x, spawn.y, RL.CAR_SPAWN_REST_Z),
    Math.fround(spawn.yaw),
    hitboxOrCarId,
  );
}

/** @typedef {ReturnType<typeof makeCar>} SimCar */

/** RocketSim `CarState::HasFlipOrJump`. @param {SimCar} car */
export function canFlipOrJump(car) {
  return (
    car.onGround ||
    (!car.hasFlipped && !car.hasDoubleJumped && car.airTimeSinceJump < RL.FLIP_WINDOW)
  );
}

/** @param {SimCar} car */
export function carRestZ(car) {
  return car.hitbox?.restZ ?? RL.REST_HEIGHT;
}

/* ---------------------------- rigid body math ---------------------------- */

/** @param {SimCar} car */
function carFrame(car) {
  const basis = nativeOrientation(car.q).basis;
  return { f: V(basis[0][0], basis[1][0], basis[2][0]), r: V(basis[0][1], basis[1][1], basis[2][1]), u: V(basis[0][2], basis[1][2], basis[2][2]) };
}

/**
 * World inverse inertia × v.
 * @param {SimCar} car
 * @param {{ f: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3 }} fr
 * @param {THREE.Vector3} v
 */
function nativeInertiaMatrix(car, fr) {
  const halfExtents = car.hitbox.size.map(length => f32(nativeLength(car.physicsProfile === "rocketsim" ? f32(length) : length) * 0.5));
  const dimensions = halfExtents.map(length => f32(length - f32(0.04)));
  const margin = Math.min(f32(0.04), f32(Math.min(...halfExtents) * f32(0.1)));
  const lengths = dimensions.map(value => f32(2 * f32(value + margin)));
  const squared = lengths.map(value => f32(value * value));
  const inverse = [f32(1 / f32(f32(CAR_MASS / 12) * f32(squared[1] + squared[2]))), f32(1 / f32(f32(CAR_MASS / 12) * f32(squared[0] + squared[2]))), f32(1 / f32(f32(CAR_MASS / 12) * f32(squared[0] + squared[1])))];
  const columns = [fr.f, fr.r, fr.u];
  return ["x", "y", "z"].map(row => ["x", "y", "z"].map(column => f32(f32(f32(f32(columns[0][row] * inverse[0]) * columns[0][column]) + f32(f32(columns[1][row] * inverse[1]) * columns[1][column])) + f32(f32(columns[2][row] * inverse[2]) * columns[2][column]))));
}

function invInertiaMul(car, fr, v, native = false) {
  const matrix = nativeInertiaMatrix(car, fr);
  const nativeTorque = native ? v : V(f32(v.x / 2500), f32(v.y / 2500), f32(v.z / 2500));
  return V(...matrix.map(row => nativeDot(V(...row), nativeTorque)));
}

function nativeAngularTorque(car, fr, acceleration) {
  const matrix = nativeInertiaMatrix(car, fr);
  const cofactor = (row1, column1, row2, column2) => f32(f32(matrix[row1][column1] * matrix[row2][column2]) - f32(matrix[row1][column2] * matrix[row2][column1]));
  const co = V(cofactor(1, 1, 2, 2), cofactor(1, 2, 2, 0), cofactor(1, 0, 2, 1));
  const inverse = f32(1 / nativeDot(V(...matrix[0]), co));
  const rows = [
    [co.x, cofactor(0, 2, 2, 1), cofactor(0, 1, 1, 2)],
    [co.y, cofactor(0, 0, 2, 2), cofactor(0, 2, 1, 0)],
    [co.z, cofactor(0, 1, 2, 0), cofactor(0, 0, 1, 1)],
  ].map(row => row.map(value => f32(value * inverse)));
  return V(...rows.map(row => nativeDot(V(...row), acceleration)));
}

function nativeCross(first, second) {
  return V(
    f32(f32(first.y * second.z) - f32(first.z * second.y)),
    f32(f32(first.z * second.x) - f32(first.x * second.z)),
    f32(f32(first.x * second.y) - f32(first.y * second.x)),
  );
}

/** @param {SimCar} car @param {THREE.Vector3} rel offset from the centre of mass */
function velocityAt(car, rel) {
  return car.omega.clone().cross(rel).add(car.vel);
}

/** Bullet `computeImpulseDenominator` against a static body. */
function impulseDenominator(car, fr, rel, dir, native = false) {
  const point = native ? rel : nativeVector(rel);
  const cross = nativeCross(point, dir);
  const angular = invInertiaMul(car, fr, cross, true);
  return f32(f32(INV_MASS) + nativeDot(dir, nativeCross(angular, point)));
}

/** @param {SimCar} car */
function applyImpulse(car, fr, impulse, rel, native = false) {
  const state = nativeVelocity(car);
  for (const axis of ["x", "y", "z"]) {
    const nativeImpulse = native ? impulse[axis] : nativeLength(impulse[axis]);
    state.value[axis] = Math.fround(state.value[axis] + Math.fround(nativeImpulse * Math.fround(INV_MASS)));
  }
  publishVelocity(car, state);
  const angularImpulse = invInertiaMul(car, fr, nativeCross(native ? rel : nativeVector(rel), native ? impulse : nativeVector(impulse)), true);
  for (const axis of ["x", "y", "z"]) car.omega[axis] = f32(f32(car.omega[axis]) + angularImpulse[axis]);
}

/** Bullet `resolveSingleCollision` with applyImpulses = false, restitution 0. */
function resolveSingleCollision(car, fr, point, normal, distance, dt, native = false) {
  const cached = translationState.get(car);
  const origin = cached?.published.equals(car.pos) ? cached.origin : nativeVector(car.pos);
  const rel = (native ? point.clone() : nativeVector(point)).sub(origin);
  for (const axis of ["x", "y", "z"]) rel[axis] = f32(rel[axis]);
  const relVel = nativeDot(normal, nativePointVelocity(car, rel));
  const positionalError = f32(f32(f32(RS.SOLVER_ERP) * -(native ? distance : nativeLength(distance))) / f32(dt));
  const inverse = f32(1 / impulseDenominator(car, fr, rel, normal, true));
  const impulse = f32(f32(positionalError * inverse) + f32(-relVel * inverse));
  return Math.max(0, impulse) * (native ? 1 : BT_TO_UU);
}

/* ------------------------------ btVehicleRL ------------------------------ */

function updateWheelTransform(car, fr, wheel) {
  const c = wheel.connection;
  const cached = translationState.get(car);
  const origin = cached?.published.equals(car.pos) ? cached.origin : nativeVector(car.pos);
  const connection = nativeVector(c);
  wheel.nativeHardPoint = V();
  for (const axis of ["x", "y", "z"]) {
    wheel.nativeHardPoint[axis] = f32(f32(f32(f32(fr.f[axis] * connection.x) + f32(fr.r[axis] * connection.y)) + f32(fr.u[axis] * connection.z)) + origin[axis]);
    wheel.hardPoint[axis] = wheel.nativeHardPoint[axis] * BT_TO_UU;
  }
  const halfAngle = f32(f32(wheel.steerAngle) * f32(0.5));
  const inverseLength = f32(1 / f32(Math.sqrt(nativeDot(fr.u, fr.u))));
  const factor = f32(f32(Math.sin(halfAngle)) * inverseLength);
  const steering = new THREE.Quaternion(f32(fr.u.x * factor), f32(fr.u.y * factor), f32(fr.u.z * factor), f32(Math.cos(halfAngle)));
  const matrix = basisFromQuaternion(steering);
  wheel.axle.set(...matrix.map(row => nativeDot(V(...row), fr.r)));
}

const wheelSolverTime = new WeakMap();

function rayCastWheel(car, fr, wheel, numWheels, dt) {
  const travel = RS.MAX_SUSPENSION_TRAVEL;
  const subtraction = car.physicsProfile === "native" ? 0 : RS.SUSPENSION_SUBTRACTION;
  const rayLength =
    wheel.restLength + travel + wheel.radius - subtraction;
  const down = fr.u.clone().negate();
  const nativeRayLength = f32(f32(f32(nativeLength(wheel.restLength) + nativeLength(travel)) + nativeLength(wheel.radius)) - nativeLength(subtraction));
  const target = V(...["x", "y", "z"].map(axis => f32(wheel.nativeHardPoint[axis] + f32(down[axis] * nativeRayLength))));
  const delta = target.clone().sub(wheel.nativeHardPoint);
  for (const axis of ["x", "y", "z"]) delta[axis] = f32(delta[axis]);
  const hit = car.arenaCollisions ? raycastArena(wheel.hardPoint, delta.clone().normalize(), delta.length() * BT_TO_UU) : null;
  let nativeHit = hit ? nativeVector(hit.point) : null;
  if (hit) {
    let planeNormal = hit.normal;
    let planePoint = nativeVector(hit.point);
    if (hit.triangle >= 0) {
      const offset = hit.triangle * 9;
      const vertices = [0, 3, 6].map(index => V(...Array.from(SOCCAR_TRIS.slice(offset + index, offset + index + 3), nativeLength)));
      planePoint = vertices[0];
      const edges = vertices.slice(1).map(vertex => V(...["x", "y", "z"].map(axis => f32(vertex[axis] - planePoint[axis]))));
      planeNormal = nativeCross(edges[0], edges[1]);
      if (car.physicsProfile === "rocketsim") {
        hit.normal.copy(normalizeSse(planeNormal.clone()));
      } else {
        const inverse = f32(1 / f32(Math.sqrt(nativeDot(planeNormal, planeNormal))));
        hit.normal.set(...["x", "y", "z"].map(axis => f32(planeNormal[axis] * inverse)));
      }
      if (nativeDot(hit.normal, delta) > 0) hit.normal.negate();
    }
    if (car.physicsProfile === "rocketsim") normalizeSse(hit.normal);
    const plane = nativeDot(planeNormal, planePoint);
    const fromDistance = f32(nativeDot(planeNormal, wheel.nativeHardPoint) - plane);
    const toDistance = f32(nativeDot(planeNormal, target) - plane);
    const fraction = f32(fromDistance / f32(fromDistance - toDistance));
    const inverseFraction = f32(1 - fraction);
    for (const axis of ["x", "y", "z"]) {
      nativeHit[axis] = f32(f32(wheel.nativeHardPoint[axis] * inverseFraction) + f32(target[axis] * fraction));
      hit.point[axis] = nativeHit[axis] * BT_TO_UU;
    }
  }

  if (!hit) {
    wheel.inContact = false;
    wheel.contactPoint.copy(wheel.hardPoint).addScaledVector(down, rayLength);
    wheel.suspensionLength = wheel.restLength + travel;
    wheel.suspensionRelVel = 0;
    wheel.contactNormal.copy(fr.u);
    wheel.clippedInvContactDotSuspension = 1;
    wheel.extraPushback = 0;
    wheel.nativeExtraPushback = 0;
    return;
  }

  wheel.inContact = true;
  wheel.nativeContactPoint = nativeHit;
  wheel.contactPoint.copy(hit.point);
  wheel.contactNormal.copy(hit.normal);

  const point = wheel.nativeContactPoint;
  const trace = wheel.nativeHardPoint.clone().sub(point);
  for (const axis of ["x", "y", "z"]) trace[axis] = f32(trace[axis]);
  const traceNative = nativeDot(trace, fr.u);
  const traceLen = traceNative * BT_TO_UU;
  wheel.nativeSuspensionLength = clamp(
    f32(traceNative - nativeLength(wheel.radius)),
    f32(nativeLength(wheel.restLength) - nativeLength(travel)),
    f32(nativeLength(wheel.restLength) + nativeLength(travel)),
  );
  wheel.suspensionLength = wheel.nativeSuspensionLength * BT_TO_UU;

  const denominator = nativeDot(wheel.contactNormal, fr.u);
  const cached = translationState.get(car);
  const origin = cached?.published.equals(car.pos) ? cached.origin : nativeVector(car.pos);
  const rel = point.clone().sub(origin);
  for (const axis of ["x", "y", "z"]) rel[axis] = f32(rel[axis]);
  const projVel = nativeDot(wheel.contactNormal, nativePointVelocity(car, rel));
  if (denominator > 0.1) {
    const inv = f32(1 / denominator);
    wheel.nativeSuspensionRelVel = f32(projVel * inv);
    wheel.suspensionRelVel = wheel.nativeSuspensionRelVel * BT_TO_UU;
    wheel.clippedInvContactDotSuspension = inv;
  } else {
    wheel.suspensionRelVel = 0;
    wheel.nativeSuspensionRelVel = 0;
    wheel.clippedInvContactDotSuspension = 10;
  }

  // RocketSim keeps the previous pushback while in contact above the threshold.
  const pushbackThresh = f32(f32(nativeLength(wheel.restLength) + nativeLength(wheel.radius)) - nativeLength(RS.SUSPENSION_SUBTRACTION));
  if (traceNative < pushbackThresh) {
    const impulse = resolveSingleCollision(
      car,
      fr,
      wheel.nativeContactPoint,
      wheel.contactNormal,
      f32(traceNative - pushbackThresh),
      car.physicsProfile === "rocketsim" ? (wheelSolverTime.get(car) ?? 1 / 60) : dt,
      true,
    );
    wheel.nativeExtraPushback = f32(impulse / numWheels);
    wheel.extraPushback = wheel.nativeExtraPushback * BT_TO_UU;
  }
}

function calcFrictionImpulses(car, fr, dt) {
  const frictionScale = f32(CAR_MASS / 3);
  const normalize = vector => {
    const squared = nativeDot(vector, vector);
    if (squared > 1e-12) {
      const inverse = f32(1 / f32(Math.sqrt(squared)));
      for (const axis of ["x", "y", "z"]) vector[axis] = f32(vector[axis] * inverse);
    }
    return vector;
  };
  const cached = translationState.get(car);
  const origin = cached?.published.equals(car.pos) ? cached.origin : nativeVector(car.pos);
  const halfExtents = car.hitbox.size.map(length => f32(nativeLength(car.physicsProfile === "rocketsim" ? f32(length) : length) * 0.5));
  const margin = Math.min(f32(0.04), f32(Math.min(...halfExtents) * f32(0.1)));
  const squared = halfExtents.map(value => f32(2 * f32(f32(value - f32(0.04)) + margin))).map(value => f32(value * value));
  const inverseInertia = [f32(1 / f32(f32(CAR_MASS / 12) * f32(squared[1] + squared[2]))), f32(1 / f32(f32(CAR_MASS / 12) * f32(squared[0] + squared[2]))), f32(1 / f32(f32(CAR_MASS / 12) * f32(squared[0] + squared[1])))];
  for (const wheel of car.wheels) {
    if (!wheel.inContact) {
      wheel.impulse.set(0, 0, 0);
      continue;
    }
    const n = wheel.contactNormal;
    const projection = nativeDot(wheel.axle, n);
    const axleDir = normalize(V(...["x", "y", "z"].map(axis => f32(wheel.axle[axis] - f32(n[axis] * projection)))));
    // btVehicleRL's "forward" is n × axle, which points backwards.
    const forwardDir = normalize(nativeCross(n, axleDir));

    const rel = wheel.nativeContactPoint.clone().sub(origin);
    for (const axis of ["x", "y", "z"]) rel[axis] = f32(rel[axis]);
    const contactVel = nativePointVelocity(car, rel);
    const angular = nativeCross(rel, axleDir);
    const local = V(nativeDot(fr.f, angular), nativeDot(fr.r, angular), nativeDot(fr.u, angular));
    const scaled = V(f32(local.x * inverseInertia[0]), f32(local.y * inverseInertia[1]), f32(local.z * inverseInertia[2]));
    const inverse = f32(1 / f32(f32(INV_MASS) + nativeDot(scaled, local)));
    const sideImpulse = f32(f32(-f32(RS.SIDE_FRICTION_DAMPING) * nativeDot(axleDir, contactVel)) * inverse);

    let rollingFriction = 0;
    if (wheel.engineForce === 0) {
      if (wheel.brake) {
        let relVel = nativeDot(contactVel, forwardDir);
        if (dt > 1 / 80) {
          const threshold = -(1 / (dt * 150)) + 0.8;
          if (Math.abs(relVel) < threshold) relVel = 0;
        }
        rollingFriction = clamp(
          f32(-relVel * f32(RS.ROLLING_FRICTION_SCALE_MAGIC)),
          -nativeLength(wheel.brake),
          nativeLength(wheel.brake),
        );
      }
    } else {
      rollingFriction = f32(-nativeLength(wheel.engineForce) / frictionScale);
    }

    wheel.nativeImpulse = V(...["x", "y", "z"].map(axis => f32(f32(f32(f32(forwardDir[axis] * rollingFriction) * f32(wheel.longFriction)) + f32(f32(axleDir[axis] * sideImpulse) * f32(wheel.latFriction))) * frictionScale)));
    wheel.impulse.copy(wheel.nativeImpulse).multiplyScalar(BT_TO_UU);
  }
}

function vehicleFirst(car, fr, dt) {
  for (const wheel of car.wheels) updateWheelTransform(car, fr, wheel);
  for (const wheel of car.wheels) rayCastWheel(car, fr, wheel, car.wheels.length, dt);
  calcFrictionImpulses(car, fr, dt);
}

function updateSuspension(car, fr, dt) {
  for (const wheel of car.wheels) {
    if (!wheel.inContact) {
      wheel.suspensionForce = 0;
      continue;
    }
    const spring = f32(f32(f32(nativeLength(wheel.restLength) - wheel.nativeSuspensionLength) * f32(RS.SUSPENSION_STIFFNESS)) * wheel.clippedInvContactDotSuspension);
    const damping =
      wheel.suspensionRelVel < 0
        ? RS.WHEELS_DAMPING_COMPRESSION
        : RS.WHEELS_DAMPING_RELAXATION;
    const force = f32(f32(spring - f32(f32(damping) * wheel.nativeSuspensionRelVel)) * f32(wheel.forceScale));
    wheel.nativeSuspensionForce = Math.max(0, force);
    wheel.suspensionForce = wheel.nativeSuspensionForce * BT_TO_UU;
  }
  for (const wheel of car.wheels) {
    if (wheel.suspensionForce === 0) continue;
    const cached = translationState.get(car);
    const origin = cached?.published.equals(car.pos) ? cached.origin : nativeVector(car.pos);
    const rel = wheel.nativeContactPoint.clone().sub(origin);
    for (const axis of ["x", "y", "z"]) rel[axis] = f32(rel[axis]);
    const scalar = f32(f32(wheel.nativeSuspensionForce * f32(dt)) + (wheel.nativeExtraPushback ?? nativeLength(wheel.extraPushback)));
    const impulse = V(...["x", "y", "z"].map(axis => f32(wheel.contactNormal[axis] * scalar)));
    applyImpulse(car, fr, impulse, rel, true);
  }
}

function applyFrictionImpulses(car, fr, dt) {
  const cached = translationState.get(car);
  const origin = cached?.published.equals(car.pos) ? cached.origin : nativeVector(car.pos);
  for (const wheel of car.wheels) {
    if (wheel.impulse.lengthSq() === 0) continue;
    const offset = wheel.nativeContactPoint.clone().sub(origin);
    for (const axis of ["x", "y", "z"]) offset[axis] = f32(offset[axis]);
    const projection = nativeDot(fr.u, offset);
    for (const axis of ["x", "y", "z"]) offset[axis] = f32(offset[axis] - f32(fr.u[axis] * projection));
    const impulse = V(...["x", "y", "z"].map(axis => f32(wheel.nativeImpulse[axis] * f32(dt))));
    applyImpulse(car, fr, impulse, offset, true);
  }
}

function vehicleSecond(car, fr, dt, jumpingFromGround = false, reverseBraking = false) {
  if (!jumpingFromGround) updateSuspension(car, fr, dt);
  if (jumpingFromGround || reverseBraking) calcFrictionImpulses(car, fr, dt);
  applyFrictionImpulses(car, fr, dt);
}

/** btVehicleRL::getUpwardsDirFromWheelContacts */
function upwardsDirFromWheelContacts(car, fr) {
  const sum = V();
  if (car.physicsProfile !== "rocketsim") {
    for (const wheel of car.wheels) if (wheel.inContact) sum.add(wheel.contactNormal);
    return sum.lengthSq() === 0 ? fr.u.clone() : sum.normalize();
  }
  for (const wheel of car.wheels) {
    if (wheel.inContact) {
      for (const axis of ["x", "y", "z"]) sum[axis] = f32(sum[axis] + wheel.contactNormal[axis]);
    }
  }
  const squared = nativeDot(sum, sum);
  if (squared === 0) return fr.u.clone();
  const inverse = f32(1 / f32(Math.sqrt(squared)));
  for (const axis of ["x", "y", "z"]) sum[axis] = f32(sum[axis] * inverse);
  return sum;
}

/* ------------------------------- Car tick ------------------------------- */

/**
 * @typedef {{
 *   throttle: number, steer: number, pitch: number, yaw: number, roll: number,
 *   boost: boolean, jump: boolean, handbrake: boolean,
 * }} SimControls
 */

/**
 * @param {object} c `{ throttle, steer, pitch, yaw, roll, boost, jump, handbrake | powerslide }`
 * @returns {SimControls}
 */
function sanitizeControls(c) {
  return {
    throttle: clamp(c.throttle || 0, -1, 1),
    steer: clamp(c.steer || 0, -1, 1),
    pitch: clamp(c.pitch || 0, -1, 1),
    yaw: clamp(c.yaw || 0, -1, 1),
    roll: clamp(c.roll || 0, -1, 1),
    boost: !!c.boost,
    jump: !!c.jump,
    handbrake: !!(c.handbrake ?? c.powerslide),
  };
}

/** Car::_UpdateWheels */
function updateWheels(car, fr, c, numWheels, forwardSpeed, dt, accel, previousJumpContact) {
  const absForwardSpeed = Math.abs(forwardSpeed);

  if (c.handbrake) car.handbrakeVal = f32(f32(car.handbrakeVal) + f32(f32(RL.POWERSLIDE_RISE) * f32(dt)));
  else car.handbrakeVal = f32(f32(car.handbrakeVal) - f32(f32(RL.POWERSLIDE_FALL) * f32(dt)));
  car.handbrakeVal = clamp(car.handbrakeVal, 0, 1);

  const hasBoost = car.infiniteBoost || car.boost > 0;
  const realThrottle = c.boost && hasBoost ? 1 : c.throttle;
  let realBrake = 0;
  let engineThrottle = realThrottle;
  let driveSpeedScale = RS_CURVES.driveSpeedTorque(absForwardSpeed);

  if (!c.handbrake) {
    if (Math.abs(realThrottle) >= RS.THROTTLE_DEADZONE) {
      if (
        absForwardSpeed > RS.STOPPING_FORWARD_VEL &&
        Math.sign(realThrottle) !== Math.sign(forwardSpeed)
      ) {
        realBrake = 1;
        if (absForwardSpeed > RS.BRAKING_NO_THROTTLE_SPEED_THRESH) engineThrottle = 0;
      }
    } else {
      engineThrottle = 0;
      realBrake =
        absForwardSpeed < RS.STOPPING_FORWARD_VEL ? 1 : RS.COASTING_BRAKE_FACTOR;
    }
  }

  if (numWheels < 3) driveSpeedScale /= 4;

  const engineForce = f32(f32(f32(engineThrottle) * nativeLength(RS.THROTTLE_TORQUE_AMOUNT)) * f32(driveSpeedScale)) * BT_TO_UU;
  const brakeForce = f32(f32(realBrake) * nativeLength(RS.BRAKE_TORQUE_AMOUNT)) * BT_TO_UU;
  for (const wheel of car.wheels) {
    wheel.engineForce = engineForce;
    wheel.brake = brakeForce;
  }

  let steerAngle = RS_CURVES.steerAngle(absForwardSpeed);
  if (car.handbrakeVal) {
    steerAngle = f32(steerAngle + f32(f32(RS_CURVES.powerslideSteerAngle(absForwardSpeed) - steerAngle) * car.handbrakeVal));
  }
  steerAngle = f32(steerAngle * f32(c.steer));
  car.wheels[0].steerAngle = steerAngle;
  car.wheels[1].steerAngle = steerAngle;

  for (const wheel of car.wheels) {
    if (!wheel.inContact) continue;
    const latDir = wheel.axle;
    const longDir = nativeCross(latDir, wheel.contactNormal);
    const cached = translationState.get(car);
    const origin = cached?.published.equals(car.pos) ? cached.origin : nativeVector(car.pos);
    const wheelDelta = wheel.nativeHardPoint.clone().sub(origin);
    for (const axis of ["x", "y", "z"]) wheelDelta[axis] = f32(wheelDelta[axis]);
    const crossVec = nativePointVelocity(car, wheelDelta);
    for (const axis of ["x", "y", "z"]) crossVec[axis] = f32(crossVec[axis] * BT_TO_UU);

    const baseFriction = Math.abs(nativeDot(crossVec, latDir));
    let frictionCurveInput = 0;
    if (baseFriction > 5) {
      frictionCurveInput = f32(baseFriction / f32(Math.abs(nativeDot(crossVec, longDir)) + baseFriction));
    }

    let latFriction = RS_CURVES.latFriction(frictionCurveInput);
    let longFriction = RS_CURVES.longFriction(frictionCurveInput);
    if (car.handbrakeVal) {
      const hb = car.handbrakeVal;
      latFriction = f32(latFriction * f32(f32(f32(RS_CURVES.handbrakeLatFriction(frictionCurveInput) - 1) * hb) + 1));
      longFriction = f32(longFriction * f32(f32(f32(RS_CURVES.handbrakeLongFriction(frictionCurveInput) - 1) * hb) + 1));
    } else {
      longFriction = 1;
    }

    if (realThrottle === 0) {
      const nonSticky = RS_CURVES.nonStickyFriction(wheel.contactNormal.z);
      latFriction = f32(latFriction * nonSticky);
      longFriction = f32(longFriction * nonSticky);
    }
    wheel.latFriction = latFriction;
    wheel.longFriction = longFriction;
  }

  if (numWheels > 0 || previousJumpContact) {
    const upwardsDir = numWheels > 0 ? upwardsDirFromWheelContacts(car, fr) : previousJumpContact;
    const fullStick = realThrottle !== 0 || absForwardSpeed > RS.STOPPING_FORWARD_VEL;
    let stickyForceScale = 0.5;
    if (fullStick) stickyForceScale = f32(stickyForceScale + f32(1 - Math.abs(upwardsDir.z)));
    addNativeForce(accel, upwardsDir, stickyForceScale, f32(-RL.GRAVITY * f32(1 / BT_TO_UU)), CAR_MASS);
  }
}

/** Car::_UpdateAirTorque */
function updateAirTorque(car, fr, c, updateAirControl, accel, angAccel) {
  const dirPitch = fr.r.clone().negate();
  const dirYaw = fr.u;
  const dirRoll = fr.f.clone().negate();

  let doAirControl = false;
  if (car.isFlipping) {
    // RocketSim compares flipTime in float32; 78*(1/120) still < 0.65f, so
    // dodge torque runs for 79 ticks. Mirror that with an inclusive tick count.
    const flipTicks = Math.round(car.flipTime / RL.DT);
    const flipTorqueTicks = Math.round(RL.FLIP_TORQUE_TIME / RL.DT);
    car.isFlipping = car.hasFlipped && flipTicks <= flipTorqueTicks;
  }
  if (car.isFlipping) {
    const rel = car.flipRelTorque.clone();
    if (rel.x !== 0 || rel.y !== 0 || rel.z !== 0) {
      let pitchScale = 1;
      if ((car.physicsProfile !== "native" || Math.round(car.flipTime / RL.DT) >= 5) && rel.y !== 0 && c.pitch !== 0 && Math.sign(rel.y) === Math.sign(c.pitch)) {
        pitchScale = 1 - Math.min(Math.abs(c.pitch), 1);
        doAirControl = true;
      }
      rel.y = f32(rel.y * f32(pitchScale));
      const dodge = V(f32(rel.x * f32(RL.FLIP_TORQUE_X)), f32(rel.y * f32(RL.FLIP_TORQUE_Y)), 0);
      const desired = V(...["x", "y", "z"].map(axis => nativeDot(V(fr.f[axis], fr.r[axis], fr.u[axis]), dodge)));
      const nativeTorque = nativeAngularTorque(car, fr, desired);
      for (const axis of ["x", "y", "z"]) angAccel[axis] = f32(angAccel[axis] + nativeTorque[axis]);
      if (car.physicsProfile === "native") doAirControl = true;
    } else {
      doAirControl = true;
    }
  } else {
    doAirControl = true;
  }

  doAirControl = doAirControl && !car.isAutoFlipping && updateAirControl;
  if (doAirControl) {
    let pitchTorqueScale = 1;
    const torque = V();
    if (c.pitch || c.yaw || c.roll) {
      if (car.isFlipping) {
        pitchTorqueScale = 0;
      } else if (car.hasFlipped) {
        const flipTicks = Math.round(car.flipTime / RL.DT);
        const lockTicks = Math.round(
          (RL.FLIP_TORQUE_TIME + RL.FLIP_PITCHLOCK_EXTRA) / RL.DT,
        );
        if (flipTicks <= lockTicks) pitchTorqueScale = 0;
      }
      for (const axis of ["x", "y", "z"]) torque[axis] = f32(f32(f32(f32(f32(c.pitch) * dirPitch[axis]) * f32(pitchTorqueScale)) * f32(RS.AIR_CONTROL_TORQUE.pitch)) + f32(f32(f32(c.yaw) * dirYaw[axis]) * f32(RS.AIR_CONTROL_TORQUE.yaw)));
      for (const axis of ["x", "y", "z"]) torque[axis] = f32(torque[axis] + f32(f32(f32(c.roll) * dirRoll[axis]) * f32(RS.AIR_CONTROL_TORQUE.roll)));
    }
    const w = car.omega;
    const dampPitch =
      f32(f32(nativeDot(dirPitch, w) * f32(RS.AIR_CONTROL_DAMPING.pitch)) * f32(1 - Math.abs(f32(f32(c.pitch) * f32(pitchTorqueScale)))));
    const dampYaw = f32(f32(nativeDot(dirYaw, w) * f32(RS.AIR_CONTROL_DAMPING.yaw)) * f32(1 - Math.abs(f32(c.yaw))));
    const dampRoll = f32(nativeDot(dirRoll, w) * f32(RS.AIR_CONTROL_DAMPING.roll));
    for (const axis of ["x", "y", "z"]) {
      const damping = f32(f32(f32(dirYaw[axis] * dampYaw) + f32(dirPitch[axis] * dampPitch)) + f32(dirRoll[axis] * dampRoll));
      torque[axis] = f32(torque[axis] - damping);
    }
    const nativeTorque = nativeAngularTorque(car, fr, torque);
    for (const axis of ["x", "y", "z"]) angAccel[axis] = f32(angAccel[axis] + f32(nativeTorque[axis] * f32(RS.CAR_TORQUE_SCALE)));
  }

  const airThrottle = car.physicsProfile === "native" && car.isBoosting ? 1 : c.throttle;
  if (airThrottle !== 0) {
    const calibratedThrottle = car.physicsProfile === "native" && !car.hasJumped && !car.hasFlipped && !car.onGround && !car.isBoosting;
    const throttleAcceleration = calibratedThrottle ? NATIVE_FREE_FLIGHT_THROTTLE_ACCEL : RS.THROTTLE_AIR_ACCEL;
    addNativeForce(accel, fr.f, airThrottle, throttleAcceleration, 1 / BT_TO_UU, CAR_MASS);
  }
}

/** Car::_UpdateJump */
function updateJump(car, fr, c, jumpPressed, dt, accel) {
  if (car.onGround && !car.jumping) {
    const stillLeaving =
      car.hasJumped && car.jumpTime < RS.JUMP_MIN_TIME + RS.JUMP_RESET_TIME_PAD;
    if (!stillLeaving) {
      car.hasJumped = false;
      car.jumpTime = 0;
    }
  }

  // RocketSim compares jumpTime in float32; 24*(1/120) underflows 0.2 in f64 and
  // would grant an extra hold tick. Use tick counts so hold lasts exactly 0.2s.
  const jumpTicks = Math.round(car.jumpTime / RL.DT);
  const minJumpTicks = Math.round(RS.JUMP_MIN_TIME / RL.DT);
  const maxJumpTicks = Math.round(RL.JUMP_HOLD_MAX / RL.DT);

  if (car.jumping) {
    car.jumping = jumpTicks < minJumpTicks || (c.jump && jumpTicks < maxJumpTicks);
  } else if (car.onGround && jumpPressed) {
    car.jumping = true;
    car.jumpTime = 0;
    applyCentralVelocityImpulse(car, fr.u, RL.JUMP_IMPULSE);
  }

  if (car.jumping) {
    car.hasJumped = true;
    addNativeForce(accel, fr.u, RL.JUMP_HOLD_ACCEL,
      car.physicsProfile !== "native" && jumpTicks < minJumpTicks ? RS.JUMP_PRE_MIN_ACCEL_SCALE : 1, 1 / BT_TO_UU, CAR_MASS);
  }

  if (car.jumping || car.hasJumped) car.jumpTime += dt;
}

/** Car::_UpdateAutoFlip */
function updateAutoFlip(car, fr, jumpPressed, dt) {
  if (
    jumpPressed &&
    car.worldContact.hasContact &&
    car.worldContact.normal.z > RS.AUTOFLIP_NORMZ_THRESH
  ) {
    const roll = Math.atan2(-fr.r.z, fr.u.z);
    const absRoll = Math.abs(roll);
    if (absRoll > RS.AUTOFLIP_ROLL_THRESH) {
      car.autoFlipTimer = RS.AUTOFLIP_TIME * (absRoll / Math.PI);
      car.autoFlipTorqueScale = roll > 0 ? 1 : -1;
      car.isAutoFlipping = true;
      applyCentralVelocityImpulse(car, fr.u.clone().negate(), RS.AUTOFLIP_IMPULSE);
    }
  }

  if (car.isAutoFlipping) {
    if (car.autoFlipTimer <= 0) {
      car.isAutoFlipping = false;
      car.autoFlipTimer = 0;
    } else {
      car.omega.addScaledVector(fr.f, RS.AUTOFLIP_TORQUE * car.autoFlipTorqueScale * dt);
      car.autoFlipTimer -= dt;
    }
  }
}

/** Car::_UpdateDoubleJumpOrFlip */
function updateDoubleJumpOrFlip(car, fr, c, jumpPressed, forwardSpeed, dt) {
  const tickTimeScale = dt / RL.DT;

  if (car.onGround) {
    car.hasDoubleJumped = false;
    car.hasFlipped = false;
    car.airTime = 0;
    car.airTimeSinceJump = 0;
    car.flipTime = 0;
  } else {
    car.airTime += dt;
    if (car.hasJumped && !car.jumping) {
      car.airTimeSinceJump = car.physicsProfile === "rocketsim"
        ? f32(f32(car.airTimeSinceJump) + f32(dt))
        : car.airTimeSinceJump + dt;
    } else car.airTimeSinceJump = 0;

    if (jumpPressed && car.airTimeSinceJump < RL.FLIP_WINDOW) {
      const inputMagnitude = Math.abs(c.yaw) + Math.abs(c.pitch) + Math.abs(c.roll);
      const isFlipInput = inputMagnitude >= car.dodgeDeadzone;
      const canUse = !car.hasDoubleJumped && !car.hasFlipped && !car.isAutoFlipping;

      if (canUse && isFlipInput) {
        car.flipTime = 0;
        car.hasFlipped = true;
        car.isFlipping = true;

        const forwardSpeedRatio = f32(Math.abs(forwardSpeed) / RL.MAX_SPEED);
        let dx = -c.pitch;
        let dy = f32(c.yaw + c.roll);
        if (Math.abs(dy) < 0.1 && Math.abs(dx) < 0.1) {
          dx = 0;
          dy = 0;
        } else {
          const inverse = f32(1 / f32(Math.sqrt(nativeDot(V(dx, dy, 0), V(dx, dy, 0)))));
          dx = f32(dx * inverse);
          dy = f32(dy * inverse);
        }
        car.flipRelTorque.set(-dy / tickTimeScale, dx / tickTimeScale, 0);

        if (Math.abs(dx) < 0.1) dx = 0;
        if (Math.abs(dy) < 0.1) dy = 0;

        if (dx !== 0 || dy !== 0) {
          const shouldDodgeBackwards =
            Math.abs(forwardSpeed) < 100 ? dx < 0 : dx >= 0 !== forwardSpeed >= 0;
          let ix = f32(dx * RL.FLIP_INITIAL_VEL);
          let iy = f32(dy * RL.FLIP_INITIAL_VEL);
          const maxSpeedScaleX = shouldDodgeBackwards
            ? RL.FLIP_BACK_SPEED_SCALE
            : RL.FLIP_FWD_SPEED_SCALE;
          ix = f32(ix * f32(f32(f32(maxSpeedScaleX - 1) * forwardSpeedRatio) + 1));
          iy = f32(iy * f32(f32(f32(RL.FLIP_SIDE_SPEED_SCALE - 1) * forwardSpeedRatio) + 1));
          if (shouldDodgeBackwards) ix = f32(ix * RL.FLIP_BACK_IMPULSE_X);

          const forward2D = V(fr.f.x, fr.f.y, 0);
          if (forward2D.lengthSq() > 1e-12) {
            const inverse = f32(1 / f32(Math.sqrt(nativeDot(forward2D, forward2D))));
            forward2D.set(f32(forward2D.x * inverse), f32(forward2D.y * inverse), 0);
          }
          const right2D = V(-forward2D.y, forward2D.x, 0);
          const delta = V(...["x", "y", "z"].map(axis => f32(f32(forward2D[axis] * ix) + f32(right2D[axis] * iy))));
          applyCentralVelocityImpulse(car, delta);
        }
      } else if (canUse) {
        applyCentralVelocityImpulse(car, fr.u, RL.JUMP_IMPULSE);
        car.hasDoubleJumped = true;
      }
    }
  }

  if (car.isFlipping) {
    car.flipTime += dt;
    const flipTicks = Math.round(car.flipTime / RL.DT);
    const flipTorqueTicks = Math.round(RL.FLIP_TORQUE_TIME / RL.DT);
    const zDampStart = Math.round(RL.FLIP_Z_DAMP_START / RL.DT);
    const zDampEnd = Math.round(RL.FLIP_Z_DAMP_END / RL.DT);
    if (
      flipTicks <= flipTorqueTicks &&
      (car.physicsProfile === "native" ? flipTicks > zDampStart : flipTicks >= zDampStart) &&
      (car.vel.z < 0 || flipTicks < zDampEnd)
    ) {
      const state = nativeVelocity(car);
      state.value.z = f32(state.value.z * f32(f32(1 - RL.FLIP_Z_DAMP_120) ** f32(tickTimeScale)));
      publishVelocity(car, state);
    }
  } else if (car.hasFlipped) {
    car.flipTime += dt;
  }
}

/** Car::_UpdateAutoRoll */
function updateAutoRoll(car, fr, numWheels, accel, angAccel) {
  const groundUp =
    numWheels > 0 ? upwardsDirFromWheelContacts(car, fr) : car.worldContact.normal.clone();
  const groundDown = groundUp.clone().negate();
  const { f, r } = fr;

  const crossRight = nativeCross(groundUp, f);
  const crossForward = nativeCross(groundDown, crossRight);
  const rightTorqueFactor = f32(1 - clamp(nativeDot(r, crossRight), 0, 1));
  const forwardTorqueFactor = f32(1 - clamp(nativeDot(f, crossForward), 0, 1));

  const torqueDirRight = f.clone().multiplyScalar(nativeDot(r, groundUp) >= 0 ? -1 : 1);
  const torqueDirForward = r.clone().multiplyScalar(nativeDot(f, groundUp) >= 0 ? 1 : -1);

  addNativeForce(accel, groundDown, RS.AUTOROLL_FORCE, 1 / BT_TO_UU, CAR_MASS);
  const desired = V(...["x", "y", "z"].map(axis => f32(f32(torqueDirForward[axis] * forwardTorqueFactor) + f32(torqueDirRight[axis] * rightTorqueFactor))));
  const torque = nativeAngularTorque(car, fr, desired);
  for (const axis of ["x", "y", "z"]) angAccel[axis] = f32(angAccel[axis] + f32(torque[axis] * RS.AUTOROLL_TORQUE));
}

/** Car::_UpdateBoost (soccar: no recharge) */
function updateBoost(car, fr, c, dt, accel) {
  const hasBoost = car.infiniteBoost || car.boost > 0;
  if (hasBoost) {
    if (car.isBoosting) {
      car.isBoosting = c.boost || car.boostingTime < RL.BOOST_MIN_TIME;
    } else if (c.boost) {
      car.isBoosting = true;
    }
  } else {
    car.isBoosting = false;
  }

  if (car.isBoosting) car.boostingTime = Math.fround(car.boostingTime + Math.fround(dt));
  else car.boostingTime = 0;

  if (car.isBoosting) {
    if (!car.infiniteBoost) car.boost = Math.max(0, Math.fround(car.boost - Math.fround(Math.fround(RL.BOOST_USE) * Math.fround(dt))));
    addNativeForce(accel, fr.f,
      f32(f32(car.onGround || car.physicsProfile === "native" ? RL.BOOST_ACCEL_GROUND : RL.BOOST_ACCEL_AIR) * f32(1 / BT_TO_UU)), CAR_MASS);
  }
  car.boost = Math.min(car.boost, RL.BOOST_MAX);
}

/** Car::_PostTickUpdate supersonic timer */
function updateSupersonic(car, dt) {
  const speed = car.vel.length();
  if (car.isSupersonic && car.supersonicTime < RL.SUPERSONIC_KEEP_TIME) {
    car.isSupersonic = speed >= RL.SUPERSONIC_KEEP;
  } else {
    car.isSupersonic = speed >= RL.SUPERSONIC_START;
  }
  if (car.isSupersonic) car.supersonicTime += dt;
  else car.supersonicTime = 0;
}

/* ------------------------- hitbox ↔ arena contacts ------------------------- */

/** Any unit vector perpendicular to n (Bullet `btPlaneSpace1`). */
function perpendicular(n) {
  if (Math.abs(n.z) > Math.SQRT1_2) {
    const k = 1 / Math.hypot(n.y, n.z);
    return V(0, -n.z * k, n.y * k);
  }
  const k = 1 / Math.hypot(n.x, n.y);
  return V(-n.y * k, n.x * k, 0);
}

/**
 * Sequential-impulse solve of the hitbox corners against the arena, with
 * Bullet's split-impulse position correction. Velocities are updated in place.
 * @returns {{ push: THREE.Vector3, turn: THREE.Vector3 }} split-impulse pseudo velocities
 */
function solveArenaContacts(car, fr, dt, impactVelocity, impactOmega) {
  const push = V();
  const turn = V();
  const transformTurn = V();
  const { size, offset } = car.hitbox;
  const hitboxCenter = car.pos.clone()
    .addScaledVector(fr.f, offset[0])
    .addScaledVector(fr.r, offset[1])
    .addScaledVector(fr.u, offset[2]);
  const contacts = [];
  if (car.captureArenaContacts) car.lastArenaContacts = [];

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const rel = V()
          .addScaledVector(fr.f, offset[0] + (sx * size[0]) / 2)
          .addScaledVector(fr.r, offset[1] + (sy * size[1]) / 2)
          .addScaledVector(fr.u, offset[2] + (sz * size[2]) / 2);
        const p = rel.clone().add(car.pos);
        const n = V();
        let dist = arenaDistance(p.x, p.y, p.z, n, hitboxCenter);
        if (Math.abs(n.z) < RS.CONTACT_FLOOR_NORMAL_Z) {
          const margin = Math.min(2, Math.min(...size) * 0.05);
          rel.addScaledVector(fr.f, -sx * 2)
            .addScaledVector(fr.r, -sy * 2)
            .addScaledVector(fr.u, -sz * 2);
          p.copy(rel).add(car.pos);
          dist = arenaDistance(p.x, p.y, p.z, n, hitboxCenter) - margin;
          rel.addScaledVector(n, -margin);
        }
        const roofContact = n.z === 1 && fr.u.z < 0;
        if (dist >= (n.z === 1 ? 2 : RS.CONTACT_BREAKING_THRESHOLD)) continue;
        const approaching = n.dot(velocityAt(car, rel)) < RS.RESTITUTION_VELOCITY_THRESHOLD;
        if (n.z === 1 || dist < 0 || approaching) contacts.push({ rel, dist, n: n.clone() });
      }
    }
  }
  if (contacts.length === 0 && !RS.EXPERIMENTAL_PERSISTENT_CONTACTS) {
    car.arenaManifold?.clear();
    car.roofManifold?.clear();
    return { push, turn };
  }

  // Merge near-duplicate normals so 8 OBB corners against one plane do not
  // each apply a full bounce. Keep the deepest sample per normal group.
  // On a depth tie (edge flush with a plane), Bullet's manifold is not exactly
  // at a corner or the edge midpoint — the effective single contact that
  // matches RocketSim sits ~75% toward the +local-Y vertex (car right).
  // Picking the opposite corner flips ω.x/ω.z and wrecks ground_flip_forward.
  const DEPTH_TIE = 1e-5;
  /** @type {{ n: THREE.Vector3, dist: number, tied: { rel: THREE.Vector3, dist: number, n: THREE.Vector3 }[] }[]} */
  const groups = [];
  for (const c of contacts) {
    let group = groups.find((g) => g.n.dot(c.n) > 0.95);
    if (!group) {
      group = { n: c.n.clone(), dist: c.dist, tied: [{ rel: c.rel.clone(), dist: c.dist, n: c.n.clone() }] };
      groups.push(group);
    } else if (c.dist < group.dist - DEPTH_TIE) {
      group.dist = c.dist;
      group.n.copy(c.n);
      group.tied = [{ rel: c.rel.clone(), dist: c.dist, n: c.n.clone() }];
    } else if (Math.abs(c.dist - group.dist) <= DEPTH_TIE) {
      group.tied.push({ rel: c.rel.clone(), dist: c.dist, n: c.n.clone() });
      if (c.dist < group.dist) {
        group.dist = c.dist;
        group.n.copy(c.n);
      }
    }
  }
  contacts.length = 0;
  for (const g of groups) {
    if (Math.abs(g.n.z) === 1) {
      const half = size.map(length => f32(nativeLength(length) * 0.5));
      const margin = Math.min(f32(0.04), f32(Math.min(...half) * f32(0.1)));
      const extent = half.map(value => f32(f32(value - f32(0.04)) + margin));
      const cached = translationState.get(car);
      const origin = cached?.published.equals(car.pos) ? cached.origin : nativeVector(car.pos);
      const center = V(...["x", "y", "z"].map(axis => f32(f32(f32(f32(fr.f[axis] * nativeLength(offset[0])) + f32(fr.r[axis] * nativeLength(offset[1]))) + f32(fr.u[axis] * nativeLength(offset[2]))) + origin[axis])));
      const support = [fr.f, fr.r, fr.u].map((basis, index) => (basis.z * g.n.z <= 0 ? 1 : -1) * extent[index]);
      const point = V(...["x", "y", "z"].map(axis => f32(f32(f32(f32(fr.f[axis] * support[0]) + f32(fr.r[axis] * support[1])) + f32(fr.u[axis] * support[2])) + center[axis])));
      const planeHeight = f32(nativeLength(car.pos.z + g.tied[0].rel.z - g.dist / g.n.z));
      const dist = f32(f32(point.z - planeHeight) * g.n.z) * BT_TO_UU;
      const rel = V(...["x", "y", "z"].map(axis => f32(point[axis] - origin[axis]) * BT_TO_UU));
      if (dist < 2) contacts.push({ rel, dist, n: g.n.clone(), face: true });
      continue;
    }
    const mid = V();
    for (const t of g.tied) mid.add(t.rel);
    mid.multiplyScalar(1 / g.tied.length);

    // Face flush with a plane (wall, floor plate): Bullet's manifold is near
    // the patch centre. Collapsing to one offset corner invents spin — most
    // obvious when jumping/driving nose-first into a wall (4 front corners).
    if (g.tied.length >= 3) {
      if (RS.EXPERIMENTAL_PERSISTENT_CONTACTS) {
        const support = V()
          .addScaledVector(fr.f, offset[0] + (fr.f.dot(g.n) <= 0 ? 1 : -1) * size[0] / 2)
          .addScaledVector(fr.r, offset[1] + (fr.r.dot(g.n) <= 0 ? 1 : -1) * size[1] / 2)
          .addScaledVector(fr.u, offset[2] + (fr.u.dot(g.n) <= 0 ? 1 : -1) * size[2] / 2);
        contacts.push({ rel: support, dist: g.dist, n: g.n.clone(), face: true });
        continue;
      }
      contacts.push({
        rel: mid,
        dist: g.dist,
        n: g.n.clone(),
        face: true,
      });
      continue;
    }

    // Prefer the +local-Y (car-right) corner on edge ties — not world Y.
    let preferred = g.tied[0];
    let preferredRight = preferred.rel.dot(fr.r);
    for (const t of g.tied) {
      const right = t.rel.dot(fr.r);
      if (right > preferredRight) {
        preferred = t;
        preferredRight = right;
      }
    }
    if (g.tied.length === 1 || RS.CONTACT_EDGE_CORNER_BLEND >= 1 - 1e-9) {
      contacts.push({
        rel: preferred.rel.clone(),
        dist: g.dist,
        n: g.n.clone(),
        face: false,
      });
      continue;
    }
    contacts.push({
      rel: mid.lerp(preferred.rel, RS.CONTACT_EDGE_CORNER_BLEND),
      dist: g.dist,
      n: g.n.clone(),
      face: false,
    });
  }

  if (contacts.some(contact => Math.abs(contact.n.z) < 0.9999)) {
    const center = car.pos.clone().addScaledVector(fr.f, offset[0])
      .addScaledVector(fr.r, offset[1]).addScaledVector(fr.u, offset[2]);
    const margin = Math.min(2, Math.min(...size) * 0.05);
    const gaps = boxTriangleGapContacts(center, [fr.f, fr.r, fr.u], size.map(length => length / 2 - 2), margin, 2, true);
    for (let index = contacts.length - 1; index >= 0; index--) {
      if (gaps.some(contact => (contact.distance < 0 || Math.abs(contact.normal.z) >= RS.CONTACT_FLOOR_NORMAL_Z) && contact.normal.dot(contacts[index].n) > 0.9999)) contacts.splice(index, 1);
    }
    contacts.unshift(...gaps.map(contact => ({ rel: contact.point.clone().sub(car.pos), n: contact.normal, dist: contact.distance, face: true })));
  }
  if (contacts.length === 0) return { push, turn };
  // Inset impulse points so the lever arm matches Bullet's manifold, not the
  // geometric outer corner (which over-kicks linear bounce on edge scrapes).
  // Skip for face contacts and steep walls — those should bounce through the
  // patch centre like RocketSim/Bullet.
  const nInset = RS.CONTACT_NORMAL_INSET_UU;
  const cInset = RS.CONTACT_CORNER_INSET_UU;
  if (nInset > 0 || cInset > 0) {
    for (const c of contacts) {
      if (c.face || Math.abs(c.n.z) < RS.CONTACT_FLOOR_NORMAL_Z) continue;
      if (nInset > 0) c.rel.addScaledVector(c.n, nInset);
      if (cInset > 0) {
        // Pull toward hitbox centre in car frame (rel is world offset from COM).
        const local = V(c.rel.dot(fr.f), c.rel.dot(fr.r), c.rel.dot(fr.u));
        const sx = Math.sign(local.x) || 1;
        const sy = Math.sign(local.y) || 1;
        const sz = Math.sign(local.z) || 1;
        c.rel
          .addScaledVector(fr.f, -sx * cInset)
          .addScaledVector(fr.r, -sy * cInset)
          .addScaledVector(fr.u, -sz * cInset);
      }
    }
  }

  if (fr.u.z < -0.9 && contacts.some(contact => contact.n.z === 1)) {
    car.roofManifold ??= new ContactManifold(RS.CONTACT_BREAKING_THRESHOLD, 0);
    const roofContacts = contacts.filter(contact => contact.n.z === 1);
    car.roofManifold.clear();
    const refreshed = car.roofManifold.update(car.pos, car.q, roofContacts);
    contacts.splice(0, contacts.length, ...contacts.filter(contact => contact.n.z !== 1), ...refreshed);
  } else {
    car.roofManifold?.clear();
  }

  if (RS.EXPERIMENTAL_PERSISTENT_CONTACTS) {
    car.arenaManifold ??= new ContactManifold(RS.CONTACT_BREAKING_THRESHOLD);
    const refreshed = car.arenaManifold.update(car.pos, car.q, contacts);
    contacts.splice(0, contacts.length, ...refreshed);
  }

  if (contacts.length === 0) {
    car.arenaManifold?.clear();
    return { push, turn };
  }

  let deepest = contacts[0];
  for (const c of contacts) if (c.dist < deepest.dist) deepest = c;
  car.worldContact.hasContact = true;
  car.worldContact.normal.copy(deepest.n);

  if (contacts.every(contact => Math.abs(contact.n.z) === 1) && !RS.EXPERIMENTAL_PERSISTENT_CONTACTS) {
    const linear = nativeVelocity(car).value.clone();
    const angular = car.omega.clone();
    const deltaLinear = V(), deltaAngular = V(), pushNative = V(), turnNative = V();
    const simdDot = (first, second) => f32(f32(first.x * second.x) + f32(f32(first.y * second.y) + f32(first.z * second.z)));
    const addScaled = (total, direction, scale) => {
      for (const axis of ["x", "y", "z"]) total[axis] = f32(total[axis] + f32(direction[axis] * scale));
    };
    const row = (direction, rel, velocity, spin, target = 0) => {
      const cross = nativeCross(rel, direction);
      const component = invInertiaMul(car, fr, cross, true);
      const inverse = f32(1 / f32(f32(INV_MASS) + nativeDot(direction, nativeCross(component, rel))));
      const speed = f32(nativeDot(direction, velocity) + nativeDot(cross, spin));
      return { direction, cross, component, inverse, rhs: f32(f32(target - speed) * inverse), impulse: 0 };
    };
    for (const contact of contacts) {
      const rel = nativeVector(contact.rel);
      const before = nativeCross(impactOmega, rel).add(nativeVector(impactVelocity));
      for (const axis of ["x", "y", "z"]) before[axis] = f32(before[axis]);
      const speed = nativeDot(contact.n, before);
      const restitution = speed < -nativeLength(RS.RESTITUTION_VELOCITY_THRESHOLD) ? f32(-speed * f32(RS.CARWORLD_RESTITUTION)) : 0;
      contact.nativeNormal = row(contact.n, rel, linear, angular, restitution);
      const pointVelocity = nativeCross(angular, rel);
      for (const axis of ["x", "y", "z"]) pointVelocity[axis] = f32(pointVelocity[axis] + linear[axis]);
      const normalSpeed = nativeDot(contact.n, pointVelocity);
      const tangent = V(...["x", "y", "z"].map(axis => f32(pointVelocity[axis] - f32(contact.n[axis] * normalSpeed))));
      const squared = nativeDot(tangent, tangent);
      if (squared > f32(1.1920928955078125e-7)) {
        const inverse = f32(1 / f32(Math.sqrt(squared)));
        for (const axis of ["x", "y", "z"]) tangent[axis] = f32(tangent[axis] * inverse);
      } else tangent.copy(perpendicular(contact.n));
      contact.nativeFriction = row(tangent, rel, linear, impactOmega);
      const penetration = Math.min(0, nativeLength(contact.dist));
      contact.nativePush = { ...contact.nativeNormal, rhs: f32(f32(f32(-penetration * f32(RS.SOLVER_ERP2)) * f32(1 / f32(dt))) * contact.nativeNormal.inverse), impulse: 0 };
    }
    const solve = (constraint, velocity, spin, lower, upper) => {
      const speed = f32(simdDot(constraint.direction, velocity) + simdDot(constraint.cross, spin));
      let impulse = f32(constraint.rhs - f32(speed * constraint.inverse));
      const total = f32(constraint.impulse + impulse);
      const applied = clamp(total, lower, upper);
      if (applied !== total) impulse = f32(applied - constraint.impulse);
      constraint.impulse = applied;
      const component = V(...["x", "y", "z"].map(axis => f32(constraint.direction[axis] * f32(INV_MASS))));
      addScaled(velocity, component, impulse);
      addScaled(spin, constraint.component, impulse);
    };
    for (let iteration = 0; iteration < RS.SOLVER_ITERATIONS; iteration++) {
      for (const contact of contacts) solve(contact.nativeNormal, deltaLinear, deltaAngular, 0, Infinity);
      for (const contact of contacts) {
        const limit = f32(f32(RS.CARWORLD_FRICTION) * contact.nativeNormal.impulse);
        solve(contact.nativeFriction, deltaLinear, deltaAngular, -limit, limit);
      }
      for (const contact of contacts) if (contact.nativePush.rhs !== 0) solve(contact.nativePush, pushNative, turnNative, 0, Infinity);
    }
    const state = nativeVelocity(car);
    for (const axis of ["x", "y", "z"]) {
      state.value[axis] = f32(linear[axis] + deltaLinear[axis]);
      car.omega[axis] = f32(angular[axis] + deltaAngular[axis]);
      push[axis] = pushNative[axis] * BT_TO_UU;
      transformTurn[axis] = f32(turnNative[axis] * f32(0.1));
    }
    publishVelocity(car, state);
    if (car.captureArenaContacts) car.lastArenaContacts = contacts.map(contact => ({
      point: contact.rel.clone().add(car.pos).toArray(), normal: contact.n.toArray(), distance: contact.dist,
      normalImpulse: contact.nativeNormal.impulse * BT_TO_UU, frictionImpulse: contact.nativeFriction.impulse * BT_TO_UU,
    }));
    return { push, turn: transformTurn };
  }

  const externalAngularImpulse = car.omega.clone().sub(impactOmega);
  for (const c of contacts) {
    const vel = Math.abs(c.n.z) === 1
      ? impactOmega.clone().cross(c.rel).add(impactVelocity)
      : velocityAt(car, c.rel);
    const vn = c.n.dot(vel);
    // Desired normal speed after the impulse (Bullet restitutionCurve).
    // Do NOT bias by positive clearance — that attracts the body into the surface.
    const restitution =
      vn >= -RS.RESTITUTION_VELOCITY_THRESHOLD
        ? 0
        : RS.CARWORLD_RESTITUTION * -vn;
    c.target = restitution;
    c.k = impulseDenominator(car, fr, c.rel, c.n);
    const frictionVelocity = velocityAt(car, c.rel);
    const tangentVel = frictionVelocity.addScaledVector(c.n, -c.n.dot(frictionVelocity));
    c.t = tangentVel.lengthSq() > 1e-12 ? tangentVel.normalize() : perpendicular(c.n);
    c.kt = impulseDenominator(car, fr, c.rel, c.t);
    c.frictionTorqueVelocity = c.t.dot(externalAngularImpulse.clone().cross(c.rel));
    c.normalImpulse = c.cachedNormalImpulse ?? 0;
    const frictionLimit = RS.CARWORLD_FRICTION * c.normalImpulse;
    c.frictionImpulse = clamp(c.cachedFriction?.dot(c.t) ?? 0, -frictionLimit, frictionLimit);
    c.pushImpulse = 0;
  }

  if (RS.EXPERIMENTAL_PERSISTENT_CONTACTS) {
    for (const contact of contacts) {
      const impulse = contact.n.clone().multiplyScalar(contact.normalImpulse)
        .addScaledVector(contact.t, contact.frictionImpulse);
      applyImpulse(car, fr, impulse, contact.rel);
    }
  }

  for (let iter = 0; iter < RS.SOLVER_ITERATIONS; iter++) {
    for (const c of contacts) {
      const vn = c.n.dot(velocityAt(car, c.rel));
      const total = Math.max(0, c.normalImpulse + (c.target - vn) / c.k);
      const delta = total - c.normalImpulse;
      c.normalImpulse = total;
      if (delta !== 0) applyImpulse(car, fr, c.n.clone().multiplyScalar(delta), c.rel);
    }
    for (const c of contacts) {
      const vt = c.t.dot(velocityAt(car, c.rel)) - c.frictionTorqueVelocity;
      const limit = RS.CARWORLD_FRICTION * c.normalImpulse;
      const total = clamp(c.frictionImpulse - vt / c.kt, -limit, limit);
      const delta = total - c.frictionImpulse;
      c.frictionImpulse = total;
      if (delta !== 0) applyImpulse(car, fr, c.t.clone().multiplyScalar(delta), c.rel);
    }
  }

  const penetrating = contacts.filter((c) => c.dist < 0);
  if (car.captureArenaContacts) {
    car.lastArenaContacts = contacts.map(contact => ({
      point: contact.rel.clone().add(car.pos).toArray(),
      normal: contact.n.toArray(),
      distance: contact.dist,
      normalImpulse: contact.normalImpulse,
      frictionImpulse: contact.frictionImpulse,
    }));
  }
  for (let iter = 0; iter < RS.SOLVER_ITERATIONS && penetrating.length; iter++) {
    for (const c of penetrating) {
      const vn = c.n.dot(turn.clone().cross(c.rel).add(push));
      const target = (-c.dist * RS.SOLVER_ERP2) / dt;
      const total = Math.max(0, c.pushImpulse + (target - vn) / c.k);
      const delta = total - c.pushImpulse;
      c.pushImpulse = total;
      if (delta === 0) continue;
      const impulse = c.n.clone().multiplyScalar(delta);
      push.addScaledVector(impulse, INV_MASS);
      const angularImpulse = invInertiaMul(car, fr, c.rel.clone().cross(impulse));
      turn.add(angularImpulse);
      transformTurn.addScaledVector(angularImpulse, 0.1);
    }
  }
  if (RS.EXPERIMENTAL_PERSISTENT_CONTACTS) car.arenaManifold.store(car.pos, car.q, contacts);
  if (car.roofManifold) car.roofManifold.store(car.pos, car.q, contacts.filter(contact => contact.n.z === 1));
  return { push, turn: transformTurn };
}

/** btTransformUtil::integrateTransform orientation part. */
function integrateOrientation(q, omega, dt) {
  const state = nativeOrientation(q);
  const components = [omega.x, omega.y, omega.z].map(f32);
  const squared = components.map(value => f32(value * value));
  const lengthSquared = f32(f32(squared[0] + squared[1]) + squared[2]);
  let speed = lengthSquared > 1.1920928955078125e-7 ? f32(Math.sqrt(lengthSquared)) : 0;
  const step = f32(dt);
  if (f32(speed * step) > Math.PI / 4) speed = f32(f32(Math.PI / 4) / step);
  const halfAngle = f32(f32(f32(0.5 * speed) * step));
  const factor = speed < 0.001
    ? f32(f32(0.5 * step) - f32(f32(f32(f32(f32(step * step) * step) * f32(1 / 48)) * speed) * speed))
    : f32(f32(Math.sin(halfAngle)) / speed);
  const delta = new THREE.Quaternion(...components.map(value => f32(value * factor)), f32(Math.cos(f32(f32(speed * step) * 0.5))));
  const original = quaternionFromBasis(state.basis);
  const product = (first, second) => f32(first * second);
  const sum = (first, second, third, fourth) => f32(f32(first + fourth) + f32(second + third));
  q.set(
    sum(product(delta.w, original.x), product(delta.x, original.w), product(delta.y, original.z), -product(delta.z, original.y)),
    sum(product(delta.w, original.y), product(delta.y, original.w), product(delta.z, original.x), -product(delta.x, original.z)),
    sum(product(delta.w, original.z), product(delta.z, original.w), product(delta.x, original.y), -product(delta.y, original.x)),
    sum(product(delta.w, original.w), -product(delta.x, original.x), -product(delta.y, original.y), -product(delta.z, original.z)),
  );
  const normSquares = [q.x, q.y, q.z, q.w].map(value => f32(value * value));
  const inverseLength = f32(1 / f32(Math.sqrt(f32(f32(normSquares[0] + normSquares[2]) + f32(normSquares[1] + normSquares[3])))));
  q.set(...[q.x, q.y, q.z, q.w].map(value => f32(value * inverseLength)));
  state.basis = basisFromQuaternion(q);
  state.published.copy(q);
}

/**
 * One RocketSim car tick (120 Hz).
 * controls: `{ throttle, steer, pitch, yaw, roll, boost, jump, handbrake | powerslide }`
 * @param {SimCar} car
 * @param {object} controls
 * @param {number} [dt]
 */
export function stepCar(car, controls, dt = RL.DT, beforeTransform) {
  const c = sanitizeControls(controls);
  const fr = carFrame(car);
  const accel = V();
  const angAccel = V();

  const previousJumpContact = car.physicsProfile === "native" && car.hasJumped && car.wheels.some(wheel => wheel.inContact)
    ? upwardsDirFromWheelContacts(car, fr) : null;
  vehicleFirst(car, fr, dt);
  wheelSolverTime.set(car, dt);

  const jumpPressed = c.jump && !car.prevJump;
  let numWheels = 0;
  for (const wheel of car.wheels) if (wheel.inContact) numWheels++;
  car.numWheelsInContact = numWheels;
  car.onGround = numWheels >= 3;
  car.wheelsContact = numWheels > 0;
  car.contactNormal.copy(upwardsDirFromWheelContacts(car, fr));

  const forwardSpeed = f32(nativeDot(nativeVelocity(car).value, fr.f) * BT_TO_UU);
  updateWheels(car, fr, c, numWheels, forwardSpeed, dt, accel, previousJumpContact);

  const wasFlipping = car.isFlipping;
  const angularBeforeAir = angAccel.clone();
  if (numWheels < 3) updateAirTorque(car, fr, c, numWheels === 0, accel, angAccel);
  else car.isFlipping = false;

  updateJump(car, fr, c, jumpPressed, dt, accel);
  updateAutoFlip(car, fr, jumpPressed, dt);
  updateDoubleJumpOrFlip(car, fr, c, jumpPressed, forwardSpeed, dt);
  if (car.physicsProfile === "native" && !wasFlipping && car.isFlipping && numWheels === 0) {
    const flipTime = car.flipTime;
    car.flipTime = 0;
    angAccel.copy(angularBeforeAir);
    updateAirTorque(car, fr, c, true, V(), angAccel);
    car.flipTime = flipTime;
  }

  if (c.throttle && ((numWheels > 0 && numWheels < 4) || car.worldContact.hasContact)) {
    updateAutoRoll(car, fr, numWheels, accel, angAccel);
  }
  car.worldContact.hasContact = false;

  vehicleSecond(car, fr, dt, car.physicsProfile === "native" && jumpPressed && car.jumping && car.onGround,
    car.physicsProfile === "native" && car.onGround && !c.handbrake && !c.boost &&
    ((Math.abs(c.throttle) >= RS.THROTTLE_DEADZONE && c.throttle * car.vel.dot(fr.f) < 0) || car.contactNormal.z === 0));
  updateBoost(car, fr, c, dt, accel);

  // Bullet step: integrate forces, solve contacts, integrate transform.
  const impactVelocity = car.vel.clone().add(car.velocityImpulseCache);
  const impactOmega = car.omega.clone();
  integrateVelocity(car, accel, dt);
  // RocketSim applies `_velocityImpulseCache` (bumps) before the world step.
  if (car.velocityImpulseCache.lengthSq() > 0) {
    car.vel.add(car.velocityImpulseCache);
    car.velocityImpulseCache.set(0, 0, 0);
  }
  const angularAcceleration = invInertiaMul(car, fr, angAccel, true);
  for (const axis of ["x", "y", "z"]) car.omega[axis] = f32(f32(car.omega[axis]) + f32(angularAcceleration[axis] * f32(dt)));
  const { push, turn } = car.arenaCollisions ? solveArenaContacts(car, fr, dt, impactVelocity, impactOmega) : { push: V(), turn: V() };
  beforeTransform?.(impactVelocity, impactOmega);
  if (car.contactTurn?.lengthSq() > 0) {
    integrateOrientation(car.q, car.contactTurn, 1);
    car.contactTurn.set(0, 0, 0);
  }
  integratePosition(car, push, dt);
  if (push.lengthSq() > 0 || turn.lengthSq() > 0) integrateOrientation(car.q, turn, dt);
  integrateOrientation(car.q, car.omega, dt);

  updateSupersonic(car, dt);
  car.prevJump = c.jump;
  car.lastControls = { ...c };
  if (car.carContact.cooldownTimer > 0) {
    car.carContact.cooldownTimer = Math.max(0, car.carContact.cooldownTimer - dt);
  }
  if (car.isDemoed) {
    car.demoRespawnTimer = Math.max(0, car.demoRespawnTimer - dt);
  }

  if (car.vel.length() > RL.MAX_SPEED) car.vel.setLength(RL.MAX_SPEED);
  if (car.omega.length() > RL.MAX_ANG_VEL) car.omega.setLength(RL.MAX_ANG_VEL);
}

/** Coupled Free Play tick: solve contact at the old transforms, integrate with
 * engine impulses, then apply the separate ball-only extra velocity cache. */
export function stepCarBall(car, ball, controls, tick, dt = RL.DT) {
  ball.physicsProfile = car.physicsProfile;
  synchronizeBallBulletState(ball);
  let finishBall;
  let contact;
  if (car.physicsProfile === "native" && ball.extraVelocityCache) {
    ball.vel.add(ball.extraVelocityCache);
    ball.extraVelocityCache.set(0, 0, 0);
  }
  const input = sanitizeControls(controls);
  const nativeReverseHit = car.physicsProfile === "native" && car.onGround && !input.handbrake && !input.boost &&
    Math.abs(input.throttle) >= RS.THROTTLE_DEADZONE && input.throttle * car.vel.dot(carFrame(car).f) < 0;
  const nativeRestingHit = car.physicsProfile === "native" && car.onGround && !input.jump && !input.handbrake && !input.boost &&
    Math.abs(input.throttle) < RS.THROTTLE_DEADZONE && car.vel.length() < RS.STOPPING_FORWARD_VEL;
  const nativeWallHit = car.physicsProfile === "native" && car.onGround && car.contactNormal.z === 0;
  const nativeHitVelocity = nativeReverseHit || nativeRestingHit || nativeWallHit ? car.vel.clone() : null;
  stepCar(car, controls, dt, (impactVelocity, impactOmega) => {
    const contactVelocity = ball.vel.clone().multiplyScalar(Math.pow(1 - RL.BALL_DRAG, dt)).sub(nativeHitVelocity ?? impactVelocity);
    finishBall = stepBall(ball, dt, { arena: car.arenaCollisions, deferTransform: true, deferContacts: true });
    let contactsSolved = false;
    const frame = carFrame(car), translation = translationState.get(car);
    const bulletTransform = {
      basis: [frame.f, frame.r, frame.u],
      origin: translation?.published.equals(car.pos) ? translation.origin : nativeVector(car.pos),
    };
    contact = collideCarBall(car, ball, tick, { deferred: true, bulletTransform, contactVelocity, externalAngularImpulse: car.omega.clone().sub(impactOmega), solveBallArena: phase => {
      contactsSolved = true;
      finishBall.solveContacts(phase);
    } });
    if (!contactsSolved) {
      if (!contact && car.physicsProfile === "rocketsim") finishBall.solveIndependentContacts();
      else for (let iteration = 0; iteration < 10; iteration++) finishBall.solveContacts();
    }
  });
  if (car.physicsProfile === "native" && car.onGround && car.contactNormal.z === 0 && ball.extraVelocityCache) {
    const pendingExtraVelocity = ball.extraVelocityCache.clone();
    ball.extraVelocityCache.set(0, 0, 0);
    finishBall();
    ball.extraVelocityCache.copy(pendingExtraVelocity);
  } else finishBall();
  return contact;
}

/**
 * Separating-axis test for two car hitbox OBBs (uu, Z-up).
 * @param {ReturnType<typeof carHitbox>} a
 * @param {ReturnType<typeof carHitbox>} b
 */
function obbOverlap(a, b) {
  const axesList = [a.f, a.l, a.u, b.f, b.l, b.u];
  const d = b.center.clone().sub(a.center);
  for (const axis of axesList) {
    if (Math.abs(d.dot(axis)) > hitboxExtentOnAxis(a, axis) + hitboxExtentOnAxis(b, axis)) {
      return false;
    }
  }
  return true;
}

/**
 * RocketSim `Arena::_BtCallback_OnCarCarCollision` bump / demo logic.
 * Bullet already resolves penetration; this applies the Psyonix bumper impulse
 * (or demolish) when the contact is on the forward bumper.
 *
 * @param {SimCar} car1 bumper car (attacker)
 * @param {SimCar} car2 victim
 * @param {{
 *   demoMode?: "normal" | "on_contact" | "disabled",
 *   enableTeamDemos?: boolean,
 *   bumpForceScale?: number,
 *   respawnDelay?: number,
 * }} [opts]
 * @returns {null | { demo: boolean, bumperId: number, victimId: number }}
 */
/**
 * SAT penetration depth + axis for two car OBBs.
 * @returns {{ depth: number, axis: THREE.Vector3 } | null}
 */
function obbPenetration(a, b) {
  const axesList = [a.f, a.l, a.u, b.f, b.l, b.u];
  const d = b.center.clone().sub(a.center);
  let minDepth = Infinity;
  let minAxis = axesList[0];
  for (const axis of axesList) {
    const n = axis.clone();
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    const extent =
      hitboxExtentOnAxis(a, n) + hitboxExtentOnAxis(b, n) - Math.abs(d.dot(n));
    if (extent <= 0) return null;
    if (extent < minDepth) {
      minDepth = extent;
      minAxis = n.multiplyScalar(d.dot(n) < 0 ? -1 : 1);
    }
  }
  return { depth: minDepth, axis: minAxis.clone() };
}

export function collideCarCar(car1, car2, opts = {}) {
  if (car1.isDemoed || car2.isDemoed) return null;
  const hb1 = carHitbox(car1);
  const hb2 = carHitbox(car2);
  if (!obbOverlap(hb1, hb2)) return null;

  // Bullet-style separation + CARCAR impulse (RocketSim resolves penetration
  // in the world step before the Psyonix bump/demo callback).
  const pen = obbPenetration(hb1, hb2);
  if (pen && pen.depth > 0) {
    const n = pen.axis;
    const share = 0.5;
    car1.pos.addScaledVector(n, -pen.depth * share);
    car2.pos.addScaledVector(n, pen.depth * share);
    const relN = car2.vel.clone().sub(car1.vel).dot(n);
    if (relN < 0) {
      const invSum = 2 / CAR_MASS;
      const J = (-(1 + RL.CARCAR_RESTITUTION) * relN) / invSum;
      car1.vel.addScaledVector(n, -J / CAR_MASS);
      car2.vel.addScaledVector(n, J / CAR_MASS);
      const rel = car2.vel.clone().sub(car1.vel);
      const vt = rel.addScaledVector(n, -rel.dot(n));
      const vtLen = vt.length();
      if (vtLen > 1e-6) {
        const maxJf = RL.CARCAR_FRICTION * Math.abs(J);
        const jfMag = Math.min(vtLen / invSum, maxJf);
        const jf = vt.multiplyScalar(-jfMag / vtLen);
        car1.vel.addScaledVector(jf, -1 / CAR_MASS);
        car2.vel.addScaledVector(jf, 1 / CAR_MASS);
      }
    }
  }

  const demoMode = opts.demoMode ?? "normal";
  const enableTeamDemos = opts.enableTeamDemos ?? false;
  const bumpForceScale = opts.bumpForceScale ?? RL.BUMP_FORCE_SCALE;
  const respawnDelay = opts.respawnDelay ?? RL.DEMO_RESPAWN_TIME;

  /** @type {null | { demo: boolean, bumperId: number, victimId: number }} */
  let event = null;

  // Test collision both ways (RocketSim loop i = 0..1 with swap).
  for (let pass = 0; pass < 2; pass++) {
    const bumper = pass === 0 ? car1 : car2;
    const victim = pass === 0 ? car2 : car1;
    const bumperHb = pass === 0 ? hb1 : hb2;
    const victimHb = pass === 0 ? hb2 : hb1;

    if (
      bumper.carContact.otherCarId === victim.id &&
      bumper.carContact.cooldownTimer > 0
    ) {
      continue;
    }

    const deltaPos = victim.pos.clone().sub(bumper.pos);
    if (bumper.vel.dot(deltaPos) <= 0) continue;

    const speed = bumper.vel.length();
    if (speed < 1e-6) continue;
    const velDir = bumper.vel.clone().multiplyScalar(1 / speed);
    const dirToOther = deltaPos.clone();
    if (dirToOther.lengthSq() < 1e-8) continue;
    dirToOther.normalize();

    const speedTowards = bumper.vel.dot(dirToOther);
    const otherAway = victim.vel.dot(velDir);
    if (speedTowards <= otherAway) continue;

    // Approximate manifold local-X: closest point on bumper OBB to victim
    // centre, expressed along bumper forward (RocketSim bumper threshold).
    const toVictim = victimHb.center.clone().sub(bumper.pos);
    const localX = clamp(
      toVictim.dot(bumperHb.f),
      bumperHb.preset.offset[0] - bumperHb.half[0],
      bumperHb.preset.offset[0] + bumperHb.half[0],
    );
    if (localX <= RL.BUMP_MIN_FORWARD_DIST) continue;

    let isDemo = false;
    if (demoMode === "on_contact") isDemo = true;
    else if (demoMode === "disabled") isDemo = false;
    else isDemo = bumper.isSupersonic;

    if (isDemo && !enableTeamDemos && bumper.team === victim.team) {
      isDemo = false;
    }

    if (isDemo) {
      victim.isDemoed = true;
      victim.demoRespawnTimer = respawnDelay;
      victim.vel.set(0, 0, 0);
      victim.omega.set(0, 0, 0);
    } else {
      const groundHit = victim.onGround;
      const baseScale = (
        groundHit ? RS_CURVES.bumpVelGround : RS_CURVES.bumpVelAir
      )(speedTowards);
      const hitUp = groundHit
        ? axes(victim.q).u.clone()
        : V(0, 0, 1);
      const bumpImpulse = velDir
        .clone()
        .multiplyScalar(baseScale)
        .addScaledVector(
          hitUp,
          RS_CURVES.bumpVelUp(speedTowards) * bumpForceScale,
        );
      victim.velocityImpulseCache.add(bumpImpulse);
    }

    bumper.carContact.otherCarId = victim.id;
    bumper.carContact.cooldownTimer = RL.BUMP_COOLDOWN_TIME;
    event = { demo: isDemo, bumperId: bumper.id, victimId: victim.id };
  }

  return event;
}

/* ------------------------------ world step ------------------------------ */

export function makeWorld() {
  return { car: makeCar(), ball: makeBall(), tick: 0, time: 0, events: [] };
}

export function stepWorld(w, controls) {
  w.events.length = 0;
  stepCar(w.car, controls);
  stepBall(w.ball);
  const hit = collideCarBall(w.car, w.ball, w.tick);
  if (hit) w.events.push({ type: "touch", ...hit, time: w.time });
  w.tick++;
  w.time += RL.DT;
}

/** Fixed-step driver: call every animation frame with real elapsed seconds. */
export function advance(w, getControls, elapsed, acc = { t: 0 }) {
  acc.t += Math.min(elapsed, 0.1);
  while (acc.t >= RL.DT) {
    stepWorld(w, getControls());
    acc.t -= RL.DT;
  }
  return acc;
}
