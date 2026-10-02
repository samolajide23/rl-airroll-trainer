import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { Vector3 } from "three";
import { makePhysCar, RL } from "../../src/shared/carPhysics.js";
import { stepCar, stepCarBall, setCarOrientation } from "../../src/shared/carSim.js";
import { RL_CONST } from "../../src/shared/rlConst.js";
import { makeBall } from "../../src/shared/rl-physics.js";

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
const mode = process.argv[4] ?? "goal-roof";
const fastSteering = mode === "fast-steering";
const steering = mode === "steering" || fastSteering;
const traceTicks = Number(process.argv[5] ?? (fastSteering ? 90 : steering ? 240 : 360));
if (!Number.isInteger(traceTicks) || traceTicks < 1 || traceTicks > (fastSteering ? 90 : steering ? 240 : 360)) throw new Error("Invalid trace tick count");
const nativeRun = spawnSync(executable, ["tools/physics-compare/collision_meshes", mode], {
  encoding: "utf8", maxBuffer: 12 * 1024 * 1024,
});
if (nativeRun.status !== 0) throw new Error(nativeRun.stderr || nativeRun.error?.message);
const native = nativeRun.stdout.split(/\r?\n/).filter(line => line.startsWith("{")).map(line => JSON.parse(line));
const reference = JSON.parse(readFileSync(`${directory}/rocketsim/${fastSteering ? "movement_ground_fast_steer" : steering ? "movement_ground_steer_right_1s" : "movement_bot_goal_roof"}.json`, "utf8"));
const car = makePhysCar(steering ? new Vector3(fastSteering ? -2000 : 0, 0, 17) : new Vector3(0, 5500, 610), 0, "octane");
car.physicsProfile = "rocketsim";
car.boost = 100;
car.onGround = steering;
car.wheelsContact = steering;
setCarOrientation(car, 0, 0, 0);
const idle = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, handbrake: false };
const snapshot = key => ({
  ...key, pos: car.pos.toArray(), vel: car.vel.toArray(), omega: car.omega.toArray(),
  wheels: car.wheels.map(wheel => ({
    length: wheel.suspensionLength, force: wheel.suspensionForce,
    axle: wheel.axle.toArray(), latFriction: wheel.latFriction, longFriction: wheel.longFriction,
    steerAngle: wheel.steerAngle,
    pushback: wheel.extraPushback, contact: Number(wheel.inContact),
    nativePushback: wheel.nativeExtraPushback, nativeImpulse: wheel.nativeImpulse?.toArray(),
    hardPoint: wheel.nativeHardPoint?.toArray(), nativePoint: wheel.inContact ? wheel.nativeContactPoint?.toArray() : null,
    normal: wheel.contactNormal.toArray(),
    terms: suspensionTerms(wheel),
  })),
});
const candidate = [];
for (let tick = 0; tick < (steering ? 240 : 1); tick++) {
  stepCar(car, idle, RL.DT);
  if (steering) candidate.push(snapshot({ stage: `settle-${tick + 1}` }));
}
candidate.push(snapshot({ stage: steering ? "settled" : "warmup" }));
car.pos.set(fastSteering ? -2000 : 0, steering ? 0 : 5500, steering ? car.pos.z : 610);
car.vel.set(fastSteering ? 2200 : 0, steering ? 0 : 300, 0);
car.omega.set(0, 0, 0);
setCarOrientation(car, 0, 0, 0);
if (steering) {
  stepCar(car, idle, RL.DT);
  car.vel.set(fastSteering ? 2200 : 0, 0, 0);
  car.omega.set(0, 0, 0);
  setCarOrientation(car, 0, 0, 0);
}
car.onGround = true;
car.wheelsContact = false;
car.numWheelsInContact = 0;
car.airTime = 0;
car.airTimeSinceJump = 0;
candidate.push(snapshot({ stage: "reset" }));
const ball = makeBall(new Vector3(0, 0, 92.75));
ball.physicsProfile = "rocketsim";
for (let tick = 1; tick <= traceTicks; tick++) {
  if (steering) stepCarBall(car, ball, { ...idle, throttle: 1, steer: fastSteering ? 0.5 : tick <= 120 ? 0 : 1 }, tick - 1, RL.DT);
  else stepCar(car, { ...idle, throttle: tick <= 240 ? 1 : -1, steer: tick <= 240 ? 0.3 : -0.3 }, RL.DT);
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
const fidelity = Object.fromEntries(["pos", "vel", "omega"].map(field => [field, Math.max(...native.filter(state => state.tick && state.tick <= traceTicks).map(state =>
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
if (!steering && forceWitness.error !== 0) throw new Error(`Native projection does not explain first-tick force: ${JSON.stringify(forceWitness)}`);
writeFileSync(`${directory}/${steering ? `${mode}-wheel-trace` : "wheel-trace"}.json`, JSON.stringify({ traceTicks, fidelity, forceWitness, rows }, null, 2));
console.log(JSON.stringify({ fidelity, forceWitness, first: rows.slice(0, 4).map(row => ({ stage: row.stage, tick: row.tick, pos: row.errors.pos, vel: row.errors.vel, omega: row.errors.omega })) }, null, 2));