import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildMovementScenarios } from "./movement-bot.mjs";

test("airborne replay matches native cold-state ground flag before first contact update", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "airlab-replay-"));
  try {
    await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("./run_js.mjs", import.meta.url)),
      "--scenarios", fileURLToPath(new URL("./scenarios.json", import.meta.url)),
      "--only", "freefall_1s", "--only", "plank_jump", "--out", output,
    ]);
    const replay = JSON.parse(await readFile(path.join(output, "freefall_1s.json"), "utf8"));
    assert.equal(replay.frames[0].on_ground, true);
    assert.equal(replay.frames[0].air_time, 0);
    assert(replay.frames.slice(1).every(frame => frame.on_ground === false));
    const jump = JSON.parse(await readFile(path.join(output, "plank_jump.json"), "utf8"));
    const nativeEndpoint = [-998.1614990234375, 0, 227.46133422851562];
    assert(Math.hypot(...jump.frames.at(-1).pos.map((value, index) => value - nativeEndpoint[index])) <= 0.002);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("movement bot records deterministic isolated controls without modifying source", async () => {
  const source = JSON.parse(await readFile(new URL("./scenarios.json", import.meta.url), "utf8"));
  const original = JSON.stringify(source);
  const first = buildMovementScenarios(source);
  assert.equal(JSON.stringify(first), JSON.stringify(buildMovementScenarios(source)));
  assert.equal(JSON.stringify(source), original);
  assert.equal(first.scenarios.length, source.scenarios.length + 6);
  assert.equal(new Set(first.scenarios.map(scenario => scenario.id)).size, first.scenarios.length);
  for (const scenario of first.scenarios) {
    assert.equal(scenario.car_only, true);
    assert.equal(scenario.ball, undefined);
    if (!scenario.id.startsWith("movement_bot_")) continue;
    assert.equal(scenario.control_schedule.at(-1).until_tick, scenario.ticks);
    let previous = 0;
    for (const segment of scenario.control_schedule) {
      assert(segment.until_tick > previous);
      previous = segment.until_tick;
      for (const [key, value] of Object.entries(segment.controls)) {
        if (["boost", "jump", "handbrake"].includes(key)) assert.equal(typeof value, "boolean");
        else assert(Number.isFinite(value) && Math.abs(value) <= 1);
      }
    }
  }
});

test("movement bot rejects coupled or ball-only source scenarios", () => {
  assert.throws(() => buildMovementScenarios({ scenarios: [{ ball: { pos: [0, 0, 93] } }] }), /car-only/);
  assert.throws(() => buildMovementScenarios({ scenarios: [{ entity: "ball" }] }), /car-only/);
});