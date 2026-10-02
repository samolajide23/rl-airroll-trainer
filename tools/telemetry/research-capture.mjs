import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const axes = ["throttle", "steer", "pitch", "yaw", "roll"];
const buttons = ["jump", "boost", "handbrake"];
const bodyKeys = ["location", "velocity", "angular_velocity", "quaternion"];
const distance = (first, second) => Math.hypot(...first.map((value, index) => value - second[index]));

function keys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label);
}

function validate(row, index) {
  keys(row, ["frame", "ball", "car", "input"], `record ${index}`);
  assert.ok(Number.isSafeInteger(row.frame) && row.frame >= 0, `frame ${index}`);
  for (const name of ["car", "ball"]) {
    keys(row[name], bodyKeys, `${name} ${index}`);
    for (const field of bodyKeys) {
      const vector = row[name][field];
      assert.ok(Array.isArray(vector) && vector.length === (field === "quaternion" ? 4 : 3)
        && vector.every(Number.isFinite), `${name}.${field} ${index}`);
    }
    assert.ok(Math.abs(Math.hypot(...row[name].quaternion) - 1) <= 0.001, `${name} quaternion norm ${index}`);
  }
  keys(row.input, [...axes, ...buttons], `input ${index}`);
  for (const axis of axes) assert.ok(Number.isFinite(row.input[axis]) && Math.abs(row.input[axis]) <= 1, `${axis} ${index}`);
  for (const button of buttons) assert.equal(typeof row.input[button], "boolean", `${button} ${index}`);
}

function sameObservation(first, second) {
  return ["car", "ball"].every(name => bodyKeys.every(field =>
    first[name][field].every((value, index) => value === second[name][field][index])))
    && [...axes, ...buttons].every(field => first.input[field] === second.input[field]);
}

export function auditResearchCapture(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0, "nonempty capture required");
  rows.forEach(validate);
  const groups = [];
  let repeatedRecords = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const previous = groups.at(-1);
    assert.ok(!previous || row.frame >= previous.row.frame, `frame reversal at ${index}`);
    if (previous && row.frame === previous.row.frame) {
      repeatedRecords++;
      previous.indices.push(index);
      previous.conflicting ||= !sameObservation(previous.row, row);
    } else groups.push({ row, indices: [index], conflicting: false });
  }
  const segments = [];
  let segment = [];
  let gaps = 0;
  let discontinuities = 0;
  for (const group of groups) {
    const previous = segment.at(-1);
    const gap = previous && group.row.frame !== previous.row.frame + 1;
    const discontinuity = previous && ["ball", "car"].some(name =>
      distance(group.row[name].location, previous.row[name].location) > 100);
    if (gap) gaps++;
    if (discontinuity) discontinuities++;
    if (group.conflicting || gap || discontinuity) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (!group.conflicting) segment.push(group);
  }
  if (segment.length) segments.push(segment);
  const candidates = [];
  for (const run of segments) {
    for (let index = 2; index < run.length - 2; index++) {
      const before = run[index - 1].row;
      const after = run[index].row;
      const velocityChange = distance(after.ball.velocity, before.ball.velocity);
      const separation = Math.min(distance(before.ball.location, before.car.location),
        distance(after.ball.location, after.car.location));
      if (velocityChange < 100 || separation > 250) continue;
      const window = run.slice(index - 2, index + 3);
      candidates.push({ frame: after.frame, velocityChange, separation,
        records: window.map(group => ({ frame: group.row.frame, sourceIndices: group.indices })) });
    }
  }
  return {
    records: rows.length, uniqueFrames: groups.length, repeatedRecords,
    conflictingFrames: groups.filter(group => group.conflicting).map(group => group.row.frame),
    gaps, discontinuities,
    segments: segments.map(run => ({ first: run[0].row.frame, last: run.at(-1).row.frame, frames: run.length })),
    candidates,
    comparisonEligible: false,
    limitations: [
      "Frame duration, input application phase, exact recorder, units and quaternion mapping are not independently established.",
      "Identical adjacent observations are grouped with all source indices retained; conflicting groups are excluded.",
      "The 100-unit displacement screen is heuristic, not proof that resets are absent; gaps count boundaries after retained frames.",
      "Candidates use >=100 velocity change and <=250 center separation, not confirmed contacts or model-error selection.",
      "Five-frame windows may overlap and may include arena contacts; unknown mutators, hitbox and hidden state prevent parity certification.",
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv[2] && process.argv[3], "usage: node research-capture.mjs input.json report.json");
  assert.notEqual(pathToFileURL(process.argv[2]).href, pathToFileURL(process.argv[3]).href, "do not overwrite source");
  const bytes = readFileSync(process.argv[2]);
  const report = { source: process.argv[2], sha256: createHash("sha256").update(bytes).digest("hex"),
    ...auditResearchCapture(JSON.parse(bytes)) };
  writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ records: report.records, uniqueFrames: report.uniqueFrames,
    conflictingFrames: report.conflictingFrames.length, segments: report.segments.length,
    candidates: report.candidates.length, comparisonEligible: report.comparisonEligible }));
}