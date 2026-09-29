#!/usr/bin/env node
/**
 * Compare RocketSim vs rl-physics.js trajectories and write a markdown report.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RS = path.join(HERE, "out", "rocketsim");
const DEFAULT_JS = path.join(HERE, "out", "js");
const DEFAULT_OUT = path.join(HERE, "out", "report.md");

function parseArgs(argv) {
  const args = { rs: DEFAULT_RS, js: DEFAULT_JS, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rs") args.rs = argv[++i];
    else if (a === "--js") args.js = argv[++i];
    else if (a === "--out") args.out = argv[++i];
  }
  return args;
}

function sub(a, b) {
  return a.map((v, i) => v - b[i]);
}

function len(v) {
  return Math.hypot(...v);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function angErrDeg(a, b) {
  const c = Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b) || 1)));
  return (Math.acos(c) * 180) / Math.PI;
}

function mean(xs) {
  return xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
}

function max(xs) {
  return xs.reduce((m, x) => (x > m ? x : m), 0);
}

function fmt(n, digits = 3) {
  if (!Number.isFinite(n)) return "n/a";
  return n.toFixed(digits);
}

function compareScenario(rs, js) {
  const n = Math.min(rs.frames.length, js.frames.length);
  const posErr = [];
  const velErr = [];
  const omegaErr = [];
  const fwdErr = [];
  const upErr = [];
  let worst = { tick: 0, pos: 0 };

  for (let i = 0; i < n; i++) {
    const a = rs.frames[i];
    const b = js.frames[i];
    const pe = len(sub(a.pos, b.pos));
    const ve = len(sub(a.vel, b.vel));
    const oe = len(sub(a.ang_vel, b.ang_vel));
    const fe = angErrDeg(a.rot.forward, b.rot.forward);
    const ue = angErrDeg(a.rot.up, b.rot.up);
    posErr.push(pe);
    velErr.push(ve);
    omegaErr.push(oe);
    fwdErr.push(fe);
    upErr.push(ue);
    if (pe >= worst.pos) worst = { tick: a.tick, pos: pe };
  }

  const finalRs = rs.frames[n - 1];
  const finalJs = js.frames[n - 1];

  return {
    id: rs.id,
    description: rs.description,
    frames: n,
    pos_mean: mean(posErr),
    pos_max: max(posErr),
    vel_mean: mean(velErr),
    vel_max: max(velErr),
    omega_mean: mean(omegaErr),
    omega_max: max(omegaErr),
    fwd_mean_deg: mean(fwdErr),
    fwd_max_deg: max(fwdErr),
    up_mean_deg: mean(upErr),
    up_max_deg: max(upErr),
    worst_tick: worst.tick,
    final: {
      rs_pos: finalRs.pos,
      js_pos: finalJs.pos,
      rs_ang_vel: finalRs.ang_vel,
      js_ang_vel: finalJs.ang_vel,
      rs_forward: finalRs.rot.forward,
      js_forward: finalJs.rot.forward,
      rs_up: finalRs.rot.up,
      js_up: finalJs.rot.up,
    },
  };
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
    ["Extra impulse Z", rsConst.BALL_CAR_EXTRA_IMPULSE_Z_SCALE, jsConst.EXTRA_IMPULSE_Z],
    [
      "Extra impulse forward",
      rsConst.BALL_CAR_EXTRA_IMPULSE_FORWARD_SCALE,
      jsConst.EXTRA_IMPULSE_FWD,
    ],
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
md += `Ground truth: **RocketSim** (\`GameMode.THE_VOID\`) via Python bindings.\n`;
md += `Candidate: **\`src/shared/rl-physics.js\`**.\n\n`;

if (rsConst && jsConst) md += constantsSection(rsConst, jsConst) + "\n";

md += `## Trajectory errors\n\n`;
md += `| Scenario | pos mean/max (uu) | vel mean/max | ω mean/max | fwd° mean/max | up° mean/max |\n`;
md += `|---|---:|---:|---:|---:|---:|\n`;
for (const r of results) {
  md += `| \`${r.id}\` | ${fmt(r.pos_mean)} / ${fmt(r.pos_max)} | ${fmt(r.vel_mean)} / ${fmt(r.vel_max)} | ${fmt(r.omega_mean)} / ${fmt(r.omega_max)} | ${fmt(r.fwd_mean_deg)} / ${fmt(r.fwd_max_deg)} | ${fmt(r.up_mean_deg)} / ${fmt(r.up_max_deg)} |\n`;
}

md += `\n## Per-scenario finals\n\n`;
for (const r of results) {
  md += `### \`${r.id}\`\n`;
  if (r.description) md += `${r.description}\n\n`;
  md += `- Worst position error at tick **${r.worst_tick}** (${fmt(r.pos_max)} uu)\n`;
  md += `- Final pos RS ${r.final.rs_pos.map((x) => fmt(x, 2)).join(", ")} vs JS ${r.final.js_pos.map((x) => fmt(x, 2)).join(", ")}\n`;
  md += `- Final ω RS ${r.final.rs_ang_vel.map((x) => fmt(x, 3)).join(", ")} vs JS ${r.final.js_ang_vel.map((x) => fmt(x, 3)).join(", ")}\n`;
  md += `- Final forward RS [${r.final.rs_forward.map((x) => fmt(x, 3)).join(", ")}] vs JS [${r.final.js_forward.map((x) => fmt(x, 3)).join(", ")}]\n\n`;
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
