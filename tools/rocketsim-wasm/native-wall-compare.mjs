import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sse = process.argv.includes('--sse');
const sse2 = process.argv.includes('--sse2');
const exactRsqrt = process.argv.includes('--exact-rsqrt');
const executable = fileURLToPath(new URL(`./build-native-msvc${exactRsqrt ? '-exact' : sse ? '-sse' : ''}/native_wall_probe.exe`, import.meta.url));
const meshes = fileURLToPath(new URL('../physics-compare/collision_meshes/', import.meta.url));
const limits = { pos: 0.05, vel: 0.05, ang_vel: 0.0001, basis: 0.0001, boost: 0.001 };
const distance = (actual, expected) => Math.hypot(...actual.map((value, index) => value - expected[index]));
let passed = true;
for (const id of ['wall_drive_throttle_3s', 'ground_jump_into_wall']) {
  const reference = JSON.parse(await readFile(new URL(`../physics-compare/out/rocketsim/${id}.json`, import.meta.url)));
  const result = spawnSync(executable, [meshes, id, ...(sse2 ? ['--sse2'] : [])], { encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split(/\r?\n/).map(line => line.split(',').map(value => Math.fround(Number(value))));
  assert.equal(rows.length, reference.frames.length);
  const maxima = Object.fromEntries(Object.keys(limits).map(field => [field, 0]));
  const firstDifference = {};
  const failures = {};
  for (const [tick, row] of rows.entries()) {
    assert.equal(row.length, 21);
    assert.ok(row.every(Number.isFinite));
    assert.equal(row[0], tick);
    const frame = reference.frames[tick];
    const errors = {
      pos: distance(row.slice(1, 4), frame.pos),
      vel: distance(row.slice(4, 7), frame.vel),
      ang_vel: distance(row.slice(7, 10), frame.ang_vel),
      basis: Math.max(...['forward', 'right', 'up'].map((axis, index) => distance(row.slice(10 + index * 3, 13 + index * 3), frame.rot[axis]))),
      boost: Math.abs(row[19] - frame.boost),
    };
    for (const [field, error] of Object.entries(errors)) {
      maxima[field] = Math.max(maxima[field], error);
      if (error > 0 && !firstDifference[field]) firstDifference[field] = { tick, error };
      if (error > limits[field] && !failures[field]) failures[field] = { tick, error };
    }
    if (Boolean(row[20]) !== frame.on_ground && !failures.on_ground) failures.on_ground = { tick };
  }
  passed &&= Object.keys(failures).length === 0;
  console.log(JSON.stringify({ id, compiler: exactRsqrt ? 'MSVC exact rsqrt' : sse ? `MSVC ${sse2 ? 'SSE2' : 'SSE'}` : 'MSVC scalar', maxima, firstDifference, failures }, null, 2));
}
process.exitCode = passed ? 0 : 1;