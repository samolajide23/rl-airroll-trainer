import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { makeCar, stepCar } from "../../src/shared/carSim.js";
import { RL } from "../../src/shared/rl-physics.js";
import { validateCapture } from "./validate.mjs";

export function controlsFromSample(input) {
    return {
        throttle: input.throttle, steer: input.steer, pitch: input.pitch,
        yaw: input.yaw, roll: input.roll, jump: input.jump,
        handbrake: input.handbrake,
        boost: input.activate_boost || input.holding_boost,
    };
}

function applyState(car, sample) {
    car.pos.fromArray(sample.car.pos);
    car.vel.fromArray(sample.car.vel);
    car.omega.fromArray(sample.car.omega);
    const [scalar, x, y, z] = sample.car.quaternion_wxyz;
    car.q.set(x, y, z, scalar).normalize();
    car.boost = sample.boost_raw === null ? RL.BOOST_MAX : sample.boost_raw * 100;
}

function predict(sample, input, preset) {
    const car = makeCar(new THREE.Vector3(...sample.car.pos), 0, preset);
    applyState(car, sample);
    car.arenaCollisions = true;
    const idle = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false };
    stepCar(car, idle);
    applyState(car, sample);
    car.prevJump = sample.input.jump;
    car.hasJumped = sample.flags.jumped;
    car.hasDoubleJumped = sample.flags.double_jumped;
    car.infiniteBoost = true;
    stepCar(car, controlsFromSample(input));
    return car;
}

export function alignmentReport(samples, preset = "octane") {
    const groups = { ground: [], air: [] };
    let excluded = 0;
    for (let index = 0; index < samples.length - 1; index++) {
        const before = samples[index], after = samples[index + 1];
        const dt = after.physics_time - before.physics_time;
        const ground = before.flags.on_ground && after.flags.on_ground;
        const air = !before.flags.on_ground && !after.flags.on_ground &&
            before.flags.wheel_contacts === 0 && after.flags.wheel_contacts === 0 &&
            !before.flags.jumped && !after.flags.jumped;
        const controlsChanged = JSON.stringify(controlsFromSample(before.input)) !== JSON.stringify(controlsFromSample(after.input));
        const ballDistance = new THREE.Vector3(...before.car.pos).distanceTo(new THREE.Vector3(...before.ball.pos));
        if (Math.abs(dt - RL.DT) > 0.0001 || (!ground && !air) || !controlsChanged ||
            before.input.jump || after.input.jump || before.input.handbrake || after.input.handbrake ||
            before.flags.double_jumped || after.flags.double_jumped || ballDistance < 300) {
            excluded++;
            continue;
        }
        const expectedVelocity = new THREE.Vector3(...after.car.vel);
        const earlier = predict(before, before.input, preset);
        const later = predict(before, after.input, preset);
        groups[ground ? "ground" : "air"].push({
            elapsed: before.elapsed, physics_time: before.physics_time,
            earlier_velocity_error: earlier.vel.distanceTo(expectedVelocity),
            later_velocity_error: later.vel.distanceTo(expectedVelocity),
            earlier_position_error: earlier.pos.distanceTo(new THREE.Vector3(...after.car.pos)),
            later_position_error: later.pos.distanceTo(new THREE.Vector3(...after.car.pos)),
        });
    }
    const summary = values => {
        const mean = key => values.length ? values.reduce((sum, value) => sum + value[key], 0) / values.length : null;
        const earlierWins = values.filter(value => value.earlier_velocity_error + 0.01 < value.later_velocity_error).length;
        const laterWins = values.filter(value => value.later_velocity_error + 0.01 < value.earlier_velocity_error).length;
        return {
            transitions: values.length, earlier_wins: earlierWins, later_wins: laterWins,
            earlier_mean_velocity_error: mean("earlier_velocity_error"),
            later_mean_velocity_error: mean("later_velocity_error"),
            evidence: values.length >= 10 && Math.max(earlierWins, laterWins) / values.length >= 0.8
                ? (earlierWins > laterWins ? "earlier_input_supported" : "later_input_supported") : "inconclusive",
            largest_discriminators: [...values].sort((a, b) =>
                Math.abs(b.earlier_velocity_error - b.later_velocity_error) - Math.abs(a.earlier_velocity_error - a.later_velocity_error)).slice(0, 8),
        };
    };
    return {
        preset, excluded_transitions: excluded, ground: summary(groups.ground), air: summary(groups.air),
        caveats: ["One-step reconstruction is missing suspension/contact history and jump/flip timers.",
            "Boost is assumed normalized 0..1 and unlimited for this capture.",
            "This is input-alignment evidence, not full replay or parity certification."],
    };
}

export function boostEdgeReport(samples) {
    const edges = [];
    const boosting = sample => sample.input.activate_boost || sample.input.holding_boost;
    const speed = sample => Math.hypot(...sample.car.vel);
    for (let index = 1; index < samples.length - 2; index++) {
        const before = samples[index - 1], current = samples[index], after = samples[index + 1];
        if (boosting(before) || !boosting(current) || !boosting(after) || !boosting(samples[index + 2])) continue;
        if ([before, current, after].some(sample => sample.input.jump || sample.input.handbrake)) continue;
        if ([before, after].some(sample => sample.flags.on_ground !== current.flags.on_ground || sample.flags.wheel_contacts !== current.flags.wheel_contacts)) continue;
        if (Math.abs(before.input.throttle - current.input.throttle) > 0.03 || Math.abs(after.input.throttle - current.input.throttle) > 0.03) continue;
        if (speed(current) > 2100 || speed(current) < 100) continue;
        if ([before, current, after].some(sample => new THREE.Vector3(...sample.car.pos).distanceTo(new THREE.Vector3(...sample.ball.pos)) < 300)) continue;
        if (Math.abs(current.physics_time - before.physics_time - RL.DT) > 0.0001 || Math.abs(after.physics_time - current.physics_time - RL.DT) > 0.0001) continue;
        const previousGain = speed(current) - speed(before);
        const nextGain = speed(after) - speed(current);
        edges.push({
            elapsed: current.elapsed, physics_time: current.physics_time, grounded: current.flags.on_ground,
            previous_speed_gain: previousGain, next_speed_gain: nextGain, gain_change: nextGain - previousGain
        });
    }
    const followingWins = edges.filter(edge => edge.gain_change > 2).length;
    return {
        eligible_press_edges: edges.length, following_step_wins: followingWins,
        evidence: edges.length >= 3 && followingWins / edges.length >= 0.8 ? "following_step_supported" : "inconclusive",
        edges, caveat: "Supporting evidence only: slope, rotation, minimum boost duration and contact changes can confound speed gains."
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        if (!process.argv[2]) throw new Error("Usage: node tools/telemetry/alignment.mjs capture.ndjson [hitbox-preset]");
        await validateCapture(process.argv[2]);
        const records = (await readFile(process.argv[2], "utf8")).trim().split(/\r?\n/).map(JSON.parse);
        const samples = records.filter(record => record.type === "input_state");
        console.log(JSON.stringify({ reconstruction: alignmentReport(samples, process.argv[3] ?? "octane"), boost_edges: boostEdgeReport(samples) }, null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}