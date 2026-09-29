/**
 * Dump per-tick JS vs RS during ground_flip contact window.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { RL, makePhysCar, stepCar } from "../../src/shared/carPhysics.js";
import { RS } from "../../src/shared/carSim.js";
import { arenaDistance } from "../../src/shared/arenaMesh.js";
import { axes } from "../../src/shared/rl-physics.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(
  await readFile(path.join(HERE, "out", "rocketsim", "ground_flip_forward.json"), "utf8"),
);
const SCENARIOS = JSON.parse(
  await readFile(path.join(HERE, "scenarios.json"), "utf8"),
);
const scenario = SCENARIOS.scenarios.find((s) => s.id === "ground_flip_forward");

RS.CONTACT_EDGE_CORNER_BLEND = 0.8;
RS.CONTACT_MERGE_MODE = "blend";

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

function setOrientation(car, yaw, pitch, roll) {
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

function prepareGround(car, initial, settleTicks) {
  const idle = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, handbrake: false };
  car.pos.set(...initial.pos);
  car.vel.set(0, 0, 0);
  car.omega.set(0, 0, 0);
  setOrientation(car, 0, 0, 0);
  car.boost = RL.BOOST_MAX;
  for (let i = 0; i < settleTicks; i++) stepCar(car, idle, RL.DT);
  const settledZ = car.pos.z;
  car.pos.set(initial.pos[0], initial.pos[1], settledZ);
  car.vel.set(0, 0, 0);
  car.omega.set(0, 0, 0);
  setOrientation(car, 0, 0, 0);
  car.boost = RL.BOOST_MAX;
  stepCar(car, idle, RL.DT);
  car.vel.set(0, 0, 0);
  car.omega.set(0, 0, 0);
  setOrientation(car, 0, 0, 0);
  car.boost = RL.BOOST_MAX;
}

function cornerDepths(car) {
  const { f, l, u } = axes(car.q);
  const { size, offset } = car.hitbox;
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const rel = new THREE.Vector3()
          .addScaledVector(f, offset[0] + (sx * size[0]) / 2)
          .addScaledVector(l, offset[1] + (sy * size[1]) / 2)
          .addScaledVector(u, offset[2] + (sz * size[2]) / 2);
        const p = rel.clone().add(car.pos);
        const n = new THREE.Vector3();
        const dist = arenaDistance(p.x, p.y, p.z, n);
        out.push({ sx, sy, sz, dist, relY: rel.y, nz: n.z });
      }
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

const car = makePhysCar(new THREE.Vector3(0, 0, 17), 0);
prepareGround(car, scenario.initial, SCENARIOS.defaults.settle_ticks ?? 120);

console.log("tick\trsZ\tjsZ\trsvz\tjsvz\trswx\tjswx\trswz\tjswz\tdeepest");
for (let tick = 0; tick < scenario.ticks; tick++) {
  const before = {
    z: car.pos.z,
    vz: car.vel.z,
    wx: car.omega.x,
    wz: car.omega.z,
  };
  const depths = cornerDepths(car);
  stepCar(car, controlsAtTick(tick), RL.DT);
  const r = ref.frames[tick];
  if (tick <= 35) {
    const d0 = depths[0];
    const tied = depths.filter((d) => Math.abs(d.dist - d0.dist) < 1e-4);
    console.log(
      [
        tick,
        r.pos[2].toFixed(2),
        car.pos.z.toFixed(2),
        r.vel[2].toFixed(1),
        car.vel.z.toFixed(1),
        r.ang_vel[0].toFixed(2),
        car.omega.x.toFixed(2),
        r.ang_vel[2].toFixed(2),
        car.omega.z.toFixed(2),
        `d=${d0.dist.toFixed(3)} sy=${d0.sy} sz=${d0.sz} n=${tied.length}`,
      ].join("\t"),
    );
    if (tick === 44 || tick === 45) {
      console.log(
        "  corners",
        depths
          .slice(0, 4)
          .map((d) => `(${d.sx},${d.sy},${d.sz}):${d.dist.toFixed(3)}`)
          .join(" "),
      );
    }
  }
  void before;
}
