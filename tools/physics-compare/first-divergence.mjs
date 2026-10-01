import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compareScenario } from "./trajectory.mjs";

const distance = (left, right) => Math.hypot(...left.map((value, index) => value - right[index]));
const angle = (left, right) => Math.atan2(Math.hypot(
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
), left.reduce((sum, value, index) => sum + value * right[index], 0)) * 180 / Math.PI;

export function firstDivergence(reference, candidate, limits = { velocity: 0.5, omega: 0.01 }) {
    compareScenario(reference, candidate);
    const rows = reference.frames.map((frame, index) => {
        const other = candidate.frames[index];
        return {
            tick: frame.tick,
            position_error: distance(frame.pos, other.pos),
            velocity_error: distance(frame.vel, other.vel),
            omega_error: distance(frame.ang_vel, other.ang_vel),
            forward_error_deg: frame.rot ? angle(frame.rot.forward, other.rot.forward) : 0,
            up_error_deg: frame.rot ? angle(frame.rot.up, other.rot.up) : 0,
            boost_error: frame.rot ? Math.abs(frame.boost - other.boost) : 0,
            air_time_error: frame.rot ? Math.abs(frame.air_time - other.air_time) : 0,
            ground_mismatch: frame.rot ? Number(frame.on_ground !== other.on_ground) : 0,
            reference: { pos: frame.pos, vel: frame.vel, omega: frame.ang_vel, on_ground: frame.on_ground },
            candidate: { pos: other.pos, vel: other.vel, omega: other.ang_vel, on_ground: other.on_ground },
        };
    });
    const fields = { position: "position_error", velocity: "velocity_error", omega: "omega_error", forward: "forward_error_deg", up: "up_error_deg", boost: "boost_error", air_time: "air_time_error", ground: "ground_mismatch" };
    const exceeded = row => Object.entries(fields).filter(([key, field]) => row[field] > (limits[key] ?? Infinity)).map(([key]) => key);
    const index = rows.findIndex(row => exceeded(row).length > 0);
    return {
        first_tick: index < 0 ? null : rows[index].tick,
        exceeded: index < 0 ? [] : exceeded(rows[index]),
        limits, context: index < 0 ? [] : rows.slice(Math.max(0, index - 2), index + 4)
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const id = process.argv[2] ?? "roof_recovery";
        if (!/^[a-z0-9_]+$/i.test(id)) throw new Error("Invalid scenario ID");
        const root = new URL("./out/", import.meta.url);
        const reference = JSON.parse(await readFile(new URL(`rocketsim/${id}.json`, root), "utf8"));
        const candidate = JSON.parse(await readFile(new URL(`js/${id}.json`, root), "utf8"));
        console.log(JSON.stringify({ scenario: id, ...firstDivergence(reference, candidate) }, null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}