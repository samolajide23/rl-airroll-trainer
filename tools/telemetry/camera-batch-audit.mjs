import { readFileSync } from "node:fs";
import { validateCapture } from "./validate.mjs";
import { compareCameraRecords } from "./camera-compare.mjs";

const records = readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
await validateCapture(process.argv[2]);
const cases = new Map();
for (const row of records) {
    if (row.type !== "camera" || !row.camera_case || row.case_elapsed < 0.4) continue;
    const entry = cases.get(row.camera_case) ?? { samples: 0, mismatches: new Set() };
    entry.samples++;
    const requested = row.requested_camera;
    for (const key of ["fov", "height", "angle", "distance", "stiffness", "swivel_speed", "transition_speed", "shake"]) {
        const matches = typeof requested[key] === "boolean" ? row.settings[key] === requested[key] :
            Math.abs(row.settings[key] - requested[key]) < 0.001;
        if (!matches) entry.mismatches.add(key);
    }
    const expected = requested.ball_cam ? "CameraState_BallCam_TA" : "CameraState_Car_TA";
    if (row.state_name !== expected) entry.mismatches.add("mode");
    cases.set(row.camera_case, entry);
}
const failures = [...cases].filter(([, entry]) => entry.mismatches.size || entry.samples < 10);
console.log(JSON.stringify({
    reason: records.at(-1).reason,
    cases: cases.size,
    failures: failures.map(([label, entry]) => ({ label, samples: entry.samples, mismatches: [...entry.mismatches] })),
    acceptance: "Setting readback only; not camera motion parity",
}, null, 2));
if (process.argv.includes("--compare")) {
    for (const [label] of cases) {
        const subset = records.filter(row => row.camera_case === label);
        const result = compareCameraRecords(subset, "recorded", 0, "camera_callback");
        console.log(JSON.stringify({ label, samples: result.samples, position_uu: result.position_uu,
            rotation_deg: result.rotation_deg, horizontal_fov_deg: result.horizontal_fov_deg }));
    }
}
if (process.argv.includes("--geometry")) {
    for (const [label] of cases) {
        if (!label.startsWith("car/")) continue;
        const subset = records.filter(row => row.type === "camera" && row.camera_case === label);
        console.log(JSON.stringify({ label, observations: [0.1, 0.3, 0.5, 0.8].map(time => {
            const row = subset.reduce((first, second) => Math.abs(first.case_elapsed - time) < Math.abs(second.case_elapsed - time) ? first : second);
            return { time: row.case_elapsed, fov: row.fov, settings: row.settings, pos: row.pos,
                car: row.observed_car.pos, rotation: row.rotator_unreal };
        }) }));
    }
}
if (records.at(-1).reason !== "camera_batch_complete" || cases.size !== 46 || failures.length) process.exitCode = 1;