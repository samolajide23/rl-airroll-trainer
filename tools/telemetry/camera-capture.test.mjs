import * as THREE from "three";
import { compareCameraRecords, nativeCameraRotation } from "./camera-compare.mjs";

test("camera comparison matches a static native car-camera fixture and rejects gaps", () => {
    const records = [];
    for (let index = 0; index <= 240; index++) {
        const elapsed = index / 120;
        records.push({ type: "input_state", elapsed, physics_time: elapsed,
            car: { pos: [0, 0, 17], vel: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0] },
            ball: { pos: [1000, 0, 93] },
            flags: { on_ground: true }, contact_state: { ground_normal: [0, 0, 1] } });
        records.push({ type: "camera", elapsed, pos: [-270 * Math.cos(Math.PI / 60), 0, 97 + 270 * Math.sin(Math.PI / 60)],
            rotator_unreal: [-3 * 65536 / 360, 0, 0], fov: 108, viewport: [1920, 1080],
            settings: { fov: 108, height: 80, angle: -3, distance: 270, stiffness: 1, shake: false } });
    }
    const report = compareCameraRecords(records, "car");
    assert(report.samples > 100);
    assert(report.position_uu.max < 1e-10);
    assert(report.rotation_deg.max < 1e-5);
    assert(report.horizontal_fov_deg.max < 1e-10);
    assert.equal(report.surfaces.floor.samples, report.samples);
    const gapped = records.filter(record => record.type !== "input_state" || record.elapsed < 0.8 || record.elapsed > 1.2);
    const rejected = compareCameraRecords(gapped, "car");
    assert(rejected.rejected_samples > report.rejected_samples);
    assert(rejected.warmup_samples > report.warmup_samples);
    assert.throws(() => compareCameraRecords(records, "auto"), /fixed camera mode/);
    assert.equal(compareCameraRecords(records, "recorded").samples, 0);
    for (const observed of records.filter(record => record.type === "camera")) {
        observed.state_name = "CameraState_Car_TA";
        observed.behind_view = false;
        observed.swivel_unreal = [0, 0, 0];
    }
    const recorded = compareCameraRecords(records, "recorded");
    assert.equal(recorded.samples, report.samples);
    assert(recorded.position_uu.max < 1e-10);
    assert.equal(recorded.controls.car.samples, recorded.samples);
    for (const observed of records.filter(record => record.type === "camera")) observed.swivel_unreal = [0, 100, 0];
    assert.equal(compareCameraRecords(records, "recorded").samples, 0);
    for (const observed of records.filter(record => record.type === "camera")) observed.swivel_unreal = [0, 0, 0];
    for (const observed of records.filter(record => record.type === "camera")) {
        observed.observed_car = { pos: [0, 0, 17], vel: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0] };
        observed.observed_ball = { pos: [1000, 0, 93] };
    }
    const direct = compareCameraRecords(records, "car", 0, "camera_callback");
    assert.equal(direct.samples, report.samples);
    assert(direct.position_uu.max < 1e-10);
    for (const state of records.filter(record => record.type === "input_state")) state.car.pos[0] = 100;
    assert(compareCameraRecords(records, "car").position_uu.mean > 99);
    assert(compareCameraRecords(records, "car", 0, "camera_callback").position_uu.max < 1e-10);
    assert.throws(() => compareCameraRecords(records, "car", 0.01, "camera_callback"), /timing offset/);
    assert.throws(() => compareCameraRecords(records, "car", 0, "unknown"), /state source/);
    for (const observed of records.filter(record => record.type === "camera")) observed.observed_car = null;
    assert.equal(compareCameraRecords(records, "car", 0, "camera_callback").samples, 0);
});

test("native camera rotation maps Unreal forward and roll into the reflected render basis", () => {
    const quaternion = nativeCameraRotation([0, 16384, 16384]);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    assert(forward.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-10);
    assert(up.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);
});
import test from "node:test";
import assert from "node:assert/strict";
import { auditCameraRecords } from "./camera-capture.mjs";
import { validateCameraDiagnostics } from "./validate.mjs";

test("native camera diagnostics validate transitions and explicit unavailable fields", () => {
    const record = {
        camera_callback_interval: null, state_name: "CameraState_Car", blender_state: null,
        behind_view: false, native_rates: { swivel_fast: 1, swivel_decay: 2, clip: 3 },
        car_camera_default_rates: null, transition: { started: false }, observed_car: null, observed_ball: null,
    };
    assert.doesNotThrow(() => validateCameraDiagnostics(record));
    record.car_camera_default_rates = { to_ground: 1, to_air: 2, ground_rotation: 3, wall_rotation: 4, fov: 5, supersonic_fov: 6, ground_normal: 7 };
    record.observed_car = { pos: [0, 0, 17], vel: [0, 0, 0], omega: [0, 0, 0], quaternion_wxyz: [1, 0, 0, 0], rb_time: 1 };
    record.transition = { started: true, remaining_time: 0.2, blend_time: 0.5, blend_function: 2,
        blend_exp: 2, lock_outgoing: false,
        snapshot: { focus: [0, 0, 17], pos: [-270, 0, 117], rotator_unreal: [0, 0, 0], distance: 270, fov: 110 } };
    assert.doesNotThrow(() => validateCameraDiagnostics(record));
    for (const mutate of [
        value => { delete value.state_name; },
        value => { value.camera_callback_interval = -1; },
        value => { value.native_rates.clip = NaN; },
        value => { value.car_camera_default_rates.to_air = Infinity; },
        value => { delete value.transition.snapshot; },
        value => { value.transition.blend_function = 256; },
        value => { value.observed_car.quaternion_wxyz = [0, 0, 0, 0]; },
    ]) {
        const invalid = structuredClone(record);
        mutate(invalid);
        assert.throws(() => validateCameraDiagnostics(invalid));
    }
    record.transition = null;
    record.behind_view = null;
    assert.doesNotThrow(() => validateCameraDiagnostics(record));
});

test("camera audit brackets timestamps, rejects gaps and reports measured surfaces", () => {
    const state = (elapsed, physicsTime, normal) => ({ type: "input_state", elapsed,
        physics_time: physicsTime, flags: { on_ground: true }, contact_state: { ground_normal: normal } });
    const camera = elapsed => ({ type: "camera", elapsed, swivel_unreal: [0, 0, 0], settings: { fov: 110 } });
    const report = auditCameraRecords([
        state(0, 0, [0, 0, 1]), camera(0.005), state(0.01, 0.01, [1, 0, 0]),
        camera(0.015), state(0.02, 0.02, [0, 0, -1]), camera(0.025),
        state(0.03, 0.03, [0, 0, 1]), camera(0.04), state(1, 1, [0, 0, 1]), camera(1.01),
    ], "ball");
    assert.equal(report.bracketed_samples, 3);
    assert.equal(report.rejected_gap_or_nonadvancing_samples, 1);
    assert.equal(report.unbracketed_samples, 1);
    assert.deepEqual(report.observed_contact_surfaces, { floor: 1, wall: 1, ceiling: 1, airborne_or_unknown: 0 });
    assert.equal(report.parity_certified, false);
    assert.throws(() => auditCameraRecords([], "auto"), /fixed camera mode/);
});

test("camera audit rejects repeated physics time and identifies swivel and setting changes", () => {
    const records = [
        { type: "input_state", elapsed: 0, physics_time: 1 },
        { type: "camera", elapsed: 0.005, swivel_unreal: [0, 100, 0], settings: { fov: 110 } },
        { type: "input_state", elapsed: 0.01, physics_time: 1 },
        { type: "camera", elapsed: 0.015, swivel_unreal: [0, 0, 0], settings: { fov: 100 } },
    ];
    const report = auditCameraRecords(records, "car");
    assert.equal(report.rejected_gap_or_nonadvancing_samples, 1);
    assert.equal(report.swivel_samples, 1);
    assert.equal(report.settings_change_samples, 1);
});