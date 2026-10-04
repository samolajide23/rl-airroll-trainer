import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import createRocketSim from './build/rocketsim.mjs';
import { loadSoccar, runContactChecks } from './soccar.mjs';

const wasmBinary = await readFile(new URL('./build/rocketsim.wasm', import.meta.url));
const engine = await createRocketSim({ wasmBinary });
const snapshot = () => {
  const pointer = engine._rs_state();
  assert.notEqual(pointer, 0);
  return Array.from(engine.HEAPF32.subarray(pointer / 4, pointer / 4 + 10));
};
const trial = (boost) => {
  assert.equal(engine._rs_create(), 1);
  const initial = snapshot();
  const started = performance.now();
  engine._rs_step(120, 0, 0, 0, 0, 0, 0, boost, 0);
  const elapsedMs = performance.now() - started;
  const final = snapshot();
  assert.ok(final.every(Number.isFinite));
  assert.ok(final[2] < initial[2]);
  assert.ok(final[5] < 0);
  if (!boost) assert.ok(final[5] < -600 && final[5] > -700);
  engine._rs_destroy();
  return { final, elapsedMs };
};
const coast = trial(0);
assert.deepEqual(trial(0).final, coast.final);
const boosted = trial(1);
assert.ok(boosted.final[9] < coast.final[9]);
assert.ok(boosted.final[3] > coast.final[3]);
console.log(JSON.stringify({ engine: 'RocketSim 2.2.1 WASM', coast, boosted }, null, 2));
const soccar = await createRocketSim({ wasmBinary });
const meshRoot = new URL('../physics-compare/collision_meshes/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', meshRoot), 'utf8'));
const meshes = await loadSoccar(soccar, manifest, async name => {
  const bytes = await readFile(new URL(`soccar/${name}`, meshRoot));
  return bytes;
}, webcrypto);
console.log(JSON.stringify({ meshes, contacts: runContactChecks(soccar) }, null, 2));
const scenarioBytes = await readFile(new URL('../physics-compare/ball-scenarios.json', import.meta.url));
const suite = JSON.parse(scenarioBytes);
const scenarioHash = createHash('sha256').update(scenarioBytes).digest('hex');
const comparison = [];
const ballLimits = { pos: 0.05, vel: 0.05, ang_vel: 0.0001 };
for (const scenario of suite.scenarios) {
  const reference = JSON.parse(await readFile(new URL(`../physics-compare/out/ball/rocketsim/${scenario.id}.json`, import.meta.url)));
  assert.equal(reference.rocketsim_version, '2.2.1');
  assert.equal(reference.scenario_sha256, scenarioHash);
  const target = scenario.game_mode === 'soccar' ? soccar : engine;
  assert.equal(scenario.game_mode === 'soccar' ? target._rs_create_soccar() : target._rs_create(), 1);
  target._rs_remove_car();
  const initial = { ...suite.defaults.initial, ...scenario.initial };
  assert.deepEqual(reference.initial, initial);
  assert.equal(reference.frames.length, scenario.ticks + 1);
  target._rs_set_ball(...initial.pos, ...initial.vel, ...initial.ang_vel);
  const maxima = { pos: 0, vel: 0, ang_vel: 0 };
  for (let tick = 0; tick <= scenario.ticks; tick++) {
    const pointer = target._rs_state();
    assert.notEqual(pointer, 0);
    const state = Array.from(target.HEAPF32.subarray(pointer / 4 + 10, pointer / 4 + 19));
    assert.ok(state.every(Number.isFinite));
    assert.equal(reference.frames[tick].tick, tick);
    for (const [field, offset] of [['pos', 0], ['vel', 3], ['ang_vel', 6]]) {
      const difference = Math.hypot(...reference.frames[tick][field].map((value, axis) => state[offset + axis] - value));
      maxima[field] = Math.max(maxima[field], difference);
      assert.ok(difference <= ballLimits[field], `${scenario.id} tick ${tick} ${field}: ${difference} > ${ballLimits[field]}`);
    }
    if (tick < scenario.ticks) target._rs_step(1, 0, 0, 0, 0, 0, 0, 0, 0);
  }
  target._rs_destroy();
  comparison.push({ id: scenario.id, maximumError: maxima });
}
console.log(JSON.stringify({ nativeBallComparison: comparison, limits: ballLimits }, null, 2));