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

    return {
        accept(record) {
            requireCondition(record && typeof record === "object" && !Array.isArray(record), "record must be an object");
            requireCondition(!footer, "records found after footer");
            if (!header) {
                requireCondition(record.type === "header" && record.version === 1, "missing or unsupported header");
                requireCondition(record.position_units === "uu" && record.rotation_units === "unreal_rotator", "unsupported coordinate units");
                requireCondition(record.input_phase === "post_SetVehicleInput_not_post_physics" && record.camera_phase === "drawable", "unsupported sample phases");
                requireCondition(record.sample_rate_assumed === false, "sampling rate must not be assumed");
                header = record;
                return;
            }
            if (record.type === "footer") {
                requireCondition(record.input_count === counts.input_state && record.camera_count === counts.camera, "footer counts do not match capture");
                requireCondition(typeof record.reason === "string", "footer reason missing");
                footer = record;
                return;
            }
            requireCondition(Object.hasOwn(counts, record.type), "unknown sample type");
            requireCondition(record.sequence === sequence++, "sample sequence is not contiguous");
            finite(record.elapsed, "elapsed");
            requireCondition(record.elapsed >= 0 && record.elapsed >= elapsed, "sample time went backwards");
            elapsed = record.elapsed;
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