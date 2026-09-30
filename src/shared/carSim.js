import * as THREE from "three";
import { ContactManifold } from "./contactManifold.js";
import { arenaDistance, arenaNormal, raycastArena } from "./arenaMesh.js";
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
} from "./rl-physics.js";

/* =====================================================================
 *  Car simulation — a port of RocketSim's Car + btVehicleRL tick
 *  (ZealanL/RocketSim, MIT: src/Sim/Car/Car.cpp, src/Sim/btVehicleRL).
 *
 *  Everything runs in uu with the RocketSim constants unchanged: every
 *  Bullet-unit formula in btVehicleRL is linear in length, so converting
 *  uu↔BT (÷50) cancels out. Frame: X forward, Y right, Z up.
 *
 *  Tick order matches Car::_PreTickUpdate → btDiscreteDynamicsWorld step →
 *  Car::_PostTickUpdate / _FinishPhysicsTick.
 * ===================================================================== */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const CAR_MASS = RL.CAR_MASS;
const INV_MASS = 1 / CAR_MASS;
const BT_TO_UU = 50;

/** RocketSim `LinearPieceCurve::GetOutput` (clamped piecewise-linear). */
function linearPieceCurve(points, defaultOutput = 1) {
  return (input) => {
    if (points.length === 0) return defaultOutput;
    if (input <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] > input) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        return y0 + ((y1 - y0) * (input - x0)) / (x1 - x0);
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
    const restLength = cfg.suspensionRest - RS.MAX_SUSPENSION_TRAVEL;
    wheels.push({
      front,
      left,
      radius: cfg.radius,
      restLength,
      connection: V(cfg.offset[0], left ? -cfg.offset[1] : cfg.offset[1], cfg.offset[2]),
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
  const [lx, ly, lz] = hitbox.size;
  return {
    pos: spawn,
    vel: V(),
    /** World angular velocity (rad/s). */
    omega: V(),
    q: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), yaw),
    boost: RL.BOOST_SPAWN,
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
    worldContact: { hasContact: false, normal: V(0, 0, 1) },
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
  const { f, l, u } = axes(car.q);
  return { f, r: l, u };
}

/**
 * World inverse inertia × v.
 * @param {SimCar} car
 * @param {{ f: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3 }} fr
 * @param {THREE.Vector3} v
 */
function invInertiaMul(car, fr, v) {
  const I = car.invInertiaLocal;
  return V()
    .addScaledVector(fr.f, v.dot(fr.f) * I.x)
    .addScaledVector(fr.r, v.dot(fr.r) * I.y)
    .addScaledVector(fr.u, v.dot(fr.u) * I.z);
}

/** @param {SimCar} car @param {THREE.Vector3} rel offset from the centre of mass */
function velocityAt(car, rel) {
  return car.omega.clone().cross(rel).add(car.vel);
}

/** Bullet `computeImpulseDenominator` against a static body. */
function impulseDenominator(car, fr, rel, dir) {
  const c = rel.clone().cross(dir);
  return INV_MASS + c.dot(invInertiaMul(car, fr, c));
}

/** @param {SimCar} car */
function applyImpulse(car, fr, impulse, rel) {
  car.vel.addScaledVector(impulse, INV_MASS);
  car.omega.add(invInertiaMul(car, fr, rel.clone().cross(impulse)));
}

/** Bullet `resolveSingleCollision` with applyImpulses = false, restitution 0. */
function resolveSingleCollision(car, fr, point, normal, distance, dt) {
  const rel = point.clone().sub(car.pos);
  const relVel = normal.dot(velocityAt(car, rel));
  const positionalError = (RS.SOLVER_ERP * -distance) / dt;
  const velocityError = -relVel;
  const impulse =
    (positionalError + velocityError) / impulseDenominator(car, fr, rel, normal);
  return Math.max(0, impulse);
}

/* ------------------------------ btVehicleRL ------------------------------ */

function updateWheelTransform(car, fr, wheel) {
  const c = wheel.connection;
  wheel.hardPoint
    .copy(car.pos)
    .addScaledVector(fr.f, c.x)
    .addScaledVector(fr.r, c.y)
    .addScaledVector(fr.u, c.z);
  wheel.axle.copy(fr.r).applyAxisAngle(fr.u, wheel.steerAngle);
}

function rayCastWheel(car, fr, wheel, numWheels, dt) {
  const travel = RS.MAX_SUSPENSION_TRAVEL;
  const rayLength =
    wheel.restLength + travel + wheel.radius - RS.SUSPENSION_SUBTRACTION;
  const down = fr.u.clone().negate();
  const hit = car.arenaCollisions ? raycastArena(wheel.hardPoint, down, rayLength) : null;

  if (!hit) {
    wheel.inContact = false;
    wheel.contactPoint.copy(wheel.hardPoint).addScaledVector(down, rayLength);
    wheel.suspensionLength = wheel.restLength + travel;
    wheel.suspensionRelVel = 0;
    wheel.contactNormal.copy(fr.u);
    wheel.clippedInvContactDotSuspension = 1;
    wheel.extraPushback = 0;
    return;
  }

  wheel.inContact = true;
  wheel.contactPoint.copy(hit.point);
  wheel.contactNormal.copy(hit.normal);

  const traceLen = wheel.hardPoint.clone().sub(wheel.contactPoint).dot(fr.u);
  wheel.suspensionLength = clamp(
    traceLen - wheel.radius,
    wheel.restLength - travel,
    wheel.restLength + travel,
  );

  const denominator = wheel.contactNormal.dot(fr.u);
  const rel = wheel.contactPoint.clone().sub(car.pos);
  const projVel = wheel.contactNormal.dot(velocityAt(car, rel));
  if (denominator > 0.1) {
    const inv = 1 / denominator;
    wheel.suspensionRelVel = projVel * inv;
    wheel.clippedInvContactDotSuspension = inv;
  } else {
    wheel.suspensionRelVel = 0;
    wheel.clippedInvContactDotSuspension = 10;
  }

  // RocketSim keeps the previous pushback while in contact above the threshold.
  const pushbackThresh = wheel.restLength + wheel.radius - RS.SUSPENSION_SUBTRACTION;
  if (traceLen < pushbackThresh) {
    const impulse = resolveSingleCollision(
      car,
      fr,
      wheel.contactPoint,
      wheel.contactNormal,
      traceLen - pushbackThresh,
      dt,
    );
    wheel.extraPushback = impulse / numWheels;
  }
}

function calcFrictionImpulses(car, fr, dt) {
  const frictionScale = CAR_MASS / 3;
  for (const wheel of car.wheels) {
    if (!wheel.inContact) {
      wheel.impulse.set(0, 0, 0);
      continue;
    }
    const n = wheel.contactNormal;
    const axleDir = wheel.axle.clone().addScaledVector(n, -wheel.axle.dot(n));
    if (axleDir.lengthSq() > 1e-12) axleDir.normalize();
    // btVehicleRL's "forward" is n × axle, which points backwards.
    const forwardDir = n.clone().cross(axleDir);
    if (forwardDir.lengthSq() > 1e-12) forwardDir.normalize();

    const rel = wheel.contactPoint.clone().sub(car.pos);
    const contactVel = velocityAt(car, rel);
    const sideImpulse =
      (-RS.SIDE_FRICTION_DAMPING * axleDir.dot(contactVel)) /
      impulseDenominator(car, fr, rel, axleDir);

    let rollingFriction = 0;
    if (wheel.engineForce === 0) {
      if (wheel.brake) {
        let relVel = contactVel.dot(forwardDir);
        if (dt > 1 / 80) {
          const threshold = -(1 / (dt * 150)) + 0.8;
          if (Math.abs(relVel) < threshold) relVel = 0;
        }
        rollingFriction = clamp(
          -relVel * RS.ROLLING_FRICTION_SCALE_MAGIC,
          -wheel.brake,
          wheel.brake,
        );
      }
    } else {
      rollingFriction = -wheel.engineForce / frictionScale;
    }

    wheel.impulse
      .copy(forwardDir)
      .multiplyScalar(rollingFriction * wheel.longFriction)
      .addScaledVector(axleDir, sideImpulse * wheel.latFriction)
      .multiplyScalar(frictionScale);
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
    const spring =
      (wheel.restLength - wheel.suspensionLength) *
      RS.SUSPENSION_STIFFNESS *
      wheel.clippedInvContactDotSuspension;
    const damping =
      wheel.suspensionRelVel < 0
        ? RS.WHEELS_DAMPING_COMPRESSION
        : RS.WHEELS_DAMPING_RELAXATION;
    const force = (spring - damping * wheel.suspensionRelVel) * wheel.forceScale;
    wheel.suspensionForce = Math.max(0, force);
  }
  for (const wheel of car.wheels) {
    if (wheel.suspensionForce === 0) continue;
    const rel = wheel.contactPoint.clone().sub(car.pos);
    const impulse = wheel.contactNormal
      .clone()
      .multiplyScalar(wheel.suspensionForce * dt + wheel.extraPushback);
    applyImpulse(car, fr, impulse, rel);
  }
}

function applyFrictionImpulses(car, fr, dt) {
  for (const wheel of car.wheels) {
    if (wheel.impulse.lengthSq() === 0) continue;
    const offset = wheel.contactPoint.clone().sub(car.pos);
    offset.addScaledVector(fr.u, -fr.u.dot(offset));
    applyImpulse(car, fr, wheel.impulse.clone().multiplyScalar(dt), offset);
  }
}

function vehicleSecond(car, fr, dt) {
  updateSuspension(car, fr, dt);
  applyFrictionImpulses(car, fr, dt);
}

/** btVehicleRL::getUpwardsDirFromWheelContacts */
function upwardsDirFromWheelContacts(car, fr) {
  const sum = V();
  for (const wheel of car.wheels) {
    if (wheel.inContact) sum.add(wheel.contactNormal);
  }
  if (sum.lengthSq() === 0) return fr.u.clone();
  return sum.normalize();
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
function updateWheels(car, fr, c, numWheels, forwardSpeed, dt, accel) {
  const absForwardSpeed = Math.abs(forwardSpeed);

  if (c.handbrake) car.handbrakeVal += RL.POWERSLIDE_RISE * dt;
  else car.handbrakeVal -= RL.POWERSLIDE_FALL * dt;
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

  const engineForce = engineThrottle * RS.THROTTLE_TORQUE_AMOUNT * driveSpeedScale;
  const brakeForce = realBrake * RS.BRAKE_TORQUE_AMOUNT;
  for (const wheel of car.wheels) {
    wheel.engineForce = engineForce;
    wheel.brake = brakeForce;
  }

  let steerAngle = RS_CURVES.steerAngle(absForwardSpeed);
  if (car.handbrakeVal) {
    steerAngle +=
      (RS_CURVES.powerslideSteerAngle(absForwardSpeed) - steerAngle) * car.handbrakeVal;
  }
  steerAngle *= c.steer;
  car.wheels[0].steerAngle = steerAngle;
  car.wheels[1].steerAngle = steerAngle;

  for (const wheel of car.wheels) {
    if (!wheel.inContact) continue;
    const latDir = wheel.axle;
    const longDir = latDir.clone().cross(wheel.contactNormal);
    const wheelDelta = wheel.hardPoint.clone().sub(car.pos);
    const crossVec = car.omega.clone().cross(wheelDelta).add(car.vel);

    const baseFriction = Math.abs(crossVec.dot(latDir));
    let frictionCurveInput = 0;
    if (baseFriction > 5) {
      frictionCurveInput = baseFriction / (Math.abs(crossVec.dot(longDir)) + baseFriction);
    }

    let latFriction = RS_CURVES.latFriction(frictionCurveInput);
    let longFriction = RS_CURVES.longFriction(frictionCurveInput);
    if (car.handbrakeVal) {
      const hb = car.handbrakeVal;
      latFriction *= (RS_CURVES.handbrakeLatFriction(frictionCurveInput) - 1) * hb + 1;
      longFriction *= (RS_CURVES.handbrakeLongFriction(frictionCurveInput) - 1) * hb + 1;
    } else {
      longFriction = 1;
    }

    if (realThrottle === 0) {
      const nonSticky = RS_CURVES.nonStickyFriction(wheel.contactNormal.z);
      latFriction *= nonSticky;
      longFriction *= nonSticky;
    }
    wheel.latFriction = latFriction;
    wheel.longFriction = longFriction;
  }

  if (numWheels > 0) {
    const upwardsDir = upwardsDirFromWheelContacts(car, fr);
    const fullStick = realThrottle !== 0 || absForwardSpeed > RS.STOPPING_FORWARD_VEL;
    let stickyForceScale = 0.5;
    if (fullStick) stickyForceScale += 1 - Math.abs(upwardsDir.z);
    accel.addScaledVector(upwardsDir, stickyForceScale * -RL.GRAVITY);
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
      if (rel.y !== 0 && c.pitch !== 0 && Math.sign(rel.y) === Math.sign(c.pitch)) {
        pitchScale = 1 - Math.min(Math.abs(c.pitch), 1);
        doAirControl = true;
      }
      rel.y *= pitchScale;
      angAccel
        .addScaledVector(fr.f, rel.x * RL.FLIP_TORQUE_X)
        .addScaledVector(fr.r, rel.y * RL.FLIP_TORQUE_Y);
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
      torque
        .addScaledVector(dirPitch, c.pitch * pitchTorqueScale * RS.AIR_CONTROL_TORQUE.pitch)
        .addScaledVector(dirYaw, c.yaw * RS.AIR_CONTROL_TORQUE.yaw)
        .addScaledVector(dirRoll, c.roll * RS.AIR_CONTROL_TORQUE.roll);
    }
    const w = car.omega;
    const dampPitch =
      dirPitch.dot(w) *
      RS.AIR_CONTROL_DAMPING.pitch *
      (1 - Math.abs(c.pitch * pitchTorqueScale));
    const dampYaw = dirYaw.dot(w) * RS.AIR_CONTROL_DAMPING.yaw * (1 - Math.abs(c.yaw));
    const dampRoll = dirRoll.dot(w) * RS.AIR_CONTROL_DAMPING.roll;
    torque
      .addScaledVector(dirYaw, -dampYaw)
      .addScaledVector(dirPitch, -dampPitch)
      .addScaledVector(dirRoll, -dampRoll);
    angAccel.addScaledVector(torque, RS.CAR_TORQUE_SCALE);
  }

  if (c.throttle !== 0) {
    accel.addScaledVector(fr.f, c.throttle * RS.THROTTLE_AIR_ACCEL);
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
    car.vel.addScaledVector(fr.u, RL.JUMP_IMPULSE);
  }

  if (car.jumping) {
    car.hasJumped = true;
    let jumpAccel = RL.JUMP_HOLD_ACCEL;
    if (jumpTicks < minJumpTicks) jumpAccel *= RS.JUMP_PRE_MIN_ACCEL_SCALE;
    accel.addScaledVector(fr.u, jumpAccel);
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
      car.vel.addScaledVector(fr.u, -RS.AUTOFLIP_IMPULSE);
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
    if (car.hasJumped && !car.jumping) car.airTimeSinceJump += dt;
    else car.airTimeSinceJump = 0;

    if (jumpPressed && car.airTimeSinceJump < RL.FLIP_WINDOW) {
      const inputMagnitude = Math.abs(c.yaw) + Math.abs(c.pitch) + Math.abs(c.roll);
      const isFlipInput = inputMagnitude >= car.dodgeDeadzone;
      const canUse = !car.hasDoubleJumped && !car.hasFlipped && !car.isAutoFlipping;

      if (canUse && isFlipInput) {
        car.flipTime = 0;
        car.hasFlipped = true;
        car.isFlipping = true;

        const forwardSpeedRatio = Math.abs(forwardSpeed) / RL.MAX_SPEED;
        let dx = -c.pitch;
        let dy = c.yaw + c.roll;
        if (Math.abs(dy) < 0.1 && Math.abs(dx) < 0.1) {
          dx = 0;
          dy = 0;
        } else {
          const len = Math.hypot(dx, dy);
          dx /= len;
          dy /= len;
        }
        car.flipRelTorque.set(-dy / tickTimeScale, dx / tickTimeScale, 0);

        if (Math.abs(dx) < 0.1) dx = 0;
        if (Math.abs(dy) < 0.1) dy = 0;

        if (dx !== 0 || dy !== 0) {
          const shouldDodgeBackwards =
            Math.abs(forwardSpeed) < 100 ? dx < 0 : dx >= 0 !== forwardSpeed >= 0;
          let ix = dx * RL.FLIP_INITIAL_VEL;
          let iy = dy * RL.FLIP_INITIAL_VEL;
          const maxSpeedScaleX = shouldDodgeBackwards
            ? RL.FLIP_BACK_SPEED_SCALE
            : RL.FLIP_FWD_SPEED_SCALE;
          ix *= (maxSpeedScaleX - 1) * forwardSpeedRatio + 1;
          iy *= (RL.FLIP_SIDE_SPEED_SCALE - 1) * forwardSpeedRatio + 1;
          if (shouldDodgeBackwards) ix *= RL.FLIP_BACK_IMPULSE_X;

          const forward2D = V(fr.f.x, fr.f.y, 0);
          if (forward2D.lengthSq() > 1e-12) forward2D.normalize();
          const right2D = V(-forward2D.y, forward2D.x, 0);
          car.vel.addScaledVector(forward2D, ix).addScaledVector(right2D, iy);
        }
      } else if (canUse) {
        car.vel.addScaledVector(fr.u, RL.JUMP_IMPULSE);
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
      flipTicks >= zDampStart &&
      (car.vel.z < 0 || flipTicks < zDampEnd)
    ) {
      car.vel.z *= (1 - RL.FLIP_Z_DAMP_120) ** tickTimeScale;
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

  const crossRight = groundUp.clone().cross(f);
  const crossForward = groundDown.clone().cross(crossRight);
  const rightTorqueFactor = 1 - clamp(r.dot(crossRight), 0, 1);
  const forwardTorqueFactor = 1 - clamp(f.dot(crossForward), 0, 1);

  const torqueDirRight = f.clone().multiplyScalar(r.dot(groundUp) >= 0 ? -1 : 1);
  const torqueDirForward = r.clone().multiplyScalar(f.dot(groundUp) >= 0 ? 1 : -1);

  accel.addScaledVector(groundDown, RS.AUTOROLL_FORCE);
  angAccel
    .addScaledVector(torqueDirForward, forwardTorqueFactor * RS.AUTOROLL_TORQUE)
    .addScaledVector(torqueDirRight, rightTorqueFactor * RS.AUTOROLL_TORQUE);
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
    if (!car.infiniteBoost) car.boost = Math.max(0, car.boost - RL.BOOST_USE * dt);
    accel.addScaledVector(
      fr.f,
      car.onGround ? RL.BOOST_ACCEL_GROUND : RL.BOOST_ACCEL_AIR,
    );
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
  const contacts = [];

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const rel = V()
          .addScaledVector(fr.f, offset[0] + (sx * size[0]) / 2)
          .addScaledVector(fr.r, offset[1] + (sy * size[1]) / 2)
          .addScaledVector(fr.u, offset[2] + (sz * size[2]) / 2);
        const p = rel.clone().add(car.pos);
        const n = V();
        const dist = arenaDistance(p.x, p.y, p.z, n);
        if (dist >= RS.CONTACT_BREAKING_THRESHOLD) continue;
        const approaching = n.dot(velocityAt(car, rel)) < RS.RESTITUTION_VELOCITY_THRESHOLD;
        if (dist < 0 || approaching) contacts.push({ rel, dist, n: n.clone() });
      }
    }
  }
  if (contacts.length === 0 && !RS.EXPERIMENTAL_PERSISTENT_CONTACTS) {
    car.arenaManifold?.clear();
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
    if (g.n.z === -1) {
      const rel = V()
        .addScaledVector(fr.f, offset[0] + (fr.f.z >= 0 ? 1 : -1) * size[0] / 2)
        .addScaledVector(fr.r, offset[1] + (fr.r.z >= 0 ? 1 : -1) * size[1] / 2)
        .addScaledVector(fr.u, offset[2] + (fr.u.z >= 0 ? 1 : -1) * size[2] / 2);
      contacts.push({ rel, dist: 2048 - car.pos.z - rel.z, n: g.n.clone(), face: true });
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

  for (const c of contacts) {
    const vel = c.n.z === -1
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
    const tangentVel = vel.clone().addScaledVector(c.n, -c.n.dot(vel));
    c.t = tangentVel.lengthSq() > 1e-12 ? tangentVel.normalize() : perpendicular(c.n);
    c.kt = impulseDenominator(car, fr, c.rel, c.t);
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
      const vt = c.t.dot(velocityAt(car, c.rel));
      const limit = RS.CARWORLD_FRICTION * c.normalImpulse;
      const total = clamp(c.frictionImpulse - vt / c.kt, -limit, limit);
      const delta = total - c.frictionImpulse;
      c.frictionImpulse = total;
      if (delta !== 0) applyImpulse(car, fr, c.t.clone().multiplyScalar(delta), c.rel);
    }
  }

  const penetrating = contacts.filter((c) => c.dist < 0);
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
      transformTurn.addScaledVector(angularImpulse, c.n.z === -1 ? 0.1 : 1);
    }
  }
  if (RS.EXPERIMENTAL_PERSISTENT_CONTACTS) car.arenaManifold.store(car.pos, car.q, contacts);
  return { push, turn: transformTurn };
}

/** btTransformUtil::integrateTransform orientation part. */
function integrateOrientation(q, omega, dt) {
  const speed = omega.length();
  if (speed * dt < 1e-12) return;
  const dq = new THREE.Quaternion().setFromAxisAngle(
    omega.clone().multiplyScalar(1 / speed),
    speed * dt,
  );
  q.premultiply(dq).normalize();
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

  vehicleFirst(car, fr, dt);

  const jumpPressed = c.jump && !car.prevJump;
  let numWheels = 0;
  for (const wheel of car.wheels) if (wheel.inContact) numWheels++;
  car.numWheelsInContact = numWheels;
  car.onGround = numWheels >= 3;
  car.wheelsContact = numWheels > 0;
  car.contactNormal.copy(upwardsDirFromWheelContacts(car, fr));

  const forwardSpeed = car.vel.dot(fr.f);
  updateWheels(car, fr, c, numWheels, forwardSpeed, dt, accel);

  if (numWheels < 3) updateAirTorque(car, fr, c, numWheels === 0, accel, angAccel);
  else car.isFlipping = false;

  updateJump(car, fr, c, jumpPressed, dt, accel);
  updateAutoFlip(car, fr, jumpPressed, dt);
  updateDoubleJumpOrFlip(car, fr, c, jumpPressed, forwardSpeed, dt);

  if (c.throttle && ((numWheels > 0 && numWheels < 4) || car.worldContact.hasContact)) {
    updateAutoRoll(car, fr, numWheels, accel, angAccel);
  }
  car.worldContact.hasContact = false;

  vehicleSecond(car, fr, dt);
  updateBoost(car, fr, c, dt, accel);

  // Bullet step: integrate forces, solve contacts, integrate transform.
  const impactVelocity = car.vel.clone().add(car.velocityImpulseCache);
  const impactOmega = car.omega.clone();
  car.vel.addScaledVector(accel, dt);
  car.vel.z -= RL.GRAVITY * dt;
  // RocketSim applies `_velocityImpulseCache` (bumps) before the world step.
  if (car.velocityImpulseCache.lengthSq() > 0) {
    car.vel.add(car.velocityImpulseCache);
    car.velocityImpulseCache.set(0, 0, 0);
  }
  car.omega.addScaledVector(angAccel, dt);
  const { push, turn } = car.arenaCollisions ? solveArenaContacts(car, fr, dt, impactVelocity, impactOmega) : { push: V(), turn: V() };
  beforeTransform?.();
  if (car.contactTurn?.lengthSq() > 0) {
    integrateOrientation(car.q, car.contactTurn, 1);
    car.contactTurn.set(0, 0, 0);
  }
  car.pos.addScaledVector(car.vel, dt).addScaledVector(push, dt);
  integrateOrientation(car.q, turn, dt);
  integrateOrientation(car.q, car.omega, dt);

  updateSupersonic(car, dt);
  car.prevJump = c.jump;
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
  let finishBall;
  let contact;
  stepCar(car, controls, dt, () => {
    finishBall = stepBall(ball, dt, { arena: car.arenaCollisions, deferTransform: true });
    contact = collideCarBall(car, ball, tick, { deferred: true });
  });
  finishBall();
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
