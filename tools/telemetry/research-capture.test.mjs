import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { auditResearchCapture } from "./research-capture.mjs";

function capture() {
  return Array.from({ length: 7 }, (_, frame) => ({ frame,
    ball: { location: [frame, 0, 100], velocity: [frame >= 3 ? 200 : 0, 0, 0],
      angular_velocity: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    car: { location: [frame, 0, 17], velocity: [0, 0, 0],
      angular_velocity: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    input: { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false },
  }));
}

test("research candidates retain raw indices without claiming comparison eligibility", () => {
  const rows = capture();
  rows.splice(2, 0, structuredClone(rows[2]));
  const original = structuredClone(rows);
  const report = auditResearchCapture(rows);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.repeatedRecords, 1);
  assert.equal(report.comparisonEligible, false);
  assert.deepEqual(report.candidates[0].records[1], { frame: 2, sourceIndices: [2, 3] });
  assert.deepEqual(rows, original);
});

test("conflicting controls or rigid states exclude the entire repeated frame group", () => {
  for (const field of ["input", "ball", "car"]) {
    const rows = capture();
    const duplicate = structuredClone(rows[3]);
    if (field === "input") duplicate.input.jump = true;
    else duplicate[field].angular_velocity[0] = 1;
    rows.splice(4, 0, duplicate);
    const report = auditResearchCapture(rows);
    assert.deepEqual(report.conflictingFrames, [3]);
    assert.equal(report.candidates.length, 0);
  }
});

test("gaps, reversals and large position jumps cannot enter contact windows", () => {
  const gap = capture();
  gap.splice(2, 1);
  assert.equal(auditResearchCapture(gap).candidates.length, 0);
  const jump = capture();
  jump[3].ball.location[0] = 5000;
  assert.equal(auditResearchCapture(jump).candidates.length, 0);
  const reversal = capture();
  reversal[3].frame = 1;
  assert.throws(() => auditResearchCapture(reversal), /reversal/);
});

test("every state field, shape, control and quaternion is validated fail closed", () => {
  assert.throws(() => auditResearchCapture([]));
  for (const body of ["car", "ball"]) {
    for (const field of ["location", "velocity", "angular_velocity", "quaternion"]) {
      const rows = capture();
      rows[4][body][field][0] = NaN;
      assert.throws(() => auditResearchCapture(rows));
    }
  }
  for (const mutate of [
    row => { row.ball.quaternion = [0, 0, 0, 0]; },
    row => { row.car.location.push(0); },
    row => { row.input.throttle = 2; },
    row => { row.input.jump = 1; },
    row => { delete row.input.roll; },
    row => { row.ball.extra = 1; },
    row => { row.frame = 1.5; },
  ]) {
    const rows = capture();
    mutate(rows[4]);
    assert.throws(() => auditResearchCapture(rows));
  }
});

test("CLI hashes original bytes and refuses to overwrite sources or reports", () => {
  const directory = mkdtempSync(join(tmpdir(), "research-capture-"));
  try {
    const source = join(directory, "source.json");
    const output = join(directory, "report.json");
    const bytes = JSON.stringify(capture(), null, 2) + "\n";
    writeFileSync(source, bytes);
    const run = destination => spawnSync(process.execPath,
      [fileURLToPath(new URL("./research-capture.mjs", import.meta.url)), source, destination], { encoding: "utf8" });
    const result = run(output);
    assert.equal(result.status, 0, result.stderr);
    const reportBytes = readFileSync(output, "utf8");
    const report = JSON.parse(reportBytes);
    assert.equal(report.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(report.comparisonEligible, false);
    assert.notEqual(run(output).status, 0);
    assert.notEqual(run(source).status, 0);
    assert.equal(readFileSync(source, "utf8"), bytes);
    assert.equal(readFileSync(output, "utf8"), reportBytes);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});