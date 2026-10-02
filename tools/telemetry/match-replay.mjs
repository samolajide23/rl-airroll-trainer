import fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Vector3 } from "three";
import { makeBall, stepBall, RL } from "../../src/shared/rl-physics.js";

const vector = (value) => new Vector3(value.x, value.y, value.z);

export function auditReplayEvidence(replay) {
  const actors = new Map();
  const events = [];
  const fields = {};
  const intervals = [];
  let generation = 0;
  let unresolvedEvents = 0;
  const frames = replay.network_frames.frames;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    if (index > 0) intervals.push(frame.time - frames[index - 1].time);
    for (const id of frame.deleted_actors) actors.delete(id);
    for (const actor of frame.new_actors) actors.set(actor.actor_id, {
      name: replay.objects[actor.object_id], generation: ++generation, vehicle: null,
    });
    for (const update of frame.updated_actors) {
      if (replay.objects[update.object_id] !== "TAGame.CarComponent_TA:Vehicle") continue;
      const component = actors.get(update.actor_id);
      const reference = update.attribute.ActiveActor;
      const car = reference?.active ? actors.get(reference.actor) : null;
      if (component) component.vehicle = car?.name === "Archetypes.Car.Car_Default"
        ? { id: reference.actor, generation: car.generation } : null;
    }
    for (const update of frame.updated_actors) {
      const property = replay.objects[update.object_id];
      if (/Time|Throttle|Steer|Pitch|Yaw|Roll|Handbrake|ReplicatedActive|BoostAmount|DodgeTorque|DoubleJumpImpulse/.test(property)) {
        fields[property] = (fields[property] ?? 0) + 1;
      }
      if (!/^(TAGame.Vehicle_TA:(ReplicatedThrottle|ReplicatedSteer|bReplicatedHandbrake)|TAGame.CarComponent.*:(ReplicatedActive|ReplicatedBoostAmount|DodgeTorque|DoubleJumpImpulse))$/.test(property)) continue;
      const actor = actors.get(update.actor_id);
      const vehicle = actor?.vehicle;
      const linked = vehicle ? actors.get(vehicle.id) : null;
      const car = actor?.name === "Archetypes.Car.Car_Default" ? actor
        : linked?.generation === vehicle?.generation ? linked : null;
      if (!car) { unresolvedEvents++; continue; }
      events.push({ frame: index, time: frame.time, carLifetime: car.generation,
        source: actor.name, property, raw: update.attribute });
    }
  }
  intervals.sort((first, second) => first - second);
  return { status: "evidence-audit-only", frameCount: frames.length,
    timing: { min: intervals[0] ?? null, median: intervals[Math.floor(intervals.length / 2)] ?? null,
      max: intervals.at(-1) ?? null, gapsOver50ms: intervals.filter(value => value > 0.05).length,
      declaredTimeProperties: replay.objects.filter(name => /Time|Timestamp/.test(name)),
      observedTimeProperties: Object.keys(fields).filter(name => /Time|Timestamp/.test(name)) },
    fields, unresolvedEvents, events,
    limitations: ["Frame timestamps locate network updates, not independently synchronized rigid-body physics ticks",
      "Match countdowns and component activity times are not a per-state engine clock",
      "Raw bytes retained: analog scale, activity encoding and input application phase are unverified",
      "Camera pitch/yaw and dodge torque are not aerial pitch/yaw/roll controls",
      "Sparse events are not complete tick controls; no missing values are interpolated or assumed zero"] };
}

export function extractBallSamples(replay) {
  const actors = new Map();
  const cars = new Map();
  const samples = [];
  let generation = 0;
  for (const frame of replay.network_frames.frames) {
    for (const id of frame.deleted_actors) {
      actors.delete(id);
      cars.delete(id);
    }
    for (const actor of frame.new_actors) {
      actors.set(actor.actor_id, { name: replay.objects[actor.object_id], generation: ++generation });
      cars.delete(actor.actor_id);
    }
    for (const update of frame.updated_actors) {
      const actor = actors.get(update.actor_id);
      const state = update.attribute.RigidBody;
      if (actor?.name === "Archetypes.Car.Car_Default" && state) {
        cars.set(update.actor_id, { time: frame.time, pos: vector(state.location) });
      }
    }
    for (const update of frame.updated_actors) {
      const actor = actors.get(update.actor_id);
      const state = update.attribute.RigidBody;
      if (actor?.name !== "Archetypes.Ball.Ball_Default" || !state?.linear_velocity || state.sleeping) continue;
      const pos = vector(state.location);
      const nearby = [...cars.values()].some(car => frame.time - car.time > 0.05 || car.pos.distanceTo(pos) < 500);
      const interior = Math.abs(pos.x) < 3300 && Math.abs(pos.y) < 4300 && pos.z > 300 && pos.z < 1700;
      samples.push({ time: frame.time, generation: actor.generation, pos,
        vel: vector(state.linear_velocity), safe: interior && !nearby });
    }
  }
  return samples;
}

export function measureFlights(samples, intervals = 15) {
  if (!Number.isInteger(intervals) || intervals < 1) throw new Error("Intervals must be a positive integer");
  const windows = [];
  const rejections = { contactRisk: 0, timing: 0, motion: 0 };
  let rejected = 0;
  for (let start = 0; start < samples.length - intervals; start++) {
    const first = samples[start];
    if (!first.safe || Math.hypot(first.vel.x, first.vel.y) < 300) continue;
    const nominal = makeBall(first.pos);
    const inferred = makeBall(first.pos);
    nominal.vel.copy(first.vel);
    inferred.vel.copy(first.vel);
    let valid = true;
    let inferredTicks = 0;
    let timingMismatch = 0;
    let maxPosition = 0;
    let maxVelocity = 0;
    let diagnosticPosition = 0;
    let diagnosticVelocity = 0;
    for (let offset = 1; offset <= intervals; offset++) {
      const prev = samples[start + offset - 1];
      const next = samples[start + offset];
      const elapsed = next.time - prev.time;
      const displacement = next.pos.clone().sub(prev.pos);
      const horizontalSquared = prev.vel.x ** 2 + prev.vel.y ** 2;
      const estimated = (displacement.x * prev.vel.x + displacement.y * prev.vel.y) / horizontalSquared / RL.DT;
      const ticks = Math.round(estimated);
      if (!next.safe || next.generation !== first.generation || elapsed < 0.02 || elapsed > 0.045 ||
          ticks < 1 || ticks > 8 || Math.abs(estimated - ticks) > 0.12) {
        rejections[!next.safe || next.generation !== first.generation ? "contactRisk" : "timing"]++;
        valid = false;
        break;
      }
      const local = makeBall(prev.pos);
      local.vel.copy(prev.vel);
      for (let tick = 0; tick < ticks; tick++) stepBall(local, RL.DT, { arena: false });
      if (local.vel.distanceTo(next.vel) > 15 || local.pos.distanceTo(next.pos) > 5) {
        rejections.motion++;
        valid = false;
        break;
      }
      inferredTicks += ticks;
      timingMismatch += ticks !== Math.round(elapsed / RL.DT) ? 1 : 0;
      const targetTicks = Math.round((next.time - first.time) / RL.DT);
      const previousTicks = Math.round((prev.time - first.time) / RL.DT);
      for (let tick = previousTicks; tick < targetTicks; tick++) stepBall(nominal, RL.DT, { arena: false });
      for (let tick = 0; tick < ticks; tick++) stepBall(inferred, RL.DT, { arena: false });
      maxPosition = Math.max(maxPosition, nominal.pos.distanceTo(next.pos));
      maxVelocity = Math.max(maxVelocity, nominal.vel.distanceTo(next.vel));
      diagnosticPosition = Math.max(diagnosticPosition, inferred.pos.distanceTo(next.pos));
      diagnosticVelocity = Math.max(diagnosticVelocity, inferred.vel.distanceTo(next.vel));
    }
    if (!valid) { rejected++; continue; }
    windows.push({ start: first.time, end: samples[start + intervals].time, inferredTicks, timingMismatch,
      maxPosition, maxVelocity, diagnosticPosition, diagnosticVelocity });
    start += intervals;
  }
  return { status: "diagnostic-only", intervals, samples: samples.length, rejectedCandidates: rejected, rejections, windows,
    limitations: ["Replay provenance and game version must be checked separately; this is not current-version native telemetry certification",
      "Sparse network states and replay timestamps are not synchronized 120 Hz physics observations",
      "Inferred ticks use observed displacement and are not independent timing evidence",
      "Contact exclusion is heuristic; velocity/position filtering uses the current model and biases accepted windows",
      "No car, bounce, angular velocity or full-match parity certification"] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, intervals = "15"] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: node tools/telemetry/match-replay.mjs decoded.json report.json [intervals|--audit]");
  const decoded = fs.readFileSync(input);
  const replay = JSON.parse(decoded.toString("utf8"));
  const report = intervals === "--audit" ? auditReplayEvidence(replay)
    : measureFlights(extractBallSamples(replay), Number(intervals));
  report.decodedSha256 = createHash("sha256").update(decoded).digest("hex");
  report.metadata = Object.fromEntries(Object.entries(replay.properties).filter(([key]) =>
    ["Date", "MapName", "RecordFPS", "NumFrames", "MatchType"].includes(key)));
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, events: report.events?.length, windows: report.windows?.length }, null, 2));
  if (report.windows && !report.windows.length) process.exitCode = 1;
}