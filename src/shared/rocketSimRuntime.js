import * as THREE from "three";
import { loadSoccar } from "../../tools/rocketsim-wasm/soccar.mjs";

let engine;
let scratch;
const sessions = new Map();
const presets = ["octane", "dominus", "plank", "breakout", "hybrid", "merc"];
const fields = {
  onGround: 19, hasJumped: 29, hasDoubleJumped: 30, hasFlipped: 31,
  jumping: 32, isFlipping: 33, jumpTime: 34, flipTime: 35, airTime: 36,
  airTimeSinceJump: 37, isBoosting: 41, boostingTime: 42, isSupersonic: 43,
  supersonicTime: 44, handbrakeVal: 45, isAutoFlipping: 46, autoFlipTimer: 47,
  autoFlipTorqueScale: 48, prevJump: 49, isDemoed: 58, demoRespawnTimer: 59,
  dodgeDeadzone: 60,
};
const flags = new Set(["onGround", "hasJumped", "hasDoubleJumped", "hasFlipped", "jumping", "isFlipping", "isBoosting", "isSupersonic", "isAutoFlipping", "prevJump", "isDemoed"]);
const matrix = new THREE.Matrix4();
const basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

export function configureRocketSim(module) {
  disposeRocketSimWorlds();
  if (engine && scratch) engine._free(scratch);
  engine = module;
  scratch = engine._malloc(80 * 4);
  if (!scratch) throw new Error("RocketSim state allocation failed");
}

export function rocketSimReady() { return Boolean(engine); }

export async function initializeRocketSim() {
  const root = new URL(`${import.meta.env.BASE_URL}physics/`, location.origin);
  const factory = (await import(/* @vite-ignore */ new URL("rocketsim.mjs", root).href)).default;
  const module = await factory({ locateFile: name => new URL(name, root).href });
  const fetchBytes = async name => {
    const response = await fetch(new URL(name, root));
    if (!response.ok) throw new Error(`RocketSim asset unavailable: ${name} (${response.status})`);
    return response;
  };
  const manifest = await (await fetchBytes("manifest.json")).json();
  await loadSoccar(module, manifest, async name => (await fetchBytes(`soccar/${name}`)).arrayBuffer(), crypto);
  module._rs_destroy();
  configureRocketSim(module);
}

function copyVector(values, offset, vector) {
  values[offset] = vector.x; values[offset + 1] = vector.y; values[offset + 2] = vector.z;
}

function carValues(car) {
  const values = new Float32Array(67);
  copyVector(values, 0, car.pos); copyVector(values, 3, car.vel); copyVector(values, 6, car.omega);
  values[9] = car.boost;
  basis[0].set(1, 0, 0).applyQuaternion(car.q);
  basis[1].set(0, 1, 0).applyQuaternion(car.q);
  basis[2].set(0, 0, 1).applyQuaternion(car.q);
  basis.forEach((vector, index) => copyVector(values, 20 + index * 3, vector));
  for (const [name, offset] of Object.entries(fields)) values[offset] = Number(car[name] ?? 0);
  copyVector(values, 38, car.flipRelTorque);
  car.wheels.forEach((wheel, index) => { values[50 + index] = Number(wheel.inContact); });
  values[54] = Number(car.worldContact.hasContact);
  copyVector(values, 55, car.worldContact.normal);
  return values;
}

function ballValues(ball) {
  const values = new Float32Array(9);
  copyVector(values, 0, ball.pos); copyVector(values, 3, ball.vel); copyVector(values, 6, ball.omega);
  return values;
}

function equal(first, second) {
  return second && first.every((value, index) => value === second[index]);
}

function write(values) { engine.HEAPF32.set(values, scratch / 4); return scratch; }

function sessionFor(owner, car, ball, arena) {
  let session = sessions.get(owner);
  const preset = car ? presets.indexOf(car.hitbox.id) : 0;
  if (preset < 0) throw new Error(`Unsupported RocketSim hitbox: ${car.hitbox.id}`);
  if (session && (session.arena !== arena || session.preset !== preset)) {
    engine._rs_world_destroy(session.handle);
    sessions.delete(owner);
    session = null;
  }
  if (!session) {
    const handle = engine._rs_world_create(Number(arena), preset, Number(Boolean(car)));
    if (!handle) throw new Error("RocketSim world creation failed");
    session = { handle, arena, preset, ball: null, carPublished: null, ballPublished: null };
    sessions.set(owner, session);
    if (!ball) engine._rs_world_set_ball(handle, write(new Float32Array([0, 0, 100000, 0, 0, 0, 0, 0, 0])));
  }
  if (car) {
    const values = carValues(car);
    if (!equal(values, session.carPublished)) engine._rs_world_set_car(session.handle, write(values));
  }
  if (ball) {
    const values = ballValues(ball);
    if (session.ball !== ball || !equal(values, session.ballPublished)) engine._rs_world_set_ball(session.handle, write(values));
    session.ball = ball;
  } else if (session.ball) {
    engine._rs_world_set_ball(session.handle, write(new Float32Array([0, 0, 100000, 0, 0, 0, 0, 0, 0])));
    session.ball = null;
    session.ballPublished = null;
  }
  return session;
}

function publish(session, car, ball, input, index = null) {
  const pointer = index === null ? engine._rs_world_state(session.handle) : engine._rs_world_state_at(session.handle, index);
  if (!pointer) throw new Error("RocketSim world state unavailable");
  const values = Array.from(engine.HEAPF32.subarray(pointer / 4, pointer / 4 + 67));
  if (!values.every(Number.isFinite)) throw new Error("RocketSim produced non-finite state");
  if (car) {
    car.pos.fromArray(values, 0); car.vel.fromArray(values, 3); car.omega.fromArray(values, 6);
    car.boost = car.infiniteBoost ? 100 : values[9];
    basis.forEach((vector, index) => vector.fromArray(values, 20 + index * 3));
    car.q.setFromRotationMatrix(matrix.makeBasis(...basis)).normalize();
    for (const [name, offset] of Object.entries(fields)) car[name] = flags.has(name) ? Boolean(values[offset]) : values[offset];
    car.flipRelTorque.fromArray(values, 38);
    car.wheels.forEach((wheel, index) => { wheel.inContact = Boolean(values[50 + index]); });
    car.numWheelsInContact = car.wheels.filter(wheel => wheel.inContact).length;
    car.wheelsContact = car.numWheelsInContact > 0;
    car.worldContact.hasContact = Boolean(values[54]); car.worldContact.normal.fromArray(values, 55);
    car.contactNormal.copy(car.worldContact.hasContact ? car.worldContact.normal : basis[2]);
    car.lastControls = { ...input }; car.physicsProfile = "wasm";
    if (index === null) session.carPublished = carValues(car);
    else session.published[index] = carValues(car);
  }
  if (ball) {
    ball.pos.fromArray(values, 10); ball.vel.fromArray(values, 13); ball.omega.fromArray(values, 16);
    ball.physicsProfile = "wasm";
    session.ballPublished = ballValues(ball);
  }
  return values[61] ? { point: new THREE.Vector3().fromArray(values, 62), tick: values[65] - 1 } : null;
}

export function stepRocketSim(car, ball, controls = {}, dt = 1 / 120, arena = car?.arenaCollisions !== false) {
  if (Math.abs(dt - 1 / 120) > 1e-8) throw new Error("RocketSim requires fixed 120 Hz steps");
  const session = sessionFor(car ?? ball, car, ball, arena);
  const clamp = value => Math.max(-1, Math.min(1, Number(value) || 0));
  const input = {
    throttle: clamp(controls.throttle), steer: clamp(controls.steer), pitch: clamp(controls.pitch),
    yaw: clamp(controls.yaw), roll: clamp(controls.roll), jump: Boolean(controls.jump),
    boost: Boolean(controls.boost), handbrake: Boolean(controls.handbrake ?? controls.powerslide),
  };
  engine._rs_world_step(session.handle, write(new Float32Array([
    input.throttle, input.steer, input.pitch, input.yaw, input.roll,
    Number(input.jump), Number(input.boost), Number(input.handbrake), car?.dodgeDeadzone ?? 0.5,
  ])), Number(Boolean(car?.infiniteBoost)));
  return publish(session, car, ball, input);
}

export function syncRocketSimPads(pads, car, reset = false) {
  const session = sessions.get(car);
  if (!session?.arena) return false;
  reset ||= Boolean(pads._nativeReset);
  pads._nativeReset = false;
  for (let index = 0; index < 34; index++) {
    const pointer = engine._rs_world_pad(session.handle, index, Number(reset));
    if (!pointer) continue;
    const values = Array.from(engine.HEAPF32.subarray(pointer / 4, pointer / 4 + 5));
    const pad = pads.find(candidate => candidate.x === values[0] && candidate.y === values[1]);
    if (!pad) continue;
    pad.active = Boolean(values[3]); pad.timer = values[4];
  }
  return true;
}

export function stepRocketSimMatch(owner, cars, ball, controls, dt = 1 / 120) {
  if (!engine) throw new Error("RocketSim is not initialized");
  if (Math.abs(dt - 1 / 120) > 1e-8) throw new Error("RocketSim requires fixed 120 Hz steps");
  if (cars.length !== 2 || controls.length !== 2 || !ball) throw new Error("A 1v1 match requires two cars, two controls and a ball");
  let session = sessions.get(owner);
  const configuration = cars.map(car => `${car.team}:${car.hitbox.id}`).join(",");
  if (session && session.configuration !== configuration) {
    releaseRocketSimWorld(owner);
    session = null;
  }
  if (!session) {
    if (typeof engine._rs_world_add_car !== "function") throw new Error("Rebuild RocketSim with multi-car support");
    const handle = engine._rs_world_create(1, 0, 0);
    if (!handle) throw new Error("RocketSim match creation failed");
    session = { handle, arena: true, configuration, published: [], ball: null, ballPublished: null };
    sessions.set(owner, session);
    for (const car of cars) {
      const index = engine._rs_world_add_car(handle, car.team, presets.indexOf(car.hitbox.id));
      if (index < 0) {
        releaseRocketSimWorld(owner);
        throw new Error("Invalid RocketSim match car configuration");
      }
    }
  }
  const inputs = controls.map(control => {
    const clamp = value => Math.max(-1, Math.min(1, Number(value) || 0));
    return {
      throttle: clamp(control.throttle), steer: clamp(control.steer), pitch: clamp(control.pitch),
      yaw: clamp(control.yaw), roll: clamp(control.roll), jump: Boolean(control.jump),
      boost: Boolean(control.boost), handbrake: Boolean(control.handbrake ?? control.powerslide),
    };
  });
  cars.forEach((car, index) => {
    const values = carValues(car);
    if (!equal(values, session.published[index])) engine._rs_world_set_car_at(session.handle, index, write(values));
    const input = inputs[index];
    engine._rs_world_controls_at(session.handle, index, write(new Float32Array([
      input.throttle, input.steer, input.pitch, input.yaw, input.roll,
      Number(input.jump), Number(input.boost), Number(input.handbrake), car.dodgeDeadzone ?? 0.5,
    ])), Number(Boolean(car.infiniteBoost)));
  });
  const values = ballValues(ball);
  if (session.ball !== ball || !equal(values, session.ballPublished)) engine._rs_world_set_ball(session.handle, write(values));
  session.ball = ball;
  engine._rs_world_advance(session.handle);
  return cars.map((car, index) => publish(session, car, ball, inputs[index], index));
}

export function disposeRocketSimWorlds() {
  if (engine) for (const session of sessions.values()) engine._rs_world_destroy(session.handle);
  sessions.clear();
}

export function releaseRocketSimWorld(owner) {
  const session = sessions.get(owner);
  if (session && engine) engine._rs_world_destroy(session.handle);
  sessions.delete(owner);
}

export function resetRocketSimMatch(owner) {
  const session = sessions.get(owner);
  if (!session?.configuration) return;
  session.published = [];
  session.ball = null;
  session.ballPublished = null;
  for (let index = 0; index < 34; index++) engine._rs_world_pad(session.handle, index, 1);
}

export function rocketSimDiagnostics() { return { engine: engine ? "RocketSim 2.2.1 WASM" : null, worlds: sessions.size }; }