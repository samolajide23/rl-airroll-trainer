import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { compareScenario } from "./trajectory.mjs";
import { firstDivergence } from "./first-divergence.mjs";
import { auditLeaves, requestedRotation, validateAuditScenarios } from "./audit-state.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outputIndex = process.argv.indexOf("--out");
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error("--out requires a directory");
const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(here, "out/movement-bot");

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

export function buildAuditScenarios(movement, balls, contacts) {
  const quietBall = { pos: [0, 0, 92.75], vel: [0, 0, 0], ang_vel: [0, 0, 0] };
  const scenarios = [];
  const add = (scenario, defaults, prefix) => {
    const initial = { ...movement.defaults.initial, ...defaults.initial, ...scenario.initial };
    const { car_only, ...rest } = scenario;
    scenarios.push({ ...rest, id: `${prefix}_${scenario.id}`, audit: true,
      preparation: scenario.preparation ?? "legacy",
      game_mode: scenario.game_mode ?? initial.game_mode ?? (initial.on_ground ? "soccar" : "void"),
      initial, ...(scenario.entity === "ball" ? {} : { ball: { ...quietBall, ...scenario.ball } }),
    });
  };
  for (const hitbox of ["octane", "dominus", "plank", "breakout", "hybrid", "merc"]) {
    add({ id: `raw_spawn_${hitbox}`, ticks: 120, preparation: "raw", game_mode: "soccar",
      initial: { pos: [0, -4608, 17], hitbox, on_ground: true },
    }, movement.defaults, "basic");
  }
  for (const scenario of balls.scenarios) add(scenario, balls.defaults, "ball");
  for (const scenario of buildMovementScenarios(movement).scenarios) add(scenario, movement.defaults, "movement");
  for (const scenario of contacts.scenarios) add(scenario, contacts.defaults, "contact");
  return validateAuditScenarios({ version: 3, notes: "Independent unseeded every-tick state audit; unsupported fields fail coverage. Live balls in every car case.", defaults: movement.defaults, scenarios });
}

export async function reportAudit(directory) {
  const source = validateAuditScenarios(JSON.parse(await readFile(path.join(directory, "scenarios.json"), "utf8")));
  const budgets = JSON.parse(await readFile(path.join(here, "tolerances.json"), "utf8"));
  const rows = [];
  await mkdir(path.join(directory, "audit"), { recursive: true });
  for (const scenario of source.scenarios) {
    const reference = JSON.parse(await readFile(path.join(directory, "rocketsim", `${scenario.id}.json`), "utf8"));
    const candidate = JSON.parse(await readFile(path.join(directory, "js", `${scenario.id}.json`), "utf8"));
    const allowed = budgets.defaults;
    const trajectory = compareScenario(reference, candidate);
    const divergence = firstDivergence(reference, candidate, {
      position: allowed.pos_max, velocity: allowed.vel_max, omega: allowed.omega_max,
      forward: allowed.fwd_max_deg, right: allowed.fwd_max_deg, up: allowed.up_max_deg,
      boost: allowed.boost_max, air_time: allowed.air_time_max, ground: 0,
      ball_position: allowed.pos_max, ball_velocity: allowed.vel_max, ball_omega: allowed.omega_max,
    });
    const fields = new Map();
    const observe = (leaves, tick) => {
      for (const leaf of leaves) {
        let record = fields.get(leaf.field);
        if (!record) { record = { field: leaf.field, samples: 0, failures: 0, nonexact: 0, max_error: 0, first_failure: null }; fields.set(leaf.field, record); }
        record.samples++;
        if (!leaf.exact) record.nonexact++;
        record.max_error = Math.max(record.max_error, leaf.error ?? 0);
        if (leaf.status !== "checked") {
          record.failures++;
          record.first_failure ??= { tick, ...leaf };
        }
      }
    };
    observe(auditLeaves(reference.audit_setup, candidate.audit_setup, allowed, "setup"), 0);
    for (let tick = 0; tick < reference.frames.length; tick++) {
      observe(auditLeaves(reference.frames[tick].audit, candidate.frames[tick].audit, allowed, "state"), tick);
    }
    for (const [engine, recording] of [["reference", reference], ["candidate", candidate]]) {
      const frame = recording.frames[0];
      const requested = { ...source.defaults.initial, ...scenario.initial };
      observe(auditLeaves(requested, recording.initial, allowed, `${engine}.initial`), 0);
      for (const name of ["vel", "ang_vel", ...(scenario.preparation === "raw" || scenario.entity === "ball" ? ["pos"] : [])]) {
        observe(auditLeaves(requested[name], frame[name], allowed, `${engine}.spawn.${name}`), 0);
      }
      if (scenario.entity !== "ball") {
        observe(auditLeaves(requestedRotation(requested), frame.rot, allowed, `${engine}.spawn.rot_mat`), 0);
        for (const name of ["pos", "vel", "ang_vel"]) observe(auditLeaves(scenario.ball[name], frame.ball[name], allowed, `${engine}.ball_spawn.${name}`), 0);
        observe(auditLeaves(requested.boost, frame.boost, allowed, `${engine}.spawn.boost`), 0);
      }
    }
    const coverage = [...fields.values()];
    const failed = coverage.filter(field => field.failures);
    const row = { id: scenario.id, ticks: scenario.ticks, trajectory, first_trajectory_failure: divergence.first_tick,
      exceeded: divergence.exceeded, fields: coverage.length, failed_fields: failed.length,
      passed: !failed.length && divergence.first_tick === null,
      exact: coverage.every(field => !field.nonexact) && divergence.first_tick === null,
      failures: failed.map(field => ({ field: field.field, ...field.first_failure })),
    };
    await writeFile(path.join(directory, "audit", `${scenario.id}.json`), JSON.stringify({ ...row, coverage, tick_errors: divergence.rows }, null, 2));
    rows.push(row);
  }
  const summary = { scenarios: rows.length, passed: rows.filter(row => row.passed).length, trajectory_passed: rows.filter(row => row.first_trajectory_failure === null).length,
    frames: rows.reduce((total, row) => total + row.ticks + 1, 0), rows };
  await writeFile(path.join(directory, "audit-report.json"), JSON.stringify(summary, null, 2));
  const lines = ["# Audited Edge-State Parity", "", `${summary.passed}/${summary.scenarios} full-state passes; ${summary.trajectory_passed}/${summary.scenarios} trajectory passes. ${summary.frames} paired frames. Missing state is a failure. RocketSim is not native Rocket League telemetry.`, "", "| Scenario | First trajectory failure | Failed state/setup fields |", "|---|---:|---:|"];
  for (const row of rows) lines.push(`| ${row.id} | ${row.first_trajectory_failure ?? "none"} | ${row.failed_fields} |`);
  await writeFile(path.join(directory, "audit-report.md"), lines.join("\n") + "\n");
  console.log(lines.slice(0, 3).join("\n"));
  return summary;
}

export async function reportMovement(directory = output) {
  const source = JSON.parse(await readFile(path.join(directory, "scenarios.json"), "utf8"));
  const budgets = JSON.parse(await readFile(path.join(here, "tolerances.json"), "utf8"));
  const rows = [];
  await mkdir(path.join(directory, "ticks"), { recursive: true });
  for (const scenario of source.scenarios) {
    const reference = JSON.parse(await readFile(path.join(directory, "rocketsim", `${scenario.id}.json`), "utf8"));
    const candidate = JSON.parse(await readFile(path.join(directory, "js", `${scenario.id}.json`), "utf8"));
    if (!reference.car_only || reference.ball_initial || candidate.ball_initial) throw new Error(`${scenario.id}: expected isolated car replay`);
    const result = compareScenario(reference, candidate);
    const local = firstDivergence(reference, candidate, { position: 0.0001, velocity: 0.0001, omega: 0.00001, forward: 0.00001, right: 0.00001, up: 0.00001 });
    const allowed = { ...budgets.defaults, ...budgets.scenarios[scenario.id] };
    const budget = firstDivergence(reference, candidate, { position: allowed.pos_max, velocity: allowed.vel_max, omega: allowed.omega_max, forward: allowed.fwd_max_deg, right: allowed.right_max_deg ?? allowed.fwd_max_deg, up: allowed.up_max_deg, boost: allowed.boost_max, air_time: allowed.air_time_max, ground: allowed.ground_mismatch_ticks });
    await writeFile(path.join(directory, "ticks", `${scenario.id}.json`), JSON.stringify({ id: scenario.id,
      limits: budget.limits, first_tick: budget.first_tick, exceeded: budget.exceeded, rows: budget.rows }, null, 2));
    rows.push({ id: scenario.id, ...result, first_precision_tick: local.first_tick, first_budget_tick: budget.first_tick, precision_limits: local.limits, budget_limits: budget.limits, precision_exceeded: local.exceeded, budget_exceeded: budget.exceeded, precision_context: local.context, budget_context: budget.context });
  }
  await writeFile(path.join(directory, "tick-errors.json"), JSON.stringify(rows, null, 2));
  const lines = ["# Car-Only Movement Bot", "", "Immutable-input, unseeded RocketSim 2.2.1 comparison. Precision thresholds: position 0.0001 uu, velocity 0.0001 uu/s, omega 0.00001 rad/s, forward/right/up 0.00001 degrees. Allowed budgets come from tolerances.json, including scenario exceptions and state mismatches. Right uses the forward limit unless explicitly specified.", "", "| Scenario | Max position (uu) | Max velocity (uu/s) | Max omega (rad/s) | First precision tick | First allowed-budget tick |", "|---|---:|---:|---:|---:|---:|"];
  for (const row of rows) lines.push(`| ${row.id} | ${row.pos_max.toFixed(6)} | ${row.vel_max.toFixed(6)} | ${row.omega_max.toFixed(6)} | ${row.first_precision_tick ?? "none"} | ${row.first_budget_tick ?? "none"} |`);
  await writeFile(path.join(directory, "tick-report.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  return rows;
}

async function main() {
  if (process.argv.includes("--audit")) {
    if (process.argv.includes("--report")) {
      const summary = await reportAudit(output);
      if (summary.passed !== summary.scenarios) process.exitCode = 1;
      return;
    }
    const sources = await Promise.all(["scenarios.json", "ball-scenarios.json", "contact-scenarios.json"].map(async name => JSON.parse(await readFile(path.join(here, name), "utf8"))));
    const scenarios = buildAuditScenarios(...sources);
    await mkdir(output, { recursive: true });
    const file = path.join(output, "scenarios.json");
    const encoded = JSON.stringify(scenarios, null, 2);
    try {
      if (await readFile(file, "utf8") !== encoded) throw new Error("Audit scenarios changed; use a new output directory");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await writeFile(file, encoded);
    }
    if (process.argv.includes("--prepare")) return;
    try { await access(path.join(output, "rocketsim", "index.json")); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      try { await access(path.join(output, "rocketsim")); throw new Error("Partial native recording exists; use a new output directory"); }
      catch (partial) { if (partial.code !== "ENOENT") throw partial; }
      run(process.execPath, ["tools/python-runner.mjs", "tools/physics-compare/generate_rocketsim.py", "--scenarios", file, "--out", path.join(output, "rocketsim")]);
    }
    run(process.execPath, ["tools/physics-compare/run_js.mjs", "--scenarios", file, "--out", path.join(output, "js")]);
    const summary = await reportAudit(output);
    if (summary.passed !== summary.scenarios) process.exitCode = 1;
    return;
  }
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