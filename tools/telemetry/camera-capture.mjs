import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateCapture } from "./validate.mjs";

export function auditCameraRecords(records, mode) {
    if (!["car", "ball"].includes(mode)) throw new Error("Specify fixed camera mode: car or ball");
    const states = records.filter(record => record.type === "input_state");
    const cameras = records.filter(record => record.type === "camera");
    if (states.length < 2 || cameras.length < 2) throw new Error("Need both state and camera streams");
    let stateIndex = 0;
    let bracketed = 0;
    let gaps = 0;
    let unbracketed = 0;
    let swivelSamples = 0;
    let settingsChanges = 0;
    let maximumGap = 0;
    const settings = JSON.stringify(cameras[0].settings);
    const surfaces = { floor: 0, wall: 0, ceiling: 0, airborne_or_unknown: 0 };
    for (const camera of cameras) {
        if (camera.swivel_unreal.some(value => Math.abs(value) > 1)) swivelSamples++;
        if (JSON.stringify(camera.settings) !== settings) settingsChanges++;
        while (stateIndex + 1 < states.length && states[stateIndex + 1].elapsed <= camera.elapsed) stateIndex++;
        const before = states[stateIndex];
        const after = states[stateIndex + 1];
        if (before.elapsed > camera.elapsed || !after) {
            unbracketed++;
            continue;
        }
        const gap = after.elapsed - before.elapsed;
        maximumGap = Math.max(maximumGap, gap);
        if (gap > 0.025 || after.physics_time <= before.physics_time) {
            gaps++;
            continue;
        }
        bracketed++;
        const normal = before.contact_state?.ground_normal;
        if (!before.flags.on_ground || !normal || Math.hypot(...normal) < 0.5) surfaces.airborne_or_unknown++;
        else if (normal[2] > 0.7) surfaces.floor++;
        else if (normal[2] < -0.7) surfaces.ceiling++;
        else surfaces.wall++;
    }
    return {
        declared_camera_mode: mode,
        camera_samples: cameras.length,
        bracketed_samples: bracketed,
        rejected_gap_or_nonadvancing_samples: gaps,
        unbracketed_samples: unbracketed,
        maximum_state_bracket_ms: maximumGap * 1000,
        swivel_samples: swivelSamples,
        settings_change_samples: settingsChanges,
        observed_contact_surfaces: surfaces,
        settings: cameras[0].settings,
        parity_certified: false,
        limitations: [
            "Camera mode is operator-declared, not measured; do not toggle during a capture.",
            "Timestamp brackets do not prove camera-to-physics phase alignment.",
            "Contact normals indicate surfaces, not corner coverage or camera collision behavior.",
            "This is capture-quality evidence, not a trainer camera comparison.",
        ],
    };
}

export async function auditCameraCapture(file, mode) {
    const integrity = await validateCapture(file);
    const records = (await readFile(file, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    return { integrity, ...auditCameraRecords(records, mode) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        if (process.argv.length !== 4) throw new Error("Usage: node tools/telemetry/camera-capture.mjs capture.ndjson car|ball");
        console.log(JSON.stringify(await auditCameraCapture(process.argv[2], process.argv[3]), null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}