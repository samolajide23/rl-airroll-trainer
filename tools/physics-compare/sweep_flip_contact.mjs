/**
 * Sweep ground_flip_forward contact strategies vs RocketSim (aligned by frame.tick).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { RL, makePhysCar, stepCar } from "../../src/shared/carPhysics.js";
import { RS } from "../../src/shared/carSim.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(
  await readFile(path.join(HERE, "out", "rocketsim", "ground_flip_forward.json"), "utf8"),
);
const SCENARIOS = JSON.parse(
  await readFile(path.join(HERE, "scenarios.json"), "utf8"),
);
const scenario = SCENARIOS.scenarios.find((s) => s.id === "ground_flip_forward");
const settleTicks = SCENARIOS.defaults.settle_ticks ?? 240;

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
    } else out[key] = value;
  }
  return out;
}

function controlsAtTick(tick) {
  const base = deepMerge(SCENARIOS.defaults.controls ?? {}, scenario.controls);
  for (const entry of scenario.control_schedule) {
    if (tick < entry.until_tick) return deepMerge(base, entry.controls);
  }
  return deepMerge(base, scenario.control_schedule.at(-1).controls);
}

function setOrientation(car, yaw = 0, pitch = 0, roll = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
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
  car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, right, up)).normalize();
}

function prepareGround(car, initial) {
  const idle = {
    throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0,
    boost: false, jump: false, handbrake: false,
  };
  car.pos.set(...initial.pos);
  car.vel.set(0, 0, 0);
  car.omega.set(0, 0, 0);
  setOrientation(car);
  car.boost = RL.BOOST_MAX;
  for (let i = 0; i < settleTicks; i++) stepCar(car, idle, RL.DT);
  const settledZ = car.pos.z;
  car.pos.set(initial.pos[0], initial.pos[1], settledZ);
  car.vel.set(0, 0, 0);
  car.omega.set(0, 0, 0);
  setOrientation(car);
  car.boost = RL.BOOST_MAX;
  stepCar(car, idle, RL.DT);
  car.vel.set(0, 0, 0);
  car.omega.set(0, 0, 0);
  setOrientation(car);
  car.boost = RL.BOOST_MAX;
}

function runOnce() {
  const car = makePhysCar(new THREE.Vector3(0, 0, 17), 0);
  prepareGround(car, scenario.initial);
  const byTick = new Map(ref.frames.map((f) => [f.tick, f]));
  let maxPos = 0;
  let maxTick = 0;
  let at45 = null;
  let final = null;
  // Match run_js: snapshot tick 0, then step ticks 0..N-1 → frames 1..N
  for (let tick = 0; tick < scenario.ticks; tick++) {
    stepCar(car, controlsAtTick(tick), RL.DT);
    const frameTick = tick + 1;
    const r = byTick.get(frameTick);
    const pe = Math.hypot(
      car.pos.x - r.pos[0],
      car.pos.y - r.pos[1],
      car.pos.z - r.pos[2],
    );
    if (pe >= maxPos) {
      maxPos = pe;
      maxTick = frameTick;
    }
    if (frameTick === 45) {
      at45 = {
        pe,
        vz: car.vel.z,
        rsVz: r.vel[2],
        w: [car.omega.x, car.omega.y, car.omega.z],
        rsw: r.ang_vel,
      };
    }
    if (frameTick === scenario.ticks) {
      final = { pe, z: car.pos.z, rsZ: r.pos[2] };
    }
  }
  return { maxPos, maxTick, at45, final };
}

console.log("nInset\tcInset\tblend\tmaxPos\tt45vz/rs\tωx/rs\tωz/rs\tfinalPe");
RS.CONTACT_MERGE_MODE = "blend";
let best = { maxPos: 1e9 };
for (const blend of [0.9, 0.95, 1.0]) {
  RS.CONTACT_EDGE_CORNER_BLEND = blend;
  for (const nInset of [6, 7, 8, 9]) {
    for (const cInset of [3, 3.5, 4, 4.5, 5]) {
      RS.CONTACT_NORMAL_INSET_UU = nInset;
      RS.CONTACT_CORNER_INSET_UU = cInset;
      const r = runOnce();
      const a = r.at45;
      const row = {
        blend,
        nInset,
        cInset,
        maxPos: r.maxPos,
        vz: a.vz,
        wx: a.w[0],
        wz: a.w[2],
        finalPe: r.final.pe,
      };
      if (r.maxPos < best.maxPos) best = row;
      console.log(
        [
          nInset,
          cInset,
          blend.toFixed(2),
          r.maxPos.toFixed(3),
          `${a.vz.toFixed(0)}/${a.rsVz.toFixed(0)}`,
          `${a.w[0].toFixed(2)}/${a.rsw[0].toFixed(2)}`,
          `${a.w[2].toFixed(2)}/${a.rsw[2].toFixed(2)}`,
          r.final.pe.toFixed(3),
        ].join("\t"),
      );
    }
  }
}
console.log("BEST", best);
