import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createCaptureValidator } from "../telemetry/validate.mjs";
import { alignmentReport, boostEdgeReport, controlsFromSample } from "../telemetry/alignment.mjs";
import { selectStraightSegment, replaySegment, replayContactApproaches } from "../telemetry/replay.mjs";
import { compareNativeAir, compareNativeMechanics, compareNativeJumpBatch, compareNativeAirBatch, restoreNativeAirCar, nativeOrientationStep, nativeStepDurations, nativePositionAcceleration } from "../telemetry/native-air-replay.mjs";
import { stepCar, RL } from "../../src/shared/carPhysics.js";

test("contact replay CLI rejects invalid options before reading captures", () => {
    const script = fileURLToPath(new URL("../telemetry/replay.mjs", import.meta.url));
    for (const [args, message] of [
        [["--contact", "--pre-roll", "1.5"], /integer from 1 to 30/],
        [["--pre-roll", "1"], /requires --contact/],
        [["report.json", "dominus", "--contact"], /hitbox override/],
        [["--unknown"], /Unknown option/],
    ]) {
        const result = spawnSync(process.execPath, [script, "missing.ndjson", ...args], { encoding: "utf8" });
        assert.equal(result.status, 1);
        assert.match(result.stderr, message);
        assert.equal(result.stdout, "");
    }
});

test("contact replay rejects jump histories and discontinuous candidate windows", () => {
    for (const preImpactTicks of [0, 31, 1.5, NaN]) {
        assert.throws(() => replayContactApproaches([], { preImpactTicks }), /pre-roll/);
    }
    assert.equal(replayContactApproaches([], { preImpactTicks: 1 }).pre_impact_ticks, 1);
    const samples = Array.from({ length: 100 }, (_, index) => ({
        physics_time: index / 120, elapsed: index / 120,
        car: { pos: [0, 0, 17], vel: [0, 0, 0] },
        ball: { pos: [100, 0, 100], vel: [index >= 40 ? 100 : 0, 0, 0] },
        input: { jump: index === 20, activate_boost: false, holding_boost: false },
        flags: { wheel_contacts: 4, jumped: false, double_jumped: false },
    }));
    const jumping = replayContactApproaches(samples);
    assert.equal(jumping.trials.length, 0);
    assert.equal(jumping.rejected.length, 1);
    assert.equal(jumping.parity_certified, false);
    samples[20].input.jump = false;
    samples[35].elapsed += 1;
    assert.equal(replayContactApproaches(samples).rejected.length, 1);
    samples[35].elapsed -= 1;
    samples[35].ball.pos = [1000, 0, 100];
    assert.equal(replayContactApproaches(samples).rejected.length, 1);
});

test("contact replay exposes angular and wheel errors independently of linear velocity", () => {
    const samples = Array.from({ length: 100 }, (_, index) => ({
        physics_time: index / 120, elapsed: index / 120,
        car: { pos: [0, 0, 17], vel: [0, 0, 0], omega: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0] },
        ball: { pos: [180, 0, 100], vel: [index >= 40 ? 100 : 0, 0, 0], omega: [0, 0, index >= 40 ? 2 : 0] },
        input: { jump: false, activate_boost: false, holding_boost: false },
        flags: { on_ground: true, wheel_contacts: index >= 40 ? 0 : 4, jumped: false, double_jumped: false },
    }));
    const report = replayContactApproaches(samples);
    assert.equal(report.trials.length, 1);
    const trial = report.trials[0];
    const impact = trial.impact_window.find(row => row.index === 40);
    assert.equal(impact.ball_angular_velocity_error, 2);
    assert.equal(impact.wheel_contact_mismatch, true);
    assert.ok(trial.wheel_contact_mismatch_ticks > 0);
    assert.ok(trial.first_state_divergence);
    for (const value of Object.values(trial.maxima)) assert.ok(Number.isFinite(value));
});

test("contact replay seeds preceding throttle rather than idle braking", () => {
    const samples = Array.from({ length: 100 }, (_, index) => ({
        physics_time: index / 120, elapsed: index / 120,
        car: { pos: [0, 0, 17], vel: [1000, 0, 0], omega: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0] },
        ball: { pos: [180, 0, 100], vel: [index >= 40 ? 100 : 0, 0, 0], omega: [0, 0, 0] },
        input: { throttle: 0.8, jump: false, activate_boost: false, holding_boost: false },
        flags: { on_ground: true, wheel_contacts: 4, jumped: false, double_jumped: false },
    }));
    const trial = replayContactApproaches(samples).trials[0];
    assert.ok(trial.first_state_divergence.simulated_car_velocity[0] > 1000,
        "first replay tick must accelerate, not apply warmup coasting brakes");
});

test("native airborne replay reproduces a known free-flight step and excludes gaps", () => {
    const player = {
        player_id: 7, air_state: 4, demolished_timeout: -1, has_dodged: false,
        has_jumped: true, has_double_jumped: false, boost: 30,
        last_input: { throttle: 1, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false },
        physics: { location: { x: 0, y: 0, z: 1000 }, velocity: { x: 100, y: 0, z: 0 }, angular_velocity: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 } },
    };
    const records = [{ type: "header", version: 2, player_id: 7 }];
    for (let frame = 0; frame < 40; frame++) {
        records.push({ type: "physics", frame, packet: { players: [structuredClone(player)], balls: [], match_info: { match_phase: 3, seconds_elapsed: frame / 120, world_gravity_z: -650, game_speed: 1 } } });
        const car = restoreNativeAirCar(player);
        stepCar(car, player.last_input, RL.DT);
        player.physics.location = { ...car.pos };
        player.physics.velocity = { ...car.vel };
    }
    const report = compareNativeAir(records);
    assert.equal(report.eligible_steps, 16);
    assert.equal(report.metrics.velocity.max, 0);
    assert.equal(report.parity_certified, false);
    const countdown = structuredClone(records);
    countdown.forEach(record => { if (record.packet) record.packet.match_info.match_phase = 1; });
    assert.equal(compareNativeAir(countdown).eligible_steps, 0);
    assert.equal(compareNativeAir(countdown).rejected.phase, 39);
    records.splice(20, 1);
    assert.equal(compareNativeAir(records).rejected.gap, 1);
    records.forEach(record => { if (record.packet) record.packet.players[0].last_input.jump = true; });
    assert.equal(compareNativeAir(records).eligible_steps, 0);
    assert.throws(() => compareNativeAir([]));
});

test("mechanics trajectory replay resolves a recorded boost edge without state resets", () => {
    const player = {
        player_id: 7, air_state: 4, demolished_timeout: -1, has_dodged: false,
        has_jumped: false, has_double_jumped: false, boost: 50,
        last_input: { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false },
        physics: { location: { x: 0, y: 0, z: 1500 }, velocity: { x: 0, y: 0, z: 0 }, angular_velocity: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 } },
    };
    const car = restoreNativeAirCar(player);
    const records = [{ type: "header", version: 2, player_id: 7, scenario: "mechanics_probe" }];
    for (let frame = 40; frame < 161; frame++) {
        const input = { ...player.last_input, boost: frame >= 60 && frame < 120 };
        if (frame > 40) stepCar(car, input, RL.DT);
        player.last_input = input;
        player.boost = car.boost;
        player.physics.location = { ...car.pos };
        player.physics.velocity = { ...car.vel };
        records.push({ type: "physics", frame, probe_case: "boost", probe_tick: frame, packet: { players: [structuredClone(player)], balls: [], match_info: { match_phase: 3, seconds_elapsed: frame / 120, world_gravity_z: -650, game_speed: 1 } } });
    }
    const report = compareNativeMechanics(records);
    assert.equal(report.trials.length, 1);
    assert.equal(report.trials[0].phases.later.ticks, 120);
    assert.equal(report.trials[0].phases.later.max.velocity, 0);
    assert.equal(report.trials[0].phases.later.max.boost, 0);
    assert.ok(report.trials[0].phases.earlier.max.velocity > 0);
    const edge = report.trials[0].phases.later.input_edges[0];
    assert.equal(edge.tick, 60);
    assert.deepEqual(edge.changed, ["boost"]);
    assert.deepEqual(edge.window.map(row => row.tick), [58, 59, 60, 61, 62, 63, 64]);
    const onset = edge.window.find(row => row.tick === 60);
    assert.deepEqual(onset.expected_velocity_gain, onset.simulated_velocity_gain);
    assert.deepEqual(onset.expected_omega_gain, onset.simulated_omega_gain);
    assert.equal(onset.input.boost, true);
    assert.equal(report.trials[0].phases.later.dodge_onset, null);
    records.forEach(record => { if (record.packet) record.packet.match_info.match_phase = 1; });
    assert.equal(compareNativeMechanics(records).trials.length, 0);
});

test("native jump batch replay excludes incomplete, mislabeled and gapped segments", () => {
    const records = [{ type: "header", version: 2, player_id: 7, scenario: "native_batch", probe_repeats: 2, probe_definitions: [{ name: "jump_hold_1", duration_ticks: 360 }] }];
    for (let tick = 0; tick < 360; tick++) {
        records.push({ type: "physics", frame: tick, probe_index: 0, probe_case: "jump_hold_1", probe_tick: tick, reset_after_packet: tick === 0,
            packet: { players: [{ player_id: 7, air_state: 0, has_jumped: false, has_double_jumped: false, has_dodged: false, boost: 50,
                last_input: { jump: false, boost: false }, physics: { location: { x: 0, y: 0, z: 17 }, velocity: { x: 0, y: 0, z: 0 }, angular_velocity: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 } } }], balls: [],
                match_info: { match_phase: 3, seconds_elapsed: tick / 120, world_gravity_z: -650, game_speed: 1 } } });
    }
    records.push({ type: "batch_complete" });
    assert.equal(compareNativeJumpBatch(records).trials.length, 1);
    assert.equal(compareNativeJumpBatch(records.slice(0, -1)).trials.length, 0);
    const mislabeled = structuredClone(records);
    mislabeled[101].probe_tick = 99;
    assert.equal(compareNativeJumpBatch(mislabeled).trials.length, 0);
    records.splice(101, 1);
    assert.equal(compareNativeJumpBatch(records).rejected.length, 1);
});

test("native aerial batch retains trajectory state and rejects invalid segments", () => {
    const player = { player_id: 7, air_state: 4, demolished_timeout: -1, has_dodged: false, has_jumped: false, has_double_jumped: false, boost: 50,
        last_input: { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false },
        physics: { location: { x: 0, y: 0, z: 1500 }, velocity: { x: 0, y: 0, z: 0 }, angular_velocity: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 } } };
    const car = restoreNativeAirCar(player);
    const records = [{ type: "header", version: 2, player_id: 7, scenario: "native_batch", probe_repeats: 2, probe_definitions: [{ name: "air_yaw_1", duration_ticks: 360 }] }];
    for (let tick = 0; tick < 360; tick++) {
        player.last_input.yaw = tick >= 60 && tick < 120 ? 1 : 0;
        if (tick) stepCar(car, player.last_input, RL.DT);
        player.physics.location = { ...car.pos };
        player.physics.velocity = { ...car.vel };
        player.physics.angular_velocity = { ...car.omega };
        player.physics.rotation.yaw = 2 * Math.atan2(car.q.z, car.q.w);
        records.push({ type: "physics", frame: tick, probe_index: 0, probe_case: "air_yaw_1", probe_tick: tick, reset_after_packet: tick === 0,
            packet: { players: [structuredClone(player)], balls: [], match_info: { match_phase: 3, seconds_elapsed: tick / 120, world_gravity_z: -650, game_speed: 1 } } });
    }
    records.push({ type: "batch_complete" });
    const report = compareNativeAirBatch(records);
    assert.equal(report.trials.length, 1);
    assert.equal(report.trials[0].phases.later.ticks, 180);
    assert.ok(report.trials[0].phases.later.max.angular_velocity < 0.00001);
    assert.ok(report.trials[0].phases.later.max.position < 0.001);
    assert.ok(report.trials[0].phases.earlier.max.angular_velocity > 0.01);
    assert.equal(compareNativeAirBatch(records.slice(0, -1)).trials.length, 0);
    const gap = structuredClone(records);
    gap.splice(100, 1);
    assert.equal(compareNativeAirBatch(gap).trials.length, 0);
    const contact = structuredClone(records);
    contact[101].packet.players[0].air_state = 0;
    assert.equal(compareNativeAirBatch(contact).trials[0].phases.later.ticks, 59);
});

test("native step duration diagnostics distinguish timing from force scale", () => {
    const duration = 0.008;
    const previous = { boost: 50, last_input: { throttle: 0, boost: false, jump: false }, physics: {
        location: { x: 0, y: 0, z: 1000 }, velocity: { x: 500, y: 0, z: -100 },
        angular_velocity: { x: 0, y: 0, z: 2 }, rotation: { yaw: 0, pitch: 0, roll: 0 },
    } };
    const current = structuredClone(previous);
    current.physics.velocity.z -= RL.GRAVITY * duration;
    current.physics.location.x += current.physics.velocity.x * duration;
    current.physics.location.z += current.physics.velocity.z * duration;
    current.physics.rotation.yaw += 2 * duration;
    const measured = nativeStepDurations(previous, current);
    for (const value of Object.values(measured)) assert.ok(Math.abs(value - duration) < 0.000001);
    current.last_input.throttle = 1;
    assert.equal(nativeStepDurations(previous, current).gravity, null);
    current.physics.angular_velocity.z = RL.MAX_ANG_VEL;
    assert.equal(nativeStepDurations(previous, current).rotation, null);
});

test("position acceleration does not inherit reported velocity precision", () => {
    const samples = Array.from({ length: 3 }, (_, tick) => ({ physics: {
        location: { x: 100 * tick * RL.DT, y: 0, z: 1000 - RL.GRAVITY * RL.DT ** 2 * tick * (tick + 1) / 2 },
        velocity: { x: 0, y: 0, z: -5.41 * tick },
    } }));
    const acceleration = nativePositionAcceleration(...samples);
    assert.ok(Math.abs(acceleration[0]) < 0.000001);
    assert.ok(Math.abs(acceleration[2] + RL.GRAVITY) < 0.000001);
    const duration = 30 * RL.DT;
    const rounded = Array.from({ length: 3 }, (_, tick) => ({ physics: {
        location: { x: 0, y: 0, z: Math.round((1000 - RL.GRAVITY * duration ** 2 * tick * (tick + 1) / 2) * 100) / 100 },
    } }));
    assert.ok(Math.abs(nativePositionAcceleration(...rounded, duration)[2] + RL.GRAVITY) < 0.2);
});

test("native orientation diagnostics distinguish old and new angular velocity", () => {
    const previous = { boost: 50, physics: { location: { x: 0, y: 0, z: 1000 }, velocity: { x: 0, y: 0, z: 0 }, angular_velocity: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 } } };
    const current = structuredClone(previous);
    current.physics.angular_velocity.z = 2;
    current.physics.rotation.yaw = 2 * RL.DT;
    const errors = nativeOrientationStep(previous, current);
    assert.ok(errors.current_omega < 0.000001);
    assert.ok(errors.previous_omega > 0.016);
});

test("native forward dodge diagnostics distinguish a damped torque response", () => {
    const angularSamples = [0.00021, 1.86681, 3.68871, 5.46691, 5.49991, 5.50001];
    const rotationIncrements = [0, 0.0155572636, 0.0307394341, 0.0455580331, 0.0600211933, 0.0602896019];
    const records = [{ type: "header", version: 2, player_id: 7 }];
    for (let tick = 40; tick <= 160; tick++) {
        const dodging = tick >= 101;
        records.push({ type: "physics", frame: tick, probe_case: "forward_flip", probe_tick: tick, packet: {
            players: [{ player_id: 7, air_state: dodging ? 3 : 0, has_jumped: dodging, has_dodged: dodging, has_double_jumped: false, boost: 50,
                last_input: { jump: tick === 101 || tick === 102, pitch: tick === 101 || tick === 102 ? -1 : 0, boost: false },
                physics: { location: { x: 0, y: 0, z: dodging ? 300 : 17 }, velocity: { x: dodging ? 500 : 0, y: 0, z: 0 }, angular_velocity: { x: 0, y: angularSamples[Math.max(0, Math.min(5, tick - 100))], z: 0 }, rotation: { yaw: 0, pitch: -rotationIncrements.slice(0, Math.max(1, Math.min(6, tick - 99))).reduce((sum, value) => sum + value, 0), roll: 0 } } }],
            balls: [], match_info: { match_phase: 3, seconds_elapsed: tick / 120, world_gravity_z: -650, game_speed: 1 },
        } });
    }
    const report = compareNativeMechanics(records);
    const response = report.trials[0].forward_pitch_response;
    assert.deepEqual(response.map(row => row.tick), [101, 102, 103, 104, 105]);
    assert.ok(response.slice(0, 3).every(row => row.torque_and_damping_error < 0.0001));
    assert.ok(response.every(row => row.pre_cap_orientation_error < 0.000001));
    assert.ok(report.trials[0].phases.later.input_edges.find(row => row.tick === 101).window.find(row => row.tick === 104).orientation_step_error.current_omega > 0.014);
    assert.ok(response[1].torque_only_error > 0.04);
    assert.ok(Math.abs(response[2].torque_only_error - (5.5 - angularSamples[3])) < 0.000001);
    assert.equal(report.trials[0].phases.later.dodge_onset.tick, 101);
    assert.deepEqual(report.trials[0].phases.later.dodge_onset.expected_velocity_gain, [500, 0, 0]);
});

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
    const replay = replaySegment(samples, segment);
    assert.equal(replay.ticks, 90);
    assert.ok(Array.isArray(replay.first_velocity_divergence_window));
    assert.deepEqual(replay.checkpoints[0].controls, controlsFromSample(samples[segment.start].input));
    assert.deepEqual(replay.checkpoints[0].expected_velocity, samples[segment.start + 1].car.vel);
    assert.deepEqual(replay.checkpoints[0].expected_velocity_gain, [0, 0, 0]);
    assert.ok(replay.checkpoints[0].simulated_velocity_gain.every(Number.isFinite));
    assert.deepEqual(replay.checkpoints[0].velocity_delta,
        replay.checkpoints[0].simulated_velocity.map((value, axis) => value - replay.checkpoints[0].expected_velocity[axis]));
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

test("contact recorder validates wheel data without assuming old captures contain it", () => {
    const records = fixture();
    records[0].recorder = "0.3.0";
    for (const sample of records.filter(record => record.type === "input_state")) {
        sample.contact_state = { time_on_ground: 1, time_off_ground: 0, sticky_ground: 0.5, sticky_wall: 1.5, ground_normal: [0, 0, 1] };
        sample.jump_component = { min_time: 0.025, activity_time: 0, active_time: 0, force_time: 0.2, impulse: 0, force: 0, impulse_speed: 292, accel: 1458, active: false, deactivate: false };
        sample.wheels = Array.from({ length: 4 }, (_, index) => ({ index, has_contact: true, world_contact: true, had_contact: true,
            contact_change_time: 0, radius: 12.5, suspension_distance: 20, suspension_travel: 12, suspension_max_raise: 12,
            contact_force_distance: 0, stiffness: 500, damping_compression: 25, damping_relaxation: 40,
            ray_start_local: [0, 0, 20], rest_position_local: [0, 0, 0], contact_location: [0, 0, 0], contact_normal: [0, 0, 1] }));
    }
    const validate = source => {
        const validator = createCaptureValidator();
        source.forEach(record => validator.accept(record));
        return validator.finish();
    };
    assert.equal(validate(records).contact_samples, 2);
    const duplicate = structuredClone(records);
    duplicate.find(record => record.type === "input_state").wheels[1].index = 0;
    assert.throws(() => validate(duplicate), /duplicated/);
    const invalid = structuredClone(records);
    invalid.find(record => record.type === "input_state").wheels[0].suspension_distance = NaN;
    assert.throws(() => validate(invalid), /finite/);
    const unavailable = structuredClone(records);
    unavailable.filter(record => record.type === "input_state").forEach(record => { record.wheels = null; });
    assert.equal(validate(unavailable).unavailable_contact_samples, 2);
    const missing = structuredClone(records);
    delete missing.find(record => record.type === "input_state").wheels;
    assert.throws(() => validate(missing), /four entries/);
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