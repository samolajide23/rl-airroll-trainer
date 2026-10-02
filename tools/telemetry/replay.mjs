import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import * as THREE from "three";
import { makeCar, stepCar, stepCarBall } from "../../src/shared/carSim.js";
import { RL, makeBall } from "../../src/shared/rl-physics.js";
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
        const controls = controlsFromSample(samples[index + (alignment === "later" ? 1 : 0)].input);
        const previousVelocity = car.vel.toArray();
        stepCar(car, controls);
        const expected = samples[index + 1];
        const [scalar, x, y, z] = expected.car.quaternion_wxyz;
        rows.push({
            elapsed: expected.elapsed, physics_time: expected.physics_time,
            controls, expected_velocity: [...expected.car.vel], simulated_velocity: car.vel.toArray(),
            velocity_delta: car.vel.toArray().map((value, axis) => value - expected.car.vel[axis]),
            expected_velocity_gain: expected.car.vel.map((value, axis) => value - samples[index].car.vel[axis]),
            simulated_velocity_gain: car.vel.toArray().map((value, axis) => value - previousVelocity[axis]),
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
    const divergenceIndex = rows.findIndex(row => row.velocity_error > 1);
    return {
        alignment, ticks: rows.length, metrics,
        first_velocity_divergence_window: divergenceIndex < 0 ? [] : rows.slice(Math.max(0, divergenceIndex - 3), divergenceIndex + 4),
        ground_mismatch_ticks: rows.filter(row => row.ground_mismatch).length,
        first_position_error_above_1uu: rows.find(row => row.position_error > 1) ?? null,
        first_velocity_error_above_1uu_s: rows.find(row => row.velocity_error > 1) ?? null,
        checkpoints: rows.filter((row, index) => index % 120 === 0 || index === rows.length - 1),
    };
}

export async function compareJumpCapture(file) {
    const integrity = await validateCapture(file);
    const records = (await readFile(file, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    if (records[0].recorder !== "0.3.0" || records[0].body_id !== 23) throw new Error("Jump contact replay requires recorder 0.3.0 and Octane");
    const samples = records.filter(record => record.type === "input_state");
    const trials = [];
    const rejected = [];
    for (let start = 30; start < samples.length - 120; start++) {
        if (!samples[start].input.jump || samples[start - 1].input.jump || samples[start].flags.wheel_contacts !== 4) continue;
        const window = samples.slice(start - 30, start + 121);
        const invalid = window.some((sample, index) => {
            const input = sample.input;
            const previous = window[index - 1];
            return (previous && (Math.abs(sample.physics_time - previous.physics_time - RL.DT) > 0.0001 || sample.elapsed - previous.elapsed > 0.05)) ||
                input.activate_boost || input.holding_boost || input.handbrake ||
                [input.throttle, input.steer, input.pitch, input.yaw, input.roll].some(value => Math.abs(value) > 0.01) ||
                new THREE.Vector3(...sample.car.pos).distanceTo(new THREE.Vector3(...sample.ball.pos)) < 300;
        });
        if (invalid || samples.slice(start - 30, start).some(sample => sample.input.jump || sample.flags.wheel_contacts !== 4 || Math.hypot(...sample.car.vel) > 2)) {
            rejected.push({ start, reason: "unsettled_or_interrupted_or_mixed_controls" });
            continue;
        }
        const initial = samples[start];
        const car = makeCar(new THREE.Vector3(...initial.car.pos), 0, "octane");
        car.physicsProfile = "native";
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
        car.prevJump = false;
        const rows = [];
        for (let tick = 0; tick < 120; tick++) {
            const observed = samples[start + tick];
            const expected = samples[start + tick + 1];
            stepCar(car, controlsFromSample(observed.input));
            rows.push({ tick: tick + 1, expected_z: expected.car.pos[2], simulated_z: car.pos.z,
                expected_vz: expected.car.vel[2], simulated_vz: car.vel.z,
                expected_contacts: expected.flags.wheel_contacts,
                simulated_contacts: car.wheels.filter(wheel => wheel.inContact).length,
                position_error: car.pos.distanceTo(new THREE.Vector3(...expected.car.pos)),
                velocity_error: car.vel.distanceTo(new THREE.Vector3(...expected.car.vel)) });
        }
        let held = 0;
        while (samples[start + held]?.input.jump) held++;
        trials.push({ start, held, max_position_error: Math.max(...rows.map(row => row.position_error)),
            max_velocity_error: Math.max(...rows.map(row => row.velocity_error)),
            expected_release_tick: rows.find(row => row.expected_contacts === 0)?.tick,
            simulated_release_tick: rows.find(row => row.simulated_contacts === 0)?.tick,
            onset: rows.slice(0, 10), final: rows.at(-1) });
    }
    return { integrity, trials, rejected, parity_certified: false };
}

export function replayContactApproaches(samples, { preImpactTicks = 30 } = {}) {
    if (!Number.isInteger(preImpactTicks) || preImpactTicks < 1 || preImpactTicks > 30) {
        throw new Error("Contact pre-roll must be an integer from 1 to 30 ticks");
    }
    const trials = [];
    const rejected = [];
    let previousCandidate = -100;
    const distance = (first, second) => Math.hypot(...first.map((value, axis) => value - second[axis]));
    for (let impact = 31; impact < samples.length - 30; impact++) {
        const before = samples[impact - 1], after = samples[impact];
        if (distance(before.car.pos, before.ball.pos) >= 210 || distance(before.ball.vel, after.ball.vel) <= 30) continue;
        if (impact - previousCandidate < 30) continue;
        previousCandidate = impact;
        const start = impact - preImpactTicks;
        const window = samples.slice(start, impact + 31);
        const discontinuous = window.slice(1).some((sample, index) => {
            const previous = window[index];
            return Math.abs(sample.physics_time - previous.physics_time - RL.DT) > 0.0001 ||
                sample.elapsed - previous.elapsed > 0.05 ||
                distance(sample.car.pos, previous.car.pos) > Math.hypot(...previous.car.vel) * RL.DT + 12 ||
                distance(sample.ball.pos, previous.ball.pos) > Math.hypot(...previous.ball.vel) * RL.DT + 12;
        });
        const initial = samples[start];
        if (discontinuous || window.slice(0, preImpactTicks).some(sample => sample.input.jump) || window.some(sample => sample.input.activate_boost || sample.input.holding_boost) ||
            window.slice(0, preImpactTicks).some(sample => sample.flags.wheel_contacts !== 4 || sample.flags.jumped || sample.flags.double_jumped)) {
            rejected.push({ impact, reason: "gap_reset_or_jump_boost_history" });
            continue;
        }
        const car = makeCar(new THREE.Vector3(...initial.car.pos), 0, "octane");
        car.physicsProfile = "native";
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
        for (let index = start - 2; index < start; index++) {
            const previous = samples[index];
            car.pos.fromArray(previous.car.pos);
            car.vel.fromArray(previous.car.vel);
            car.omega.fromArray(previous.car.omega);
            const [scalar, x, y, z] = previous.car.quaternion_wxyz;
            car.q.set(x, y, z, scalar).normalize();
            const previousControls = controlsFromSample(samples[index].input);
            stepCar(car, { ...previousControls, jump: false, boost: false });
        }
        restore();
        const ball = makeBall(new THREE.Vector3(...initial.ball.pos));
        ball.vel.fromArray(initial.ball.vel);
        ball.omega.fromArray(initial.ball.omega);
        const rows = [];
        for (let index = start; index < impact + 30; index++) {
            const controls = controlsFromSample(samples[index].input);
            const contact = stepCarBall(car, ball, controls, index);
            const expected = samples[index + 1];
            const [scalar, x, y, z] = expected.car.quaternion_wxyz;
            const expectedOrientation = new THREE.Quaternion(x, y, z, scalar).normalize();
            rows.push({ index: index + 1, contact: Boolean(contact), controls,
                expected_car_velocity: expected.car.vel, simulated_car_velocity: car.vel.toArray(),
                car_angular_velocity_error: distance(car.omega.toArray(), expected.car.omega),
                car_orientation_error_rad: car.q.angleTo(expectedOrientation),
                ball_angular_velocity_error: distance(ball.omega.toArray(), expected.ball.omega),
                expected_wheel_contacts: expected.flags.wheel_contacts,
                simulated_wheel_contacts: car.numWheelsInContact,
                wheel_contact_mismatch: car.numWheelsInContact !== expected.flags.wheel_contacts,
                ground_mismatch: car.onGround !== expected.flags.on_ground,
                car_position_error: distance(car.pos.toArray(), expected.car.pos),
                car_velocity_error: distance(car.vel.toArray(), expected.car.vel),
                ball_position_error: distance(ball.pos.toArray(), expected.ball.pos),
                ball_velocity_error: distance(ball.vel.toArray(), expected.ball.vel),
                expected_ball_velocity: expected.ball.vel, simulated_ball_velocity: ball.vel.toArray() });
        }
        const maxima = {};
        for (const key of ["car_position_error", "car_velocity_error", "ball_position_error", "ball_velocity_error",
            "car_angular_velocity_error", "car_orientation_error_rad", "ball_angular_velocity_error"]) {
            maxima[key] = Math.max(...rows.map(row => row[key]));
        }
        trials.push({ start, candidate_impact: impact, simulated_first_contact: rows.find(row => row.contact)?.index ?? null,
            wheel_contact_mismatch_ticks: rows.filter(row => row.wheel_contact_mismatch).length,
            ground_mismatch_ticks: rows.filter(row => row.ground_mismatch).length,
            first_state_divergence: rows.find(row => row.car_velocity_error > 1 || row.car_angular_velocity_error > 0.01 ||
                row.car_orientation_error_rad > 0.001 || row.ball_angular_velocity_error > 0.01 || row.wheel_contact_mismatch || row.ground_mismatch) ?? null,
            maxima, preimpact: rows[preImpactTicks - 2] ?? null,
            impact_window: rows.slice(Math.max(0, preImpactTicks - 3), preImpactTicks + 4),
            first_car_velocity_divergence: rows.find(row => row.car_velocity_error > 1) ?? null, final: rows.at(-1) });
    }
    return { trials, rejected, pre_impact_ticks: preImpactTicks, parity_certified: false,
        limitations: ["Velocity-change candidates are not authoritative car touches; arena contacts may overlap.",
            "Grounded suspension is warmed and preceding wheel commands are seeded; internal engine state is not restored.",
            "Only grounded, jump-free initial histories and boost-free windows are replayed; already-active flicks remain untested."] };
}

export async function compareContactCapture(file, options) {
    const integrity = await validateCapture(file);
    const records = (await readFile(file, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    if (records[0].recorder !== "0.3.0" || records[0].body_id !== 23) throw new Error("Contact replay requires recorder 0.3.0 and Octane");
    return { integrity, ...replayContactApproaches(records.filter(record => record.type === "input_state"), options) };
}

export async function compareCapture(file, preset = "octane") {
    const integrity = await validateCapture(file);
    const records = (await readFile(file, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const samples = records.filter(record => record.type === "input_state");
    const segment = selectStraightSegment(samples);
    return {
        integrity, body_id: records[0].body_id, assumed_hitbox: preset,
        segment: {
            ...segment, elapsed_start: samples[segment.start].elapsed,
            elapsed_end: samples[segment.end].elapsed, initial_position: samples[segment.start].car.pos
        },
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
        const { values, positionals } = parseArgs({
            allowPositionals: true,
            options: { contact: { type: "boolean" }, "pre-roll": { type: "string" } },
        });
        if (!positionals[0] || positionals.length > 3) throw new Error("Usage: node tools/telemetry/replay.mjs capture.ndjson [report.json] [hitbox] [--contact --pre-roll 30]");
        if (values["pre-roll"] !== undefined && !values.contact) throw new Error("--pre-roll requires --contact");
        const preImpactTicks = values["pre-roll"] === undefined ? 30 : Number(values["pre-roll"]);
        if (values.contact && (!Number.isInteger(preImpactTicks) || preImpactTicks < 1 || preImpactTicks > 30)) throw new Error("Contact pre-roll must be an integer from 1 to 30");
        if (values.contact && positionals[2] !== undefined) throw new Error("Contact replay requires recorded Octane; do not supply a hitbox override");
        const report = values.contact
            ? await compareContactCapture(positionals[0], { preImpactTicks })
            : await compareCapture(positionals[0], positionals[2] ?? "octane");
        const json = JSON.stringify(report, null, 2);
        if (positionals[1]) await writeFile(positionals[1], json + "\n");
        console.log(json);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}