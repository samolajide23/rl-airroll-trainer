import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  root: { type: "string", default: "tools/physics-compare/out/edge-audit-20261002-v1" },
  exe: { type: "string", default: "tools/physics-compare/out/native/jump_wall_trace.exe" },
  meshes: { type: "string", default: "tools/physics-compare/collision_meshes" },
  out: { type: "string", default: "tools/physics-compare/out/jump-wall-followup/contact-diagnostic" },
} });
const scenarioId = "movement_ground_jump_into_wall";
const input = readFileSync(path.join(values.root, "rocketsim", `${scenarioId}.json`));
const reference = JSON.parse(input);
const scenario = JSON.parse(readFileSync(path.join(values.root, "scenarios.json"))).scenarios.find(item => item.id === scenarioId);
assert.equal(scenario.ticks, 180);
assert.deepEqual(scenario.initial, {
  pos: [3600, 0, 17], vel: [0, 0, 0], ang_vel: [0, 0, 0],
  yaw: 0, pitch: 0, roll: 0, boost: 100, on_ground: true,
});
assert.deepEqual(scenario.control_schedule, [
  { until_tick: 3, controls: { jump: true, throttle: 1 } },
  { until_tick: 180, controls: { throttle: 1, boost: true } },
]);
assert.equal(scenario.preparation, "legacy");
assert.deepEqual(scenario.ball, { pos: [0, 0, 92.75], vel: [0, 0, 0], ang_vel: [0, 0, 0] });
const output = path.resolve(values.out);
const relativeOutput = path.relative(path.resolve(values.root), output);
assert(relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput), "Diagnostic output must be outside the immutable input directory");

function execute(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function distance(first, second) {
  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  const error = Math.hypot(...first.map((value, index) => value - second[index]));
  assert(Number.isFinite(error));
  return error;
}

function errors(actual, expected) {
  return Object.fromEntries(["pos", "vel", "ang_vel"].map(key => [key, distance(actual[key], expected[key])]));
}

const nativeRows = execute(values.exe, [values.meshes, "jump-wall"])
  .split(/\r?\n/).filter(line => line.startsWith("{")).map(line => JSON.parse(line));
const nativeFrames = nativeRows.filter(row => Number.isInteger(row.tick));
assert.equal(nativeFrames.length, 180);
const nativeReset = nativeRows.find(row => row.stage === "reset");
const resetError = errors({ ...nativeReset, ang_vel: nativeReset.omega }, reference.frames[0]);
assert(Object.values(resetError).every(error => error === 0), "Native reset differs from immutable recording");
const nativeErrors = nativeFrames.map((row, index) => {
  assert.equal(row.tick, index + 1);
  return { tick: row.tick, ...errors({ ...row, ang_vel: row.omega }, reference.frames[row.tick]) };
});
assert(nativeErrors.filter(row => row.tick <= 90).every(row => row.pos === 0 && row.vel === 0 && row.ang_vel === 0), "Native pre-impact trace differs from immutable recording");
const impactError = nativeErrors[90];
assert.equal(impactError.pos, 0);
assert.equal(impactError.ang_vel, 0);
assert(impactError.vel <= 0.000002, "Native impact exceeds the documented compiler fidelity envelope");
const nativeImpact = nativeFrames[90];
assert.equal(nativeImpact.contacts.length, 2);
assert(nativeImpact.contacts.every(contact => contact.body === "car" && contact.depth < 0));

const results = [];
for (const variant of ["baseline", "normal", "point", "distance", "all", "all-native-order"]) {
  const injectedSource = `
  if (car.captureArenaContacts && contacts.some(contact => Math.abs(contact.n.z) < 0.9999)) {
    const measured = ${JSON.stringify(nativeImpact.contacts)};
    const variant = ${JSON.stringify(variant)};
    if (contacts.length !== measured.length) throw new Error("Unexpected probe contact count");
    const matched = new Set();
    for (const contact of contacts) {
      const point = contact.rel.clone().add(car.pos);
      const nearest = measured.reduce((best, item) => point.distanceToSquared(V(...item.world)) < point.distanceToSquared(V(...best.world)) ? item : best);
      if (point.distanceTo(V(...nearest.world)) > 0.01 || matched.has(nearest)) throw new Error("Ambiguous probe witness pairing");
      matched.add(nearest);
      if (["normal", "all", "all-native-order"].includes(variant)) contact.n.set(...nearest.normal);
      if (["point", "all", "all-native-order"].includes(variant)) contact.rel.copy(V(...nearest.world).sub(car.pos));
      if (["distance", "all", "all-native-order"].includes(variant)) contact.dist = nearest.depth;
    }
    if (variant === "all-native-order") contacts.sort((first, second) => measured.findIndex(item => first.rel.clone().add(car.pos).distanceTo(V(...item.world)) < 1e-8) - measured.findIndex(item => second.rel.clone().add(car.pos).distanceTo(V(...item.world)) < 1e-8));
  }
`;
  const probe = `
import { registerHooks } from "node:module";
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url.endsWith("/src/shared/carSim.js")) {
    const source = String(result.source);
    const marker = '  if ((contacts.every(contact => Math.abs(contact.n.z) === 1) ||';
    if (source.split(marker).length !== 2) throw new Error("Probe anchor changed; review diagnostic before running");
    result.source = source.replace(marker, ${JSON.stringify(injectedSource)} + marker);
  }
  return result;
} });
const { Vector3 } = await import("three");
const { makePhysCar } = await import("./src/shared/carPhysics.js");
const { stepCar, setCarPosition } = await import("./src/shared/carSim.js");
const car = makePhysCar(new Vector3(3600, 0, 17), 0);
car.physicsProfile = "rocketsim";
for (let tick = 0; tick < 240; tick++) stepCar(car, {});
setCarPosition(car, new Vector3(3600, 0, car.pos.z));
car.vel.set(0, 0, 0); car.omega.set(0, 0, 0); car.q.identity(); car.boost = 100;
stepCar(car, {});
setCarPosition(car, car.pos.clone());
car.vel.set(0, 0, 0); car.omega.set(0, 0, 0); car.q.identity(); car.boost = 100;
const snapshot = tick => ({ tick, pos: car.pos.toArray(), vel: car.vel.toArray(), ang_vel: car.omega.toArray() });
const frames = [snapshot(0)];
for (let tick = 1; tick <= 91; tick++) {
  car.captureArenaContacts = tick === 91;
  stepCar(car, tick <= 3 ? { jump: true, throttle: 1 } : { throttle: 1, boost: true });
  frames.push(snapshot(tick));
}
console.log(JSON.stringify({ frames, contacts: car.lastArenaContacts }));
`;
  const actual = JSON.parse(execute(process.execPath, ["--input-type=module"], { input: probe }));
  assert.equal(actual.frames.length, 92);
  for (const frame of actual.frames.slice(0, 91)) {
    assert(Object.values(errors(frame, reference.frames[frame.tick])).every(error => error === 0), `${variant}: JS pre-impact state differs at ${frame.tick}`);
  }
  results.push({ variant, errors: errors(actual.frames[91], reference.frames[91]), actual: actual.frames[91], contacts: actual.contacts });
}

const report = {
  diagnosticOnly: true,
  scenario: scenarioId,
  referenceSha256: createHash("sha256").update(input).digest("hex"),
  executableSha256: createHash("sha256").update(readFileSync(values.exe)).digest("hex"),
  nativePreImpactExact: true,
  nativeImpactError: impactError,
  nativeRouteMax: Object.fromEntries(["pos", "vel", "ang_vel"].map(key => [key, Math.max(...nativeErrors.map(row => row[key]))])),
  nativeImpact,
  results,
};
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, "native-trace.json"), JSON.stringify(nativeRows, null, 2));
writeFileSync(path.join(output, "witness-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ nativeImpactError: impactError, nativeRouteMax: report.nativeRouteMax, results: results.map(({ variant, errors }) => ({ variant, errors })), output }, null, 2));