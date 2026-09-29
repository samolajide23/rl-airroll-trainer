/**
 * Assert browser constants / curves / pads / hitboxes / spawns match RocketSim
 * RLConst and CarConfig across the whole site. Run: `npm run physics:parity`
 *
 * Optionally cross-checks live MutatorConfig + CarConfig via Python when
 * RocketSim is installed (`python3 -c "import RocketSim"`).
 */
import { spawnSync } from "node:child_process";
import { RL, extraImpulseScale } from "../src/shared/rl-physics.js";
import { RS, RS_CURVES } from "../src/shared/carSim.js";
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

/** @param {number[]} a @param {number[]} b @param {number} [eps] */
function nearArr(a, b, eps = 1e-4) {
  return a.length === b.length && a.every((v, i) => near(v, b[i], eps));
}

console.log("=== RL / RS scalars (RocketSim RLConst) ===");
const scalars = [
  ["GRAVITY", RL.GRAVITY, 650],
  ["MAX_SPEED", RL.MAX_SPEED, 2300],
  ["MAX_DRIVE_SPEED", RL.MAX_DRIVE_SPEED, 1410],
  ["MAX_ANG_VEL", RL.MAX_ANG_VEL, 5.5],
  ["BOOST_ACCEL_AIR", RL.BOOST_ACCEL_AIR, 3175 / 3],
  ["BOOST_ACCEL_GROUND", RL.BOOST_ACCEL_GROUND, 2975 / 3],
  ["BOOST_USE", RL.BOOST_USE, 100 / 3],
  ["BOOST_MAX", RL.BOOST_MAX, 100],
  ["BOOST_SPAWN", RL.BOOST_SPAWN, 100 / 3],
  ["BOOST_MIN_TIME", RL.BOOST_MIN_TIME, 0.1],
  ["AIR_THROTTLE", RL.AIR_THROTTLE, 200 / 3],
  ["JUMP_IMPULSE", RL.JUMP_IMPULSE, 875 / 3],
  ["JUMP_HOLD_ACCEL", RL.JUMP_HOLD_ACCEL, 4375 / 3],
  ["JUMP_HOLD_MAX", RL.JUMP_HOLD_MAX, 0.2],
  ["FLIP_WINDOW", RL.FLIP_WINDOW, 1.25],
  ["DODGE_DEADZONE", RL.DODGE_DEADZONE, 0.5],
  ["FLIP_TORQUE_TIME", RL.FLIP_TORQUE_TIME, 0.65],
  ["FLIP_TORQUE_MIN_TIME", RL.FLIP_TORQUE_MIN_TIME, 0.41],
  ["FLIP_PITCHLOCK_TIME", RL.FLIP_PITCHLOCK_TIME, 1],
  ["FLIP_PITCHLOCK_EXTRA", RL.FLIP_PITCHLOCK_EXTRA, 0.3],
  ["FLIP_Z_DAMP_120", RL.FLIP_Z_DAMP_120, 0.35],
  ["FLIP_Z_DAMP_START", RL.FLIP_Z_DAMP_START, 0.15],
  ["FLIP_Z_DAMP_END", RL.FLIP_Z_DAMP_END, 0.21],
  ["FLIP_INITIAL_VEL", RL.FLIP_INITIAL_VEL, 500],
  ["FLIP_TORQUE_X", RL.FLIP_TORQUE_X, 260],
  ["FLIP_TORQUE_Y", RL.FLIP_TORQUE_Y, 224],
  ["FLIP_FWD_SPEED_SCALE", RL.FLIP_FWD_SPEED_SCALE, 1],
  ["FLIP_SIDE_SPEED_SCALE", RL.FLIP_SIDE_SPEED_SCALE, 1.9],
  ["FLIP_BACK_SPEED_SCALE", RL.FLIP_BACK_SPEED_SCALE, 2.5],
  ["FLIP_BACK_IMPULSE_X", RL.FLIP_BACK_IMPULSE_X, 16 / 15],
  ["SUPERSONIC_START", RL.SUPERSONIC_START, 2200],
  ["SUPERSONIC_KEEP", RL.SUPERSONIC_KEEP, 2100],
  ["SUPERSONIC_KEEP_TIME", RL.SUPERSONIC_KEEP_TIME, 1],
  ["POWERSLIDE_RISE", RL.POWERSLIDE_RISE, 5],
  ["POWERSLIDE_FALL", RL.POWERSLIDE_FALL, 2],
  ["CAR_MASS", RL.CAR_MASS, 180],
  ["BALL_MASS", RL.BALL_MASS, 30],
  ["BALL_RADIUS", RL.BALL_RADIUS, 91.25],
  ["BALL_MAX_SPEED", RL.BALL_MAX_SPEED, 6000],
  ["BALL_MAX_SPIN", RL.BALL_MAX_SPIN, 6],
  ["BALL_RESTITUTION", RL.BALL_RESTITUTION, 0.6],
  ["BALL_FRICTION", RL.BALL_FRICTION, 0.35],
  ["BALL_DRAG", RL.BALL_DRAG, 0.03],
  ["BALL_REST_Z", RL.BALL_REST_Z, 93.15],
  ["CARBALL_FRICTION", RL.CARBALL_FRICTION, 2],
  ["CARBALL_RESTITUTION", RL.CARBALL_RESTITUTION, 0],
  ["EXTRA_IMPULSE_Z", RL.EXTRA_IMPULSE_Z, 0.35],
  ["EXTRA_IMPULSE_FWD", RL.EXTRA_IMPULSE_FWD, 0.65],
  ["EXTRA_IMPULSE_MAX_DV", RL.EXTRA_IMPULSE_MAX_DV, 4600],
  ["EXTRA_COOLDOWN_TICKS", RL.EXTRA_COOLDOWN_TICKS, 1],
  ["EXTRA_FORCE_SCALE", RL.EXTRA_FORCE_SCALE, 1],
  ["CAR_SPAWN_REST_Z", RL.CAR_SPAWN_REST_Z, 17],
  ["CAR_RESPAWN_Z", RL.CAR_RESPAWN_Z, 36],
  ["HALF_W", RL.HALF_W, 4096],
  ["HALF_L", RL.HALF_L, 5120],
  ["CEILING", RL.CEILING, 2048],
  ["GOAL_HALF_W", RL.GOAL_HALF_W, 892.755],
  ["GOAL_HEIGHT", RL.GOAL_HEIGHT, 642.775],
  ["GOAL_SCORE_Y", RL.GOAL_SCORE_Y, 5124.25],
  ["ARENA_FRICTION", RL.ARENA_FRICTION, 0.3],
  ["ARENA_RESTITUTION", RL.ARENA_RESTITUTION, 0.3],
  ["DT", RL.DT, 1 / 120],
  ["CAR_TORQUE_SCALE", RS.CAR_TORQUE_SCALE, ((2 * Math.PI) / (1 << 16)) * 1000],
  ["THROTTLE_TORQUE", RS.THROTTLE_TORQUE_AMOUNT, 180 * 400],
  ["BRAKE_TORQUE", RS.BRAKE_TORQUE_AMOUNT, 180 * (14.25 + 1 / 3)],
  ["STOPPING_FORWARD_VEL", RS.STOPPING_FORWARD_VEL, 25],
  ["COASTING_BRAKE_FACTOR", RS.COASTING_BRAKE_FACTOR, 0.15],
  ["BRAKING_NO_THROTTLE", RS.BRAKING_NO_THROTTLE_SPEED_THRESH, 0.01],
  ["THROTTLE_DEADZONE", RS.THROTTLE_DEADZONE, 0.001],
  ["THROTTLE_AIR_ACCEL", RS.THROTTLE_AIR_ACCEL, 200 / 3],
  ["JUMP_MIN_TIME", RS.JUMP_MIN_TIME, 0.025],
  ["JUMP_RESET_TIME_PAD", RS.JUMP_RESET_TIME_PAD, 1 / 40],
  ["JUMP_PRE_MIN_ACCEL_SCALE", RS.JUMP_PRE_MIN_ACCEL_SCALE, 0.62],
  ["AUTOFLIP_IMPULSE", RS.AUTOFLIP_IMPULSE, 200],
  ["AUTOFLIP_TORQUE", RS.AUTOFLIP_TORQUE, 50],
  ["AUTOFLIP_TIME", RS.AUTOFLIP_TIME, 0.4],
  ["AUTOFLIP_NORMZ", RS.AUTOFLIP_NORMZ_THRESH, Math.SQRT1_2],
  ["AUTOFLIP_ROLL", RS.AUTOFLIP_ROLL_THRESH, 2.8],
  ["AUTOROLL_FORCE", RS.AUTOROLL_FORCE, 100],
  ["AUTOROLL_TORQUE", RS.AUTOROLL_TORQUE, 80],
  ["SUSP_FRONT", RS.SUSPENSION_FORCE_SCALE_FRONT, 36 - 0.25],
  ["SUSP_BACK", RS.SUSPENSION_FORCE_SCALE_BACK, 54 + 0.25 + 0.015],
  ["SUSP_STIFF", RS.SUSPENSION_STIFFNESS, 500],
  ["WHEEL_DAMP_C", RS.WHEELS_DAMPING_COMPRESSION, 25],
  ["WHEEL_DAMP_R", RS.WHEELS_DAMPING_RELAXATION, 40],
  ["MAX_SUSP_TRAVEL", RS.MAX_SUSPENSION_TRAVEL, 12],
  ["SUSP_SUBTRACTION_UU", RS.SUSPENSION_SUBTRACTION, 0.05 * 50],
  ["CARWORLD_FRICTION", RS.CARWORLD_FRICTION, 0.3],
  ["CARWORLD_RESTITUTION", RS.CARWORLD_RESTITUTION, 0.3],
  ["GOAL_DEPTH", RL.GOAL_DEPTH, 880],
  ["CONTACT_EDGE_BLEND", RS.CONTACT_EDGE_CORNER_BLEND, 1],
  ["CONTACT_NORMAL_INSET", RS.CONTACT_NORMAL_INSET_UU, 7],
  ["CONTACT_CORNER_INSET", RS.CONTACT_CORNER_INSET_UU, 5],
  ["CONTACT_FLOOR_NORMAL_Z", RS.CONTACT_FLOOR_NORMAL_Z, 0.55],
  ["CARCAR_FRICTION", RL.CARCAR_FRICTION, 0.09],
  ["CARCAR_RESTITUTION", RL.CARCAR_RESTITUTION, 0.1],
  ["CAR_COLLISION_FRICTION", RL.CAR_COLLISION_FRICTION, 0.3],
  ["CAR_COLLISION_RESTITUTION", RL.CAR_COLLISION_RESTITUTION, 0.1],
  ["BUMP_COOLDOWN_TIME", RL.BUMP_COOLDOWN_TIME, 0.25],
  ["BUMP_MIN_FORWARD_DIST", RL.BUMP_MIN_FORWARD_DIST, 64.5],
  ["DEMO_RESPAWN_TIME", RL.DEMO_RESPAWN_TIME, 3],
  ["BUMP_FORCE_SCALE", RL.BUMP_FORCE_SCALE, 1],
];

for (const [name, got, want] of scalars) {
  check(name, near(got, want, 1e-4), `got=${got} want=${want}`);
}

check("T_PITCH effective", near(RL.T_PITCH, 130 * RS.CAR_TORQUE_SCALE));
check("T_YAW effective", near(RL.T_YAW, 95 * RS.CAR_TORQUE_SCALE));
check("T_ROLL effective", near(RL.T_ROLL, 400 * RS.CAR_TORQUE_SCALE));
check("D_PITCH effective", near(RL.D_PITCH, -30 * RS.CAR_TORQUE_SCALE));
check("D_YAW effective", near(RL.D_YAW, -20 * RS.CAR_TORQUE_SCALE));
check("D_ROLL effective", near(RL.D_ROLL, -50 * RS.CAR_TORQUE_SCALE));
check(
  "AIR torque pitch/yaw/roll",
  RS.AIR_CONTROL_TORQUE.pitch === 130 &&
    RS.AIR_CONTROL_TORQUE.yaw === 95 &&
    RS.AIR_CONTROL_TORQUE.roll === 400,
);
check(
  "AIR damp pitch/yaw/roll",
  RS.AIR_CONTROL_DAMPING.pitch === 30 &&
    RS.AIR_CONTROL_DAMPING.yaw === 20 &&
    RS.AIR_CONTROL_DAMPING.roll === 50,
);
check("AIR_THROTTLE == RS.THROTTLE_AIR_ACCEL", near(RL.AIR_THROTTLE, RS.THROTTLE_AIR_ACCEL));
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

const BUMP_GROUND = [
  [0, 1 / 1.2],
  [1400, 1100],
  [2200, 1530],
];
const BUMP_AIR = [
  [0, 1 / 1.2],
  [1400, 1390],
  [2200, 1945],
];
const BUMP_UP = [
  [0, 1 / 3],
  [1400, 278],
  [2200, 417],
];
for (const [x, y] of BUMP_GROUND) {
  check(`bumpVelGround(${x})`, near(RS_CURVES.bumpVelGround(x), y));
}
for (const [x, y] of BUMP_AIR) {
  check(`bumpVelAir(${x})`, near(RS_CURVES.bumpVelAir(x), y));
}
for (const [x, y] of BUMP_UP) {
  check(`bumpVelUp(${x})`, near(RS_CURVES.bumpVelUp(x), y));
}

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
const py = spawnSync(
  "python3",
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

if (py.status === 0) {
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
    ["bump_cooldown", 0.25, live.bump_cooldown_time],
    ["respawn_delay", 3, live.respawn_delay],
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
} else {
  console.log("(skip live MutatorConfig — RocketSim python not importable)");
  if (py.stderr) console.log(py.stderr.slice(0, 400));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
