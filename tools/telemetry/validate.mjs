import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

function requireCondition(condition, message) {
    if (!condition) throw new Error(message);
}

function finite(value, name) {
    requireCondition(typeof value === "number" && Number.isFinite(value), `${name} must be finite`);
}

function vector(value, length, name) {
    requireCondition(Array.isArray(value) && value.length === length, `${name} must contain ${length} values`);
    value.forEach(component => finite(component, name));
}

function body(value, name) {
    requireCondition(value && typeof value === "object", `${name} missing`);
    for (const key of ["pos", "vel", "omega"]) vector(value[key], 3, `${name}.${key}`);
    vector(value.quaternion_wxyz, 4, `${name}.quaternion_wxyz`);
    const norm = Math.hypot(...value.quaternion_wxyz);
    requireCondition(Math.abs(norm - 1) < 0.01, `${name} quaternion is not normalized`);
    finite(value.rb_time, `${name}.rb_time`);
}

export function validateCameraDiagnostics(record) {
    requireCondition(record.camera_callback_interval === null || typeof record.camera_callback_interval === "number", "camera_callback_interval missing");
    if (record.camera_callback_interval !== null) {
        finite(record.camera_callback_interval, "camera_callback_interval");
        requireCondition(record.camera_callback_interval >= 0, "camera_callback_interval must be nonnegative");
    }
    requireCondition(typeof record.state_name === "string", "camera state_name missing");
    requireCondition(record.blender_state === null || typeof record.blender_state === "string", "blender_state missing");
    requireCondition(record.behind_view === null || typeof record.behind_view === "boolean", "behind_view missing");
    requireCondition(record.native_rates && typeof record.native_rates === "object", "native_rates missing");
    for (const key of ["swivel_fast", "swivel_decay", "clip"]) finite(record.native_rates[key], `native_rates.${key}`);
    requireCondition(record.car_camera_default_rates === null || typeof record.car_camera_default_rates === "object", "car_camera_default_rates missing");
    if (record.car_camera_default_rates !== null) {
        for (const key of ["to_ground", "to_air", "ground_rotation", "wall_rotation", "fov", "supersonic_fov", "ground_normal"]) finite(record.car_camera_default_rates[key], `car_camera_default_rates.${key}`);
    }
    for (const key of ["observed_car", "observed_ball"]) {
        requireCondition(record[key] === null || typeof record[key] === "object", `${key} missing`);
        if (record[key] !== null) body(record[key], key);
    }
    requireCondition(record.transition === null || typeof record.transition === "object", "transition missing");
    if (record.transition !== null) {
        requireCondition(typeof record.transition.started === "boolean", "transition.started missing");
        if (record.transition.started) {
            for (const key of ["remaining_time", "blend_time", "blend_exp"]) finite(record.transition[key], `transition.${key}`);
            requireCondition(Number.isInteger(record.transition.blend_function) && record.transition.blend_function >= 0 && record.transition.blend_function <= 255, "transition.blend_function invalid");
            requireCondition(typeof record.transition.lock_outgoing === "boolean", "transition.lock_outgoing missing");
            const snapshot = record.transition.snapshot;
            requireCondition(snapshot && typeof snapshot === "object", "transition.snapshot missing");
            for (const key of ["focus", "pos", "rotator_unreal"]) vector(snapshot[key], 3, `snapshot.${key}`);
            for (const key of ["distance", "fov"]) finite(snapshot[key], `snapshot.${key}`);
        }
    }
}

export function createCaptureValidator() {
    let header = null;
    let footer = null;
    let sequence = 0;
    let elapsed = -Infinity;
    const counts = { input_state: 0, camera: 0 };
    const times = { input_state: [], camera: [] };
    let previousPhysicsTime = -Infinity;
    let repeatedPhysicsTimes = 0;
    let backwardsPhysicsTimes = 0;
    let contactSamples = 0;
    let unavailableContactSamples = 0;

    return {
        accept(record) {
            requireCondition(record && typeof record === "object" && !Array.isArray(record), "record must be an object");
            requireCondition(!footer, "records found after footer");
            if (!header) {
                requireCondition(record.type === "header" && record.version === 1, "missing or unsupported header");
                requireCondition(record.position_units === "uu" && record.rotation_units === "unreal_rotator", "unsupported coordinate units");
                requireCondition(record.input_phase === "post_SetVehicleInput_not_post_physics" && record.camera_phase === "drawable", "unsupported sample phases");
                requireCondition(record.sample_rate_assumed === false, "sampling rate must not be assumed");
                if (record.camera_diagnostics_version !== undefined) requireCondition(record.camera_diagnostics_version === 1, "unsupported camera diagnostics version");
                if (record.recorder === "0.4.0") requireCondition(record.camera_diagnostics_version === 1, "camera diagnostics version missing");
                header = record;
                return;
            }
            if (record.type === "footer") {
                requireCondition(record.input_count === counts.input_state && record.camera_count === counts.camera, "footer counts do not match capture");
                requireCondition(typeof record.reason === "string", "footer reason missing");
                footer = record;
                return;
            }
            requireCondition(Object.hasOwn(counts, record.type) || record.type === "camera_swivel_update", "unknown sample type");
            requireCondition(record.sequence === sequence++, "sample sequence is not contiguous");
            finite(record.elapsed, "elapsed");
            requireCondition(record.elapsed >= 0 && record.elapsed >= elapsed, "sample time went backwards");
            elapsed = record.elapsed;
            if (record.type === "camera_swivel_update") {
                finite(record.delta_time, "swivel.delta_time");
                requireCondition(record.delta_time > 0 && record.delta_time <= 0.1, "invalid swivel update duration");
                vector(record.before_unreal, 3, "swivel.before_unreal");
                vector(record.after_unreal, 3, "swivel.after_unreal");
                vector(record.desired_unreal, 3, "swivel.desired_unreal");
                return;
            }
            if (record.type === "input_state") {
                finite(record.physics_time, "physics_time");
                if (record.physics_time === previousPhysicsTime) repeatedPhysicsTimes++;
                if (record.physics_time < previousPhysicsTime) backwardsPhysicsTimes++;
                previousPhysicsTime = record.physics_time;
                requireCondition(record.input && record.flags, "input or flags missing");
                for (const key of ["throttle", "steer", "pitch", "yaw", "roll", "dodge_forward", "dodge_strafe"]) {
                    finite(record.input[key], `input.${key}`);
                    requireCondition(Math.abs(record.input[key]) <= 1.001, `input.${key} out of range`);
                }
                for (const key of ["jump", "handbrake", "activate_boost", "holding_boost"]) {
                    requireCondition(typeof record.input[key] === "boolean", `input.${key} must be boolean`);
                }
                for (const key of ["on_ground", "jumped", "double_jumped", "has_flip", "supersonic"]) {
                    requireCondition(typeof record.flags[key] === "boolean", `flags.${key} must be boolean`);
                }
                for (const key of ["wheel_contacts", "wheel_world_contacts"]) {
                    requireCondition(Number.isInteger(record.flags[key]) && record.flags[key] >= 0 && record.flags[key] <= 4, `flags.${key} invalid`);
                }
                if (record.boost_raw !== null) finite(record.boost_raw, "boost_raw");
                body(record.car, "car");
                body(record.ball, "ball");
                if (header.recorder === "0.3.0" || header.recorder === "0.4.0") {
                    requireCondition(record.contact_state, "contact_state missing");
                    for (const key of ["time_on_ground", "time_off_ground", "sticky_ground", "sticky_wall"]) finite(record.contact_state[key], `contact_state.${key}`);
                    vector(record.contact_state.ground_normal, 3, "contact_state.ground_normal");
                    requireCondition(record.jump_component === null || typeof record.jump_component === "object", "jump_component missing");
                    if (record.jump_component !== null) {
                        for (const key of ["min_time", "activity_time", "active_time", "force_time", "impulse", "force", "impulse_speed", "accel"]) finite(record.jump_component[key], `jump_component.${key}`);
                        for (const key of ["active", "deactivate"]) requireCondition(typeof record.jump_component[key] === "boolean", `jump_component.${key} must be boolean`);
                    }
                    requireCondition(record.wheels === null || (Array.isArray(record.wheels) && record.wheels.length === 4), "wheels must contain four entries or be null");
                    const indices = new Set();
                    for (const wheel of record.wheels ?? []) {
                        if (wheel === null) continue;
                        requireCondition(wheel && Number.isInteger(wheel.index) && wheel.index >= 0 && wheel.index < 4 && !indices.has(wheel.index), "wheel index invalid or duplicated");
                        indices.add(wheel.index);
                        for (const key of ["has_contact", "world_contact", "had_contact"]) requireCondition(typeof wheel[key] === "boolean", `wheel.${key} must be boolean`);
                        requireCondition(!wheel.world_contact || wheel.has_contact, "world contact without wheel contact");
                        for (const key of ["contact_change_time", "radius", "suspension_distance", "suspension_travel", "suspension_max_raise", "contact_force_distance", "stiffness", "damping_compression", "damping_relaxation"]) finite(wheel[key], `wheel.${key}`);
                        for (const key of ["ray_start_local", "rest_position_local", "contact_location", "contact_normal"]) vector(wheel[key], 3, `wheel.${key}`);
                    }
                    if (indices.size === 4 && record.jump_component !== null) contactSamples++;
                    else unavailableContactSamples++;
                }
            } else {
                vector(record.pos, 3, "camera.pos");
                vector(record.rotator_unreal, 3, "camera.rotator_unreal");
                vector(record.swivel_unreal, 3, "camera.swivel_unreal");
                vector(record.viewport, 2, "camera.viewport");
                requireCondition(record.viewport.every(value => value > 0), "viewport must be positive");
                finite(record.fov, "camera.fov");
                requireCondition(record.fov > 0 && record.fov < 180, "camera FOV out of range");
                requireCondition(record.settings && typeof record.settings.shake === "boolean", "camera settings missing");
                for (const key of ["fov", "height", "angle", "distance", "stiffness", "swivel_speed", "transition_speed"]) finite(record.settings[key], `settings.${key}`);
                if (header.camera_diagnostics_version === 1) validateCameraDiagnostics(record);
            }
            counts[record.type]++;
            times[record.type].push(record.elapsed);
        },
        finish() {
            requireCondition(header && footer, "capture is incomplete: header or footer missing");
            requireCondition(counts.input_state >= 2 && counts.camera >= 2, "capture must contain at least two samples from each stream");
            const intervalStats = values => {
                let total = 0;
                let maximum = 0;
                let duplicates = 0;
                for (let index = 1; index < values.length; index++) {
                    const interval = values[index] - values[index - 1];
                    total += interval;
                    maximum = Math.max(maximum, interval);
                    if (interval === 0) duplicates++;
                }
                return { mean_ms: total * 1000 / (values.length - 1), maximum_ms: maximum * 1000, duplicates };
            };
            return {
                counts, elapsed_seconds: elapsed, stop_reason: footer.reason,
                input_intervals: intervalStats(times.input_state), camera_intervals: intervalStats(times.camera),
                repeated_physics_times: repeatedPhysicsTimes, backwards_physics_times: backwardsPhysicsTimes,
                contact_samples: contactSamples, unavailable_contact_samples: unavailableContactSamples,
                parity_certified: false,
            };
        },
    };
}

export async function validateCapture(file) {
    const validator = createCaptureValidator();
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    let number = 0;
    for await (const line of lines) {
        number++;
        try {
            requireCondition(line.trim().length > 0, "empty record");
            validator.accept(JSON.parse(line));
        } catch (error) {
            lines.close();
            throw new Error(`Line ${number}: ${error.message}`);
        }
    }
    return validator.finish();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        requireCondition(process.argv[2], "Usage: node tools/telemetry/validate.mjs capture.ndjson");
        console.log(JSON.stringify(await validateCapture(process.argv[2]), null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}