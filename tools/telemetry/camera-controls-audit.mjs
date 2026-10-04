import { readFileSync } from "node:fs";
import { validateCapture } from "./validate.mjs";
import * as THREE from "three";
import { ChaseCamera } from "../../src/shared/chaseCamera.js";
import { setCamera } from "../../src/shared/settings.js";

await validateCapture(process.argv[2]);
const records = readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
const cases = new Map();
for (const row of records) {
    if (row.type !== "camera" || !row.camera_case) continue;
    const rows = cases.get(row.camera_case) ?? [];
    rows.push(row);
    cases.set(row.camera_case, rows);
}
let failures = 0;
const fovSweep = process.argv.includes("--fov");
const armSweep = process.argv.includes("--arm");
for (const [label, rows] of cases) {
    if (armSweep) {
        const gaps = rows.slice(1).filter((row, index) => row.elapsed - rows[index].elapsed > 0.025).length;
        const mismatches = rows.filter(row => row.case_elapsed > 0.1 &&
            ["fov", "height", "angle", "distance", "stiffness", "swivel_speed", "transition_speed", "shake"].some(field =>
                typeof row.settings[field] === "boolean" ? row.settings[field] !== row.requested_camera[field] :
                    Math.abs(row.settings[field] - row.requested_camera[field]) > 0.001)).length;
        const accepted = rows.length > 100 && gaps === 0 && mismatches === 0 && rows.at(-1).case_elapsed > 2.7;
        if (!accepted) failures++;
        let fit = null;
        if (label.startsWith("car/") && !label.endsWith("/0")) {
            const axis = label.includes("distance") ? 0 : 2;
            const samples = rows.filter(row => row.case_elapsed > 0.1);
            for (let candidate = 20; candidate <= 1000; candidate++) {
                const rate = candidate / 100;
                let sumBasis = 0, sumSquared = 0, sumValue = 0, sumProduct = 0;
                for (const row of samples) {
                    const basis = Math.exp(-rate * row.case_elapsed);
                    sumBasis += basis;
                    sumSquared += basis * basis;
                    sumValue += row.pos[axis];
                    sumProduct += basis * row.pos[axis];
                }
                const amplitude = (samples.length * sumProduct - sumBasis * sumValue) /
                    (samples.length * sumSquared - sumBasis * sumBasis);
                const endpoint = (sumValue - amplitude * sumBasis) / samples.length;
                const rms = Math.sqrt(samples.reduce((sum, row) => sum +
                    (endpoint + amplitude * Math.exp(-rate * row.case_elapsed) - row.pos[axis]) ** 2, 0) / samples.length);
                if (!fit || rms < fit.rms_uu) fit = { rate_per_s: rate, endpoint_uu: endpoint, amplitude_uu: amplitude, rms_uu: rms };
            }
        }
        console.log(JSON.stringify({ label, accepted, gaps, mismatches, exponential_fit: fit, response: [0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 2.7].map(time => {
            const row = rows.reduce((first, second) => Math.abs(first.case_elapsed - time) < Math.abs(second.case_elapsed - time) ? first : second);
            return { time: row.case_elapsed, pos: row.pos, rotation: row.rotator_unreal, settings: row.settings,
                car: row.observed_car.pos };
        }) }));
        continue;
    }
    if (fovSweep) {
        const rates = [];
        let gaps = 0;
        for (let index = 1; index < rows.length; index++) {
            const previous = rows[index - 1];
            const row = rows[index];
            const dt = row.elapsed - previous.elapsed;
            if (dt > 0.025) { gaps++; continue; }
            if (dt > 0 && row.case_elapsed > 0.1 && Math.abs(row.fov - previous.fov) > 0.005 &&
                Math.abs(row.fov - row.settings.fov) > 0.5) rates.push((row.fov - previous.fov) / dt);
        }
        rates.sort((first, second) => first - second);
        const final = rows.at(-1);
        const medianRate = rates.length ? rates[Math.floor(rates.length / 2)] : null;
        const rateMatches = medianRate === null ? Math.abs(rows[0].fov - final.settings.fov) < 0.5 : Math.abs(Math.abs(medianRate) - 25) < 0.75;
        const accepted = rows.length > 100 && Math.abs(final.fov - final.settings.fov) < 0.01 && gaps === 0 && rateMatches;
        if (!accepted) failures++;
        console.log(JSON.stringify({ label, accepted, samples: rows.length, gaps, requested: final.settings.fov,
            initial: rows[0].fov, final: final.fov, median_rate_deg_s: medianRate, rate_matches: rateMatches,
            native_rates: final.car_camera_default_rates }));
        continue;
    }
    const pulse = rows.filter(row => row.case_elapsed >= 0.8 && row.case_elapsed < 1.4);
    const modes = [...new Set(pulse.map(row => row.state_name))];
    const peak = Math.max(...pulse.map(row => Math.abs(row.swivel_unreal[0]) * 180 / 32768));
    const transitionTimes = [...new Set(rows.filter(row => row.transition?.started).map(row => row.transition.blend_time))];
    const expectedBall = label.startsWith("ball/");
    const switchedMode = expectedBall ? "CameraState_Car_TA" : "CameraState_BallCam_TA";
    const validLookupFraction = pulse.filter(row => {
        const input = row.camera_input;
        const requestedInput = row.requested_camera.look_up ?? 1;
        if (input?.consumed_elapsed === undefined) return input?.look_up === requestedInput;
        const age = row.elapsed - input.consumed_elapsed;
        return input.consumed_look_up === requestedInput && age >= 0 && age <= 0.025;
    }).length / pulse.length;
    let accepted = pulse.length >= 10 && (label.includes("swivel") ? peak > 5 && validLookupFraction === 1 :
        label.includes("rear") ? pulse.every(row => row.behind_view === true) : modes.includes(switchedMode) &&
            (transitionTimes.length > 0 || pulse.every(row => row.requested_camera.transition_speed === 2)));
    const blendParams = [...new Map(rows.filter(row => row.transition?.started).map(row => {
        const params = { function: row.transition.blend_function, exponent: row.transition.blend_exp };
        return [JSON.stringify(params), params];
    })).values()];
    const curveErrors = {};
    const targetRow = pulse.at(-1);
    const startRow = rows.filter(row => row.case_elapsed < 0.75).at(-1);
    const transitions = pulse.filter(row => row.transition?.started && row.transition.blend_time > 0);
    if (label.includes("transition") && startRow && targetRow && transitions.length) {
        for (const [name, curve] of Object.entries({ linear: progress => progress,
            quadraticIn: progress => progress ** 2, quadraticOut: progress => 1 - (1 - progress) ** 2,
            cubic: progress => progress * progress * (3 - 2 * progress) })) {
            curveErrors[name] = transitions.reduce((sum, row) => {
                const progress = Math.max(0, Math.min(1, 1 - row.transition.remaining_time / row.transition.blend_time));
                const start = startRow.rotator_unreal[1];
                const wrap = value => ((value + 32768) % 65536 + 65536) % 65536 - 32768;
                const predicted = start + wrap(targetRow.rotator_unreal[1] - start) * curve(progress);
                return sum + Math.abs(wrap(predicted - row.rotator_unreal[1])) * 180 / 32768;
            }, 0) / transitions.length;
        }
    }
    const gaps = rows.slice(1).filter((row, index) => row.elapsed - rows[index].elapsed > 0.025).length;
    if (label.includes("transition")) {
        const speed = rows.at(-1).requested_camera.transition_speed;
        const duration = (2 - speed) / 2;
        const switched = rows.find(row => row.case_elapsed >= 0.75 && row.state_name === switchedMode);
        const timingMatches = duration === 0 ? transitionTimes.length === 0 && switched?.case_elapsed < 0.8 :
            transitionTimes.length > 0 && transitionTimes.every(time => Math.abs(time - duration) < 0.0001);
        accepted &&= timingMatches && (duration === 0 || curveErrors.quadraticOut < 0.05);
    }
    accepted &&= gaps === 0;
    let swivelFit = null;
    if (label.includes("swivel") && accepted) {
        const fit = (start, end) => {
            const pairs = rows.slice(1).map((row, index) => ({ row, previous: rows[index] }))
                .filter(({ row, previous }) => previous.case_elapsed >= start && row.case_elapsed < end &&
                    row.elapsed > previous.elapsed && row.elapsed - previous.elapsed <= 0.025);
            let sumValue = 0, sumSquared = 0, sumSlope = 0, sumProduct = 0;
            for (const { row, previous } of pairs) {
                const value = previous.swivel_unreal[0] * 180 / 32768;
                const slope = (row.swivel_unreal[0] - previous.swivel_unreal[0]) * 180 / 32768 /
                    (row.elapsed - previous.elapsed);
                sumValue += value;
                sumSquared += value * value;
                sumSlope += slope;
                sumProduct += value * slope;
            }
            const gradient = (pairs.length * sumProduct - sumValue * sumSlope) /
                (pairs.length * sumSquared - sumValue * sumValue);
            const intercept = (sumSlope - gradient * sumValue) / pairs.length;
            return { rate_per_s: -gradient, endpoint_deg: -intercept / gradient };
        };
        swivelFit = { hold: fit(0.8, 1.4), release: fit(1.52, 1.8) };
        const updates = records.filter(row => row.type === "camera_swivel_update" && row.camera_case === label);
        if (updates.length) {
            const requestedInput = rows.at(-1).requested_camera.look_up ?? 1;
            const targetCenter = Math.trunc(Math.min(1, Math.abs(requestedInput) * 1.2) * (requestedInput < 0 ? -9000 : 5500));
            const targetCandidates = [];
            for (let target = targetCenter - 150; target <= targetCenter + 150; target++) {
                const matched = updates.slice(1).filter((row, index) => {
                    if (updates[index].camera_input.consumed_look_up !== requestedInput) return false;
                    const predicted = Math.trunc(row.before_unreal[0] + (target - row.before_unreal[0]) *
                        Math.min(1, row.delta_time * row.requested_camera.swivel_speed));
                    return predicted === row.after_unreal[0];
                }).length;
                targetCandidates.push({ target, matched });
            }
            const bestMatches = Math.max(...targetCandidates.map(candidate => candidate.matched));
            swivelFit.target_candidates = targetCandidates.filter(candidate => candidate.matched === bestMatches);
            const errors = { linear_step: [], exponential: [], steady_linear_step: [], steady_exponential: [], delayed_integer_step: [], delayed_integer_angle: [] };
            const outliers = [];
            let previousDesired = 0;
            const trainer = new ChaseCamera();
            const trainerCamera = new THREE.PerspectiveCamera();
            const trainerOptions = { target: new THREE.Vector3(0, 3, 0), forward: new THREE.Vector3(0, 0, 1) };
            trainer.update(trainerCamera, 0, { ...trainerOptions, snap: true });
            trainer.swivelPitch = updates[0].before_unreal[0] * Math.PI / 32768;
            errors.trainer_trajectory = [];
            const discontinuities = [];
            let previousAfter = updates[0].before_unreal[0];
            for (const row of updates) {
                if (row.before_unreal[0] !== previousAfter) discontinuities.push({ time: row.case_elapsed,
                    previous_after: previousAfter, before: row.before_unreal[0] });
                previousAfter = row.after_unreal[0];
                const held = row.camera_input.consumed_look_up !== 0;
                const rate = row.requested_camera.swivel_speed * (held ? 1 : 2);
                const lookUp = row.camera_input.consumed_look_up;
                const measuredTargets = new Map([[-1, -8900], [-0.5, -5353], [0, 0], [0.5, 3291], [1, 5500]]);
                const desired = measuredTargets.get(lookUp) ?? row.desired_unreal[0];
                setCamera("swivelSpeed", row.requested_camera.swivel_speed);
                trainer.update(trainerCamera, row.delta_time, { ...trainerOptions, lookUp: row.camera_input.consumed_look_up });
                errors.trainer_trajectory.push(Math.abs(trainer.swivelPitch * 32768 / Math.PI - row.after_unreal[0]) * 180 / 32768);
                const delayedRate = row.requested_camera.swivel_speed * (previousDesired !== 0 ? 1 : 2);
                const delayedPrediction = row.before_unreal[0] + Math.trunc((previousDesired - row.before_unreal[0]) *
                    Math.min(1, row.delta_time * delayedRate));
                errors.delayed_integer_step.push(Math.abs(delayedPrediction - row.after_unreal[0]) * 180 / 32768);
                const delayedAngle = Math.trunc(row.before_unreal[0] + (previousDesired - row.before_unreal[0]) *
                    Math.min(1, row.delta_time * delayedRate));
                errors.delayed_integer_angle.push(Math.abs(delayedAngle - row.after_unreal[0]) * 180 / 32768);
                previousDesired = desired;
                for (const [name, alpha] of [["linear_step", Math.min(1, row.delta_time * rate)],
                    ["exponential", 1 - Math.exp(-row.delta_time * rate)]]) {
                    const predicted = row.before_unreal[0] + (desired - row.before_unreal[0]) * alpha;
                    const error = Math.abs(predicted - row.after_unreal[0]) * 180 / 32768;
                    errors[name].push(error);
                    if ((row.case_elapsed > 0.8 && row.case_elapsed < 1.4) ||
                        (row.case_elapsed > 1.55 && row.case_elapsed < 2)) errors[`steady_${name}`].push(error);
                    if (name === "linear_step" && error > 0.05) outliers.push({ time: row.case_elapsed,
                        dt: row.delta_time, held, before: row.before_unreal[0], after: row.after_unreal[0], desired, error });
                }
            }
            swivelFit.update_errors_deg = Object.fromEntries(Object.entries(errors).map(([name, values]) =>
                [name, { mean: values.reduce((sum, value) => sum + value, 0) / values.length, max: Math.max(...values) }]));
            swivelFit.updates = updates.length;
            swivelFit.update_discontinuities = discontinuities;
            swivelFit.outliers = outliers;
            swivelFit.desired_pitch_deg = Math.max(...updates.map(row => row.desired_unreal[0])) * 180 / 32768;
            swivelFit.pitch_parity = discontinuities.length === 0 &&
                errors.delayed_integer_angle.every(error => error === 0) &&
                errors.trainer_trajectory.every(error => error < 1e-9);
            accepted &&= swivelFit.pitch_parity;
        }
    }
    if (!accepted) failures++;
    console.log(JSON.stringify({ label, accepted, gaps, modes, valid_lookup_fraction: validLookupFraction,
        swivel_fit: swivelFit,
        peak_pitch_deg: peak, transition_times: transitionTimes, blend_params: blendParams, curve_errors_deg: curveErrors,
        pulse_samples: pulse.length,
        response: [0.7, 0.8, 0.9, 1, 1.2, 1.4, 1.6, 1.8, 2].map(time => {
            const row = rows.reduce((first, second) => Math.abs(first.case_elapsed - time) < Math.abs(second.case_elapsed - time) ? first : second);
            return { time: row.case_elapsed, look_up: row.camera_input?.look_up,
                swivel_deg: row.swivel_unreal.map(value => value * 180 / 32768),
                rotation_deg: row.rotator_unreal.map(value => value * 180 / 32768) };
        }) }));
}
console.log(JSON.stringify({ cases: cases.size, failures, reason: records.at(-1).reason }));
if (!(process.argv.includes("--pitch") ? cases.size === 9 : fovSweep || armSweep ? cases.size === 10 : [12, 18].includes(cases.size)) || failures || records.at(-1).reason !== "camera_batch_complete") process.exitCode = 1;