import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { compareScenario } from "./trajectory.mjs";
import { firstDivergence } from "./first-divergence.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const output = path.join(here, "out/movement-bot");

export function buildMovementScenarios(source) {
  if (source.scenarios.some(scenario => scenario.ball || scenario.entity === "ball")) throw new Error("Movement bot requires car-only source scenarios");
  const route = (id, initial, segments) => {
    let ticks = 0;
    return {
      id, game_mode: "soccar", car_only: true, initial, settle_ticks: 0,
      description: "Deterministic open-loop movement bot; identical inputs in both engines",
      control_schedule: segments.map(([duration, controls]) => ({ until_tick: ticks += duration, controls })),
      get ticks() { return ticks; },
    };
  };
  const ground = { pos: [0, -4608, 17], vel: [0, 0, 0], ang_vel: [0, 0, 0], yaw: Math.PI / 2, on_ground: true, boost: 100 };
  const routes = [
    route("movement_bot_straight", ground, [[360, { throttle: 1, boost: true }], [180, { throttle: 1 }], [120, {}], [120, { throttle: -1 }]]),
    route("movement_bot_slalom", { ...ground, pos: [-1800, -3000, 17] }, [
      [180, { throttle: 1 }], [120, { throttle: 1, steer: 0.3 }], [120, { throttle: 1, steer: -0.3 }],
      [120, { throttle: 1, steer: 0.7 }], [120, { throttle: 1, steer: -0.7 }], [120, { throttle: -1 }],
    ]),
    route("movement_bot_powerslide", { ...ground, pos: [-1800, -3000, 17] }, [
      [180, { throttle: 1 }], [60, { throttle: 1, steer: 1, handbrake: true }],
      [120, { throttle: 1, steer: 0.3 }], [90, { throttle: -1, steer: -0.5 }], [150, { throttle: 1 }],
    ]),
    route("movement_bot_jump_dodge", ground, [
      [120, { throttle: 1 }], [24, { throttle: 1, jump: true }], [12, { throttle: 1 }],
      [3, { throttle: 1, jump: true, pitch: -1 }], [45, { throttle: 1, pitch: 1 }],
      [156, { throttle: 1 }], [24, { jump: true }], [12, {}], [3, { jump: true }], [201, {}],
    ]),
    route("movement_bot_aerial", { pos: [-1200, -2000, 1200], vel: [600, 100, 250], ang_vel: [0, 0, 0], on_ground: false }, [
      [90, { boost: true, pitch: 0.3, roll: -0.4 }], [90, { yaw: 0.5, roll: 0.3 }],
      [120, { pitch: -0.3 }], [240, { throttle: 1 }],
    ]),
    route("movement_bot_goal_roof", { pos: [0, 5500, 610], vel: [0, 300, 0], ang_vel: [0, 0, 0], on_ground: false }, [
      [240, { throttle: 1, steer: 0.3 }], [120, { throttle: -1, steer: -0.3 }],
    ]),
  ];
  return {
    ...source,
    notes: "Car-only deterministic movement bot plus existing isolated maneuvers. No adaptive decisions, ball contacts, reference seeding or relaxed budgets.",
    scenarios: [...source.scenarios.map(scenario => ({ ...scenario, car_only: true })), ...routes],
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

export async function reportMovement(directory = output) {
  const source = JSON.parse(await readFile(path.join(directory, "scenarios.json"), "utf8"));
  const budgets = JSON.parse(await readFile(path.join(here, "tolerances.json"), "utf8"));
  const rows = [];
  for (const scenario of source.scenarios) {
    const reference = JSON.parse(await readFile(path.join(directory, "rocketsim", `${scenario.id}.json`), "utf8"));
    const candidate = JSON.parse(await readFile(path.join(directory, "js", `${scenario.id}.json`), "utf8"));
    if (!reference.car_only || reference.ball_initial || candidate.ball_initial) throw new Error(`${scenario.id}: expected isolated car replay`);
    const result = compareScenario(reference, candidate);
    const local = firstDivergence(reference, candidate, { position: 0.0001, velocity: 0.0001, omega: 0.00001, forward: 0.00001, up: 0.00001 });
    const allowed = { ...budgets.defaults, ...budgets.scenarios[scenario.id] };
    const budget = firstDivergence(reference, candidate, { position: allowed.pos_max, velocity: allowed.vel_max, omega: allowed.omega_max, forward: allowed.fwd_max_deg, up: allowed.up_max_deg, boost: allowed.boost_max, air_time: allowed.air_time_max, ground: allowed.ground_mismatch_ticks });
    rows.push({ id: scenario.id, ...result, first_precision_tick: local.first_tick, first_budget_tick: budget.first_tick, precision_limits: local.limits, budget_limits: budget.limits, precision_exceeded: local.exceeded, budget_exceeded: budget.exceeded, precision_context: local.context, budget_context: budget.context });
  }
  await writeFile(path.join(directory, "tick-errors.json"), JSON.stringify(rows, null, 2));
  const lines = ["# Car-Only Movement Bot", "", "Immutable-input, unseeded RocketSim 2.2.1 comparison. Precision thresholds: position 0.0001 uu, velocity 0.0001 uu/s, omega 0.00001 rad/s, forward/up 0.00001 degrees. Allowed budgets come from tolerances.json, including scenario exceptions and state mismatches.", "", "| Scenario | Max position (uu) | Max velocity (uu/s) | Max omega (rad/s) | First precision tick | First allowed-budget tick |", "|---|---:|---:|---:|---:|---:|"];
  for (const row of rows) lines.push(`| ${row.id} | ${row.pos_max.toFixed(6)} | ${row.vel_max.toFixed(6)} | ${row.omega_max.toFixed(6)} | ${row.first_precision_tick ?? "none"} | ${row.first_budget_tick ?? "none"} |`);
  await writeFile(path.join(directory, "tick-report.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  return rows;
}

async function main() {
  if (process.argv.includes("--report")) return reportMovement();
  await mkdir(output, { recursive: true });
  const source = JSON.parse(await readFile(path.join(here, "scenarios.json"), "utf8"));
  const scenarios = buildMovementScenarios(source);
  const file = path.join(output, "scenarios.json");
  const encoded = JSON.stringify(scenarios, null, 2);
  let existing;
  try { existing = await readFile(file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing && existing !== encoded) throw new Error("Recorded movement scenarios differ; use a new output directory instead of overwriting references");
  if (!existing) await writeFile(file, encoded);
  if (process.argv.includes("--prepare")) return;
  let referenceExists = false;
  try { await access(path.join(output, "rocketsim")); referenceExists = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!referenceExists) run(process.execPath, ["tools/python-runner.mjs", "tools/physics-compare/generate_rocketsim.py", "--scenarios", file, "--out", path.join(output, "rocketsim")]);
  run(process.execPath, ["tools/physics-compare/run_js.mjs", "--scenarios", file, "--out", path.join(output, "js")]);
  await reportMovement();
  run(process.execPath, ["tools/physics-compare/compare.mjs", "--rs", path.join(output, "rocketsim"), "--js", path.join(output, "js"), "--out", path.join(output, "report.md")]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});