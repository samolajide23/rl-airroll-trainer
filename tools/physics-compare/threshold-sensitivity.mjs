import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { firstDivergence } from "./first-divergence.mjs";

const root = new URL("./out/jump-wall-followup/scoped-audit/", import.meta.url);
const fingerprints = new Map();
function readJson(file) {
  const bytes = readFileSync(file);
  fingerprints.set(file, createHash("sha256").update(bytes).digest("hex"));
  return JSON.parse(bytes);
}

const audit = readJson(new URL("audit-report.json", root));
const scenarios = readJson(new URL("scenarios.json", root));
const { defaults } = readJson(new URL("./tolerances.json", import.meta.url));
const baseline = {
  position: defaults.pos_max, velocity: defaults.vel_max, omega: defaults.omega_max,
  forward: defaults.fwd_max_deg, right: defaults.fwd_max_deg, up: defaults.up_max_deg,
  ball_position: defaults.pos_max, ball_velocity: defaults.vel_max, ball_omega: defaults.omega_max,
  boost: defaults.boost_max, air_time: defaults.air_time_max, ground: 0,
};
const fields = {
  position: "position_error", velocity: "velocity_error", omega: "omega_error",
  forward: "forward_error_deg", right: "right_error_deg", up: "up_error_deg",
  ball_position: "ball_position_error", ball_velocity: "ball_velocity_error", ball_omega: "ball_omega_error",
  boost: "boost_error", air_time: "air_time_error", ground: "ground_mismatch",
};
const fixed = new Set(["boost", "air_time", "ground"]);
const profiles = [1, 2, 5, 10, 20, 50, 100, 1000].map(multiplier => ({
  name: `${multiplier}x`,
  limits: Object.fromEntries(Object.entries(baseline).map(([key, value]) =>
    [key, fixed.has(key) ? value : value * multiplier])),
}));
profiles.push({ name: "candidate-practical", limits: {
  ...baseline, position: 0.1, ball_position: 0.1,
  velocity: 0.1, ball_velocity: 0.1, omega: 0.001, ball_omega: 0.001,
  forward: 0.01, right: 0.01, up: 0.01,
} });

assert.equal(audit.scenarios, 100);
assert.equal(scenarios.scenarios.length, audit.scenarios);
assert.equal(new Set(audit.rows.map(row => row.id)).size, audit.scenarios);
const cases = [];
let frames = 0;
for (const scenario of scenarios.scenarios) {
  const saved = audit.rows.find(row => row.id === scenario.id);
  assert.ok(saved, `Missing audit row: ${scenario.id}`);
  const reference = readJson(new URL(`rocketsim/${scenario.id}.json`, root));
  const candidate = readJson(new URL(`js/${scenario.id}.json`, root));
  const result = firstDivergence(reference, candidate, baseline);
  assert.equal(result.rows.length, scenario.ticks + 1);
  assert.equal(result.first_tick, saved.first_trajectory_failure, scenario.id);
  assert.deepEqual(result.exceeded, saved.exceeded, scenario.id);
  frames += result.rows.length;
  const maxima = Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    const values = result.rows.map(row => row[field]);
    assert.ok(values.every(Number.isFinite), `${scenario.id}: invalid ${field}`);
    return [key, Math.max(...values)];
  }));
  const requiredMultiplier = Math.max(1, ...Object.entries(maxima)
    .filter(([key]) => !fixed.has(key)).map(([key, value]) => value / baseline[key]));
  const fixedFailures = [...fixed].filter(key => maxima[key] > baseline[key]);
  cases.push({ id: scenario.id, seconds: scenario.ticks / reference.tick_rate,
    strictPass: result.first_tick === null, requiredMultiplier, fixedFailures, maxima,
    practicalFirstFailure: result.rows.find(row => Object.entries(fields)
      .some(([key, field]) => row[field] > profiles.at(-1).limits[key]))?.tick ?? null,
  });
}
assert.equal(frames, audit.frames);
assert.equal(cases.filter(row => row.strictPass).length, audit.trajectory_passed);
const sweep = profiles.map(({ name, limits }) => {
  const failed = cases.filter(row => Object.entries(row.maxima).some(([key, value]) => value > limits[key]));
  return { name, passed: cases.length - failed.length, failed: failed.map(row => row.id), limits };
});
assert.equal(sweep[0].passed, audit.trajectory_passed);
for (let index = 1; index < profiles.length - 1; index++) {
  assert.ok(sweep[index].passed >= sweep[index - 1].passed);
}
const nativeControl = readJson(new URL("./out/jump-wall-followup/contact-diagnostic/witness-report.json", import.meta.url));
for (const [file, expected] of fingerprints) {
  assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), expected);
}
console.log(JSON.stringify({
  diagnosticOnly: true, source: root.pathname, frames, baselineReproduced: true,
  unchangedInputs: fingerprints.size, fixedLimits: [...fixed],
  nativeControl: nativeControl.nativeRouteMax,
  fullStatePassesNotRegraded: audit.passed,
  scenariosWithUnavailableFields: audit.rows.filter(row => row.failures.some(failure => failure.status === "unavailable")).length,
  float32PositionSpacingAt4096UU: 2 ** -11,
  sweep,
  strictFailures: cases.filter(row => !row.strictPass),
}, null, 2));