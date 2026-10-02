import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { makeBall, stepBall, RL } from "../../src/shared/rl-physics.js";
import { measureFlights, extractBallSamples, auditReplayEvidence } from "./match-replay.mjs";

test("continuous replay diagnostic retains state across samples and rejects gaps", () => {
  const ball = makeBall(new Vector3(0, 0, 1000));
  ball.vel.set(800, 0, 200);
  const samples = [];
  for (let frame = 0; frame < 16; frame++) {
    samples.push({ time: frame / 30, generation: 1, pos: ball.pos.clone(), vel: ball.vel.clone(), safe: true });
    for (let tick = 0; tick < 4; tick++) stepBall(ball, RL.DT, { arena: false });
  }
  const report = measureFlights(samples);
  assert.equal(report.windows.length, 1);
  assert.equal(report.windows[0].maxPosition, 0);
  assert.equal(report.windows[0].diagnosticVelocity, 0);
  assert.ok(measureFlights(samples, 3).windows.length > 0);
  assert.throws(() => measureFlights(samples, 0));
  samples[8].time += 1;
  assert.equal(measureFlights(samples).windows.length, 0);
});

test("ball actor deletion and ID reuse do not retain its identity", () => {
  const state = { location: { x: 0, y: 0, z: 500 }, linear_velocity: { x: 1, y: 0, z: 0 } };
  const frame = { time: 0, new_actors: [{ actor_id: 2, object_id: 0 }], deleted_actors: [],
    updated_actors: [{ actor_id: 2, attribute: { RigidBody: state } }] };
  const replay = { objects: ["Archetypes.Ball.Ball_Default", "Unrelated"], network_frames: { frames: [frame,
    { ...frame, time: 1, deleted_actors: [2], new_actors: [{ actor_id: 2, object_id: 1 }] }] } };
  assert.equal(extractBallSamples(replay).length, 1);
});

test("control audit preserves raw events and refuses stale component links after car ID reuse", () => {
  const replay = { objects: ["Archetypes.Car.Car_Default", "Archetypes.CarComponents.CarComponent_Boost",
    "TAGame.CarComponent_TA:Vehicle", "TAGame.CarComponent_TA:ReplicatedActive"],
  network_frames: { frames: [
    { time: 0, deleted_actors: [], new_actors: [{ actor_id: 1, object_id: 0 }, { actor_id: 2, object_id: 1 }],
      updated_actors: [{ actor_id: 2, object_id: 3, attribute: { Byte: 3 } },
        { actor_id: 2, object_id: 2, attribute: { ActiveActor: { active: true, actor: 1 } } }] },
    { time: 0.2, deleted_actors: [1], new_actors: [{ actor_id: 1, object_id: 0 }],
      updated_actors: [{ actor_id: 2, object_id: 3, attribute: { Byte: 2 } }] },
  ] } };
  const report = auditReplayEvidence(replay);
  assert.equal(report.events.length, 1);
  assert.deepEqual(report.events[0].raw, { Byte: 3 });
  assert.equal(report.unresolvedEvents, 1);
  assert.equal(report.timing.gapsOver50ms, 1);
});