import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { SkybotDiagnostic, predictSkybotBall } from "../../src/shared/skybot.js";
import { MechanicsBot } from "../../src/shared/mechanicsBot.js";
import { makePhysCar, makeBall, RL, FixedStepClock } from "../../src/shared/carPhysics.js";
import { stepCarBall } from "../../src/shared/carSim.js";
import { KamaelBot, kamaelInput } from "../../src/shared/kamaelBot.js";
import { createSoccarBoostPads } from "../../src/shared/boostPads.js";

test("Kamael packet preserves physics and aligns RLBot boost indices with live state", () => {
  const car = makePhysCar(new Vector3(0, -2000, 17), Math.PI / 2, "octane");
  const ball = makeBall(new Vector3(0, 0, RL.BALL_REST_Z));
  const pads = createSoccarBoostPads();
  const corner = pads.find(pad => pad.big && pad.x === -3072 && pad.y === -4096);
  corner.active = false;
  corner.timer = 7;
  const positions = pads.map(pad => [pad.x, pad.y]);
  const originalBall = ball.pos.clone();
  const { packet, field, prediction } = kamaelInput(car, ball, 120, pads, {});
  assert.deepEqual(field.boost_pads.flatMap((pad, index) => pad.is_full_boost ? [index] : []), [3, 4, 15, 18, 29, 30]);
  assert.deepEqual(packet.game_boosts[3], { is_active: false, timer: 7 });
  assert.deepEqual(pads.map(pad => [pad.x, pad.y]), positions);
  assert.ok(ball.pos.equals(originalBall));
  assert.equal(packet.game_info.world_gravity_z, -650);
  assert.equal(packet.game_info.seconds_elapsed, 1);
  assert.equal(prediction.slices[0].game_seconds, 1);
  assert.equal(packet.game_cars[0].hitbox.length, car.hitbox.size[0]);
  assert.ok(Math.abs(packet.game_cars[0].physics.rotation.yaw - Math.PI / 2) < 1e-6);
  assert.equal(prediction.num_slices, 360);
  assert.ok(prediction.slices.every(slice => Object.values(slice.physics.location).every(Number.isFinite)));
});

test("Kamael restart clears errors and rejects stale worker replies", () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = class {
    postMessage() {}
    terminate() {}
  };
  try {
    const bot = new KamaelBot(createSoccarBoostPads());
    bot.initialized = true;
    bot.errorMessage = "old run failure";
    bot.begin(makePhysCar(), makeBall());
    assert.equal(bot.errorMessage, null);
    bot.worker.onmessage({ data: { type: "error", generation: 0, message: "stale failure" } });
    assert.equal(bot.errorMessage, null);
    bot.worker.onmessage({ data: { type: "controls", generation: 0, controls: { throttle: 1 } } });
    assert.equal(bot.nextControls, null);
    bot.pending = true;
    bot.worker.onmessage({ data: { type: "error", generation: bot.generation, message: "current failure" } });
    assert.equal(bot.errorMessage, "current failure");
    assert.equal(bot.pending, false);
    bot.dispose();
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  }
});

test("Kamael advances real-time physics across frame rates while worker decisions are pending", () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = class {
    postMessage() {}
    terminate() {}
  };
  try {
    const results = [30, 60, 144].map(fps => {
      const car = makePhysCar(new Vector3(0, -2000, 17), Math.PI / 2, "octane");
      const ball = makeBall(new Vector3(3000, 3000, RL.BALL_REST_Z));
      const bot = new KamaelBot(createSoccarBoostPads());
      bot.begin(car, ball);
      const clock = new FixedStepClock();
      bot.advance(clock, 1 / fps, car, ball, () => assert.fail("loading must not advance physics"));
      bot.ready = true;
      bot.worker.onmessage({ data: { type: "controls", generation: bot.generation, controls: { ...idleControls(), throttle: 1 } } });
      for (let frame = 0; frame < fps; frame++) {
        bot.advance(clock, 1 / fps, car, ball, tickDt => {
          const controls = bot.controls();
          assert.equal(controls.throttle, 1);
          stepCarBall(car, ball, controls, bot.tick, tickDt);
          bot.observe(car, ball, controls);
        });
      }
      assert.equal(bot.tick, 120);
      assert.equal(bot.pending, true);
      assert.ok(car.pos.y > -1900);
      const result = { position: car.pos.toArray(), velocity: car.vel.toArray() };
      bot.reset();
      assert.deepEqual(bot.controls(), idleControls());
      bot.dispose();
      return result;
    });
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(results[1], results[2]);
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  }
});

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

test("mechanics bot sequences release jump before a dodge and cancels half flips", () => {
  const bot = new MechanicsBot();
  bot.startManeuver("Half flip");
  assert.equal(bot.maneuverControls().throttle, -1);
  assert.equal(bot.maneuverControls().jump, false);
  bot.tick = 48;
  assert.equal(bot.maneuverControls().jump, true);
  bot.tick = 56;
  assert.equal(bot.maneuverControls().jump, false);
  bot.tick = 60;
  assert.equal(bot.maneuverControls().pitch, 1);
  bot.tick = 88;
  assert.equal(bot.maneuverControls().pitch, -1);
  assert.equal(bot.maneuverControls().roll, 1);
  bot.tick = 240;
  assert.equal(bot.maneuverControls(), null);
  assert.equal(bot.maneuver, null);
});

test("wavedash waits for a descending near-floor airborne car before dodging", () => {
  const car = makePhysCar(new Vector3(0, 0, 100), 0, "octane");
  car.onGround = false;
  car.vel.z = -100;
  const bot = new MechanicsBot();
  bot.startManeuver("Wavedash");
  bot.tick = 30;
  assert.equal(bot.maneuverControls(car).jump, false);
  car.pos.z = 45;
  assert.equal(bot.maneuverControls(car).jump, true);
  assert.equal(bot.maneuverControls(car).pitch, -1);
  car.onGround = true;
  assert.equal(bot.maneuverControls(car).jump, false);
});

test("mechanics circuit records finite deterministic controls through driving and recovery", () => {
  const run = () => {
    const car = makePhysCar(new Vector3(0, -4608, 17), Math.PI / 2, "octane");
    const ball = makeBall(new Vector3(0, 0, RL.BALL_REST_Z));
    const bot = new MechanicsBot();
    bot.begin(car, ball);
    const actions = new Set();
    for (let tick = 0; tick < 1200; tick++) {
      const input = bot.controls(car, ball);
      assert.ok(Object.values(input).every(value => typeof value === "boolean" || Number.isFinite(value)));
      stepCarBall(car, ball, input, tick, RL.DT);
      bot.observe(car, ball, input);
      actions.add(bot.action);
      assert.ok(car.pos.toArray().every(Number.isFinite));
    }
    assert.ok(actions.has("Speed flip"));
    assert.ok([...actions].some(action => action.toLowerCase().includes("recovery")));
    return bot.recording.scenarios[0].control_schedule;
  };
  assert.deepEqual(run(), run());
});

test("mechanics bot attempts a flick only after sustained close carry", () => {
  const car = makePhysCar(new Vector3(0, 0, 17), 0, "octane");
  car.onGround = true;
  const ball = makeBall(new Vector3(0, 0, 150));
  const bot = new MechanicsBot();
  bot.mode = "dribble";
  bot.begin(car, ball);
  for (let tick = 0; tick < 91; tick++) {
    bot.controls(car, ball);
    bot.observe(car, ball, idleControls());
  }
  assert.equal(bot.maneuver.kind, "Flick");
  bot.reset();
  assert.equal(bot.carryTicks, 0);
  assert.equal(bot.mode, "dribble");
});

function idleControls() {
  return { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jump: false, handbrake: false };
}

test("mechanics land upright with the intended heading after an isolated maneuver", () => {
  for (const kind of ["Half flip", "Speed flip", "Wavedash"]) {
    const car = makePhysCar(new Vector3(0, 0, 17), 0, "octane");
    car.vel.x = kind === "Half flip" ? 0 : 800;
    const ball = makeBall(new Vector3(3000, 3000, RL.BALL_REST_Z));
    const bot = new MechanicsBot();
    bot.begin(car, ball);
    bot.startManeuver(kind);
    const heading = new Vector3(kind === "Half flip" ? -1 : 1, 0, 0);
    let landed = false;
    let airborne = false;
    let dodged = false;
    for (let tick = 0; tick < 240; tick++) {
      const controls = bot.maneuver ? bot.maneuverControls(car) : bot.recovery(car, car.pos.clone().add(heading), heading);
      stepCarBall(car, ball, controls ?? idleControls(), tick, RL.DT);
      bot.observe(car, ball, controls ?? idleControls());
      if (!car.onGround) airborne = true;
      if (car.hasFlipped) dodged = true;
      if (airborne && car.onGround) landed = true;
    }
    const up = new Vector3(0, 0, 1).applyQuaternion(car.q).z;
    const alignment = new Vector3(1, 0, 0).applyQuaternion(car.q).dot(heading);
    assert.ok(dodged, `${kind} must execute a dodge, not merely drive and land`);
    assert.ok(landed, `${kind} should return to its wheels`);
    assert.ok(up > 0.9, `${kind} upright: ${up}`);
    assert.ok(alignment > 0.85, `${kind} heading: ${alignment}`);
    assert.ok(car.vel.dot(heading) > 500, `${kind} should preserve useful forward speed`);
  }
});

test("a forward flick from a settled carry launches the ball upward and forward", () => {
  const car = makePhysCar(new Vector3(0, 0, 17), 0, "octane");
  car.vel.x = 700;
  const ball = makeBall(new Vector3(15, 0, 145));
  ball.vel.x = 700;
  const bot = new MechanicsBot();
  bot.begin(car, ball);
  bot.startManeuver("Flick");
  let peakVertical = 0;
  let peakForward = 0;
  for (let tick = 0; tick < 120; tick++) {
    const controls = bot.maneuverControls(car);
    stepCarBall(car, ball, controls ?? idleControls(), tick, RL.DT);
    bot.observe(car, ball, controls ?? idleControls());
    peakVertical = Math.max(peakVertical, ball.vel.z);
    peakForward = Math.max(peakForward, ball.vel.x);
  }
  assert.ok(peakVertical > 200, `flick vertical speed: ${peakVertical}`);
  assert.ok(peakForward > 800, `flick forward speed: ${peakForward}`);
});