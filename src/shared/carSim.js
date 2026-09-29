import * as THREE from "three";
import { arenaDistance, arenaNormal, raycastArena } from "./arenaMesh.js";
import {
  cloneHitbox,
  getHitboxForCarId,
  getHitboxPreset,
  HITBOX_PRESETS,
} from "./hitboxPresets.js";
import { RL, axes, collideCarBall, makeBall, stepBall } from "./rl-physics.js";

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

/** RocketSim RLConst curves. */
export const RS_CURVES = {
  /** |forward speed| → max steer angle (rad) */
  steerAngle: linearPieceCurve([
    [0, 0.53356],
    [500, 0.3193],
    [1000, 0.18203],
    [1500, 0.1057],
    [1750, 0.08507],
    [3000, 0.03454],
  ]),
  /** |forward speed| → max steer angle while fully powersliding (rad) */
  powerslideSteerAngle: linearPieceCurve([
    [0, 0.39235],
    [2500, 0.1261],
  ]),
  /** |forward speed| → engine torque factor */
  driveSpeedTorque: linearPieceCurve([
    [0, 1],
    [1400, 0.1],
    [1410, 0],
  ]),
  /** contact normal Z → friction factor when not throttling */
  nonStickyFriction: linearPieceCurve([
    [0, 0.1],
    [0.7075, 0.5],
    [1, 1],
  ]),
  /** lateral slip ratio → lateral friction */
  latFriction: linearPieceCurve([
    [0, 1],
    [1, 0.2],
  ]),
  longFriction: linearPieceCurve([]),
  handbrakeLatFriction: linearPieceCurve([[0, 0.1]]),
  handbrakeLongFriction: linearPieceCurve([
    [0, 0.5],
    [1, 0.9],
  ]),
};

/** RocketSim RLConst / Bullet solver constants used by the car tick. */
export const RS = {
  THROTTLE_TORQUE_AMOUNT: CAR_MASS * 400,
  BRAKE_TORQUE_AMOUNT: CAR_MASS * (14.25 + 1 / 3),
  STOPPING_FORWARD_VEL: 25,
  COASTING_BRAKE_FACTOR: 0.15,
  BRAKING_NO_THROTTLE_SPEED_THRESH: 0.01,
  THROTTLE_DEADZONE: 0.001,
  THROTTLE_AIR_ACCEL: 200 / 3,
  JUMP_MIN_TIME: 0.025,
  JUMP_RESET_TIME_PAD: 1 / 40,
  JUMP_PRE_MIN_ACCEL_SCALE: 0.62,
  AUTOFLIP_IMPULSE: 200,
  AUTOFLIP_TORQUE: 50,
  AUTOFLIP_TIME: 0.4,
  AUTOFLIP_NORMZ_THRESH: Math.SQRT1_2,
  AUTOFLIP_ROLL_THRESH: 2.8,
  AUTOROLL_FORCE: 100,
  AUTOROLL_TORQUE: 80,
  CAR_TORQUE_SCALE: ((2 * Math.PI) / (1 << 16)) * 1000,
  AIR_CONTROL_TORQUE: { pitch: 130, yaw: 95, roll: 400 },
  AIR_CONTROL_DAMPING: { pitch: 30, yaw: 20, roll: 50 },
  SUSPENSION_FORCE_SCALE_FRONT: 36 - 1 / 4,
  SUSPENSION_FORCE_SCALE_BACK: 54 + 1 / 4 + 1.5 / 100,
  SUSPENSION_STIFFNESS: 500,
  WHEELS_DAMPING_COMPRESSION: 25,
  WHEELS_DAMPING_RELAXATION: 40,
  MAX_SUSPENSION_TRAVEL: 12,
  SUSPENSION_SUBTRACTION: 0.05 * BT_TO_UU,
  ROLLING_FRICTION_SCALE_MAGIC: 113.73963,
  /** Bullet `resolveSingleBilateral` contact damping */
  SIDE_FRICTION_DAMPING: 0.2,
  /** Bullet btContactSolverInfo defaults (RocketSim sets erp2 = 0.8) */
  SOLVER_ERP: 0.2,
  SOLVER_ERP2: 0.8,
  SOLVER_ITERATIONS: 10,
  RESTITUTION_VELOCITY_THRESHOLD: 0.2 * BT_TO_UU,
  CONTACT_BREAKING_THRESHOLD: 0.02 * BT_TO_UU,
  CARWORLD_FRICTION: 0.3,
  CARWORLD_RESTITUTION: 0.3,
  /**
   * When several OBB corners share the deepest penetration on one normal
   * (edge flush with a plane), the effective Bullet/RocketSim contact sits
   * between the edge midpoint and the +local-Y vertex. Tuned on
   * `ground_flip_forward` against RocketSim (0 = midpoint, 1 = corner).
   */
  CONTACT_EDGE_CORNER_BLEND: 0.85,
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
      latFriction: 1,
      longFriction: 1,
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
  const hit = raycastArena(wheel.hardPoint, down, rayLength);

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

  if (car.isBoosting) car.boostingTime += dt;
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
function solveArenaContacts(car, fr, dt) {
  const push = V();
  const turn = V();
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
  if (contacts.length === 0) return { push, turn };

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
    const mid = V();
    for (const t of g.tied) mid.add(t.rel);
    mid.multiplyScalar(1 / g.tied.length);
    let preferred = g.tied[0];
    for (const t of g.tied) if (t.rel.y > preferred.rel.y) preferred = t;
    // Single deepest sample, or edge blend when several corners share the depth.
    const rel =
      g.tied.length === 1
        ? preferred.rel.clone()
        : mid.lerp(preferred.rel, RS.CONTACT_EDGE_CORNER_BLEND);
    contacts.push({ rel, dist: g.dist, n: g.n.clone() });
  }

  let deepest = contacts[0];
  for (const c of contacts) if (c.dist < deepest.dist) deepest = c;
  car.worldContact.hasContact = true;
  car.worldContact.normal.copy(deepest.n);

  for (const c of contacts) {
    const vel = velocityAt(car, c.rel);
    const vn = c.n.dot(vel);
    // Desired normal speed after the impulse (Bullet restitutionCurve).
    // Do NOT bias by positive clearance — that attracts the body into the surface.
    const restitution =
      vn >= -RS.RESTITUTION_VELOCITY_THRESHOLD
        ? 0
        : RS.CARWORLD_RESTITUTION * -vn;
    c.target = restitution;
    c.k = impulseDenominator(car, fr, c.rel, c.n);
    const tangentVel = vel.clone().addScaledVector(c.n, -vn);
    c.t = tangentVel.lengthSq() > 1e-12 ? tangentVel.normalize() : perpendicular(c.n);
    c.kt = impulseDenominator(car, fr, c.rel, c.t);
    c.normalImpulse = 0;
    c.frictionImpulse = 0;
    c.pushImpulse = 0;
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
      turn.add(invInertiaMul(car, fr, c.rel.clone().cross(impulse)));
    }
  }
  return { push, turn };
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
export function stepCar(car, controls, dt = RL.DT) {
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
  car.vel.addScaledVector(accel, dt);
  car.vel.z -= RL.GRAVITY * dt;
  car.omega.addScaledVector(angAccel, dt);
  const { push, turn } = solveArenaContacts(car, fr, dt);
  car.pos.addScaledVector(car.vel, dt).addScaledVector(push, dt);
  integrateOrientation(car.q, car.omega.clone().add(turn), dt);

  updateSupersonic(car, dt);
  car.prevJump = c.jump;

  if (car.vel.length() > RL.MAX_SPEED) car.vel.setLength(RL.MAX_SPEED);
  if (car.omega.length() > RL.MAX_ANG_VEL) car.omega.setLength(RL.MAX_ANG_VEL);
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
