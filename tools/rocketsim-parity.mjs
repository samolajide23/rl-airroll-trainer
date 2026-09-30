/**
 * Assert browser constants / curves / pads / hitboxes / spawns match RocketSim
 * RLConst and CarConfig across the whole site. Run: `npm run physics:parity`
 *
 * Optionally cross-checks live MutatorConfig + CarConfig via Python when
 * RocketSim is installed in the interpreter selected by python-runner.mjs.
 */
import { spawnPythonSync } from "./python-runner.mjs";
import { RL, extraImpulseScale } from "../src/shared/rl-physics.js";
import { RS, RS_CURVES } from "../src/shared/carSim.js";
import { f32, RL_CONST as C, RL_CURVES } from "../src/shared/rlConst.js";
import { HITBOX_PRESETS } from "../src/shared/hitboxPresets.js";
import {
  BOOST_PAD,
  SOCCAR_BIG_PADS,
  SOCCAR_SMALL_PADS,
} from "../src/shared/boostPads.js";
import { DEFAULT_CAMERA } from "../src/shared/settings.js";
import { ARENA_CEILING, ARENA_HALF_W } from "../src/shared/arenaMesh.js";
import { RL_CAMERA } from "../src/shared/chaseCamera.js";
import { UU } from "../src/shared/rl-units.js";
import { ARENA_UU } from "../src/shared/soccarArena.js";
import { UU_SCALE } from "../src/shared/ball.js";

let pass = 0;
let fail = 0;

/** @param {string} name @param {boolean} cond @param {string} [detail] */
function check(name, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log("PASS", name, detail ? `— ${detail}` : "");
  } else {
    fail += 1;
    console.log("FAIL", name, detail ? `— ${detail}` : "");
  }
}

/** @param {number} a @param {number} b @param {number} [eps] */
function near(a, b, eps = 1e-5) {
  return Math.abs(a - b) <= eps;
}

/** Exact float32 / bit-identical match (RocketSim `float` scalars). */
function exact(a, b) {
  return Object.is(a, b);
}

/** @param {number[]} a @param {number[]} b @param {number} [eps] */
function nearArr(a, b, eps = 1e-4) {
  return a.length === b.length && a.every((v, i) => near(v, b[i], eps));
}

console.log("=== RL / RS scalars (RocketSim RLConst float32) ===");
const scalars = [
  ["GRAVITY", RL.GRAVITY, C.GRAVITY_Z],
  ["MAX_SPEED", RL.MAX_SPEED, C.CAR_MAX_SPEED],
  ["MAX_DRIVE_SPEED", RL.MAX_DRIVE_SPEED, 1410],
  ["MAX_ANG_VEL", RL.MAX_ANG_VEL, C.CAR_MAX_ANG_SPEED],
  ["BOOST_ACCEL_AIR", RL.BOOST_ACCEL_AIR, C.BOOST_ACCEL_AIR],
  ["BOOST_ACCEL_GROUND", RL.BOOST_ACCEL_GROUND, C.BOOST_ACCEL_GROUND],
  ["BOOST_USE", RL.BOOST_USE, C.BOOST_USED_PER_SECOND],
  ["BOOST_MAX", RL.BOOST_MAX, C.BOOST_MAX],
  ["BOOST_SPAWN", RL.BOOST_SPAWN, C.BOOST_SPAWN_AMOUNT],
  ["BOOST_MIN_TIME", RL.BOOST_MIN_TIME, C.BOOST_MIN_TIME],
  ["AIR_THROTTLE", RL.AIR_THROTTLE, C.THROTTLE_AIR_ACCEL],
  ["JUMP_IMPULSE", RL.JUMP_IMPULSE, C.JUMP_IMMEDIATE_FORCE],
  ["JUMP_HOLD_ACCEL", RL.JUMP_HOLD_ACCEL, C.JUMP_ACCEL],
  ["JUMP_HOLD_MAX", RL.JUMP_HOLD_MAX, C.JUMP_MAX_TIME],
  ["FLIP_WINDOW", RL.FLIP_WINDOW, C.DOUBLEJUMP_MAX_DELAY],
  ["DODGE_DEADZONE", RL.DODGE_DEADZONE, 0.5],
  ["FLIP_TORQUE_TIME", RL.FLIP_TORQUE_TIME, C.FLIP_TORQUE_TIME],
  ["FLIP_TORQUE_MIN_TIME", RL.FLIP_TORQUE_MIN_TIME, C.FLIP_TORQUE_MIN_TIME],
  ["FLIP_PITCHLOCK_TIME", RL.FLIP_PITCHLOCK_TIME, C.FLIP_PITCHLOCK_TIME],
  ["FLIP_PITCHLOCK_EXTRA", RL.FLIP_PITCHLOCK_EXTRA, C.FLIP_PITCHLOCK_EXTRA_TIME],
  ["FLIP_Z_DAMP_120", RL.FLIP_Z_DAMP_120, C.FLIP_Z_DAMP_120],
  ["FLIP_Z_DAMP_START", RL.FLIP_Z_DAMP_START, C.FLIP_Z_DAMP_START],
  ["FLIP_Z_DAMP_END", RL.FLIP_Z_DAMP_END, C.FLIP_Z_DAMP_END],
  ["FLIP_INITIAL_VEL", RL.FLIP_INITIAL_VEL, C.FLIP_INITIAL_VEL_SCALE],
  ["FLIP_TORQUE_X", RL.FLIP_TORQUE_X, C.FLIP_TORQUE_X],
  ["FLIP_TORQUE_Y", RL.FLIP_TORQUE_Y, C.FLIP_TORQUE_Y],
  ["FLIP_FWD_SPEED_SCALE", RL.FLIP_FWD_SPEED_SCALE, C.FLIP_FORWARD_IMPULSE_MAX_SPEED_SCALE],
  ["FLIP_SIDE_SPEED_SCALE", RL.FLIP_SIDE_SPEED_SCALE, C.FLIP_SIDE_IMPULSE_MAX_SPEED_SCALE],
  ["FLIP_BACK_SPEED_SCALE", RL.FLIP_BACK_SPEED_SCALE, C.FLIP_BACKWARD_IMPULSE_MAX_SPEED_SCALE],
  ["FLIP_BACK_IMPULSE_X", RL.FLIP_BACK_IMPULSE_X, C.FLIP_BACKWARD_IMPULSE_SCALE_X],
  ["SUPERSONIC_START", RL.SUPERSONIC_START, C.SUPERSONIC_START_SPEED],
  ["SUPERSONIC_KEEP", RL.SUPERSONIC_KEEP, C.SUPERSONIC_MAINTAIN_MIN_SPEED],
  ["SUPERSONIC_KEEP_TIME", RL.SUPERSONIC_KEEP_TIME, C.SUPERSONIC_MAINTAIN_MAX_TIME],
  ["POWERSLIDE_RISE", RL.POWERSLIDE_RISE, C.POWERSLIDE_RISE_RATE],
  ["POWERSLIDE_FALL", RL.POWERSLIDE_FALL, C.POWERSLIDE_FALL_RATE],
  ["CAR_MASS", RL.CAR_MASS, C.CAR_MASS],
  ["BALL_MASS", RL.BALL_MASS, C.BALL_MASS],
  ["BALL_RADIUS", RL.BALL_RADIUS, C.BALL_COLLISION_RADIUS_SOCCAR],
  ["BALL_MAX_SPEED", RL.BALL_MAX_SPEED, C.BALL_MAX_SPEED],
  ["BALL_MAX_SPIN", RL.BALL_MAX_SPIN, C.BALL_MAX_ANG_SPEED],
  ["BALL_RESTITUTION", RL.BALL_RESTITUTION, C.BALL_RESTITUTION],
  ["BALL_FRICTION", RL.BALL_FRICTION, C.BALL_FRICTION],
  ["BALL_DRAG", RL.BALL_DRAG, C.BALL_DRAG],
  ["BALL_REST_Z", RL.BALL_REST_Z, C.BALL_REST_Z],
  ["CARBALL_FRICTION", RL.CARBALL_FRICTION, C.CARBALL_COLLISION_FRICTION],
  ["CARBALL_RESTITUTION", RL.CARBALL_RESTITUTION, C.CARBALL_COLLISION_RESTITUTION],
  ["EXTRA_IMPULSE_Z", RL.EXTRA_IMPULSE_Z, C.BALL_CAR_EXTRA_IMPULSE_Z_SCALE],
  ["EXTRA_IMPULSE_FWD", RL.EXTRA_IMPULSE_FWD, C.BALL_CAR_EXTRA_IMPULSE_FORWARD_SCALE],
  ["EXTRA_IMPULSE_MAX_DV", RL.EXTRA_IMPULSE_MAX_DV, C.BALL_CAR_EXTRA_IMPULSE_MAXDELTAVEL_UU],
  ["EXTRA_COOLDOWN_TICKS", RL.EXTRA_COOLDOWN_TICKS, 1],
  ["EXTRA_FORCE_SCALE", RL.EXTRA_FORCE_SCALE, 1],
  ["CAR_SPAWN_REST_Z", RL.CAR_SPAWN_REST_Z, C.CAR_SPAWN_REST_Z],
  ["CAR_RESPAWN_Z", RL.CAR_RESPAWN_Z, C.CAR_RESPAWN_Z],
  ["HALF_W", RL.HALF_W, C.ARENA_EXTENT_X],
  ["HALF_L", RL.HALF_L, C.ARENA_EXTENT_Y],
  ["CEILING", RL.CEILING, C.ARENA_HEIGHT],
  ["GOAL_HALF_W", RL.GOAL_HALF_W, 892.755],
  ["GOAL_HEIGHT", RL.GOAL_HEIGHT, 642.775],
  ["GOAL_SCORE_Y", RL.GOAL_SCORE_Y, C.SOCCAR_GOAL_SCORE_BASE_THRESHOLD_Y],
  ["ARENA_FRICTION", RL.ARENA_FRICTION, C.CARWORLD_COLLISION_FRICTION],
  ["ARENA_RESTITUTION", RL.ARENA_RESTITUTION, C.CARWORLD_COLLISION_RESTITUTION],
  ["DT", RL.DT, 1 / 120],
  ["CAR_TORQUE_SCALE", RS.CAR_TORQUE_SCALE, C.CAR_TORQUE_SCALE],
  ["THROTTLE_TORQUE", RS.THROTTLE_TORQUE_AMOUNT, C.THROTTLE_TORQUE_AMOUNT],
  ["BRAKE_TORQUE", RS.BRAKE_TORQUE_AMOUNT, C.BRAKE_TORQUE_AMOUNT],
  ["STOPPING_FORWARD_VEL", RS.STOPPING_FORWARD_VEL, C.STOPPING_FORWARD_VEL],
  ["COASTING_BRAKE_FACTOR", RS.COASTING_BRAKE_FACTOR, C.COASTING_BRAKE_FACTOR],
  ["BRAKING_NO_THROTTLE", RS.BRAKING_NO_THROTTLE_SPEED_THRESH, C.BRAKING_NO_THROTTLE_SPEED_THRESH],
  ["THROTTLE_DEADZONE", RS.THROTTLE_DEADZONE, C.THROTTLE_DEADZONE],
  ["THROTTLE_AIR_ACCEL", RS.THROTTLE_AIR_ACCEL, C.THROTTLE_AIR_ACCEL],
  ["JUMP_MIN_TIME", RS.JUMP_MIN_TIME, C.JUMP_MIN_TIME],
  ["JUMP_RESET_TIME_PAD", RS.JUMP_RESET_TIME_PAD, C.JUMP_RESET_TIME_PAD],
  ["JUMP_PRE_MIN_ACCEL_SCALE", RS.JUMP_PRE_MIN_ACCEL_SCALE, C.JUMP_PRE_MIN_ACCEL_SCALE],
  ["AUTOFLIP_IMPULSE", RS.AUTOFLIP_IMPULSE, C.CAR_AUTOFLIP_IMPULSE],
  ["AUTOFLIP_TORQUE", RS.AUTOFLIP_TORQUE, C.CAR_AUTOFLIP_TORQUE],
  ["AUTOFLIP_TIME", RS.AUTOFLIP_TIME, C.CAR_AUTOFLIP_TIME],
  ["AUTOFLIP_NORMZ", RS.AUTOFLIP_NORMZ_THRESH, C.CAR_AUTOFLIP_NORMZ_THRESH],
  ["AUTOFLIP_ROLL", RS.AUTOFLIP_ROLL_THRESH, C.CAR_AUTOFLIP_ROLL_THRESH],
  ["AUTOROLL_FORCE", RS.AUTOROLL_FORCE, C.CAR_AUTOROLL_FORCE],
  ["AUTOROLL_TORQUE", RS.AUTOROLL_TORQUE, C.CAR_AUTOROLL_TORQUE],
  ["SUSP_FRONT", RS.SUSPENSION_FORCE_SCALE_FRONT, C.SUSPENSION_FORCE_SCALE_FRONT],
  ["SUSP_BACK", RS.SUSPENSION_FORCE_SCALE_BACK, C.SUSPENSION_FORCE_SCALE_BACK],
  ["SUSP_STIFF", RS.SUSPENSION_STIFFNESS, C.SUSPENSION_STIFFNESS],
  ["WHEEL_DAMP_C", RS.WHEELS_DAMPING_COMPRESSION, C.WHEELS_DAMPING_COMPRESSION],
  ["WHEEL_DAMP_R", RS.WHEELS_DAMPING_RELAXATION, C.WHEELS_DAMPING_RELAXATION],
  ["MAX_SUSP_TRAVEL", RS.MAX_SUSPENSION_TRAVEL, C.MAX_SUSPENSION_TRAVEL],
  ["SUSP_SUBTRACTION_UU", RS.SUSPENSION_SUBTRACTION, C.SUSPENSION_SUBTRACTION_BT * 50],
  ["ROLLING_FRICTION_MAGIC", RS.ROLLING_FRICTION_SCALE_MAGIC, C.ROLLING_FRICTION_SCALE_MAGIC],
  ["CARWORLD_FRICTION", RS.CARWORLD_FRICTION, C.CARWORLD_COLLISION_FRICTION],
  ["CARWORLD_RESTITUTION", RS.CARWORLD_RESTITUTION, C.CARWORLD_COLLISION_RESTITUTION],
  ["GOAL_DEPTH", RL.GOAL_DEPTH, 880],
  ["CONTACT_EDGE_BLEND", RS.CONTACT_EDGE_CORNER_BLEND, 1],
  ["CONTACT_NORMAL_INSET", RS.CONTACT_NORMAL_INSET_UU, 7],
  ["CONTACT_CORNER_INSET", RS.CONTACT_CORNER_INSET_UU, 5],
  ["CONTACT_FLOOR_NORMAL_Z", RS.CONTACT_FLOOR_NORMAL_Z, 0.55],
  ["CARCAR_FRICTION", RL.CARCAR_FRICTION, C.CARCAR_COLLISION_FRICTION],
  ["CARCAR_RESTITUTION", RL.CARCAR_RESTITUTION, C.CARCAR_COLLISION_RESTITUTION],
  ["CAR_COLLISION_FRICTION", RL.CAR_COLLISION_FRICTION, C.CAR_COLLISION_FRICTION],
  ["CAR_COLLISION_RESTITUTION", RL.CAR_COLLISION_RESTITUTION, C.CAR_COLLISION_RESTITUTION],
  ["BUMP_COOLDOWN_TIME", RL.BUMP_COOLDOWN_TIME, C.BUMP_COOLDOWN_TIME],
  ["BUMP_MIN_FORWARD_DIST", RL.BUMP_MIN_FORWARD_DIST, C.BUMP_MIN_FORWARD_DIST],
  ["DEMO_RESPAWN_TIME", RL.DEMO_RESPAWN_TIME, C.DEMO_RESPAWN_TIME],
  ["BUMP_FORCE_SCALE", RL.BUMP_FORCE_SCALE, 1],
];

for (const [name, got, want] of scalars) {
  check(name, exact(got, want) || near(got, want, 1e-9), `got=${got} want=${want}`);
}

check("T_PITCH effective", exact(RL.T_PITCH, C.CAR_AIR_CONTROL_TORQUE.pitch * C.CAR_TORQUE_SCALE));
check("T_YAW effective", exact(RL.T_YAW, C.CAR_AIR_CONTROL_TORQUE.yaw * C.CAR_TORQUE_SCALE));
check("T_ROLL effective", exact(RL.T_ROLL, C.CAR_AIR_CONTROL_TORQUE.roll * C.CAR_TORQUE_SCALE));
check("D_PITCH effective", exact(RL.D_PITCH, -C.CAR_AIR_CONTROL_DAMPING.pitch * C.CAR_TORQUE_SCALE));
check("D_YAW effective", exact(RL.D_YAW, -C.CAR_AIR_CONTROL_DAMPING.yaw * C.CAR_TORQUE_SCALE));
check("D_ROLL effective", exact(RL.D_ROLL, -C.CAR_AIR_CONTROL_DAMPING.roll * C.CAR_TORQUE_SCALE));
check(
  "AIR torque pitch/yaw/roll",
  exact(RS.AIR_CONTROL_TORQUE.pitch, f32(130)) &&
    exact(RS.AIR_CONTROL_TORQUE.yaw, f32(95)) &&
    exact(RS.AIR_CONTROL_TORQUE.roll, f32(400)),
);
check(
  "AIR damp pitch/yaw/roll",
  exact(RS.AIR_CONTROL_DAMPING.pitch, f32(30)) &&
    exact(RS.AIR_CONTROL_DAMPING.yaw, f32(20)) &&
    exact(RS.AIR_CONTROL_DAMPING.roll, f32(50)),
);
check("AIR_THROTTLE == RS.THROTTLE_AIR_ACCEL", exact(RL.AIR_THROTTLE, RS.THROTTLE_AIR_ACCEL));
check("rlConst THROTTLE matches dump f32(200/3)", exact(C.THROTTLE_AIR_ACCEL, f32(200 / 3)));
check("rlConst BALL_DRAG matches f32(0.03)", exact(C.BALL_DRAG, f32(0.03)));
check("arenaMesh HALF_W", ARENA_HALF_W === RL.HALF_W);
check("arenaMesh CEILING", ARENA_CEILING === RL.CEILING);
check("octane REST_HEIGHT == CAR_SPAWN_REST_Z", near(RL.REST_HEIGHT, RL.CAR_SPAWN_REST_Z));

console.log("\n=== Curves (full RocketSim key points) ===");
const STEER = [
  [0, 0.53356],
  [500, 0.3193],
  [1000, 0.18203],
  [1500, 0.1057],
  [1750, 0.08507],
  [3000, 0.03454],
];
const POWERSLIDE_STEER = [
  [0, 0.39235],
  [2500, 0.1261],
];
const DRIVE_TORQUE = [
  [0, 1],
  [1400, 0.1],
  [1410, 0],
];
const NON_STICKY = [
  [0, 0.1],
  [0.7075, 0.5],
  [1, 1],
];
const LAT_FRICTION = [
  [0, 1],
  [1, 0.2],
];
const HB_LONG = [
  [0, 0.5],
  [1, 0.9],
];
const EXTRA_CURVE = [
  [0, 0.65],
  [500, 0.65],
  [2300, 0.55],
  [4600, 0.3],
];

for (const [x, y] of STEER) {
  check(`steerAngle(${x})`, near(RS_CURVES.steerAngle(x), y));
}
for (const [x, y] of POWERSLIDE_STEER) {
  check(`powerslideSteer(${x})`, near(RS_CURVES.powerslideSteerAngle(x), y));
}
for (const [x, y] of DRIVE_TORQUE) {
  check(`driveTorque(${x})`, near(RS_CURVES.driveSpeedTorque(x), y));
}
for (const [x, y] of NON_STICKY) {
  check(`nonSticky(${x})`, near(RS_CURVES.nonStickyFriction(x), y));
}
for (const [x, y] of LAT_FRICTION) {
  check(`latFriction(${x})`, near(RS_CURVES.latFriction(x), y));
}
check("handbrakeLat(0)", near(RS_CURVES.handbrakeLatFriction(0), 0.1));
for (const [x, y] of HB_LONG) {
  check(`handbrakeLong(${x})`, near(RS_CURVES.handbrakeLongFriction(x), y));
}
for (const [x, y] of EXTRA_CURVE) {
  check(`extraImpulse(${x})`, near(extraImpulseScale(x), y));
}
check(
  "extraImpulse(1400 mid)",
  near(extraImpulseScale(1400), 0.65 + ((1400 - 500) / 1800) * (0.55 - 0.65)),
);

for (const [x, y] of RL_CURVES.bumpVelGround) {
  check(`bumpVelGround(${x})`, exact(RS_CURVES.bumpVelGround(x), y) || near(RS_CURVES.bumpVelGround(x), y));
}
for (const [x, y] of RL_CURVES.bumpVelAir) {
  check(`bumpVelAir(${x})`, exact(RS_CURVES.bumpVelAir(x), y) || near(RS_CURVES.bumpVelAir(x), y));
}
for (const [x, y] of RL_CURVES.bumpVelUp) {
  check(`bumpVelUp(${x})`, exact(RS_CURVES.bumpVelUp(x), y) || near(RS_CURVES.bumpVelUp(x), y));
}
check("bump ground y0 is f32(5/6)", exact(RL_CURVES.bumpVelGround[0][1], f32(5 / 6)));
check("bump up y0 is f32(2/6)", exact(RL_CURVES.bumpVelUp[0][1], f32(2 / 6)));

console.log("\n=== Boost pads (all locations + BOX_*) ===");
check("SMALL amount", BOOST_PAD.SMALL_AMOUNT === 12);
check("BIG amount", BOOST_PAD.BIG_AMOUNT === 100);
check("SMALL cooldown", BOOST_PAD.SMALL_COOLDOWN === 4);
check("BIG cooldown", BOOST_PAD.BIG_COOLDOWN === 10);
check("SMALL radius", BOOST_PAD.SMALL_RADIUS === 144);
check("BIG radius", BOOST_PAD.BIG_RADIUS === 208);
check("CYL height", BOOST_PAD.CYL_HEIGHT === 95);
check("BOX height", BOOST_PAD.BOX_HEIGHT === 64);
check("BOX rad small", BOOST_PAD.BOX_RAD_SMALL === 120);
check("BOX rad big", BOOST_PAD.BOX_RAD_BIG === 160);
check("small pad count", SOCCAR_SMALL_PADS.length === 28);
check("big pad count", SOCCAR_BIG_PADS.length === 6);

/** @type {[number, number, number][]} */
const RS_SMALL = [
  [0, -4240, 70],
  [-1792, -4184, 70],
  [1792, -4184, 70],
  [-940, -3308, 70],
  [940, -3308, 70],
  [0, -2816, 70],
  [-3584, -2484, 70],
  [3584, -2484, 70],
  [-1788, -2300, 70],
  [1788, -2300, 70],
  [-2048, -1036, 70],
  [0, -1024, 70],
  [2048, -1036, 70],
  [-1024, 0, 70],
  [1024, 0, 70],
  [-2048, 1036, 70],
  [0, 1024, 70],
  [2048, 1036, 70],
  [-1788, 2300, 70],
  [1788, 2300, 70],
  [-3584, 2484, 70],
  [3584, 2484, 70],
  [0, 2816, 70],
  [-940, 3308, 70],
  [940, 3308, 70],
  [-1792, 4184, 70],
  [1792, 4184, 70],
  [0, 4240, 70],
];
/** @type {[number, number, number][]} */
const RS_BIG = [
  [-3584, 0, 73],
  [3584, 0, 73],
  [-3072, 4096, 73],
  [3072, 4096, 73],
  [-3072, -4096, 73],
  [3072, -4096, 73],
];

for (let i = 0; i < RS_SMALL.length; i++) {
  const p = SOCCAR_SMALL_PADS[i];
  const [x, y, z] = RS_SMALL[i];
  check(
    `small[${i}]`,
    p != null && p.x === x && p.y === y && p.z === z && p.big === false,
  );
}
for (let i = 0; i < RS_BIG.length; i++) {
  const p = SOCCAR_BIG_PADS[i];
  const [x, y, z] = RS_BIG[i];
  check(
    `big[${i}]`,
    p != null && p.x === x && p.y === y && p.z === z && p.big === true,
  );
}

console.log("\n=== Kickoff / respawn slots ===");
/** @type {{ x: number, y: number, yaw: number }[]} */
const RS_SPAWNS = [
  { x: -2048, y: -2560, yaw: Math.PI / 4 },
  { x: 2048, y: -2560, yaw: (3 * Math.PI) / 4 },
  { x: -256, y: -3840, yaw: Math.PI / 2 },
  { x: 256, y: -3840, yaw: Math.PI / 2 },
  { x: 0, y: -4608, yaw: Math.PI / 2 },
];
/** @type {{ x: number, y: number, yaw: number }[]} */
const RS_RESPAWNS = [
  { x: -2304, y: -4608, yaw: Math.PI / 2 },
  { x: -2688, y: -4608, yaw: Math.PI / 2 },
  { x: 2304, y: -4608, yaw: Math.PI / 2 },
  { x: 2688, y: -4608, yaw: Math.PI / 2 },
];
check("spawn count", RL.SOCCAR_SPAWNS.length === 5);
check("respawn count", RL.SOCCAR_RESPAWNS.length === 4);
for (let i = 0; i < RS_SPAWNS.length; i++) {
  const a = RL.SOCCAR_SPAWNS[i];
  const b = RS_SPAWNS[i];
  check(
    `spawn[${i}]`,
    near(a.x, b.x) && near(a.y, b.y) && near(a.yaw, b.yaw),
  );
}
for (let i = 0; i < RS_RESPAWNS.length; i++) {
  const a = RL.SOCCAR_RESPAWNS[i];
  const b = RS_RESPAWNS[i];
  check(
    `respawn[${i}]`,
    near(a.x, b.x) && near(a.y, b.y) && near(a.yaw, b.yaw),
  );
}

console.log("\n=== Hitbox presets (CarConfig) ===");
/** @type {Record<string, { size: number[], offset: number[], front: object, back: object }>} */
const RS_HITBOX = {
  octane: {
    size: [120.507, 86.6994, 38.6591],
    offset: [13.8757, 0, 20.755],
    front: { radius: 12.5, suspensionRest: 38.755, offset: [51.25, 25.9, 20.755] },
    back: { radius: 15.0, suspensionRest: 37.055, offset: [-33.75, 29.5, 20.755] },
  },
  dominus: {
    size: [130.427, 85.7799, 33.8],
    offset: [9.0, 0, 15.75],
    front: { radius: 12.0, suspensionRest: 33.95, offset: [50.3, 31.1, 15.75] },
    back: { radius: 13.5, suspensionRest: 33.85, offset: [-34.75, 33.0, 15.75] },
  },
  plank: {
    size: [131.32, 87.1704, 31.8944],
    offset: [9.00857, 0, 12.0942],
    front: { radius: 12.5, suspensionRest: 31.9242, offset: [49.97, 27.8, 12.0942] },
    back: { radius: 17.0, suspensionRest: 27.9242, offset: [-35.43, 20.28, 12.0942] },
  },
  breakout: {
    size: [133.992, 83.021, 32.8],
    offset: [12.5, 0, 11.75],
    front: { radius: 13.5, suspensionRest: 29.7, offset: [51.5, 26.67, 11.75] },
    back: { radius: 15.0, suspensionRest: 29.666, offset: [-35.75, 35.0, 11.75] },
  },
  hybrid: {
    size: [129.519, 84.6879, 36.6591],
    offset: [13.8757, 0, 20.755],
    front: { radius: 12.5, suspensionRest: 38.755, offset: [51.25, 25.9, 20.755] },
    back: { radius: 15.0, suspensionRest: 37.055, offset: [-34.0, 29.5, 20.755] },
  },
  merc: {
    size: [123.22, 79.2103, 44.1591],
    offset: [11.3757, 0, 21.505],
    front: { radius: 15.0, suspensionRest: 39.505, offset: [51.25, 25.9, 21.505] },
    back: { radius: 15.0, suspensionRest: 39.105, offset: [-33.75, 29.5, 21.505] },
  },
};

for (const id of Object.keys(RS_HITBOX)) {
  const js = HITBOX_PRESETS[id];
  const rs = RS_HITBOX[id];
  check(`${id} size`, nearArr(js.size, rs.size));
  check(`${id} offset`, nearArr(js.offset, rs.offset));
  check(
    `${id} front wheel`,
    near(js.wheels.front.radius, rs.front.radius) &&
      near(js.wheels.front.suspensionRest, rs.front.suspensionRest) &&
      nearArr(js.wheels.front.offset, rs.front.offset),
  );
  check(
    `${id} back wheel`,
    near(js.wheels.back.radius, rs.back.radius) &&
      near(js.wheels.back.suspensionRest, rs.back.suspensionRest) &&
      nearArr(js.wheels.back.offset, rs.back.offset),
  );
}

console.log("\n=== Camera (ProfileCameraSettings / BakkesMod defaults) ===");
check("camera.fov", DEFAULT_CAMERA.fov === 110);
check("camera.distance", DEFAULT_CAMERA.distance === 270);
check("camera.height", DEFAULT_CAMERA.height === 100);
check("camera.angle", DEFAULT_CAMERA.angle === -3);
check("camera.stiffness", DEFAULT_CAMERA.stiffness === 0.5);
check("camera.swivelSpeed", DEFAULT_CAMERA.swivelSpeed === 2.5);
check("camera.transitionSpeed", DEFAULT_CAMERA.transitionSpeed === 1.0);
check("camera.shake", DEFAULT_CAMERA.shake === false);
check("camera.ballCam", DEFAULT_CAMERA.ballCam === false);
check("RL_CAMERA.FOV", RL_CAMERA.FOV === DEFAULT_CAMERA.fov);
check("RL_CAMERA.DISTANCE", RL_CAMERA.DISTANCE === DEFAULT_CAMERA.distance);
check("RL_CAMERA.HEIGHT", RL_CAMERA.HEIGHT === DEFAULT_CAMERA.height);
check("RL_CAMERA.ANGLE", RL_CAMERA.ANGLE === DEFAULT_CAMERA.angle);
check("RL_CAMERA.STIFFNESS", RL_CAMERA.STIFFNESS === DEFAULT_CAMERA.stiffness);
check("RL_CAMERA.SWIVEL_SPEED", RL_CAMERA.SWIVEL_SPEED === DEFAULT_CAMERA.swivelSpeed);
check(
  "RL_CAMERA.TRANSITION_SPEED",
  RL_CAMERA.TRANSITION_SPEED === DEFAULT_CAMERA.transitionSpeed,
);
check("RL_CAMERA.STIFFNESS_ZOOM_UU", RL_CAMERA.STIFFNESS_ZOOM_UU === 100);
check("RL_CAMERA.STIFFNESS_ZOOM_SPEED", RL_CAMERA.STIFFNESS_ZOOM_SPEED === 2300);
check("UU scale", UU === 0.01);
check("ARENA_UU == UU", ARENA_UU === UU);
check("ball UU_SCALE == UU", UU_SCALE === UU);
check(
  "goal visual half-W metres",
  near(RL.GOAL_HALF_W * UU, 8.92755, 1e-5),
);
check(
  "goal visual height metres",
  near(RL.GOAL_HEIGHT * UU, 6.42775, 1e-5),
);
check("ball visual radius metres", near(RL.BALL_RADIUS * UU, 0.9125, 1e-6));
check("octane length metres", near(HITBOX_PRESETS.octane.size[0] * UU, 1.20507, 1e-5));

console.log("\n=== Live RocketSim MutatorConfig + CarConfig (optional) ===");
let py;
try {
  py = spawnPythonSync(
  [
    "-c",
    `import RocketSim as rs, json
mc=rs.MutatorConfig()
cfgs={}
for name, enum in [("octane",0),("dominus",1),("plank",2),("breakout",3),("hybrid",4),("merc",5)]:
    c=rs.CarConfig(enum)
    cfgs[name]={
      "size": list(c.hitbox_size),
      "offset": list(c.hitbox_pos_offset),
      "dodge": c.dodge_deadzone,
      "front": [c.front_wheels.wheel_radius, c.front_wheels.suspension_rest_length, *c.front_wheels.connection_point_offset],
      "back": [c.back_wheels.wheel_radius, c.back_wheels.suspension_rest_length, *c.back_wheels.connection_point_offset],
    }
print(json.dumps({
  "ball_drag": mc.ball_drag,
  "ball_mass": mc.ball_mass,
  "ball_radius": mc.ball_radius,
  "ball_max_speed": mc.ball_max_speed,
  "ball_world_friction": mc.ball_world_friction,
  "ball_world_restitution": mc.ball_world_restitution,
  "ball_hit_extra_force_scale": mc.ball_hit_extra_force_scale,
  "boost_accel_air": mc.boost_accel_air,
  "boost_accel_ground": mc.boost_accel_ground,
  "boost_used_per_second": mc.boost_used_per_second,
  "car_spawn_boost_amount": mc.car_spawn_boost_amount,
  "car_mass": mc.car_mass,
  "car_world_friction": mc.car_world_friction,
  "car_world_restitution": mc.car_world_restitution,
  "jump_accel": mc.jump_accel,
  "jump_immediate_force": mc.jump_immediate_force,
  "gravity_z": mc.gravity[2],
  "goal_base_threshold_y": mc.goal_base_threshold_y,
  "boost_pad_cooldown_big": mc.boost_pad_cooldown_big,
  "boost_pad_cooldown_small": mc.boost_pad_cooldown_small,
  "bump_cooldown_time": mc.bump_cooldown_time,
  "respawn_delay": mc.respawn_delay,
  "cfgs": cfgs,
}))`,
  ],
  { encoding: "utf8" },
  );
} catch (error) {
  if (error.code === "PYTHON_INVALID_OVERRIDE") {
    check("Python interpreter override", false, error.message);
  } else if (error.code === "PYTHON_NOT_FOUND") {
    console.log(`(skip live MutatorConfig — ${error.message})`);
  } else {
    throw error;
  }
}

if (py?.status === 0) {
  const live = JSON.parse(py.stdout);
  const pairs = [
    ["ball_drag", RL.BALL_DRAG, live.ball_drag],
    ["ball_mass", RL.BALL_MASS, live.ball_mass],
    ["ball_radius", RL.BALL_RADIUS, live.ball_radius],
    ["ball_max_speed", RL.BALL_MAX_SPEED, live.ball_max_speed],
    ["ball_friction", RL.BALL_FRICTION, live.ball_world_friction],
    ["ball_restitution", RL.BALL_RESTITUTION, live.ball_world_restitution],
    ["extra_force_scale", RL.EXTRA_FORCE_SCALE, live.ball_hit_extra_force_scale],
    ["boost_air", RL.BOOST_ACCEL_AIR, live.boost_accel_air],
    ["boost_ground", RL.BOOST_ACCEL_GROUND, live.boost_accel_ground],
    ["boost_use", RL.BOOST_USE, live.boost_used_per_second],
    ["boost_spawn", RL.BOOST_SPAWN, live.car_spawn_boost_amount],
    ["car_mass", RL.CAR_MASS, live.car_mass],
    ["car_world_friction", RL.ARENA_FRICTION, live.car_world_friction],
    ["car_world_restitution", RL.ARENA_RESTITUTION, live.car_world_restitution],
    ["jump_accel", RL.JUMP_HOLD_ACCEL, live.jump_accel],
    ["jump_impulse", RL.JUMP_IMPULSE, live.jump_immediate_force],
    ["gravity", -RL.GRAVITY, live.gravity_z],
    ["goal_score_y", RL.GOAL_SCORE_Y, live.goal_base_threshold_y],
    ["pad_cd_big", BOOST_PAD.BIG_COOLDOWN, live.boost_pad_cooldown_big],
    ["pad_cd_small", BOOST_PAD.SMALL_COOLDOWN, live.boost_pad_cooldown_small],
    ["bump_cooldown", RL.BUMP_COOLDOWN_TIME, live.bump_cooldown_time],
    ["respawn_delay", RL.DEMO_RESPAWN_TIME, live.respawn_delay],
  ];
  for (const [name, got, want] of pairs) {
    check(`live ${name}`, near(got, want, 1e-4), `got=${got} rs=${want}`);
  }
  for (const id of Object.keys(live.cfgs)) {
    const js = HITBOX_PRESETS[id];
    const rs = live.cfgs[id];
    check(`live ${id} size`, nearArr(js.size, rs.size, 1e-3));
    check(`live ${id} offset`, nearArr(js.offset, rs.offset, 1e-3));
    check(`live ${id} dodge`, near(js ? RL.DODGE_DEADZONE : 0, rs.dodge));
    check(
      `live ${id} front`,
      near(js.wheels.front.radius, rs.front[0], 1e-3) &&
        near(js.wheels.front.suspensionRest, rs.front[1], 1e-3) &&
        nearArr(js.wheels.front.offset, rs.front.slice(2), 1e-3),
    );
    check(
      `live ${id} back`,
      near(js.wheels.back.radius, rs.back[0], 1e-3) &&
        near(js.wheels.back.suspensionRest, rs.back[1], 1e-3) &&
        nearArr(js.wheels.back.offset, rs.back.slice(2), 1e-3),
    );
  }
} else if (py) {
  console.log("(skip live MutatorConfig — RocketSim python not importable)");
  if (py.error) console.log(py.error.message);
  if (py.stderr) console.log(py.stderr.slice(0, 400));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
