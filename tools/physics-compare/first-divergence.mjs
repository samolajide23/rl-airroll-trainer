import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compareScenario } from "./trajectory.mjs";

const distance = (left, right) => Math.hypot(...left.map((value, index) => value - right[index]));

export function firstDivergence(reference, candidate, limits = { velocity: 0.5, omega: 0.01 }) {
  compareScenario(reference, candidate);
  const rows = reference.frames.map((frame, index) => {
    const other = candidate.frames[index];
    return {
      tick: frame.tick,
      position_error: distance(frame.pos, other.pos),
      velocity_error: distance(frame.vel, other.vel),
      omega_error: distance(frame.ang_vel, other.ang_vel),
      reference: { pos: frame.pos, vel: frame.vel, omega: frame.ang_vel, on_ground: frame.on_ground },
      candidate: { pos: other.pos, vel: other.vel, omega: other.ang_vel, on_ground: other.on_ground },
    };
  });
  const index = rows.findIndex(row => row.velocity_error > limits.velocity || row.omega_error > limits.omega);
  return { first_tick: index < 0 ? null : rows[index].tick,
    limits, context: index < 0 ? [] : rows.slice(Math.max(0, index - 2), index + 4) };
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