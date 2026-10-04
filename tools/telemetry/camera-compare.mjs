import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { ChaseCamera, UU } from "../../src/shared/chaseCamera.js";
import { validateCapture } from "./validate.mjs";

export function nativeVector(values) {
    return new THREE.Vector3(values[0], values[2], values[1]);
}

export function nativeCameraRotation(rotator) {
    const [pitch, yaw, roll] = rotator.map(value => value * Math.PI / 32768);
    const forward = new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch));
    const up = new THREE.Vector3(-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch));
    up.multiplyScalar(Math.cos(roll)).addScaledVector(new THREE.Vector3(-Math.sin(yaw), Math.cos(yaw), 0), -Math.sin(roll));
    const mappedForward = nativeVector(forward.toArray());
    const mappedUp = nativeVector(up.toArray());
    const right = new THREE.Vector3().crossVectors(mappedForward, mappedUp).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, mappedUp, mappedForward.negate()));
}

function carQuaternion(state) {
    const [scalar, axisX, axisY, axisZ] = state.car.quaternion_wxyz;
    return new THREE.Quaternion(axisX, axisY, axisZ, scalar).normalize();
}

function metrics(values) {
    const sorted = [...values].sort((first, second) => first - second);
    return values.length ? {
        mean: values.reduce((total, value) => total + value, 0) / values.length,
        p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
        max: sorted.at(-1),
    } : null;
}

function summarize(rows) {
    return {
        samples: rows.length,
        position_uu: metrics(rows.map(row => row.position_uu)),
        rotation_deg: metrics(rows.map(row => row.rotation_deg)),
        horizontal_fov_deg: metrics(rows.map(row => row.horizontal_fov_deg)),
    };
}

export function compareCameraRecords(records, mode, offsetSeconds = 0, stateSource = "interpolated") {
    if (!["car", "ball", "recorded"].includes(mode)) throw new Error("Specify fixed camera mode: car or ball, or recorded diagnostics");
    if (!["interpolated", "camera_callback"].includes(stateSource)) throw new Error("Unknown camera comparison state source");
    if (stateSource === "camera_callback" && offsetSeconds !== 0) throw new Error("Camera callback observations cannot use a timing offset");
    const states = records.filter(record => record.type === "input_state");
    const cameras = records.filter(record => record.type === "camera");
    if (states.length < 2 || cameras.length < 2) throw new Error("Need both state and camera streams");
    let stateIndex = 0;
    let chase = new ChaseCamera();
    let previousElapsed = null;
    let segmentStart = null;
    const camera = new THREE.PerspectiveCamera();
    const rows = [];
    let rejected = 0;
    let warmup = 0;
    for (const observed of cameras) {
        const recordedMode = observed.state_name === "CameraState_BallCam_TA" ? "ball" :
            observed.state_name === "CameraState_Car_TA" ? "car" : null;
        const activeMode = mode === "recorded" ? recordedMode : mode;
        const controlsAvailable = mode !== "recorded" || (activeMode !== null &&
            typeof observed.behind_view === "boolean" && Array.isArray(observed.swivel_unreal) &&
            Math.hypot(...observed.swivel_unreal) <= 1);
        const elapsed = observed.elapsed + offsetSeconds;
        while (stateIndex + 1 < states.length && states[stateIndex + 1].elapsed <= elapsed) stateIndex++;
        const before = states[stateIndex];
        const after = states[stateIndex + 1];
        const gap = after ? after.elapsed - before.elapsed : Infinity;
        const valid = controlsAvailable && before.elapsed <= elapsed && after && gap > 0 && gap <= 0.025 &&
            after.physics_time > before.physics_time &&
            nativeVector(before.car.pos).distanceTo(nativeVector(after.car.pos)) < 500 &&
            (stateSource !== "camera_callback" || (observed.observed_car &&
                ((activeMode !== "ball" && mode !== "recorded") || observed.observed_ball)));
        if (!valid) {
            rejected++;
            previousElapsed = null;
            continue;
        }
        const snap = previousElapsed === null || observed.elapsed - previousElapsed > 0.025;
        if (snap) {
            chase = new ChaseCamera();
            segmentStart = observed.elapsed;
        }
        const fraction = (elapsed - before.elapsed) / gap;
        const blend = (first, second) => nativeVector(first).lerp(nativeVector(second), fraction).multiplyScalar(UU);
        const direct = stateSource === "camera_callback";
        const quaternion = direct ? carQuaternion({ car: observed.observed_car }) : carQuaternion(before).slerp(carQuaternion(after), fraction);
        const forward = nativeVector(new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).toArray());
        const settings = observed.settings;
        camera.aspect = observed.viewport[0] / observed.viewport[1];
        chase.update(camera, snap ? 0 : observed.elapsed - previousElapsed, {
            target: direct ? nativeVector(observed.observed_car.pos).multiplyScalar(UU) : blend(before.car.pos, after.car.pos),
            forward,
            velocity: direct ? nativeVector(observed.observed_car.vel).multiplyScalar(UU) : blend(before.car.vel, after.car.vel),
            lookAt: activeMode === "ball" || mode === "recorded" ?
                (direct ? nativeVector(observed.observed_ball.pos).multiplyScalar(UU) : blend(before.ball.pos, after.ball.pos)) : undefined,
            onGround: before.flags.on_ground,
            groundNormal: before.contact_state?.ground_normal ? nativeVector(before.contact_state.ground_normal) : undefined,
            ballCam: activeMode === "ball",
            lookBehind: mode === "recorded" ? observed.behind_view : false,
            snap,
            settings: { ...settings, swivelSpeed: settings.swivel_speed, transitionSpeed: settings.transition_speed },
        });
        previousElapsed = observed.elapsed;
        if (observed.elapsed - segmentStart < 0.5) {
            warmup++;
            continue;
        }
        const normal = before.contact_state?.ground_normal;
        const surface = !before.flags.on_ground || !normal || Math.hypot(...normal) < 0.5 ? "airborne_or_unknown" :
            normal[2] > 0.7 ? "floor" : normal[2] < -0.7 ? "ceiling" : "wall";
        const horizontalFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect));
        rows.push({
            elapsed: observed.elapsed,
            camera_mode: activeMode,
            behind_view: mode === "recorded" && observed.behind_view,
            transition: observed.transition?.started === true,
            surface,
            position_uu: camera.position.distanceTo(nativeVector(observed.pos).multiplyScalar(UU)) / UU,
            rotation_deg: THREE.MathUtils.radToDeg(camera.quaternion.angleTo(nativeCameraRotation(observed.rotator_unreal))),
            horizontal_fov_deg: Math.abs(horizontalFov - observed.fov),
        });
    }
    return {
        state_source: stateSource,
        offset_ms: offsetSeconds * 1000,
        rejected_samples: rejected,
        warmup_samples: warmup,
        ...summarize(rows),
        surfaces: Object.fromEntries(["floor", "wall", "ceiling", "airborne_or_unknown"].map(surface =>
            [surface, summarize(rows.filter(row => row.surface === surface))])),
        controls: Object.fromEntries(["car", "ball", "rear_view", "transition"].map(control =>
            [control, summarize(rows.filter(row => control === "rear_view" ? row.behind_view :
                control === "transition" ? row.transition : row.camera_mode === control))])),
        worst_position_samples: [...rows].sort((first, second) => second.position_uu - first.position_uu).slice(0, 3),
    };
}

export async function compareCameraCapture(file, mode) {
    const integrity = await validateCapture(file);
    const records = (await readFile(file, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const trials = Array.from({ length: 21 }, (_, index) => compareCameraRecords(records, mode, (index - 10) * 0.005));
    const usable = trials.filter(trial => trial.samples > 0);
    if (!usable.length) throw new Error("No continuous camera segment survives the 0.5-second warmup");
    const best = usable.reduce((first, second) => first.position_uu.mean < second.position_uu.mean ? first : second);
    return {
        file, declared_camera_mode: mode, integrity,
        zero_offset: trials[10],
        best_position_offset: best,
        offset_sweep: trials.map(({ offset_ms, samples, position_uu, rotation_deg }) => ({ offset_ms, samples, position_uu, rotation_deg })),
        parity_certified: false,
        limitations: [
            "Offset adds to camera elapsed time when querying state; sweep is bounded to +/-50 ms, not measured engine phase.",
            "Lowest position error does not establish correct timing; model error can bias the offset.",
            "Each continuous segment excludes its first 0.5 seconds; state gaps and car teleports reset the camera.",
            "Recorded states are interpolated; gameplay render interpolation and car visual offsets are not reproduced.",
            "Current trainer comfort tracking remains enabled; this measures the existing model, not a fitted native model.",
            mode === "recorded" ?
                "Native state and behind-view flags drive mode/rear view; nonzero swivel samples reset comparison because stick inputs are unavailable." :
                "Mode is operator-declared; rear-view inputs and obstruction geometry are not independently identified.",
            "Native transition metadata is reported by the capture but not substituted into trainer dynamics; obstruction geometry is not reproduced.",
        ],
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        if (process.argv.length !== 4) throw new Error("Usage: node tools/telemetry/camera-compare.mjs capture.ndjson car|ball|recorded");
        console.log(JSON.stringify(await compareCameraCapture(process.argv[2], process.argv[3]), null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}