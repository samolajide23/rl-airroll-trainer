#!/usr/bin/env node
/**
 * Replay physics-compare scenarios through src/shared/carSim.js (via carPhysics.js).
 * Writes trajectories in the same schema as generate_rocketsim.py.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { RL, axes, makePhysCar, stepCar } from "../../src/shared/carPhysics.js";
import { makeBall, stepBall } from "../../src/shared/rl-physics.js";
import { RS } from "../../src/shared/carSim.js";
import { stepCarBall } from "../../src/shared/carSim.js";
import { createSoccarBoostPads, stepBoostPads } from "../../src/shared/boostPads.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCENARIOS = path.join(HERE, "scenarios.json");
const DEFAULT_OUT = path.join(HERE, "out", "js");

function deepMerge(base, overlay) {
  const out = { ...base };
  if (!overlay) return out;
  for (const [key, value] of Object.entries(overlay)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function controlsAtTick(tick, defaults, scenario) {
  const base = deepMerge(defaults.controls ?? {}, scenario.controls);
  const schedule = scenario.control_schedule;
  if (!schedule) return base;
  for (const entry of schedule) {
    if (tick < entry.until_tick) return deepMerge(base, entry.controls);
  }
  return deepMerge(base, schedule[schedule.length - 1].controls);
}

function vecList(v) {
  return [v.x, v.y, v.z];
}

/** Match RocketSim Angle / RotMat: yaw, pitch, roll about Z, Y-after-yaw? Angle.as_rot_mat. */
function setOrientation(car, yaw, pitch, roll) {
  // RocketSim Angle YPR → RotMat (f, right, up). `axes().l` is local +Y
  // = car right, so pass right as the Y column (not -right; that would be improper).
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  const forward = new THREE.Vector3(cp * cy, cp * sy, sp);
  const right = new THREE.Vector3(
    cy * sp * sr - sy * cr,
    sy * sp * sr + cy * cr,
    -cp * sr,
  );
  const up = new THREE.Vector3(
    -cy * sp * cr - sy * sr,
    -sy * sp * cr + cy * sr,
    cp * cr,
  );
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, right, up));
  car.q.normalize();
}

function scenarioMode(scenario, initial) {
  const explicit = scenario.game_mode ?? initial.game_mode;
  if (explicit) return String(explicit).toLowerCase();
  return initial.on_ground ? "soccar" : "void";
}

function idleControls() {
  return {
    throttle: 0,
    steer: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    boost: false,
    jump: false,
    handbrake: false,
  };
}

function initCar(initial) {
  const car = makePhysCar(new THREE.Vector3(...initial.pos), 0);
  car.vel.set(...initial.vel);
  car.omega.set(...initial.ang_vel);
  car.boost = initial.boost ?? RL.BOOST_MAX;
  car.onGround = initial.on_ground ?? false;
  car.wheelsContact = car.onGround;
  setOrientation(
    car,
    initial.yaw ?? 0,
    initial.pitch ?? 0,
    initial.roll ?? 0,
  );
  return car;
}

/** Match generate_rocketsim.prepare_ground — settle suspension, then restore vel. */
function prepareGround(car, initial, settleTicks, pads) {
  car.pos.set(initial.pos[0], initial.pos[1], initial.pos[2]);
  car.vel.set(0, 0, 0);
  car.omega.set(0, 0, 0);
  car.boost = initial.boost ?? RL.BOOST_MAX;
  setOrientation(car, initial.yaw ?? 0, initial.pitch ?? 0, initial.roll ?? 0);
  const idle = idleControls();
  for (let i = 0; i < settleTicks; i++) {
    stepCar(car, idle, RL.DT);
    stepBoostPads(pads, car, RL.DT);
  }

  const settledZ = car.pos.z;
  car.pos.set(initial.pos[0], initial.pos[1], settledZ);
  car.vel.set(...initial.vel);
  car.omega.set(...initial.ang_vel);
  setOrientation(car, initial.yaw ?? 0, initial.pitch ?? 0, initial.roll ?? 0);
  car.boost = initial.boost ?? RL.BOOST_MAX;
  stepCar(car, idle, RL.DT);
  stepBoostPads(pads, car, RL.DT);
  car.pos.set(car.pos.x, car.pos.y, car.pos.z);
  car.vel.set(...initial.vel);
  car.omega.set(...initial.ang_vel);
  setOrientation(car, initial.yaw ?? 0, initial.pitch ?? 0, initial.roll ?? 0);
  car.boost = initial.boost ?? RL.BOOST_MAX;
}

/** Match generate_rocketsim.prepare_airborne. */
function prepareAirborne(car, initial) {
  car.pos.set(...initial.pos);
  car.vel.set(0, 0, 0);
  car.omega.set(0, 0, 0);
  setOrientation(car, initial.yaw ?? 0, initial.pitch ?? 0, initial.roll ?? 0);
  car.boost = initial.boost ?? RL.BOOST_MAX;
  stepCar(car, idleControls(), RL.DT);
  car.pos.set(...initial.pos);
  car.vel.set(...initial.vel);
  car.omega.set(...initial.ang_vel);
  setOrientation(car, initial.yaw ?? 0, initial.pitch ?? 0, initial.roll ?? 0);
  car.boost = initial.boost ?? RL.BOOST_MAX;
  car.onGround = false;
  car.wheelsContact = false;
  car.numWheelsInContact = 0;
  // Reference set_state replaces gameplay state after its warmup tick.
  car.airTime = 0;
  car.airTimeSinceJump = 0;
}

function rotPayload(car) {
  const { f, l, u } = axes(car.q); // l = car right
  return {
    forward: vecList(f),
    right: vecList(l),
    up: vecList(u),
  };
}

/** Best-effort yaw/pitch/roll from forward/right/up (RocketSim Angle order). */
function angleFromRot(rot) {
  const [fx, fy, fz] = rot.forward;
  const pitch = Math.asin(THREE.MathUtils.clamp(fz, -1, 1));
  const yaw = Math.atan2(fy, fx);
  const [rx, ry, rz] = rot.right;
  // roll from right vs expected level right
  const cp = Math.cos(pitch);
  const levelRightX = -Math.sin(yaw);
  const levelRightY = Math.cos(yaw);
  // Project right into plane orthogonal to forward roughly via atan2 of up.z-ish
  const roll = Math.atan2(-rz, (rx * levelRightX + ry * levelRightY) || cp);
  return [yaw, pitch, roll];
}

function snapshot(car, tick, controls) {
  const rot = rotPayload(car);
  return {
    tick,
    controls: {
      throttle: controls.throttle ?? 0,
      steer: controls.steer ?? 0,
      pitch: controls.pitch ?? 0,
      yaw: controls.yaw ?? 0,
      roll: controls.roll ?? 0,
      boost: !!controls.boost,
      jump: !!controls.jump,
      handbrake: !!controls.handbrake,
    },
    pos: vecList(car.pos),
    vel: vecList(car.vel),
    ang_vel: vecList(car.omega),
    angle: angleFromRot(rot),
    rot,
    boost: car.boost,
    on_ground: car.onGround,
    air_time: car.airTime,
  };
}

function dumpJsConstants() {
  return {
    GRAVITY: RL.GRAVITY,
    MAX_SPEED: RL.MAX_SPEED,
    MAX_ANG_VEL: RL.MAX_ANG_VEL,
    BOOST_ACCEL_AIR: RL.BOOST_ACCEL_AIR,
    BOOST_ACCEL_GROUND: RL.BOOST_ACCEL_GROUND,
    BOOST_USE: RL.BOOST_USE,
    BOOST_SPAWN: RL.BOOST_SPAWN,
    BOOST_MIN_TIME: RL.BOOST_MIN_TIME,
    AIR_THROTTLE: RL.AIR_THROTTLE,
    JUMP_IMPULSE: RL.JUMP_IMPULSE,
    JUMP_HOLD_ACCEL: RL.JUMP_HOLD_ACCEL,
    JUMP_HOLD_MAX: RL.JUMP_HOLD_MAX,
    JUMP_MIN_TIME: RS.JUMP_MIN_TIME,
    JUMP_RESET_TIME_PAD: RS.JUMP_RESET_TIME_PAD,
    FLIP_WINDOW: RL.FLIP_WINDOW,
    FLIP_BACK_IMPULSE_X: RL.FLIP_BACK_IMPULSE_X,
    FLIP_TORQUE_TIME: RL.FLIP_TORQUE_TIME,
    FLIP_TORQUE_MIN_TIME: RL.FLIP_TORQUE_MIN_TIME,
    CAR_TORQUE_SCALE: RS.CAR_TORQUE_SCALE,
    T_ROLL: RL.T_ROLL,
    T_PITCH: RL.T_PITCH,
    T_YAW: RL.T_YAW,
    D_ROLL: RL.D_ROLL,
    D_PITCH: RL.D_PITCH,
    D_YAW: RL.D_YAW,
    BALL_DRAG: RL.BALL_DRAG,
    BALL_RESTITUTION: RL.BALL_RESTITUTION,
    BALL_FRICTION: RL.BALL_FRICTION,
    BALL_REST_Z: RL.BALL_REST_Z,
    EXTRA_IMPULSE_Z: RL.EXTRA_IMPULSE_Z,
    EXTRA_IMPULSE_FWD: RL.EXTRA_IMPULSE_FWD,
    EXTRA_IMPULSE_MAX_DV: RL.EXTRA_IMPULSE_MAX_DV,
    AUTOFLIP_NORMZ: RS.AUTOFLIP_NORMZ_THRESH,
    AUTOFLIP_TIME: RS.AUTOFLIP_TIME,
    AUTOFLIP_ROLL: RS.AUTOFLIP_ROLL_THRESH,
    COASTING_BRAKE_FACTOR: RS.COASTING_BRAKE_FACTOR,
    SUSP_BACK: RS.SUSPENSION_FORCE_SCALE_BACK,
    ROLLING_FRICTION_MAGIC: RS.ROLLING_FRICTION_SCALE_MAGIC,
    BUMP_COOLDOWN_TIME: RL.BUMP_COOLDOWN_TIME,
    BUMP_MIN_FORWARD_DIST: RL.BUMP_MIN_FORWARD_DIST,
    REST_HEIGHT: RL.REST_HEIGHT,
    DT: RL.DT,
  };
}

function runScenario(scenario, defaults) {
  const initial = deepMerge(defaults.initial ?? {}, scenario.initial);
  const ticks = scenario.ticks;
  const mode = scenarioMode(scenario, initial);
  const settleTicks = scenario.settle_ticks ?? defaults.settle_ticks ?? 240;
  if (scenario.entity === "ball") {
    const ball = makeBall(new THREE.Vector3(...initial.pos));
    ball.vel.set(...initial.vel);
    ball.omega.set(...initial.ang_vel);
    const snapshotBall = (tick) => ({ tick, pos: vecList(ball.pos), vel: vecList(ball.vel), ang_vel: vecList(ball.omega) });
    const frames = [snapshotBall(0)];
    for (let tick = 0; tick < ticks; tick++) {
      stepBall(ball, RL.DT, { arena: mode !== "void" });
      frames.push(snapshotBall(tick + 1));
    }
    return { id: scenario.id, description: scenario.description ?? "", entity: "ball", engine: "rl-physics.js", game_mode: mode, tick_rate: 1 / RL.DT, tick_time: RL.DT, ticks, initial, frames };
  }
  const car = initCar(initial);
  car.arenaCollisions = mode !== "void";
  const pads = mode === "soccar" ? createSoccarBoostPads() : [];
  if (mode === "soccar") prepareGround(car, initial, settleTicks, pads);
  else prepareAirborne(car, initial);

  const ballInitial = scenario.ball ?? null;
  const ball = ballInitial ? makeBall(new THREE.Vector3(...ballInitial.pos)) : null;
  if (ball) {
    ball.vel.set(...(ballInitial.vel ?? [0, 0, 0]));
    ball.omega.set(...(ballInitial.ang_vel ?? [0, 0, 0]));
  }
  const capture = (tick, controls) => {
    const frame = snapshot(car, tick, controls);
    if (ball) frame.ball = { pos: vecList(ball.pos), vel: vecList(ball.vel), ang_vel: vecList(ball.omega) };
    return frame;
  };
  const frames = [];
  const ctrl0 = controlsAtTick(0, defaults, scenario);
  frames.push(capture(0, ctrl0));

  for (let tick = 0; tick < ticks; tick++) {
    const ctrl = controlsAtTick(tick, defaults, scenario);
    if (ball) stepCarBall(car, ball, ctrl, tick, RL.DT);
    else stepCar(car, ctrl, RL.DT);
    stepBoostPads(pads, car, RL.DT);
    frames.push(capture(tick + 1, ctrl));
  }

  return {
    id: scenario.id,
    description: scenario.description ?? "",
    engine: "carSim.js",
    game_mode: mode,
    tick_rate: 1 / RL.DT,
    tick_time: RL.DT,
    ticks,
    initial,
    ball_initial: ballInitial,
    frames,
  };
}

function parseArgs(argv) {
  const args = { scenarios: DEFAULT_SCENARIOS, out: DEFAULT_OUT, only: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scenarios") args.scenarios = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--only") args.only.push(argv[++i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const data = JSON.parse(await readFile(args.scenarios, "utf8"));
const scenarioHash = createHash("sha256").update(await readFile(args.scenarios)).digest("hex");
const defaults = data.defaults ?? {};
let scenarios = data.scenarios;
if (args.only.length) {
  const wanted = new Set(args.only);
  scenarios = scenarios.filter((s) => wanted.has(s.id));
  const missing = [...wanted].filter((id) => !scenarios.some((s) => s.id === id));
  if (missing.length) {
    console.error(`Unknown scenario ids: ${missing.join(", ")}`);
    process.exit(1);
  }
}

await mkdir(args.out, { recursive: true });
await writeFile(
  path.join(args.out, "js_constants.json"),
  `${JSON.stringify(dumpJsConstants(), null, 2)}\n`,
);

const index = [];
for (const scenario of scenarios) {
  const result = runScenario(scenario, defaults);
  result.scenario_sha256 = scenarioHash;
  const fileName = `${scenario.id}.json`;
  await writeFile(
    path.join(args.out, fileName),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  index.push({ id: scenario.id, path: fileName });
  const final = result.frames[result.frames.length - 1];
  console.log(
    `${scenario.id}: ${result.frames.length} frames, ` +
      `final pos=[${final.pos.map((x) => x.toFixed(2)).join(", ")}], ` +
      `ang_vel=[${final.ang_vel.map((x) => x.toFixed(3)).join(", ")}]`,
  );
}

await writeFile(
  path.join(args.out, "index.json"),
  `${JSON.stringify({ engine: "carSim.js", scenarios: index }, null, 2)}\n`,
);
console.log(`done — ${index.length} scenarios → ${args.out}`);
