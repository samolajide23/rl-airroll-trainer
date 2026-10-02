import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Quaternion, Vector3 } from "three";
import { makePhysCar, stepCar, RL } from "../../src/shared/carPhysics.js";
import { setCarOrientation } from "../../src/shared/carSim.js";

const vector = value => new Vector3(value.x, value.y, value.z);
const controlKeys = ["throttle", "steer", "pitch", "yaw", "roll", "jump", "boost", "handbrake"];

export function nativeOrientationStep(previous, current) {
    const before = restoreNativeAirCar(previous);
    const after = restoreNativeAirCar(current);
    before.q.normalize();
    after.q.normalize();
    return Object.fromEntries([["previous_omega", before.omega], ["current_omega", after.omega]].map(([name, omega]) => {
        const speed = omega.length();
        const delta = speed ? new Quaternion().setFromAxisAngle(omega.clone().divideScalar(speed), speed * RL.DT) : new Quaternion();
        return [name, delta.multiply(before.q).angleTo(after.q)];
    }));
}

export function restoreNativeAirCar(player) {
    const physics = player.physics;
    const car = makePhysCar(vector(physics.location), 0);
    car.vel.copy(vector(physics.velocity));
    car.omega.copy(vector(physics.angular_velocity));
    const rotation = physics.rotation;
    setCarOrientation(car, rotation.yaw, rotation.pitch, rotation.roll);
    car.onGround = false;
    car.wheelsContact = false;
    car.numWheelsInContact = 0;
    car.boost = player.boost;
    car.hasJumped = player.has_jumped;
    car.hasDoubleJumped = player.has_double_jumped;
    car.jumpTime = 1;
    car.airTime = 1;
    car.airTimeSinceJump = 1;
    car.arenaCollisions = false;
    return car;
}

function isolated(packet, player) {
    const position = vector(player.physics.location);
    if (position.z < 300 || position.z > 1700 || Math.abs(position.x) > 3500 || Math.abs(position.y) > 4500) return false;
    if (packet.balls.some(ball => position.distanceTo(vector(ball.physics.location)) < 400)) return false;
    return packet.players.every(other => other.player_id === player.player_id || position.distanceTo(vector(other.physics.location)) > 400);
}

export function nativeStepDurations(previous, current) {
    const before = restoreNativeAirCar(previous);
    const after = restoreNativeAirCar(current);
    const velocityGain = after.vel.z - before.vel.z;
    const speedSquared = after.vel.lengthSq();
    const angularSpeed = after.omega.length();
    const coasting = [previous, current].every(player => !player.last_input.throttle && !player.last_input.boost && !player.last_input.jump);
    return {
        gravity: coasting ? -velocityGain / RL.GRAVITY : null,
        position: speedSquared > 10000 ? after.pos.clone().sub(before.pos).dot(after.vel) / speedSquared : null,
        rotation: angularSpeed > 0.5 && angularSpeed < RL.MAX_ANG_VEL - 0.1 ? before.q.clone().normalize().angleTo(after.q.clone().normalize()) / angularSpeed : null,
    };
}

export function nativePositionAcceleration(previous, current, next, duration = RL.DT) {
    const positions = [previous, current, next].map(player => vector(player.physics.location));
    return positions[2].sub(positions[1].clone().multiplyScalar(2)).add(positions[0]).divideScalar(duration * duration).toArray();
}

export function compareNativeMechanics(records) {
    const header = records[0];
    if (header?.version !== 2 || !Number.isInteger(header.player_id)) throw new Error("Expected v2 native capture header");
    const samples = records.filter(record => record.type === "physics");
    const trials = [];
    for (let index = 0; index < samples.length - 1; index++) {
        const start = samples[index];
        if (!start.probe_case || start.probe_tick < 40 || start.probe_tick >= 60 || start.reset_after_packet || start.packet.match_info.match_phase !== 3) continue;
        const player = start.packet.players.find(value => value.player_id === header.player_id);
        if (!player || player.last_input.jump || player.last_input.boost || player.has_jumped || player.has_dodged) continue;
        const aerial = start.probe_case.startsWith("air_");
        const airborne = aerial || start.probe_case === "boost";
        if (!airborne && player.air_state !== 0) continue;
        if (airborne && (player.air_state !== 4 || !isolated(start.packet, player))) continue;
        const end = samples.findIndex((sample, sampleIndex) => sampleIndex > index && (sample.reset_after_packet || sample.probe_case !== start.probe_case || sample.packet.match_info.match_phase !== 3 || sample.frame !== samples[sampleIndex - 1].frame + 1 || Math.abs(sample.packet.match_info.seconds_elapsed - samples[sampleIndex - 1].packet.match_info.seconds_elapsed - RL.DT) > 0.0001));
        const segment = samples.slice(index, Math.min(end < 0 ? samples.length : end, index + 181));
        if (segment.length < 100) continue;
        const dodgeOffset = segment.findIndex((sample, offset) => offset > 0 && !segment[offset - 1].packet.players.find(value => value.player_id === header.player_id)?.has_dodged && sample.packet.players.find(value => value.player_id === header.player_id)?.has_dodged);
        const pitchResponse = [];
        if (start.probe_case === "forward_flip" && dodgeOffset > 0) {
            for (let offset = dodgeOffset; offset < Math.min(segment.length, dodgeOffset + 5); offset++) {
                const previous = segment[offset - 1].packet.players.find(value => value.player_id === header.player_id);
                const current = segment[offset].packet.players.find(value => value.player_id === header.player_id);
                if (!previous || !current) break;
                const body = restoreNativeAirCar(previous);
                const pitchAxis = new Vector3(0, 1, 0).applyQuaternion(body.q);
                const before = vector(previous.physics.angular_velocity).dot(pitchAxis);
                const after = vector(current.physics.angular_velocity).dot(pitchAxis);
                const torqueOnly = before + RL.FLIP_TORQUE_Y * RL.DT;
                const torqueAndDamping = torqueOnly - Math.abs(RL.D_PITCH) * before * RL.DT;
                const target = restoreNativeAirCar(current);
                const predictedOrientation = new Quaternion().setFromAxisAngle(pitchAxis.normalize(), torqueAndDamping * RL.DT).multiply(body.q.clone().normalize());
                pitchResponse.push({ tick: segment[offset].probe_tick, native_before: before, native_after: after, torque_only_prediction: torqueOnly, torque_and_damping_prediction: torqueAndDamping, torque_only_error: Math.abs(after - Math.min(RL.MAX_ANG_VEL, torqueOnly)), torque_and_damping_error: Math.abs(after - Math.min(RL.MAX_ANG_VEL, torqueAndDamping)), pre_cap_orientation_error: predictedOrientation.angleTo(target.q.normalize()) });
            }
        }
        const phases = {};
        for (const phase of ["earlier", "later"]) {
            const car = restoreNativeAirCar(player);
            if (!airborne) {
                car.arenaCollisions = true;
                car.hasJumped = false;
                car.jumpTime = 0;
                car.airTime = 0;
                car.airTimeSinceJump = 0;
                for (let warm = 0; warm < 120; warm++) stepCar(car, {}, RL.DT);
                car.pos.copy(vector(player.physics.location));
                car.vel.copy(vector(player.physics.velocity));
                car.omega.copy(vector(player.physics.angular_velocity));
                setCarOrientation(car, player.physics.rotation.yaw, player.physics.rotation.pitch, player.physics.rotation.roll);
            }
            const rows = [];
            for (let offset = 0; offset < segment.length - 1; offset++) {
                const before = segment[offset];
                const after = segment[offset + 1];
                const previous = before.packet.players.find(value => value.player_id === header.player_id);
                const expected = after.packet.players.find(value => value.player_id === header.player_id);
                if (!previous || !expected || after.packet.match_info.world_gravity_z !== -RL.GRAVITY || after.packet.match_info.game_speed !== 1) break;
                if (airborne && (!isolated(before.packet, previous) || !isolated(after.packet, expected))) break;
                if (aerial && [previous, expected].some(value => value.air_state !== 4 || value.has_dodged || value.has_jumped || value.has_double_jumped || value.demolished_timeout >= 0 || value.last_input.jump || value.last_input.boost)) break;
                const input = (phase === "earlier" ? previous : expected).last_input;
                const previousVelocity = car.vel.clone();
                const previousOmega = car.omega.clone();
                stepCar(car, input, RL.DT);
                const target = restoreNativeAirCar(expected);
                rows.push({ frame: after.frame, tick: after.probe_tick, air_state: expected.air_state, height: target.pos.z, position: car.pos.distanceTo(target.pos), velocity: car.vel.distanceTo(target.vel), angular_velocity: car.omega.distanceTo(target.omega), orientation: car.q.angleTo(target.q), boost: Math.abs(car.boost - expected.boost), jump_matches: car.hasJumped === expected.has_jumped, flip_matches: car.hasFlipped === expected.has_dodged, expected_velocity: target.vel.toArray(), simulated_velocity: car.vel.toArray(), expected_omega: target.omega.toArray(), simulated_omega: car.omega.toArray(), expected_velocity_gain: target.vel.clone().sub(vector(previous.physics.velocity)).toArray(), simulated_velocity_gain: car.vel.clone().sub(previousVelocity).toArray(), expected_omega_gain: target.omega.clone().sub(vector(previous.physics.angular_velocity)).toArray(), simulated_omega_gain: car.omega.clone().sub(previousOmega).toArray(), input: { ...input }, input_changes: controlKeys.filter(key => previous.last_input[key] !== expected.last_input[key]), dodge_started: !previous.has_dodged && expected.has_dodged, simulated_dodging: car.hasFlipped });
                rows.at(-1).orientation_step_error = nativeOrientationStep(previous, expected);
                if (aerial) {
                    rows.at(-1).step_durations = nativeStepDurations(previous, expected);
                    const windowTicks = 30;
                    if (offset + 1 >= windowTicks * 2) {
                        const window = segment.slice(offset + 1 - windowTicks * 2, offset + 2).map(record => record.packet.players.find(value => value.player_id === header.player_id));
                        if (window.every(value => value && !value.last_input.throttle && !value.last_input.boost && !value.last_input.jump)) {
                            rows.at(-1).position_acceleration = nativePositionAcceleration(window[0], window[windowTicks], window[windowTicks * 2], windowTicks * RL.DT);
                        }
                    }
                }
            }
            phases[phase] = {
                ticks: rows.length,
                ...(aerial ? { position_gravity: (() => {
                    const values = rows.filter(row => row.position_acceleration).map(row => row.position_acceleration[2]).toSorted((first, second) => first - second);
                    return { samples: values.length, median: values.length ? values[Math.floor(values.length / 2)] : null };
                })() } : {}),
                ...(aerial ? { step_durations: Object.fromEntries(["gravity", "position", "rotation"].map(key => {
                    const values = rows.map(row => row.step_durations[key]).filter(value => value !== null).toSorted((first, second) => first - second);
                    return [key, { samples: values.length, median: values.length ? values[Math.floor(values.length / 2)] : null }];
                })) } : {}),
                max: Object.fromEntries(["position", "velocity", "angular_velocity", "orientation", "boost"].map(key => [key, rows.length ? Math.max(...rows.map(row => row[key])) : null])),
                flag_mismatches: rows.filter(row => !row.jump_matches || !row.flip_matches).length,
                first_motion_divergence: rows.find(row => row.velocity > 5 || row.position > 5) ?? null,
                peak_velocity_error: rows.toSorted((first, second) => second.velocity - first.velocity)[0] ?? null,
                peak_rotation_error: rows.toSorted((first, second) => second.orientation - first.orientation)[0] ?? null,
                input_edges: rows.flatMap((row, offset) => row.input_changes.length ? [{ frame: row.frame, tick: row.tick, changed: row.input_changes, window: rows.slice(Math.max(0, offset - 2), offset + 5) }] : []),
                dodge_onset: rows.find(row => row.dodge_started) ?? null,
                checkpoints: rows.filter((row, offset) => offset % 30 === 0 || offset === rows.length - 1 || row.tick >= 61 && row.tick <= 80),
            };
        }
        trials.push({ case: start.probe_case, physics_profile: "native", start_frame: start.frame, start_tick: start.probe_tick, forward_pitch_response: pitchResponse, phases });
        index += segment.length - 1;
    }
    return { trials, parity_certified: false, limitations: ["Octane hitbox assumed; suspension warmed rather than recorded", "Both packet input timings reported; edges must be resolved from native data", "Reset latency excluded by a 40-frame settling period", "No ball, wall or car contacts certified"] };
}

export function compareNativeJumpBatch(records) {
    return compareNativeBatch(records, "jump");
}

export function compareNativeAirBatch(records) {
    return compareNativeBatch(records, "air");
}

function compareNativeBatch(records, family) {
    const header = records[0];
    if (header?.scenario !== "native_batch" || header.probe_repeats !== 2) throw new Error("Expected two-pass native batch");
    const definitions = header.probe_definitions;
    if (!Array.isArray(definitions) || !definitions.length) throw new Error("Expected batch definitions");
    const casePattern = family === "air" ? /^air_(?:(?:pitch|yaw|roll)_-?1|combined|throttle|coast)$/ : /^jump_hold_\d+$/;
    const groups = new Map();
    for (const record of records) {
        if (record.type !== "physics" || !casePattern.test(record.probe_case ?? "")) continue;
        if (!groups.has(record.probe_index)) groups.set(record.probe_index, []);
        groups.get(record.probe_index).push(record);
    }
    const trials = [];
    const rejected = [];
    for (const [index, segment] of groups) {
        const definition = definitions[index % definitions.length];
        const valid = Number.isInteger(index) && index >= 0 && index < definitions.length * header.probe_repeats && records.some(record => record.type === "batch_complete") &&
            definition?.duration_ticks === 360 && segment.length === 360 && segment[0].reset_after_packet === true &&
            segment.every((record, offset) => record.probe_case === definition.name && record.probe_tick === offset &&
                record.packet.match_info.match_phase === 3 && record.packet.match_info.world_gravity_z === -RL.GRAVITY &&
                record.packet.match_info.game_speed === 1 && record.packet.players.length === 1 &&
                record.packet.players[0].player_id === header.player_id &&
                (!offset || !record.reset_after_packet && record.frame === segment[offset - 1].frame + 1 &&
                    Math.abs(record.packet.match_info.seconds_elapsed - segment[offset - 1].packet.match_info.seconds_elapsed - RL.DT) < 0.0001));
        if (!valid) {
            rejected.push({ index, case: segment[0].probe_case });
            continue;
        }
        const report = compareNativeMechanics([header, ...segment]);
        if (!report.trials.length) rejected.push({ index, case: segment[0].probe_case, reason: "no eligible trajectory" });
        trials.push(...report.trials.map(trial => ({ ...trial, probe_index: index })));
    }
    return { trials, rejected, parity_certified: false, limitations: [family === "air" ? "Unboosted aerial cases only; bounded to 180 steps and stopped before contact" : "Jump-hold cases only; suspension warmed rather than observed", "Input timing reported both ways; no contact or full-batch parity certification"] };
}

export function compareNativeAir(records) {
    const header = records[0];
    if (header?.type !== "header" || header.version !== 2 || !Number.isInteger(header.player_id)) throw new Error("Expected v2 native capture header");
    const samples = records.filter(record => record.type === "physics");
    const rejected = { gap: 0, phase: 0, state: 0, transition: 0, history: 0 };
    const errors = [];
    let history = [];
    for (let index = 0; index < samples.length - 1; index++) {
        const before = samples[index];
        const after = samples[index + 1];
        const player = before.packet.players.find(value => value.player_id === header.player_id);
        const expected = after.packet.players.find(value => value.player_id === header.player_id);
        if ([before, after].some(sample => sample.packet.match_info.match_phase !== 3)) {
            rejected.phase++;
            history = [];
            continue;
        }
        if (before.reset_after_packet || after.frame !== before.frame + 1 || Math.abs(after.packet.match_info.seconds_elapsed - before.packet.match_info.seconds_elapsed - RL.DT) > 0.0001) {
            rejected.gap++;
            history = [];
            continue;
        }
        if (!player || !expected || [before, after].some(sample => sample.packet.match_info.world_gravity_z !== -RL.GRAVITY || sample.packet.match_info.game_speed !== 1) || [player, expected].some(value => value.air_state !== 4 || value.has_dodged || value.demolished_timeout >= 0 || value.last_input.jump || value.last_input.boost) || !isolated(before.packet, player) || !isolated(after.packet, expected)) {
            rejected.state++;
            history = [];
            continue;
        }
        history.push(player);
        if (history.length < 24) {
            rejected.history++;
            continue;
        }
        history.shift();
        if (controlKeys.some(key => player.last_input[key] !== expected.last_input[key])) {
            rejected.transition++;
            continue;
        }
        const car = restoreNativeAirCar(player);
        stepCar(car, player.last_input, RL.DT);
        const target = restoreNativeAirCar(expected);
        const error = {
            frame: before.frame,
            position: car.pos.distanceTo(target.pos),
            velocity: car.vel.distanceTo(target.vel),
            angular_velocity: car.omega.distanceTo(target.omega),
            orientation: car.q.angleTo(target.q),
        };
        if (!Object.values(error).every(Number.isFinite)) throw new Error(`Nonfinite physics at frame ${before.frame}`);
        errors.push(error);
    }
    const metrics = Object.fromEntries(["position", "velocity", "angular_velocity", "orientation"].map(key => [key, {
        mean: errors.length ? errors.reduce((sum, value) => sum + value[key], 0) / errors.length : null,
        max: errors.length ? Math.max(...errors.map(value => value[key])) : null,
    }]));
    return {
        physics_samples: samples.length, eligible_steps: errors.length, rejected, metrics,
        worst_velocity_steps: errors.toSorted((first, second) => second.velocity - first.velocity).slice(0, 5),
        parity_certified: false,
        limitations: ["Only steady-input, unboosted, contact-free airborne steps without dodges", "24-frame airborne history excludes unknown jump/boost hold state", "No suspension, collision, boost, input-edge or long-trajectory certification", "Rotation reconstructed from packet Euler angles"],
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const records = (await readFile(process.argv[2], "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line));
    const report = records[0].scenario === "native_batch" ? (process.argv.includes("--air-batch") ? compareNativeAirBatch(records) : compareNativeJumpBatch(records)) : records[0].scenario === "mechanics_probe" ? compareNativeMechanics(records) : compareNativeAir(records);
    if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(process.argv.includes("--summary") ? {
        parity_certified: report.parity_certified,
        rejected: report.rejected,
        trials: report.trials?.map(trial => ({ case: trial.case, probe_index: trial.probe_index,
            ticks: trial.phases.later.ticks,
            earlier_max: trial.phases.earlier.max,
            step_durations: trial.phases.later.step_durations,
            position_gravity: trial.phases.later.position_gravity,
            max: trial.phases.later.max,
            early: trial.phases.later.checkpoints.filter(row => row.tick >= 61 && row.tick <= 70).map(row => ({
                tick: row.tick, native_gain: row.expected_velocity_gain[2], simulated_gain: row.simulated_velocity_gain[2], input: row.input.jump, air_state: row.air_state,
            })),
        })),
    } : report, null, 2));
    if (!(report.eligible_steps ?? report.trials.length)) process.exitCode = 1;
}