import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { makeCar, stepCar } from "../../src/shared/carSim.js";
import { RL } from "../../src/shared/rl-physics.js";
import { controlsFromSample } from "./alignment.mjs";
import { validateCapture } from "./validate.mjs";

export function selectStraightSegment(samples, maximumSeconds = 6) {
  let resting = 0;
  let start = -1;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    const clearOfBall = new THREE.Vector3(...sample.car.pos).distanceTo(new THREE.Vector3(...sample.ball.pos)) >= 300;
    const idle = clearOfBall && sample.flags.on_ground && sample.flags.wheel_contacts === 4 &&
      Math.hypot(...sample.car.vel) < 5 && Math.abs(sample.input.throttle) < 0.01 &&
      !sample.input.jump && !sample.input.handbrake &&
      !sample.input.activate_boost && !sample.input.holding_boost;
    resting = idle ? resting + 1 : 0;
    if (resting >= 30) { start = index; break; }
  }
  if (start < 0) throw new Error("No 30-sample grounded resting start found");
  let end = start;
  let stopReason = "end_of_capture";
  for (let index = start + 1; index < samples.length; index++) {
    const sample = samples[index], previous = samples[index - 1];
    if (sample.physics_time - samples[start].physics_time > maximumSeconds) { stopReason = "duration_limit"; break; }
    if (sample.elapsed - previous.elapsed > 0.05 || Math.abs(sample.physics_time - previous.physics_time - RL.DT) > 0.0001) { stopReason = "sampling_gap"; break; }
    if (!sample.flags.on_ground || sample.flags.wheel_contacts !== 4 || sample.input.jump || sample.input.handbrake || Math.abs(sample.input.steer) > 0.01) { stopReason = "non_straight_movement"; break; }
    if (new THREE.Vector3(...sample.car.pos).distanceTo(new THREE.Vector3(...sample.ball.pos)) < 300) { stopReason = "ball_proximity"; break; }
    if (Math.abs(sample.car.pos[0]) > 3800 || sample.car.pos[2] > 40) { stopReason = "wall_proximity"; break; }
    end = index;
  }
  if (end - start < 60) throw new Error(`Segment too short: ${end - start} ticks (${stopReason})`);
  return { start, end, stop_reason: stopReason };
}

export function replaySegment(samples, segment, alignment = "earlier", preset = "octane") {
  if (!["earlier", "later"].includes(alignment)) throw new Error("Unknown input alignment");
  const initial = samples[segment.start];
  const car = makeCar(new THREE.Vector3(...initial.car.pos), 0, preset);
  const restore = () => {
    car.pos.fromArray(initial.car.pos);
    car.vel.fromArray(initial.car.vel);
    car.omega.fromArray(initial.car.omega);
    const [scalar, x, y, z] = initial.car.quaternion_wxyz;
    car.q.set(x, y, z, scalar).normalize();
  };
  restore();
  for (let tick = 0; tick < 120; tick++) stepCar(car, {});
  restore();
  car.boost = RL.BOOST_MAX;
  car.infiniteBoost = true;
  car.prevJump = false;
  const rows = [];
  for (let index = segment.start; index < segment.end; index++) {
    stepCar(car, controlsFromSample(samples[index + (alignment === "later" ? 1 : 0)].input));
    const expected = samples[index + 1];
    const [scalar, x, y, z] = expected.car.quaternion_wxyz;
    rows.push({
      elapsed: expected.elapsed, physics_time: expected.physics_time,
      position_error: car.pos.distanceTo(new THREE.Vector3(...expected.car.pos)),
      velocity_error: car.vel.distanceTo(new THREE.Vector3(...expected.car.vel)),
      speed_error: Math.abs(car.vel.length() - Math.hypot(...expected.car.vel)),
      orientation_error_deg: THREE.MathUtils.radToDeg(car.q.angleTo(new THREE.Quaternion(x, y, z, scalar).normalize())),
      ground_mismatch: car.onGround !== expected.flags.on_ground,
    });
  }
  const metrics = {};
  for (const key of ["position_error", "velocity_error", "speed_error", "orientation_error_deg"]) {
    metrics[key] = {
      mean: rows.reduce((sum, row) => sum + row[key], 0) / rows.length,
      max: Math.max(...rows.map(row => row[key])),
      final: rows.at(-1)[key],
    };
  }
  return { alignment, ticks: rows.length, metrics,
    ground_mismatch_ticks: rows.filter(row => row.ground_mismatch).length,
    first_position_error_above_1uu: rows.find(row => row.position_error > 1) ?? null,
    first_velocity_error_above_1uu_s: rows.find(row => row.velocity_error > 1) ?? null,
    checkpoints: rows.filter((row, index) => index % 120 === 0 || index === rows.length - 1),
  };
}

export async function compareCapture(file, preset = "octane") {
  const integrity = await validateCapture(file);
  const records = (await readFile(file, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
  const samples = records.filter(record => record.type === "input_state");
  const segment = selectStraightSegment(samples);
  return {
    integrity, body_id: records[0].body_id, assumed_hitbox: preset,
    segment: { ...segment, elapsed_start: samples[segment.start].elapsed,
      elapsed_end: samples[segment.end].elapsed, initial_position: samples[segment.start].car.pos },
    earlier: replaySegment(samples, segment, "earlier", preset),
    later: replaySegment(samples, segment, "later", preset),
    limitations: ["Hitbox must be confirmed from recorded body ID; octane is the explicit default assumption.",
      "Initial suspension is warmed up, not recorded; boost is assumed unlimited.",
      "No ball collisions, pads or hidden mutators are reconstructed.",
      "Reports are measurements, not relaxed parity gates or exact-RL certification.",
      "Camera replay is deferred until camera phase and missing swivel/ball-camera input are established."],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error("Usage: node tools/telemetry/replay.mjs capture.ndjson [report.json] [hitbox]");
    const report = await compareCapture(process.argv[2], process.argv[4] ?? "octane");
    const json = JSON.stringify(report, null, 2);
    if (process.argv[3]) await writeFile(process.argv[3], json + "\n");
    console.log(json);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}