import { readFile } from "node:fs/promises";
import { validateCapture } from "./validate.mjs";
import { compareCameraRecords } from "./camera-compare.mjs";

const file = process.argv[2];
if (!file) throw new Error("Specify a native capture path");
await validateCapture(file);
const records = (await readFile(file, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
if (process.argv.includes("--compare")) {
    const result = compareCameraRecords(records, "recorded", 0, "camera_callback");
    console.log(JSON.stringify({ file, controls: result.controls,
        surfaces: result.surfaces, samples: result.samples }, null, 2));
    process.exit(0);
}
const states = records.filter(row => row.type === "input_state");
let stateIndex = 0;
const samples = [];
const pivotTrials = new Map([25, 40, 50, 60, 80, 100].map(distance => [distance, []]));
const pitchTrials = new Map([0, 50, 91.25, 100, 120].map(radius => [radius, []]));
for (const row of records.filter(record => record.type === "camera")) {
    while (stateIndex + 1 < states.length && states[stateIndex + 1].elapsed <= row.elapsed) stateIndex++;
    const state = states[stateIndex];
    if (!state.flags.on_ground || state.contact_state.ground_normal[2] < 0.99 ||
        row.state_name !== "CameraState_BallCam_TA" || row.transition?.started || row.behind_view ||
        Math.hypot(...row.swivel_unreal) > 1) continue;
    const car = row.observed_car.pos;
    const ball = row.observed_ball.pos;
    const horizontal = Math.hypot(ball[0] - car[0], ball[1] - car[1]);
    const pitch = row.rotator_unreal[0] * Math.PI / 32768;
    const yaw = row.rotator_unreal[1] * Math.PI / 32768;
    const forward = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
    const focus = row.pos.map((value, axis) => value + row.settings.distance * forward[axis] - car[axis]);
    for (const [distance, errors] of pivotTrials) {
        const lift = Math.max(0, ball[2] - car[2] - row.settings.height) * Math.min(1, distance / Math.max(horizontal, 1));
        errors.push(Math.abs(focus[2] - row.settings.height - lift));
    }
    for (const [radius, errors] of pitchTrials) {
        const desired = Math.max(row.settings.angle,
            Math.atan2(ball[2] - car[2] - focus[2] - radius, horizontal) * 180 / Math.PI);
        errors.push(Math.abs(pitch * 180 / Math.PI - desired));
    }
    samples.push({
        time: row.elapsed, horizontal, ballHeight: ball[2] - car[2],
        raw: Math.atan2(ball[2] - car[2] - row.settings.height, horizontal) * 180 / Math.PI,
        pitch: pitch * 180 / Math.PI, focus,
        ballVelocity: row.observed_ball.vel,
    });
}
console.log(JSON.stringify({ file, samples: samples.length,
    pivotTrials: [...pivotTrials].map(([distance, errors]) => ({ distance,
        meanError: errors.reduce((sum, error) => sum + error, 0) / errors.length })),
    pitchTrials: [...pitchTrials].map(([radius, errors]) => ({ radius,
        meanError: errors.reduce((sum, error) => sum + error, 0) / errors.length })),
    examples: samples.filter((row, index) => index % 300 === 0) }, null, 2));