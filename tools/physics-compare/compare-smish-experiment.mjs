import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validatePair } from "./trajectory.mjs";

const root = new URL("./out/", import.meta.url);
const load = async name => JSON.parse(await readFile(new URL(name, root), "utf8"));
const vectorError = (actual, expected) => {
  for (const vector of [actual, expected]) {
    assert.equal(vector.length, 3);
    assert(vector.every(Number.isFinite));
  }
  return Math.hypot(...actual.map((value, index) => value - expected[index]));
};
const ballSetup = ball => ({
  pos: ball.pos,
  vel: ball.vel ?? [0, 0, 0],
  ang_vel: ball.ang_vel ?? [0, 0, 0],
});
const report = {
  diagnostic_only: true,
  scope: "Four continuous isolated airborne contacts; not a full-state parity gate",
  metrics: "Maximum Euclidean vector errors; orientation measured as basis-vector distance",
  rows: [],
};

for (const id of ["contact_nose", "contact_side_offset", "contact_roof", "contact_ball_spin"]) {
  const before = await load(`smish-impulse-before/${id}.json`);
  const candidate = await load(`smish-impulse-candidate/${id}.json`);
  const referenceName = `edge-audit-20261002-v1/rocketsim/contact_${id}.json`;
  const reference = await load(referenceName);
  validatePair(before, candidate);
  assert.equal(reference.id, `contact_${id}`);
  assert.deepEqual(before.initial, reference.initial);
  assert.deepEqual(ballSetup(before.ball_initial), ballSetup(reference.ball_initial));
  for (const key of ["game_mode", "ticks"]) assert.equal(before[key], reference[key]);
  assert.equal(before.frames.length, reference.frames.length);
  assert(Math.abs(before.tick_rate - reference.tick_rate) < 0.001);
  assert(Math.abs(before.tick_time - reference.tick_time) < 1e-8);
  const row = { id, reference_sha256: createHash("sha256")
    .update(await readFile(new URL(referenceName, root))).digest("hex") };
  for (const [label, data] of [["before", before], ["candidate", candidate]]) {
    row[label] = {};
    data.frames.forEach((frame, index) => {
      assert.equal(frame.tick, reference.frames[index].tick);
      assert.deepEqual(frame.controls, reference.frames[index].controls);
    });
    for (const entity of ["car", "ball"]) {
      for (const field of ["pos", "vel", "ang_vel"]) {
        const values = frame => (entity === "car" ? frame : frame.ball)[field];
        assert.equal(vectorError(values(data.frames[0]), values(reference.frames[0])), 0);
        row[label][`${entity}_${field}_max`] = Math.max(...data.frames.map((frame, index) =>
          vectorError(values(frame), values(reference.frames[index]))));
      }
    }
    for (const axis of ["forward", "right", "up"]) {
      assert.equal(vectorError(data.frames[0].rot[axis], reference.frames[0].rot[axis]), 0);
      row[label][`${axis}_vector_max`] = Math.max(...data.frames.map((frame, index) =>
        vectorError(frame.rot[axis], reference.frames[index].rot[axis])));
    }
  }
  report.rows.push(row);
}

const hashes = await load("inertia-followup/input-hashes.json");
for (const [file, expected] of Object.entries(hashes)) {
  assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), expected, file);
}
report.unchanged_input_hashes = Object.keys(hashes).length;
console.log(JSON.stringify(report, null, 2));