#!/usr/bin/env node
/**
 * Compare RocketSim vs rl-physics.js trajectories and write a markdown report.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareScenario, failuresFor } from "./trajectory.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RS = path.join(HERE, "out", "rocketsim");
const DEFAULT_JS = path.join(HERE, "out", "js");
const DEFAULT_OUT = path.join(HERE, "out", "report.md");

function parseArgs(argv) {
  const args = { rs: DEFAULT_RS, js: DEFAULT_JS, out: DEFAULT_OUT, budgets: path.join(HERE, "tolerances.json"), reportOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rs") args.rs = argv[++i];
    else if (a === "--js") args.js = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--budgets") args.budgets = argv[++i];
    else if (a === "--report-only") args.reportOnly = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function fmt(n, digits = 3) {
  if (!Number.isFinite(n)) return "n/a";
  return n.toFixed(digits);
}

function constantsSection(rsConst, jsConst) {
  const rows = [
    ["Gravity |Z|", Math.abs(rsConst.GRAVITY_Z), jsConst.GRAVITY],
    ["Max speed", rsConst.CAR_MAX_SPEED, jsConst.MAX_SPEED],
    ["Max ang vel", rsConst.CAR_MAX_ANG_SPEED, jsConst.MAX_ANG_VEL],
    ["Boost accel air", rsConst.BOOST_ACCEL_AIR, jsConst.BOOST_ACCEL_AIR],
    ["Air throttle", rsConst.THROTTLE_AIR_ACCEL, jsConst.AIR_THROTTLE],
    ["T_roll (effective)", rsConst.EFFECTIVE_T_ROLL, jsConst.T_ROLL],
    ["T_pitch (effective)", rsConst.EFFECTIVE_T_PITCH, jsConst.T_PITCH],
    ["T_yaw (effective)", rsConst.EFFECTIVE_T_YAW, jsConst.T_YAW],
    ["D_roll (effective)", -Math.abs(rsConst.EFFECTIVE_D_ROLL), jsConst.D_ROLL],
    ["D_pitch (effective)", -Math.abs(rsConst.EFFECTIVE_D_PITCH), jsConst.D_PITCH],
    ["D_yaw (effective)", -Math.abs(rsConst.EFFECTIVE_D_YAW), jsConst.D_YAW],
    ["Ball drag", rsConst.BALL_DRAG, jsConst.BALL_DRAG],
    ["Ball restitution", rsConst.BALL_RESTITUTION, jsConst.BALL_RESTITUTION],
    ["Extra impulse Z", rsConst.BALL_CAR_EXTRA_IMPULSE_Z_SCALE, jsConst.EXTRA_IMPULSE_Z],
    [
      "Extra impulse forward",
      rsConst.BALL_CAR_EXTRA_IMPULSE_FORWARD_SCALE,
      jsConst.EXTRA_IMPULSE_FWD,
    ],
    ["Jump max time", rsConst.JUMP_MAX_TIME, jsConst.JUMP_HOLD_MAX],
    ["Jump min time", rsConst.JUMP_MIN_TIME, jsConst.JUMP_MIN_TIME],
    ["Jump reset pad", rsConst.JUMP_RESET_TIME_PAD, jsConst.JUMP_RESET_TIME_PAD],
    ["CAR_TORQUE_SCALE", rsConst.CAR_TORQUE_SCALE, jsConst.CAR_TORQUE_SCALE],
    ["Flip back impulse X", rsConst.FLIP_BACKWARD_IMPULSE_SCALE_X, jsConst.FLIP_BACK_IMPULSE_X],
    ["Autoflip normZ", rsConst.CAR_AUTOFLIP_NORMZ_THRESH, jsConst.AUTOFLIP_NORMZ],
    ["Coasting brake", rsConst.COASTING_BRAKE_FACTOR, jsConst.COASTING_BRAKE_FACTOR],
  ];

  let md = `## Constants (RocketSim vs rl-physics.js)\n\n`;
  md += `| Quantity | RocketSim | JS | Δ |\n|---|---:|---:|---:|\n`;
  for (const [name, rs, js] of rows) {
    const d = js - rs;
    md += `| ${name} | ${fmt(rs, 4)} | ${fmt(js, 4)} | ${fmt(d, 4)} |\n`;
  }
  md += `\nRocketSim air torques are \`CAR_AIR_CONTROL_* * CAR_TORQUE_SCALE\` (pitch, yaw, roll packing).\n`;
  return md;
}

const args = parseArgs(process.argv.slice(2));
const rsIndex = JSON.parse(await readFile(path.join(args.rs, "index.json"), "utf8"));
const jsIndex = JSON.parse(await readFile(path.join(args.js, "index.json"), "utf8"));
const ids = (index) => index.scenarios.map((s) => s.id).sort();
if (!rsIndex.scenarios.length || JSON.stringify(ids(rsIndex)) !== JSON.stringify(ids(jsIndex)) || new Set(ids(rsIndex)).size !== rsIndex.scenarios.length) {
  throw new Error("Scenario indexes must be nonempty, unique, and identical");
}
const budgets = JSON.parse(await readFile(args.budgets, "utf8"));
const results = [];

for (const entry of rsIndex.scenarios) {
  const rs = JSON.parse(await readFile(path.join(args.rs, entry.path), "utf8"));
  const js = JSON.parse(await readFile(path.join(args.js, entry.path), "utf8"));
  results.push(compareScenario(rs, js));
}

let rsConst = null;
let jsConst = null;
try {
  rsConst = JSON.parse(
    await readFile(path.join(args.rs, "rocketsim_constants.json"), "utf8"),
  );
  jsConst = JSON.parse(await readFile(path.join(args.js, "js_constants.json"), "utf8"));
} catch {
  // optional
}

const now = new Date().toISOString();
let md = `# Physics compare report\n\n`;
md += `Generated: ${now}\n\n`;
md += `Reference: **RocketSim 2.2.1**, SOCCAR or THE_VOID as declared per scenario.\n`;
md += `Candidate: **\`carSim.js\` / \`rl-physics.js\`**.\n\n`;
const failures = results.flatMap((r) => failuresFor(r, budgets));
md += `Regression gate: **${failures.length ? "FAIL" : "PASS"}** (${args.reportOnly ? "report-only" : "enforced"}). Budgets are regression limits, not exact-parity certification.\n\n`;
for (const failure of failures) md += `- ${failure}\n`;

if (rsConst && jsConst) md += constantsSection(rsConst, jsConst) + "\n";

md += `## Trajectory errors\n\n`;
md += `| Scenario | pos mean/max (uu) | vel mean/max | ω mean/max | fwd° mean/max | up° mean/max |\n`;
md += `|---|---:|---:|---:|---:|---:|\n`;
for (const r of results) {
  md += `| \`${r.id}\` | ${fmt(r.pos_mean)} / ${fmt(r.pos_max)} | ${fmt(r.vel_mean)} / ${fmt(r.vel_max)} | ${fmt(r.omega_mean)} / ${fmt(r.omega_max)} | ${fmt(r.fwd_mean_deg)} / ${fmt(r.fwd_max_deg)} | ${fmt(r.up_mean_deg)} / ${fmt(r.up_max_deg)} |\n`;
}

if (results.some(r => r.ball_pos_max !== undefined)) {
  md += `\n## Coupled ball errors\n\n| Scenario | Ball pos max (uu) | Ball vel max (uu/s) | Ball omega max (rad/s) |\n|---|---:|---:|---:|\n`;
  for (const r of results) md += `| ${r.id} | ${fmt(r.ball_pos_max)} | ${fmt(r.ball_vel_max)} | ${fmt(r.ball_omega_max)} |\n`;
}

md += `\n## Per-scenario finals\n\n`;
for (const r of results) {
  md += `### \`${r.id}\`\n`;
  if (r.description) md += `${r.description}\n\n`;
  md += `- Worst position error at tick **${r.worst_tick}** (${fmt(r.pos_max)} uu)\n`;
  md += `- Final pos RS ${r.final.rs_pos.map((x) => fmt(x, 2)).join(", ")} vs JS ${r.final.js_pos.map((x) => fmt(x, 2)).join(", ")}\n`;
  md += `- Final ω RS ${r.final.rs_ang_vel.map((x) => fmt(x, 3)).join(", ")} vs JS ${r.final.js_ang_vel.map((x) => fmt(x, 3)).join(", ")}\n`;
  if (r.final.rs_forward) md += `- Final forward RS [${r.final.rs_forward.map((x) => fmt(x, 3)).join(", ")}] vs JS [${r.final.js_forward.map((x) => fmt(x, 3)).join(", ")}]\n\n`;
}

md += `## How to re-run\n\n`;
md += "```bash\nnpm run physics:compare\n```\n";

await mkdir(path.dirname(args.out), { recursive: true });
await writeFile(args.out, md);
const summaryPath = path.join(path.dirname(args.out), "summary.json");
await writeFile(summaryPath, `${JSON.stringify({ generated: now, results }, null, 2)}\n`);
console.log(md);
console.log(`wrote ${args.out}`);
console.log(`wrote ${summaryPath}`);
if (failures.length && !args.reportOnly) process.exitCode = 1;
