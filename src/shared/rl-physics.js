import * as THREE from "three";
import {
  cloneHitbox,
  getHitboxForCarId,
  getHitboxPreset,
  HITBOX_PRESETS,
} from "./hitboxPresets.js";

/* =====================================================================
 *  Rocket League physics core (units: uu = cm, seconds, radians)
 *  Frame: right-handed, Z up. Car local axes: x = front, y = right, z = up
 *  (RocketSim / RLBot convention). `axes()` still returns `{ f, l, u }` where
 *  `l` is the local +Y basis vector — i.e. car right, despite the old name.
 *  Runs at a FIXED 120 Hz like the real game. Render at any rate with
 *  interpolation.
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
  MAX_DRIVE_SPEED: 1410, // [V] no boost
  MAX_ANG_VEL: 5.5, // [V]
  BOOST_ACCEL_AIR: 1058.3333740234375, // [V] RocketSim
  BOOST_ACCEL_GROUND: 991.6666870117188, // [V] RocketSim
  BOOST_USE: 33.33333206176758, // [V] per second
  BOOST_MAX: 100, // [V]
  AIR_THROTTLE: 66.66666412353516, // [V] forward; reverse is half
  BRAKE: 3500, // [V]
  COAST: 525, // [V]
  JUMP_IMPULSE: 291.6666564941406, // [V] RocketSim JUMP_IMMEDIATE_FORCE
  JUMP_HOLD_ACCEL: 1458.3333740234375, // [V] RocketSim JUMP_ACCEL
  JUMP_HOLD_MAX: 0.2, // [V]
  JUMP_HOLD_MIN_TICKS: 3, // [V]
  STICKY: 325, // [V] for 3 ticks after jump
  FLIP_WINDOW: 1.25, // [V] RocketSim DOUBLEJUMP_MAX_DELAY (after first jump ends)
  DODGE_DEADZONE: 0.5, // [V] Octane default
  FLIP_TORQUE_TIME: 0.65, // [V]
  FLIP_TORQUE_MIN_TIME: 0.41, // [V]
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
  BALL_MASS: 30, // [V]
  CAR_MASS: 180, // [V]
  BALL_MAX_SPEED: 6000, // [V]
  BALL_MAX_SPIN: 6, // [V]
  BALL_RESTITUTION: 0.6, // [V] of the normal velocity component
  BALL_DRAG: 0.03, // [V] RocketSim BALL_DRAG
  BALL_REST_Z: 93.15, // [V]
  EXTRA_IMPULSE_Z: 0.35, // [V]
  EXTRA_IMPULSE_FWD: 0.65, // [V] RocketSim BALL_CAR_EXTRA_IMPULSE_FORWARD_SCALE
  EXTRA_COOLDOWN_TICKS: 3, // [A]
  // --- field ---
  HALF_W: 4096, // [V]
  HALF_L: 5120, // [V]
  CEILING: 2048, // [V]
  GOAL_HALF_W: 892.755, // [V]
  GOAL_HEIGHT: 642.775, // [V]
  GOAL_DEPTH: 880, // [A] soft back of net
  ARENA_RESTITUTION: 0.35, // [A] car↔arena bounce
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Speed-dependent turning curvature (1/uu). [V] from RLBot wiki / smish. */
export function curvature(v) {
  v = Math.abs(v);
  if (v < 500) return 0.0069 - 5.84e-6 * v;
  if (v < 1000) return 0.00561 - 3.26e-6 * v;
  if (v < 1500) return 0.0043 - 1.95e-6 * v;
  if (v < 1750) return 0.003025 - 1.1e-6 * v;
  if (v < 2500) return 0.0018 - 4e-7 * v;
  return 0;
}

/** Throttle acceleration vs forward speed. [A] shape from memory: 1600 -> ~160 at 1400 -> 0 at 1410. */
export function throttleAccel(v) {
  v = Math.abs(v);
  if (v >= RL.MAX_DRIVE_SPEED) return 0;
  if (v < 1400) return 1600 - (1440 / 1400) * v;
  return 160 * (1 - (v - 1400) / 10);
}

/** Psyonix extra-impulse scale s(|dv|). [A] community summary of the plotted curve. */
export function extraImpulseScale(dv) {
  if (dv <= 500) return 0.65;
  if (dv <= 2300) return 0.65 + ((dv - 500) / 1800) * (0.55 - 0.65);
  if (dv <= 4600) return 0.55 + ((dv - 2300) / 2300) * (0.3 - 0.55);
  return 0.3;
}

/** Local basis. `l` is local +Y = car **right** (RocketSim), not left. */
export function axes(q) {
  return { f: V(1, 0, 0).applyQuaternion(q), l: V(0, 1, 0).applyQuaternion(q), u: V(0, 0, 1).applyQuaternion(q) };
}

/* --------------------------- state factories --------------------------- */

/**
 * @param {THREE.Vector3} [pos]
 * @param {number} [yaw]
 * @param {string | import("./hitboxPresets.js").HitboxPreset} [hitboxOrCarId]
 *   Preset id (`"octane"`), garage car id (`"fennec"`), or a preset object.
 */
export function makeCar(pos, yaw = Math.PI / 2, hitboxOrCarId = "octane") {
  const hitbox =
    typeof hitboxOrCarId === "string"
      ? cloneHitbox(
          HITBOX_PRESETS[hitboxOrCarId]
            ? getHitboxPreset(hitboxOrCarId)
            : getHitboxForCarId(hitboxOrCarId),
        )
      : cloneHitbox(hitboxOrCarId ?? getHitboxPreset("octane"));
  const spawn = pos?.clone?.() ?? V(0, 0, hitbox.restZ);
  if (pos == null) spawn.z = hitbox.restZ;
  return {
    pos: spawn,
    vel: V(),
    omega: V(), // world angular velocity
    q: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), yaw),
    boost: RL.BOOST_MAX,
    /** When true, boost never depletes (orientation drills). Free Play leaves this false. */
    infiniteBoost: false,
    onGround: true,
    prevJump: false,
    jumping: false,
    jumpTime: 0,
    hasJumped: false,
    hasDoubleJumped: false,
    hasFlipped: false,
    /** @deprecated use {@link canFlipOrJump} — kept true while a flip/double-jump is still available. */
    hasFlip: true,
    isFlipping: false,
    flipTime: 0,
    /** Local dodge torque direction (about forward / right); set on flip start. */
    flipRelTorque: V(),
    airTime: 0,
    /** Time since first jump ended — double-jump / flip window. */
    airTimeSinceJump: 0,
    stickyTicks: 0,
    crashed: false,
    isBoosting: false,
    boostingTime: 0,
    isSupersonic: false,
    supersonicTime: 0,
    handbrakeVal: 0,
    dodgeDeadzone: RL.DODGE_DEADZONE,
    /** Underside (wheels / hitbox bottom) touching a surface this tick. */
    wheelsContact: true,
    /** @type {THREE.Vector3} unit surface normal at wheel contact (outward from surface). */
    contactNormal: V(0, 0, 1),
    /** @type {import("./hitboxPresets.js").HitboxPreset} */
    hitbox,
  };
}

/** True while the car can still first-jump, double-jump, or flip. */
export function canFlipOrJump(car) {
  if (car.onGround || car.wheelsContact) return true;
  return (
    !car.hasFlipped &&
    !car.hasDoubleJumped &&
    car.airTimeSinceJump < RL.FLIP_WINDOW
  );
}

/** @param {ReturnType<typeof makeCar>} car */
export function carRestZ(car) {
  return car.hitbox?.restZ ?? RL.REST_HEIGHT;
}

export function makeBall(pos = V(0, 1500, 500)) {
  return { pos: pos.clone(), vel: V(), omega: V(), lastExtraTick: -99 };
}

export function makeWorld() {
  return { car: makeCar(), ball: makeBall(), tick: 0, time: 0, events: [] };
}

/* ------------------------------ car step ------------------------------ */

/**
 * controls: { throttle, steer, pitch, yaw, roll, boost:bool, jump:bool, powerslide?:bool }
 * Axes in [-1,1]. Ground uses steer; air uses pitch/yaw/roll (+ dodge on second jump).
 */
export function stepCar(car, c, dt = RL.DT) {
  const { f, l, u } = axes(car.q);
  let throttle = clamp(c.throttle || 0, -1, 1);
  const pitch = clamp(c.pitch || 0, -1, 1);
  const yaw = clamp(c.yaw || 0, -1, 1);
  const roll = clamp(c.roll || 0, -1, 1);
  const tickScale = dt / RL.DT;

  /* ---- powerslide analog (RocketSim rise/fall) ---- */
  if (c.powerslide) car.handbrakeVal = Math.min(1, car.handbrakeVal + RL.POWERSLIDE_RISE * dt);
  else car.handbrakeVal = Math.max(0, car.handbrakeVal - RL.POWERSLIDE_FALL * dt);

  /* ---- jump / double-jump / dodge ---- */
  const pressed = !!c.jump && !car.prevJump;
  car.prevJump = !!c.jump;
  const canFirstJump = car.onGround || car.wheelsContact;

  if (car.onGround && !car.jumping) {
    // Pad so a min-time jump does not instantly re-arm on the same surface.
    if (car.hasJumped && car.jumpTime < RL.JUMP_HOLD_MIN_TICKS * RL.DT + 0.025) {
      /* keep hasJumped briefly */
    } else {
      car.hasJumped = false;
      car.jumpTime = 0;
    }
  }

  if (canFirstJump && pressed && !car.jumping) {
    car.vel.addScaledVector(u, RL.JUMP_IMPULSE);
    car.onGround = false;
    car.wheelsContact = false;
    car.jumping = true;
    car.jumpTime = 0;
    car.hasJumped = true;
    car.hasDoubleJumped = false;
    car.hasFlipped = false;
    car.isFlipping = false;
    car.flipTime = 0;
    car.flipRelTorque.set(0, 0, 0);
    car.hasFlip = true;
    car.airTime = 0;
    car.airTimeSinceJump = 0;
    car.stickyTicks = 3;
  } else if (!canFirstJump && pressed && !car.jumping) {
    maybeDoubleJumpOrFlip(car, c, pitch, yaw, roll, dt);
  }

  if (car.jumping) {
    const minTicks = car.jumpTime < RL.JUMP_HOLD_MIN_TICKS * RL.DT - 1e-9;
    if ((c.jump && car.jumpTime < RL.JUMP_HOLD_MAX) || minTicks) {
      car.vel.addScaledVector(u, RL.JUMP_HOLD_ACCEL * dt);
    } else {
      car.jumping = false;
    }
  }
  if (car.jumping || car.hasJumped) car.jumpTime += dt;
  if (car.stickyTicks > 0) {
    car.vel.addScaledVector(u, -RL.STICKY * dt);
    car.stickyTicks--;
  }

  /* ---- boost (finite unless car.infiniteBoost) ---- */
  stepBoost(car, c, f, dt);

  if (car.onGround && !car.jumping && car.stickyTicks === 0 && car.vel.z <= 0.001) {
    car.isFlipping = false;
    car.airTime = 0;
    car.airTimeSinceJump = 0;
    car.hasDoubleJumped = false;
    car.hasFlipped = false;
    car.hasFlip = true;
    const fwd = car.vel.dot(f);
    // Boost forces drive throttle to 1 on the ground only (RocketSim wheels path).
    const thr = car.isBoosting ? 1 : throttle;
    let a = 0;
    if (Math.abs(thr) < 0.01) a = -Math.sign(fwd) * Math.min(RL.COAST, Math.abs(fwd) / dt);
    else if (Math.sign(thr) !== Math.sign(fwd) && Math.abs(fwd) > 1) a = Math.sign(thr) * RL.BRAKE;
    else a = thr * throttleAccel(fwd);
    car.vel.addScaledVector(f, a * dt);
    // Powerslide: blend lateral kill with handbrake amount.
    const slip = 1 - 0.8 * car.handbrakeVal;
    car.vel.addScaledVector(l, -car.vel.dot(l) * slip);
    const yawRate = clamp(c.steer || 0, -1, 1) * curvature(fwd) * fwd;
    car.q.premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -yawRate * dt));
    car.vel.z = 0;
    car.pos.z = carRestZ(car);
    car.omega.set(0, 0, 0);
  } else {
    /* ---- airborne ---- */
    car.airTime += dt;
    if (car.hasJumped && !car.jumping) car.airTimeSinceJump += dt;
    else car.airTimeSinceJump = 0;

    car.vel.z -= RL.GRAVITY * dt;
    car.vel.addScaledVector(
      f,
      (throttle >= 0 ? RL.AIR_THROTTLE : RL.AIR_THROTTLE / 2) * throttle * dt,
    );

    // Flip Z damp (RocketSim): kill downward vz mid-dodge.
    if (car.isFlipping) {
      car.flipTime += dt;
      if (car.flipTime <= RL.FLIP_TORQUE_TIME) {
        if (
          car.flipTime >= RL.FLIP_Z_DAMP_START &&
          (car.vel.z < 0 || car.flipTime < RL.FLIP_Z_DAMP_END)
        ) {
          car.vel.z *= (1 - RL.FLIP_Z_DAMP_120) ** tickScale;
        }
      }
      if (!(car.hasFlipped && car.flipTime < RL.FLIP_TORQUE_TIME)) {
        car.isFlipping = false;
      }
    } else if (car.hasFlipped) {
      car.flipTime += dt;
    }

    const air = { pitch, yaw, roll };
    if (c.powerslide && Math.abs(c.roll) < 0.01) {
      air.roll = c.yaw || c.steer || 0;
      air.yaw = 0;
    }
    airControl(car, air, dt);
  }

  car.hasFlip = canFlipOrJump(car);
  updateSupersonic(car, dt);

  if (car.vel.length() > RL.MAX_SPEED) car.vel.setLength(RL.MAX_SPEED);
  car.pos.addScaledVector(car.vel, dt);
  resolveCarArena(car);
}

/**
 * @param {ReturnType<typeof makeCar>} car
 * @param {{ boost?: boolean }} c
 * @param {THREE.Vector3} forward
 * @param {number} dt
 */
function stepBoost(car, c, forward, dt) {
  const want = !!c.boost;
  const hasBoost = car.infiniteBoost || car.boost > 0;
  if (hasBoost) {
    if (car.isBoosting) {
      car.isBoosting = want || car.boostingTime < RL.BOOST_MIN_TIME;
    } else if (want) {
      car.isBoosting = true;
    }
  } else {
    car.isBoosting = false;
  }

  if (car.isBoosting) {
    car.boostingTime += dt;
    const accel = car.onGround ? RL.BOOST_ACCEL_GROUND : RL.BOOST_ACCEL_AIR;
    car.vel.addScaledVector(forward, accel * dt);
    if (!car.infiniteBoost) {
      car.boost = Math.max(0, car.boost - RL.BOOST_USE * dt);
      if (car.boost <= 0) car.isBoosting = false;
    } else {
      car.boost = RL.BOOST_MAX;
    }
  } else {
    car.boostingTime = 0;
  }
  car.boost = Math.min(RL.BOOST_MAX, car.boost);
}

/** @param {ReturnType<typeof makeCar>} car @param {number} dt */
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

/**
 * Second jump: dodge if stick past deadzone, else double-jump impulse.
 * @param {ReturnType<typeof makeCar>} car
 * @param {object} c
 * @param {number} pitch
 * @param {number} yaw
 * @param {number} roll
 * @param {number} dt
 */
function maybeDoubleJumpOrFlip(car, c, pitch, yaw, roll, dt) {
  if (car.airTimeSinceJump >= RL.FLIP_WINDOW) return;
  if (car.hasDoubleJumped || car.hasFlipped) return;

  const dz = car.dodgeDeadzone ?? RL.DODGE_DEADZONE;
  const mag = Math.abs(yaw) + Math.abs(pitch) + Math.abs(roll);
  const isFlip = mag >= dz;
  const { f, l } = axes(car.q);
  const tickScale = dt / RL.DT;

  if (isFlip) {
    car.flipTime = 0;
    car.hasFlipped = true;
    car.isFlipping = true;
    car.hasFlip = false;

    // RocketSim: dodgeDir = (-pitch, yaw+roll, 0)
    let dx = -pitch;
    let dy = yaw + roll;
    if (Math.abs(dy) < 0.1 && Math.abs(dx) < 0.1) {
      dx = 0;
      dy = 0;
    } else {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
    }
    // Local torque axes: x about forward, y about right (before FLIP_TORQUE_* scale).
    car.flipRelTorque.set(-dy / tickScale, dx / tickScale, 0);

    if (Math.abs(dx) < 0.1) dx = 0;
    if (Math.abs(dy) < 0.1) dy = 0;

    if (dx !== 0 || dy !== 0) {
      const fwdSpeed = car.vel.dot(f);
      const speedRatio = Math.abs(fwdSpeed) / RL.MAX_SPEED;
      let back;
      if (Math.abs(fwdSpeed) < 100) back = dx < 0;
      else back = dx >= 0 !== fwdSpeed >= 0;

      let ix = dx * RL.FLIP_INITIAL_VEL;
      let iy = dy * RL.FLIP_INITIAL_VEL;
      const scaleX = back ? RL.FLIP_BACK_SPEED_SCALE : RL.FLIP_FWD_SPEED_SCALE;
      ix *= (scaleX - 1) * speedRatio + 1;
      iy *= (RL.FLIP_SIDE_SPEED_SCALE - 1) * speedRatio + 1;
      if (back) ix *= RL.FLIP_BACK_IMPULSE_X;

      // Horizontal impulse only (flatten forward/right onto XY).
      const f2 = V(f.x, f.y, 0);
      if (f2.lengthSq() > 1e-8) f2.normalize();
      else f2.set(1, 0, 0);
      const r2 = V(-f2.y, f2.x, 0);
      car.vel.addScaledVector(f2, ix).addScaledVector(r2, iy);
    }
  } else {
    const { u } = axes(car.q);
    car.vel.addScaledVector(u, RL.JUMP_IMPULSE);
    car.hasDoubleJumped = true;
    car.hasFlip = false;
  }
}

/**
 * Air torque + dodge torque (RocketSim-aligned).
 * @param {ReturnType<typeof makeCar>} car
 * @param {{ pitch?: number, yaw?: number, roll?: number }} c
 * @param {number} dt
 */
function airControl(car, c, dt) {
  const { f, l, u } = axes(car.q); // l = car right
  const pitch = clamp(c.pitch || 0, -1, 1);
  const yaw = clamp(c.yaw || 0, -1, 1);
  const roll = clamp(c.roll || 0, -1, 1);

  let doAir = !car.isFlipping;
  let pitchScale = 1;

  if (car.isFlipping) {
    const rel = car.flipRelTorque;
    if (rel.x !== 0 || rel.y !== 0 || rel.z !== 0) {
      let relTy = rel.y;
      // Flip cancel: opposite? RocketSim cancels when pitch sign matches dodge torque Y.
      if (relTy !== 0 && pitch !== 0 && Math.sign(relTy) === Math.sign(pitch)) {
        relTy *= 1 - Math.min(Math.abs(pitch), 1);
        doAir = true;
      }
      const alpha = f
        .clone()
        .multiplyScalar(rel.x * RL.FLIP_TORQUE_X)
        .addScaledVector(l, relTy * RL.FLIP_TORQUE_Y);
      car.omega.addScaledVector(alpha, dt);
      if (doAir) pitchScale = 0; // during cancel, pitch air-control stays off
    } else {
      doAir = true;
    }
  }

  if (car.hasFlipped && !car.isFlipping) {
    if (car.flipTime < RL.FLIP_TORQUE_TIME + RL.FLIP_PITCHLOCK_EXTRA) pitchScale = 0;
  }
  if (car.isFlipping) pitchScale = 0;

  if (doAir) {
    const w = V(car.omega.dot(f), car.omega.dot(l), car.omega.dot(u));
    const p = pitch * pitchScale;
    const a = V(
      -RL.T_ROLL * roll + RL.D_ROLL * w.x,
      -RL.T_PITCH * p + RL.D_PITCH * (1 - Math.abs(p)) * w.y,
      RL.T_YAW * yaw + RL.D_YAW * (1 - Math.abs(yaw)) * w.z,
    );
    const dOmega = f.clone().multiplyScalar(a.x).addScaledVector(l, a.y).addScaledVector(u, a.z);
    car.omega.addScaledVector(dOmega, dt);
  }

  if (car.omega.length() > RL.MAX_ANG_VEL) car.omega.setLength(RL.MAX_ANG_VEL);
  const phi = car.omega.length() * dt;
  if (phi > 1e-9) {
    car.q
      .premultiply(new THREE.Quaternion().setFromAxisAngle(car.omega.clone().normalize(), phi))
      .normalize();
  }
}

/**
 * True when the surface lies under the car (normal faces the hitbox / wheel bottom).
 * @param {ReturnType<typeof makeCar>} car
 * @param {number} nx
 * @param {number} ny
 * @param {number} nz
 */
export function isUndersideContact(car, nx, ny, nz) {
  const { u } = axes(car.q);
  return u.x * nx + u.y * ny + u.z * nz > 0.3;
}

/**
 * Restore jump + flip when the bottom of the car / hitbox touches a surface.
 * @param {ReturnType<typeof makeCar>} car
 * @param {number} nx
 * @param {number} ny
 * @param {number} nz
 * @returns {boolean}
 */
export function grantWheelContact(car, nx, ny, nz) {
  if (!isUndersideContact(car, nx, ny, nz)) return false;
  car.wheelsContact = true;
  car.hasFlipped = false;
  car.hasDoubleJumped = false;
  car.hasJumped = false;
  car.isFlipping = false;
  car.flipTime = 0;
  car.flipRelTorque.set(0, 0, 0);
  car.hasFlip = true;
  car.airTimeSinceJump = 0;
  car.contactNormal.set(nx, ny, nz);
  car.airTime = 0;
  car.crashed = false;
  return true;
}

function land(car) {
  const { f, l, u } = axes(car.q);
  if (u.z > 0.5) {
    // wheels-down landing: flatten, keep heading
    const fh = f.z > 0.95 || f.z < -0.95 ? l.clone().cross(V(0, 0, 1)) : V(f.x, f.y, 0);
    fh.normalize();
    const lh = V(0, 0, 1).cross(fh);
    car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fh, lh, V(0, 0, 1)));
    car.onGround = true;
    car.wheelsContact = true;
    car.contactNormal.set(0, 0, 1);
    car.hasFlipped = false;
    car.hasDoubleJumped = false;
    car.isFlipping = false;
    car.flipTime = 0;
    car.flipRelTorque.set(0, 0, 0);
    car.hasFlip = true;
    car.airTimeSinceJump = 0;
    car.omega.set(0, 0, 0);
    car.vel.z = 0;
    car.pos.z = carRestZ(car);
    car.crashed = false;
    car.airTime = 0;
  } else {
    // Roof / side into floor — still restore jump if the underside is what hit.
    if (!grantWheelContact(car, 0, 0, 1)) {
      car.crashed = true;
      car.onGround = false;
    }
    car.omega.multiplyScalar(0.5);
  }
}

/* --------------------- Octane OBB ↔ arena solids --------------------- */

const AXIS_X = V(1, 0, 0);
const AXIS_Y = V(0, 1, 0);
const AXIS_Z = V(0, 0, 1);

/**
 * World-space car hitbox (OBB) for a physics car (Z-up).
 * Uses `car.hitbox` (RocketSim preset) when present.
 * @param {ReturnType<typeof makeCar>} car
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
 * @param {ReturnType<typeof makeCar>} car
 * @param {number} nx
 * @param {number} ny
 * @param {number} nz
 * @param {number} pen
 */
function pushCar(car, nx, ny, nz, pen) {
  car.pos.x += nx * pen;
  car.pos.y += ny * pen;
  car.pos.z += nz * pen;
}

/**
 * Reflect velocity along a unit normal if moving into the surface.
 * @param {ReturnType<typeof makeCar>} car
 * @param {number} nx
 * @param {number} ny
 * @param {number} nz
 * @param {number} e
 */
function bounceNormal(car, nx, ny, nz, e) {
  const vn = car.vel.x * nx + car.vel.y * ny + car.vel.z * nz;
  if (vn >= 0) return;
  const j = -(1 + e) * vn;
  car.vel.x += j * nx;
  car.vel.y += j * ny;
  car.vel.z += j * nz;
  car.omega.multiplyScalar(0.85);
}

/**
 * Keep the car hitbox outside the soccar box (floor, ceiling, walls, goals).
 * Underside contacts restore jump/flip ({@link grantWheelContact}).
 * @param {ReturnType<typeof makeCar>} car
 */
export function resolveCarArena(car) {
  const e = RL.ARENA_RESTITUTION;
  const rest = carRestZ(car);
  car.wheelsContact = false;

  // --- Floor: wheels when upright, otherwise hitbox bottom ---
  {
    const hb = carHitbox(car);
    const wheelsDown = hb.u.z > 0.55;
    const minHitZ = hb.center.z - hitboxExtentOnAxis(hb, AXIS_Z);

    if (car.onGround && !car.jumping && car.stickyTicks === 0) {
      car.pos.z = rest;
      car.vel.z = 0;
      grantWheelContact(car, 0, 0, 1);
    } else if (!car.onGround) {
      if (wheelsDown && car.pos.z <= rest && car.vel.z <= 0) {
        land(car);
      } else if (minHitZ < 0) {
        pushCar(car, 0, 0, 1, -minHitZ);
        if (wheelsDown && car.vel.z <= 0) {
          land(car);
        } else if (grantWheelContact(car, 0, 0, 1)) {
          // Bottom of hitbox on the floor — jump is back; soft settle if nearly upright.
          bounceNormal(car, 0, 0, 1, e * 0.5);
          if (hb.u.z > 0.35 && car.vel.z <= 0) land(car);
        } else {
          bounceNormal(car, 0, 0, 1, e);
          car.crashed = true;
          car.onGround = false;
        }
      }
    }
  }

  // --- Ceiling ---
  {
    const hb = carHitbox(car);
    const maxHitZ = hb.center.z + hitboxExtentOnAxis(hb, AXIS_Z);
    if (maxHitZ > RL.CEILING) {
      pushCar(car, 0, 0, -1, maxHitZ - RL.CEILING);
      bounceNormal(car, 0, 0, -1, e);
      car.onGround = false;
      grantWheelContact(car, 0, 0, -1); // wheels on ceiling → jump back
    }
  }

  // --- Side walls (world ±X) ---
  for (const sign of [1, -1]) {
    const hb = carHitbox(car);
    const edge = hb.center.x + sign * hitboxExtentOnAxis(hb, AXIS_X);
    if (sign > 0 && edge > RL.HALF_W) {
      pushCar(car, -1, 0, 0, edge - RL.HALF_W);
      bounceNormal(car, -1, 0, 0, e);
      car.onGround = false;
      grantWheelContact(car, -1, 0, 0);
    } else if (sign < 0 && edge < -RL.HALF_W) {
      pushCar(car, 1, 0, 0, -RL.HALF_W - edge);
      bounceNormal(car, 1, 0, 0, e);
      car.onGround = false;
      grantWheelContact(car, 1, 0, 0);
    }
  }

  // --- End walls (world ±Y) with goal mouths ---
  for (const sign of [1, -1]) {
    const hb = carHitbox(car);
    const extY = hitboxExtentOnAxis(hb, AXIS_Y);
    const extX = hitboxExtentOnAxis(hb, AXIS_X);
    const extZ = hitboxExtentOnAxis(hb, AXIS_Z);
    const edge = hb.center.y + sign * extY;
    const wall = sign * RL.HALF_L;
    const past = sign > 0 ? edge > wall : edge < wall;
    if (!past) continue;

    const inGoalX = Math.abs(hb.center.x) + extX < RL.GOAL_HALF_W;
    const underCrossbar = hb.center.z + extZ < RL.GOAL_HEIGHT;
    if (inGoalX && underCrossbar) {
      const back = sign * (RL.HALF_L + RL.GOAL_DEPTH);
      const backEdge = hb.center.y + sign * extY;
      if (sign > 0 && backEdge > back) {
        pushCar(car, 0, -1, 0, backEdge - back);
        bounceNormal(car, 0, -1, 0, e);
        car.onGround = false;
        grantWheelContact(car, 0, -1, 0);
      } else if (sign < 0 && backEdge < back) {
        pushCar(car, 0, 1, 0, back - backEdge);
        bounceNormal(car, 0, 1, 0, e);
        car.onGround = false;
        grantWheelContact(car, 0, 1, 0);
      }
      continue;
    }

    const pen = sign > 0 ? edge - wall : wall - edge;
    pushCar(car, 0, -sign, 0, pen);
    bounceNormal(car, 0, -sign, 0, e);
    car.onGround = false;
    grantWheelContact(car, 0, -sign, 0);
  }
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
 * @param {ReturnType<typeof makeCar>} car
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

export function stepBall(ball, dt = RL.DT) {
  const R = RL.BALL_RADIUS;
  ball.vel.z -= RL.GRAVITY * dt;
  ball.vel.addScaledVector(ball.vel, -RL.BALL_DRAG * dt);
  if (ball.vel.length() > RL.BALL_MAX_SPEED) ball.vel.setLength(RL.BALL_MAX_SPEED);
  ball.pos.addScaledVector(ball.vel, dt);
  const e = RL.BALL_RESTITUTION;
  // NOTE: simplified box arena (no curved walls/goals); spin-friction coupling omitted.
  if (ball.pos.z < R) { ball.pos.z = R; ball.vel.z = Math.abs(ball.vel.z) < 25 ? 0 : -ball.vel.z * e; }
  if (ball.pos.z > RL.CEILING - R) { ball.pos.z = RL.CEILING - R; ball.vel.z = -Math.abs(ball.vel.z) * e; }
  if (Math.abs(ball.pos.x) > RL.HALF_W - R) { ball.pos.x = Math.sign(ball.pos.x) * (RL.HALF_W - R); ball.vel.x = -Math.sign(ball.pos.x) * Math.abs(ball.vel.x) * e; }
  if (Math.abs(ball.pos.y) > RL.HALF_L - R) { ball.pos.y = Math.sign(ball.pos.y) * (RL.HALF_L - R); ball.vel.y = -Math.sign(ball.pos.y) * Math.abs(ball.vel.y) * e; }
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
  const pointVel = car.vel.clone().add(car.omega.clone().cross(nearW.clone().sub(car.pos)));
  const vn = ball.vel.clone().sub(pointVel).dot(n);
  if (vn < 0) {
    // inelastic normal impulse (rotation + friction terms omitted: [A] simplification)
    const J = -vn / (1 / RL.BALL_MASS + 1 / RL.CAR_MASS);
    ball.vel.addScaledVector(n, J / RL.BALL_MASS);
    car.vel.addScaledVector(n, -J / RL.CAR_MASS);
  }
  // Psyonix extra impulse on the ball only (breaks Newton's 3rd law on purpose)
  if (tick - ball.lastExtraTick > RL.EXTRA_COOLDOWN_TICKS) {
    const nn = ball.pos.clone().sub(center);
    // Psyonix extra impulse: scale Z, then remove a fraction of the forward component.
    nn.z *= RL.EXTRA_IMPULSE_Z;
    nn.sub(f.clone().multiplyScalar(RL.EXTRA_IMPULSE_FWD * nn.dot(f))).normalize();
    const m = dv0.length();
    ball.vel.addScaledVector(nn, m * extraImpulseScale(m));
    ball.lastExtraTick = tick;
  }
  return { normal: n, point: nearW, speed: dv0.length() };
}

/* ------------------------------ world step ------------------------------ */

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
  while (acc.t >= RL.DT) { stepWorld(w, getControls()); acc.t -= RL.DT; }
  return acc;
}

/**
 * Physics Z-up → Three.js Y-up. Car model axes: X=left, Y=up, Z=front.
 * Builds a proper right-handed basis so visual nose matches physics forward
 * (an earlier P(-right),P(up),P(fwd) mapping flipped the mesh 180°).
 */
export function physToThree(v, out = V()) {
  return out.set(v.x, v.z, -v.y);
}

/** @param {ReturnType<typeof makeCar>} car @param {THREE.Object3D} group @param {number} [scale=0.01] */
export function applyToCarModel(car, group, scale = 0.01) {
  const { f, u } = axes(car.q);
  const front = physToThree(f).normalize();
  const up = physToThree(u).normalize();
  // RH Three.js: X × Y = Z → left = up × front
  const left = up.clone().cross(front).normalize();
  group.position.copy(physToThree(car.pos)).multiplyScalar(scale);
  group.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(left, up, front),
  );
}

/**
 * Scale + offset a visual car so its length matches the hitbox and its bbox
 * centre sits on the hitbox centre (RocketSim root→offset placement).
 *
 * Model local axes: X=left, Y=up, Z=front. Physics offset is (fwd, right, up).
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

  // Convert hitbox offset (uu) into pre-scale local units.
  const k = uu / visualScale;
  const [ox, oy, oz] = preset.offset;
  // model x = left = −right, y = up, z = forward
  visual.position.set(-oy * k, oz * k, ox * k);
  return visualScale;
}
