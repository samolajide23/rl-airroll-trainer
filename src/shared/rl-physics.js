import * as THREE from "three";

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
  FLIP_WINDOW: 1.25, // [V] seconds (+ hold time)
  REST_HEIGHT: 17.01, // [V] Octane centre height on the floor
  // Air-control (RocketSim): magnitudes are TORQUE/DAMPING * CAR_TORQUE_SCALE.
  // World-frame signs at identity (f=+X, right=+Y, u=+Z):
  //   +roll → −ω·f,  +pitch → −ω·right,  +yaw → +ω·up
  T_ROLL: 400 * RS_TORQUE_SCALE, // [V]
  T_PITCH: 130 * RS_TORQUE_SCALE, // [V]
  T_YAW: 95 * RS_TORQUE_SCALE, // [V]
  D_ROLL: -50 * RS_TORQUE_SCALE, // [V] always on
  D_PITCH: -30 * RS_TORQUE_SCALE, // [V] scaled by (1-|input|)
  D_YAW: -20 * RS_TORQUE_SCALE, // [V] scaled by (1-|input|)
  // Octane hitbox (OBB)
  HITBOX_SIZE: [118.0074, 84.19941, 36.15907], // [V] length, width, height
  HITBOX_OFFSET: [13.87566, 0, 20.75499], // [A] from memory, verify vs halfwaydead sheet
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

export function makeCar(pos = V(0, 0, RL.REST_HEIGHT), yaw = Math.PI / 2) {
  return {
    pos: pos.clone(),
    vel: V(),
    omega: V(), // world angular velocity
    q: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), yaw),
    boost: RL.BOOST_MAX,
    onGround: true,
    prevJump: false,
    jumping: false,
    jumpTime: 0,
    hasFlip: true,
    airTime: 0,
    stickyTicks: 0,
    crashed: false,
  };
}

export function makeBall(pos = V(0, 1500, 500)) {
  return { pos: pos.clone(), vel: V(), omega: V(), lastExtraTick: -99 };
}

export function makeWorld() {
  return { car: makeCar(), ball: makeBall(), tick: 0, time: 0, events: [] };
}

/* ------------------------------ car step ------------------------------ */

/**
 * controls: { throttle, steer, pitch, yaw, roll, boost:bool, jump:bool }  (axes in [-1,1])
 * On the ground, steer is used; in the air, pitch/yaw/roll are used.
 * Directional air roll should be done in your input layer by remapping stick -> (pitch, yaw, roll).
 */
export function stepCar(car, c, dt = RL.DT) {
  const { f, l, u } = axes(car.q);
  const throttle = clamp(c.throttle || 0, -1, 1);
  const boosting = !!c.boost;

  /* ---- jump ---- */
  const pressed = !!c.jump && !car.prevJump;
  car.prevJump = !!c.jump;
  if (car.onGround && pressed) {
    car.vel.addScaledVector(u, RL.JUMP_IMPULSE);
    car.onGround = false;
    car.jumping = true;
    car.jumpTime = 0;
    car.hasFlip = true;
    car.airTime = 0;
    car.stickyTicks = 3;
  } else if (!car.onGround && pressed && !car.jumping && car.hasFlip && car.airTime < RL.FLIP_WINDOW + car.jumpTime) {
    car.vel.addScaledVector(u, RL.JUMP_IMPULSE); // NOTE: directional flips (dodges) not implemented yet
    car.hasFlip = false;
  }
  if (car.jumping) {
    const minTicks = car.jumpTime < (RL.JUMP_HOLD_MIN_TICKS * dt) - 1e-9;
    if ((c.jump && car.jumpTime < RL.JUMP_HOLD_MAX) || minTicks) {
      car.vel.addScaledVector(u, RL.JUMP_HOLD_ACCEL * dt);
      car.jumpTime += dt;
    } else car.jumping = false;
  }
  if (car.stickyTicks > 0) {
    car.vel.addScaledVector(u, -RL.STICKY * dt);
    car.stickyTicks--;
  }

  /* ---- boost (trainer: infinite) ---- */
  if (boosting) {
    car.vel.addScaledVector(f, (car.onGround ? RL.BOOST_ACCEL_GROUND : RL.BOOST_ACCEL_AIR) * dt);
    car.boost = RL.BOOST_MAX;
  }

  if (car.onGround && !car.jumping && car.stickyTicks === 0 && car.vel.z <= 0.001) {
    /* ---- ground driving (simplified: perfect grip, flat floor) ---- */
    const fwd = car.vel.dot(f);
    const thr = boosting ? 1 : throttle;
    let a = 0;
    if (Math.abs(thr) < 0.01) a = -Math.sign(fwd) * Math.min(RL.COAST, Math.abs(fwd) / dt);
    else if (Math.sign(thr) !== Math.sign(fwd) && Math.abs(fwd) > 1) a = Math.sign(thr) * RL.BRAKE;
    else a = thr * throttleAccel(fwd);
    car.vel.addScaledVector(f, a * dt);
    car.vel.addScaledVector(l, -car.vel.dot(l)); // kill lateral slip
    const yawRate = clamp(c.steer || 0, -1, 1) * curvature(fwd) * fwd; // rad/s, +steer = right
    car.q.premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -yawRate * dt));
    car.vel.z = 0;
    car.pos.z = RL.REST_HEIGHT;
    car.omega.set(0, 0, 0);
  } else {
    /* ---- airborne ---- */
    car.airTime += dt;
    car.vel.z -= RL.GRAVITY * dt;
    car.vel.addScaledVector(f, (throttle >= 0 ? RL.AIR_THROTTLE : RL.AIR_THROTTLE / 2) * throttle * dt);
    airControl(car, c, dt);
  }

  /* ---- integrate, clamp ---- */
  if (car.vel.length() > RL.MAX_SPEED) car.vel.setLength(RL.MAX_SPEED);
  car.pos.addScaledVector(car.vel, dt);
  car.pos.x = clamp(car.pos.x, -RL.HALF_W + 60, RL.HALF_W - 60);
  car.pos.y = clamp(car.pos.y, -RL.HALF_L + 60, RL.HALF_L - 60);
  if (car.pos.z > RL.CEILING - 40) { car.pos.z = RL.CEILING - 40; car.vel.z = Math.min(0, car.vel.z); }

  /* ---- landing ---- */
  if (!car.onGround && car.pos.z <= RL.REST_HEIGHT && car.vel.z <= 0) land(car);
}

function airControl(car, c, dt) {
  const { f, l, u } = axes(car.q); // l = car right
  const pitch = clamp(c.pitch || 0, -1, 1);
  const yaw = clamp(c.yaw || 0, -1, 1);
  const roll = clamp(c.roll || 0, -1, 1);
  // Local ω about (forward, right, up) — RocketSim air-control axes.
  const w = V(car.omega.dot(f), car.omega.dot(l), car.omega.dot(u));
  // Signs match RocketSim CarControls: +pitch nose up, +yaw nose right, +roll right.
  const a = V(
    -RL.T_ROLL * roll + RL.D_ROLL * w.x,
    -RL.T_PITCH * pitch + RL.D_PITCH * (1 - Math.abs(pitch)) * w.y,
    RL.T_YAW * yaw + RL.D_YAW * (1 - Math.abs(yaw)) * w.z,
  );
  const dOmega = f.clone().multiplyScalar(a.x).addScaledVector(l, a.y).addScaledVector(u, a.z);
  const next = car.omega.clone().addScaledVector(dOmega, dt);
  if (next.length() > RL.MAX_ANG_VEL) next.setLength(RL.MAX_ANG_VEL);
  // RocketSim integrates orientation with post-torque ω (not the tick average).
  const phi = next.length() * dt;
  if (phi > 1e-9) {
    car.q.premultiply(new THREE.Quaternion().setFromAxisAngle(next.clone().normalize(), phi)).normalize();
  }
  car.omega.copy(next);
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
    car.hasFlip = true;
    car.omega.set(0, 0, 0);
    car.vel.z = 0;
    car.pos.z = RL.REST_HEIGHT;
  } else {
    // bad landing (roof / side): simple bounce + flag; real game tumbles
    car.crashed = true;
    car.pos.z = RL.REST_HEIGHT;
    car.vel.z = -car.vel.z * 0.3;
    car.omega.multiplyScalar(0.5);
  }
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
  const { f, l, u } = axes(car.q);
  const [ox, oy, oz] = RL.HITBOX_OFFSET;
  const center = car.pos.clone().addScaledVector(f, ox).addScaledVector(l, oy).addScaledVector(u, oz);
  const [sx, sy, sz] = RL.HITBOX_SIZE.map((s) => s / 2);
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

/** Physics (Z-up) -> Three.js (Y-up). Car model: X=left, Y=up, Z=front. 1 three-unit = `scale` uu. */
export function applyToCarModel(car, group, scale = 0.01) {
  const P = (v) => V(v.x, v.z, -v.y);
  const { f, l, u } = axes(car.q); // l = car right
  const left = l.clone().multiplyScalar(-1);
  group.position.copy(P(car.pos)).multiplyScalar(scale);
  group.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(P(left), P(u), P(f)),
  );
}
