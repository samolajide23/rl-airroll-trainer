import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { Vector3 } from "three";
import { makePhysCar, RL } from "../../src/shared/carPhysics.js";
import { stepCar, setCarOrientation } from "../../src/shared/carSim.js";
import { RL_CONST } from "../../src/shared/rlConst.js";

const f32 = Math.fround;
const suspensionTerms = wheel => {
  if (!wheel.inContact) return null;
  const rest = f32(wheel.restLength * f32(1 / 50));
  const length = wheel.nativeSuspensionLength;
  const inverseContact = wheel.clippedInvContactDotSuspension;
  const relativeVelocity = wheel.nativeSuspensionRelVel;
  const stiffness = f32(RL_CONST.SUSPENSION_STIFFNESS);
  const damping = f32(relativeVelocity < 0 ? RL_CONST.WHEELS_DAMPING_COMPRESSION : RL_CONST.WHEELS_DAMPING_RELAXATION);
  const scale = f32(wheel.forceScale);
  const compression = f32(rest - length);
  const stiffnessProduct = f32(compression * stiffness);
  const spring = f32(stiffnessProduct * inverseContact);
  const dampingProduct = f32(damping * relativeVelocity);
  const net = f32(spring - dampingProduct);
  const force = wheel.nativeSuspensionForce;
  if (Math.max(0, f32(net * scale)) !== force) throw new Error("Reconstructed suspension force differs from stored force");
  return { rest, length, inverseContact, relativeVelocity, stiffness, damping, scale, compression, stiffnessProduct, spring, dampingProduct, net, force };
};

const directory = process.argv[2] ?? "tools/physics-compare/out/strict-fresh-20261002";
const executable = process.argv[3] ?? "tools/physics-compare/out/native/ball_wall_trace.exe";
const nativeRun = spawnSync(executable, ["tools/physics-compare/collision_meshes", "goal-roof"], {
  encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
});
if (nativeRun.status !== 0) throw new Error(nativeRun.stderr || nativeRun.error?.message);
const native = nativeRun.stdout.split(/\r?\n/).filter(line => line.startsWith("{")).map(line => JSON.parse(line));
const reference = JSON.parse(readFileSync(`${directory}/rocketsim/movement_bot_goal_roof.json`, "utf8"));
const car = makePhysCar(new Vector3(0, 5500, 610), 0, "octane");
car.physicsProfile = "rocketsim";
car.boost = 100;
car.onGround = false;
car.wheelsContact = false;
setCarOrientation(car, 0, 0, 0);
const idle = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, handbrake: false };
const snapshot = key => ({
  ...key, pos: car.pos.toArray(), vel: car.vel.toArray(), omega: car.omega.toArray(),
  wheels: car.wheels.map(wheel => ({
    length: wheel.suspensionLength, force: wheel.suspensionForce,
    pushback: wheel.extraPushback, contact: Number(wheel.inContact),
    nativePushback: wheel.nativeExtraPushback, nativeImpulse: wheel.nativeImpulse?.toArray(),
    hardPoint: wheel.nativeHardPoint?.toArray(), nativePoint: wheel.inContact ? wheel.nativeContactPoint?.toArray() : null,
    normal: wheel.contactNormal.toArray(),
    terms: suspensionTerms(wheel),
  })),
});
stepCar(car, idle, RL.DT);
const candidate = [snapshot({ stage: "warmup" })];
car.pos.set(0, 5500, 610);
car.vel.set(0, 300, 0);
car.omega.set(0, 0, 0);
setCarOrientation(car, 0, 0, 0);
car.onGround = true;
car.wheelsContact = false;
car.numWheelsInContact = 0;
car.airTime = 0;
car.airTimeSinceJump = 0;
candidate.push(snapshot({ stage: "reset" }));
for (let tick = 1; tick <= 36; tick++) {
  stepCar(car, { ...idle, throttle: 1, steer: 0.3 }, RL.DT);
  candidate.push(snapshot({ tick }));
}
const distance = (first, second) => Math.hypot(...first.map((value, index) => value - second[index]));
const rows = candidate.map((state, index) => {
  const other = native[index];
  if (state.stage !== other.stage || state.tick !== other.tick) throw new Error("Trace stage mismatch");
  const wheelErrors = state.wheels.map((wheel, wheelIndex) => Object.fromEntries(
    Object.keys(wheel).map(field => {
      const expected = other.wheels[wheelIndex][field];
      if (wheel[field] == null || expected == null) return [field, { unavailable: field === "nativePoint" ? "JS does not publish a native point for a missed ray" : "Native tick trace does not publish this field" }];
      if (field === "terms") return [field, Object.fromEntries(Object.entries(wheel.terms).map(([term, value]) => {
        const error = Math.abs(value - expected[term]);
        if (!Number.isFinite(error)) throw new Error(`Non-finite suspension error: ${index}/${wheelIndex}/${term}`);
        return [term, error];
      }))];
      const error = Array.isArray(wheel[field]) ? distance(wheel[field], expected) : Math.abs(wheel[field] - expected);
      if (!Number.isFinite(error)) throw new Error(`Non-finite wheel error: ${index}/${wheelIndex}/${field}`);
      return [field, error];
    }),
  ));
  return {
    stage: state.stage, tick: state.tick,
    errors: { pos: distance(state.pos, other.pos), vel: distance(state.vel, other.vel), omega: distance(state.omega, other.omega), wheels: wheelErrors },
    native: other, candidate: state,
  };
});
const fidelity = Object.fromEntries(["pos", "vel", "omega"].map(field => [field, Math.max(...native.filter(state => state.tick).map(state =>
  distance(state[field], reference.frames[state.tick][field === "omega" ? "ang_vel" : field])))]));
if (fidelity.pos > 1e-7 || fidelity.vel > 1e-7 || fidelity.omega > 1e-9) throw new Error(`Native trace differs from reference: ${JSON.stringify(fidelity)}`);
const firstTick = rows.find(row => row.tick === 1);
const nativeTerms = firstTick.native.wheels[3].terms;
const candidateTerms = firstTick.candidate.wheels[3].terms;
const substitutedSpring = f32(candidateTerms.stiffnessProduct * f32(nativeTerms.inverseContact));
const substitutedForce = Math.max(0, f32(f32(substitutedSpring - candidateTerms.dampingProduct) * candidateTerms.scale));
const forceWitness = {
  candidateForce: candidateTerms.force, nativeForce: f32(nativeTerms.force),
  substitutedForce, error: Math.abs(substitutedForce - f32(nativeTerms.force)),
};
if (forceWitness.error !== 0) throw new Error(`Native projection does not explain first-tick force: ${JSON.stringify(forceWitness)}`);
writeFileSync(`${directory}/wheel-trace.json`, JSON.stringify({ fidelity, forceWitness, rows }, null, 2));
console.log(JSON.stringify({ fidelity, forceWitness, wheel3: rows.slice(0, 4).map(row => ({ stage: row.stage, tick: row.tick, errors: row.errors.wheels[3], native: row.native.wheels[3].terms, candidate: row.candidate.wheels[3].terms })) }, null, 2));