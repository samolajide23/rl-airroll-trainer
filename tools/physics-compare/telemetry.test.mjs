import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureValidator } from "../telemetry/validate.mjs";
import { alignmentReport, boostEdgeReport, controlsFromSample } from "../telemetry/alignment.mjs";
import { selectStraightSegment, replaySegment } from "../telemetry/replay.mjs";

test("straight replay rejects missing resting starts and stops at pauses", () => {
  const source = fixture().find(record => record.type === "input_state");
  const samples = Array.from({ length: 150 }, (_, index) => {
    const sample = structuredClone(source);
    sample.elapsed = index / 120;
    sample.physics_time = index / 120;
    sample.car.pos = [0, -2000, 17];
    sample.ball.pos = [0, 2000, 100];
    sample.flags.on_ground = true;
    sample.flags.wheel_contacts = 4;
    return sample;
  });
  samples[120].elapsed += 1;
  const segment = selectStraightSegment(samples);
  assert.equal(segment.start, 29);
  assert.equal(segment.end, 119);
  assert.equal(segment.stop_reason, "sampling_gap");
  assert.equal(replaySegment(samples, segment).ticks, 90);
  assert.throws(() => replaySegment(samples, segment, "invalid"));
  assert.throws(() => selectStraightSegment(samples.slice(0, 20)));
});

test("boost-edge evidence requires several following-step acceleration changes", () => {
  const source = fixture().find(record => record.type === "input_state");
  const samples = Array.from({ length: 20 }, (_, index) => {
    const sample = structuredClone(source);
    sample.physics_time = index / 120;
    sample.elapsed = index / 120;
    sample.car.pos = [0, -2000, 17];
    sample.ball.pos = [0, 2000, 100];
    sample.flags.on_ground = true;
    sample.flags.wheel_contacts = 4;
    sample.input.holding_boost = index % 5 >= 2;
    sample.car.vel = [1000 + Math.floor(index / 5) * 20 + Math.max(0, index % 5 - 2) * 8, 0, 0];
    return sample;
  });
  const report = boostEdgeReport(samples);
  assert.equal(report.eligible_press_edges, 4);
  assert.equal(report.following_step_wins, 4);
  assert.equal(report.evidence, "following_step_supported");
  assert.equal(boostEdgeReport(samples.slice(0, 4)).evidence, "inconclusive");
});

test("alignment excludes unchanged controls and uncertain jump transitions", () => {
  const records = fixture().filter(record => record.type === "input_state");
  assert.equal(alignmentReport(records).ground.transitions, 0);
  records[1].physics_time = records[0].physics_time + 1 / 120;
  records[1].input = { ...records[1].input, jump: true };
  assert.equal(alignmentReport(records).air.transitions, 0);
  assert.equal(controlsFromSample({ ...records[0].input, holding_boost: true }).boost, true);
});

function fixture() {
  const body = { pos: [0, 0, 100], vel: [0, 0, 0], omega: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0], rb_time: 0 };
  const input = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, dodge_forward: 0, dodge_strafe: 0, jump: false, handbrake: false, activate_boost: false, holding_boost: false };
  const flags = { on_ground: false, jumped: false, double_jumped: false, has_flip: true, supersonic: false, wheel_contacts: 0, wheel_world_contacts: 0 };
  return [
    { type: "header", version: 1, position_units: "uu", rotation_units: "unreal_rotator", input_phase: "post_SetVehicleInput_not_post_physics", camera_phase: "drawable", sample_rate_assumed: false },
    { type: "input_state", sequence: 0, elapsed: 0, physics_time: 1, input, flags, car: body, ball: structuredClone(body), boost_raw: 1 },
    { type: "camera", sequence: 1, elapsed: 0.002, pos: [0, 0, 0], rotator_unreal: [0, 0, 0], swivel_unreal: [0, 0, 0], viewport: [1920, 1080], fov: 108, settings: { fov: 108, height: 80, angle: -3, distance: 270, stiffness: 1, swivel_speed: 7.7, transition_speed: 1.8, shake: false } },
    { type: "input_state", sequence: 2, elapsed: 0.008, physics_time: 1, input, flags, car: body, ball: structuredClone(body), boost_raw: 1 },
    { type: "camera", sequence: 3, elapsed: 0.018, pos: [0, 0, 0], rotator_unreal: [0, 0, 0], swivel_unreal: [0, 0, 0], viewport: [1920, 1080], fov: 108, settings: { fov: 108, height: 80, angle: -3, distance: 270, stiffness: 1, swivel_speed: 7.7, transition_speed: 1.8, shake: false } },
    { type: "footer", input_count: 2, camera_count: 2, reason: "manual" },
  ];
}

function validate(records) {
  const validator = createCaptureValidator();
  records.forEach(record => validator.accept(record));
  return validator.finish();
}

test("telemetry validates independent sample streams without assuming 120 Hz", () => {
  const report = validate(fixture());
  assert.equal(report.repeated_physics_times, 1);
  assert.equal(report.input_intervals.mean_ms, 8);
  assert(Math.abs(report.camera_intervals.mean_ms - 16) < 1e-10);
  assert.equal(report.parity_certified, false);
});

test("telemetry rejects incomplete, corrupt and mismatched captures", () => {
  for (const corrupt of [
    records => records.pop(),
    records => records[2].sequence++,
    records => records[3].elapsed = -1,
    records => records[1].car.pos[0] = NaN,
    records => records[1].car.quaternion_wxyz = [0, 0, 0, 0],
    records => records[1].input.jump = 1,
    records => records[1].input.steer = 2,
    records => records[5].camera_count = 3,
    records => records.push(records[4]),
    records => records[0].input_phase = "unknown",
  ]) {
    const records = fixture();
    corrupt(records);
    assert.throws(() => validate(records));
  }
});