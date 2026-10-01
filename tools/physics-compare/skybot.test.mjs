import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { SkybotDiagnostic, predictSkybotBall } from "../../src/shared/skybot.js";
import { makePhysCar, makeBall, RL } from "../../src/shared/carPhysics.js";
import { stepCarBall } from "../../src/shared/carSim.js";

test("Skybot prediction is independent, bounded and does not mutate physics", () => {
  const ball = makeBall(new Vector3(0, 0, 1000));
  ball.vel.set(100, 0, 0);
  const frames = predictSkybotBall(ball);
  assert.equal(frames.length, 601);
  assert.equal(ball.pos.z, 1000);
  assert.equal(ball.vel.z, 0);
  assert.ok(frames[120][2] < 1000);
  assert.ok(frames.every(point => point.every(Number.isFinite) && point[2] >= 93));
});

test("Skybot steers toward the target and drives into the ball deterministically", () => {
  const car = makePhysCar(new Vector3(0, -2000, 17), Math.PI / 2, "octane");
  const ball = makeBall(new Vector3(0, 0, RL.BALL_REST_Z));
  const bot = new SkybotDiagnostic();
  bot.begin(car, ball);
  const offAxis = makePhysCar(new Vector3(-1000, -2000, 17), Math.PI / 2, "octane");
  offAxis.onGround = true;
  assert.ok(bot.controls(offAxis, ball).steer < 0);
  bot.begin(car, ball);
  for (let tick = 0; tick < 480; tick++) {
    const input = bot.controls(car, ball);
    assert.ok(Object.values(input).every(value => typeof value === "boolean" || Number.isFinite(value)));
    stepCarBall(car, ball, input, tick, RL.DT);
    bot.observe(car, ball, input);
  }
  assert.ok(ball.pos.y > 100, `ball should be struck: ${ball.pos.y}`);
  assert.equal(bot.recording.scenarios[0].ticks, 480);
  assert.equal(bot.recording.observations.length, 480);
  assert.equal(bot.recording.scenarios[0].control_schedule[479].until_tick, 480);
  assert.ok(Number.isFinite(bot.error));
});