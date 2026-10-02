import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RL, makePhysCar, makeBall, stepCar, stepCarBall } from "../../src/shared/carPhysics.js";
import { recentAttempts } from "../../src/shared/metrics.js";
import { classifyStaticContact, staticGateCrossing, generateStaticBallSetup, recordStaticBallSet, staticBallSummary } from "../../src/shared/staticBallTraining.js";
import { generateSoftBallSetup, recordSoftBallSet, softBallSummary } from "../../src/shared/softBallTraining.js";
import { generateRollTouchSetup, recordRollTouchSet, rollTouchSummary } from "../../src/shared/rollTouchTraining.js";
import { generateRecoverySetup, recordRecoverySet, recoverySummary } from "../../src/shared/recoveryTraining.js";
import { DrillCoach, coachingFault, resultCoaching } from "../../src/shared/drillCoach.js";
import { formatSpeed } from "../../src/shared/rl-units.js";

globalThis.window = { addEventListener() {}, innerWidth: 1024, innerHeight: 768 };
globalThis.document = { addEventListener() {} };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { getGamepads: () => [] } });
const { FreePlayMode } = await import("../../src/modes/freePlay.js");
const { ArenaDrillBase } = await import("../../src/shared/arenaDrill.js");
const { BallContactMode } = await import("../../src/modes/ballContact.js");
const { DribbleBridgeMode } = await import("../../src/modes/dribbleBridge.js");
const { RingsMode } = await import("../../src/modes/ringsMode.js");
const { MovementMode } = await import("../../src/modes/movement.js");
const { generateMovementSetup, MOVEMENT_TRAINING } = await import("../../src/shared/movementTraining.js");
const { readControls } = await import("../../src/shared/input.js");
const { DrillCoachView } = await import("../../src/shared/drillCoachView.js");

test("controller result confirmation is consumed until release instead of jumping on retry", () => {
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const originalGamepads = navigator.getGamepads;
  navigator.getGamepads = () => [pad];
  try {
    pad.buttons[0] = { pressed: true, value: 1 };
    let retries = 0;
    const view = Object.create(DrillCoachView.prototype);
    view.failure = { open: true, contains: () => false };
    view.retryButton = { click: () => { retries += 1; assert.equal(readControls().jump, false); view.failure.open = false; } };
    view.render({ id: "result-Keep the wheels down" });
    assert.equal(retries, 1);
    for (let tick = 0; tick < 120; tick++) assert.equal(readControls().jump, false);
    pad.buttons[0] = { pressed: false, value: 0 };
    assert.equal(readControls().jump, false);
    pad.buttons[0] = { pressed: true, value: 1 };
    assert.equal(readControls().jump, true);
  } finally {
    navigator.getGamepads = originalGamepads;
  }
});

test("player-facing speeds convert centimetres per second to km/h", () => {
  assert.equal(formatSpeed(0), "0.0 km/h");
  assert.equal(formatSpeed(180), "6.5 km/h");
  assert.equal(formatSpeed(500), "18.0 km/h");
  assert.equal(formatSpeed(1600), "57.6 km/h");
  assert.equal(formatSpeed(2300), "82.8 km/h");
});

test("drills wait for fresh gameplay input without advancing physics or attempt time", () => {
  for (const [Mode, variant] of [[MovementMode, "driving"], [BallContactMode, "soft"], [BallContactMode, "rollTouch"], [BallContactMode, "recovery"], [DribbleBridgeMode, "hover"]]) {
    const mode = drillState(Mode, variant);
    mode.pads = [];
    mode.tick = 0;
    mode.carMesh = new THREE.Group();
    mode.ballVisual = new THREE.Group();
    mode.ballSpin = new THREE.Vector3();
    mode.ballSpinRotation = new THREE.Quaternion();
    mode.awaitingInput = true;
    mode.inputReady = false;
    const position = mode.physCar.pos.clone();
    const velocity = mode.physCar.vel.clone();
    const ballPosition = mode.physBall?.pos.clone();
    for (let tick = 0; tick < 240; tick++) mode._stepOnce(RL.DT, { jump: true });
    assert.equal(mode.elapsed, 0);
    assert.deepEqual(mode.physCar.pos, position);
    for (let tick = 0; tick < 240; tick++) mode._stepOnce(RL.DT, { lookRight: 1, usingPad: true });
    assert.equal(mode.elapsed, 0);
    assert.deepEqual(mode.physCar.pos, position);
    assert.deepEqual(mode.physCar.vel, velocity);
    assert.deepEqual(mode.physBall?.pos, ballPosition);
    mode._stepOnce(RL.DT, { throttle: 1 });
    assert.equal(mode.awaitingInput, false);
    assert.equal(mode.elapsed, RL.DT);
  }
});

test("completed drills slow smoothly then stay frozen despite held inputs", () => {
  for (const practiceRetry of [false, true]) {
    const mode = drillState(MovementMode, "driving");
    mode.practiceRetry = practiceRetry;
    mode.physCar.vel.set(500, 1000, 200);
    mode.physCar.omega.set(1, 2, 3);
    mode.physCar.isBoosting = true;
    mode.boosting = true;
    const position = mode.physCar.pos.clone();
    mode.finishRound(true, "Target reached");
    assert.ok(mode.physCar.vel.length() > 1000);
    assert.equal(mode.boosting, false);
    mode._stepOnce(RL.DT, { throttle: 1, boost: true, jump: true });
    assert.ok(mode.physCar.vel.length() > 0);
    assert.ok(mode.physCar.vel.length() < 1100);
    assert.equal(mode.physCar.isBoosting, false);
    for (let tick = 0; tick < 60; tick++) mode._stepOnce(RL.DT, { throttle: 1, boost: true, jump: true });
    assert.ok(mode.physCar.pos.distanceTo(position) < 150);
    assert.equal(mode.physCar.vel.lengthSq(), 0);
    assert.equal(mode.physCar.omega.lengthSq(), 0);
    const stoppedPosition = mode.physCar.pos.clone();
    const stoppedOrientation = mode.physCar.q.clone();
    for (let tick = 0; tick < 120; tick++) mode._stepOnce(RL.DT, { throttle: 1, boost: true, jump: true });
    assert.deepEqual(mode.physCar.pos, stoppedPosition);
    assert.deepEqual(mode.physCar.q, stoppedOrientation);
    assert.equal(mode.physCar.vel.lengthSq(), 0);
    assert.ok(mode.resultTime >= 0.99);
  }
});

test("drill countdown follows attempt time, warns near timeout and clamps at zero", () => {
  const mode = drillState(MovementMode, "driving");
  mode.countdown = { dataset: {} };
  mode.countdownValue = {};
  mode.ctx = { hud: { status: {} } };
  mode.setScoreRow = () => {};
  for (const [elapsed, result, value, state] of [
    [0, null, "15.0 s", "running"],
    [10, null, "5.0 s", "urgent"],
    [15.1, { success: false }, "0.0 s", "finished"],
    [0, null, "15.0 s", "running"],
  ]) {
    mode.elapsed = elapsed;
    mode.result = result;
    ArenaDrillBase.prototype.updateDrillStatus.call(mode);
    assert.equal(mode.countdownValue.textContent, value);
    assert.equal(mode.countdown.dataset.state, state);
  }
});

test("timeout feedback stays unchanged throughout the result pause", () => {
  for (const practiceRetry of [false, true]) {
    const mode = drillState(MovementMode, "driving");
    mode.practiceRetry = practiceRetry;
    const coach = new DrillCoach();
    coach.update(mode, {}, RL.DT, "Reach the target");
    coach.current = { id: "lane", title: "Stay in the lane", detail: "Steer toward the centre.", priority: 4 };
    mode.result = { success: false, message: "Time expired" };
    const feedback = coach.update(mode, {}, RL.DT, "Reach the target");
    for (let tick = 0; tick < 600; tick++) {
      assert.equal(coach.update(mode, {}, RL.DT, "Reach the target"), feedback);
    }
    assert.equal(feedback.detail, "At the end of the attempt: Steer toward the centre.");
    mode.setup = { ...mode.setup };
    mode.result = null;
    assert.equal(coach.update(mode, {}, 0, "Reach the target").id, "action-drive");
  }
});

test("coach identifies measured faults and does not mutate physics or scoring", () => {
  const mode = drillState(MovementMode, "driving");
  mode.physCar.pos.x = 120;
  const before = { pos: mode.physCar.pos.toArray(), vel: mode.physCar.vel.toArray(), q: mode.physCar.q.toArray(), result: mode.result, hits: mode.hits };
  assert.equal(coachingFault(mode, {}).id, "lane");
  const coach = new DrillCoach();
  for (let tick = 0; tick < 20; tick++) coach.update(mode, {}, RL.DT, "Drive to target");
  assert.equal(coach.current, null);
  for (let tick = 0; tick < 4; tick++) coach.update(mode, {}, RL.DT, "Drive to target");
  assert.equal(coach.current.id, "lane");
  assert.deepEqual({ pos: mode.physCar.pos.toArray(), vel: mode.physCar.vel.toArray(), q: mode.physCar.q.toArray(), result: mode.result, hits: mode.hits }, before);
  mode.physCar.pos.x = 0;
  mode.masteryStep = 2;
  mode.setupRound();
  mode.physCar.pos.y = mode.setup.targets[0][1] - 600;
  for (let tick = 0; tick < 24; tick++) coach.update(mode, {}, RL.DT, "Boost");
  assert.equal(coach.current.id, "boost");
  mode.physCar.isBoosting = true;
  for (let tick = 0; tick < 65; tick++) coach.update(mode, {}, RL.DT, "Boost");
  assert.equal(coach.current, null);
});

test("coach differentiates steering, jump, roll, reception and result faults", () => {
  const driving = drillState(MovementMode, "driving");
  driving.masteryStep = 1;
  driving.physCar.q.identity();
  driving.setup.targets = [[0, 1000, 0]];
  assert.equal(coachingFault(driving, { steer: -1, throttle: 1 }).id, "wrong-turn");
  const jump = drillState(MovementMode, "dodges");
  jump.masteryStep = 1;
  jump.jumped = true;
  jump.jumpHold = 0.1;
  jump.physCar.vel.z = 100;
  assert.equal(coachingFault(jump, { jump: false }).id, "short-hold");
  jump.masteryStep = 2;
  assert.equal(coachingFault(jump, { pitch: 1 }).id, "neutral");
  const roll = drillState(BallContactMode, "rollTouch");
  roll.physCar.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  roll.physCar.omega.set(0, 1, 0);
  assert.equal(coachingFault(roll, { roll: 1 }).id, "over-roll");
  assert.notEqual(coachingFault(roll, { roll: -1 })?.id, "over-roll");
  const soft = drillState(BallContactMode, "soft");
  soft.masteryStep = 1;
  soft.firstTouchTime = 1;
  soft.physBall.pos.copy(soft.physCar.pos).add(new THREE.Vector3(0, 350, 0));
  assert.equal(coachingFault(soft, {}).id, "separation");
  soft.result = { success: false, message: "Not cushioned enough" };
  soft.receivedSpeed = 700;
  soft.incomingSpeed = 1000;
  assert.match(resultCoaching(soft, "Cushion").value, /limit 21\.6 km\/h/);
  jump.result = { success: false, message: "Wrong dodge direction" };
  jump.setup.dodge = "left";
  assert.equal(resultCoaching(jump, "Dodge").value, "Requested: left");
});

test("turn guidance matches steering direction and stays primary at speed", () => {
  for (const direction of [-1, 1]) {
    const mode = drillState(MovementMode, "driving");
    mode.masteryStep = 1;
    mode.setupRound();
    mode.physCar.q.identity();
    mode.physCar.onGround = true;
    mode.setup.targets = [[1000, direction * 1000, 0]];
    mode.physCar.vel.set(1000, 0, 0);
    const title = direction > 0 ? "Turn right toward the target" : "Turn left toward the target";
    for (const steer of [0, direction, -direction]) {
      const feedback = coachingFault(mode, { throttle: 1, steer });
      assert.equal(feedback.title, title);
      assert.match(feedback.detail, /Ease off/);
      assert.equal(feedback.id, steer === -direction ? "wrong-turn" : "turn-direction");
    }
    for (let tick = 0; tick < 30; tick++) stepCar(mode.physCar, { throttle: 1, steer: direction }, RL.DT);
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(mode.physCar.q);
    assert.ok(forward.y * direction > 0.05, "The advised steering turns toward the target side");
    mode.physCar.pos.fromArray(mode.setup.targets[0]).setZ(mode.hitbox.restZ);
    assert.equal(coachingFault(mode, { throttle: 1 }), null, "No turn cue inside the target");
  }
});

test("all thirty Foundations stages provide coaching and repeated misses inform retries", () => {
  for (const variant of ["driving", "dodges", "static", "soft", "rollTouch", "recovery"]) for (let stage = 0; stage < 5; stage++) {
    const mode = drillState(["driving", "dodges"].includes(variant) ? MovementMode : BallContactMode, variant);
    mode.masteryStep = stage;
    mode.setupRound();
    mode.coach = new DrillCoach();
    mode.refreshCoaching({}, 0);
    assert.ok(mode.coaching.id.startsWith("action-"), `${variant}/${stage}`);
    assert.ok(mode.coaching.detail && !mode.coaching.detail.includes("undefined"), `${variant}/${stage}`);
  }
  const mode = drillState(MovementMode, "driving");
  const coach = new DrillCoach();
  for (let attempt = 0; attempt < 2; attempt++) {
    mode.setup = { ...mode.setup };
    mode.result = { success: false, message: "Left the lane" };
    coach.update(mode, {}, RL.DT, "Drive");
  }
  mode.setup = { ...mode.setup };
  mode.result = null;
  mode.elapsed = 0;
  assert.equal(coach.update(mode, {}, 0, "Drive").id, "repeat");
});

test("live instructions advance through jump, touch, reception and recovery phases", () => {
  const instruction = (mode, controls = {}) => new DrillCoach().update(mode, controls, 0, "Stage objective");
  const dodge = drillState(MovementMode, "dodges");
  dodge.masteryStep = 2;
  dodge.setupRound();
  assert.equal(instruction(dodge).id, "action-jump");
  dodge.jumped = true;
  assert.equal(instruction(dodge, { jump: true }).id, "action-release");
  assert.equal(instruction(dodge).id, "action-second-jump");
  dodge.doubleJumped = true;
  assert.equal(instruction(dodge).id, "action-land");
  const touch = drillState(BallContactMode, "static");
  touch.masteryStep = 4;
  touch.setupRound();
  assert.equal(instruction(touch).id, "action-contact");
  touch.touches = 1;
  assert.equal(instruction(touch).id, "action-watch");
  touch.gateHit = true;
  assert.equal(instruction(touch).id, "action-follow");
  const soft = drillState(BallContactMode, "soft");
  soft.masteryStep = 4;
  soft.setupRound();
  assert.equal(instruction(soft).id, "action-receive");
  soft.firstTouchTime = 1;
  assert.equal(instruction(soft).id, "action-cushion");
  soft.receptionReady = true;
  assert.equal(instruction(soft).id, "action-next-touch");
  soft.masteryStep = 2;
  assert.equal(instruction(soft).id, "action-exit");
  const recovery = drillState(BallContactMode, "recovery");
  recovery.masteryStep = 4;
  recovery.setupRound();
  assert.equal(instruction(recovery).id, "action-roll-touch");
  recovery.firstTouchTime = 1;
  assert.equal(instruction(recovery).id, "action-recover");
  recovery.landingTime = 2;
  recovery.physCar.onGround = true;
  assert.equal(instruction(recovery).id, "action-drive-out");
});

test("all movement stages complete using ordinary shared physics inputs", () => {
  for (const variant of ["driving", "dodges"]) for (const repetition of variant === "driving" ? [-1, 0, 1, 2, 6, 12, 18, 54] : [-1, 0, 1, 2]) for (let stage = 0; stage < 5; stage++) {
    const mode = drillState(MovementMode, variant);
    mode.masteryStep = stage;
    mode.varied = repetition !== -1;
    mode.retrySetup = generateMovementSetup(variant, stage, mode.varied, Math.max(0, repetition), () => repetition === 1 ? 1 : 0);
    mode.setupRound();
    for (let tick = 0; tick < 1800 && !mode.result; tick++) {
      let controls;
      if (variant === "driving") {
        const target = new THREE.Vector3(...mode.setup.targets[mode.nextTarget]);
        const delta = target.sub(mode.physCar.pos).setZ(0);
        const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(mode.physCar.q);
        const error = Math.atan2(forward.x * delta.y - forward.y * delta.x, forward.x * delta.x + forward.y * delta.y);
        const speed = Math.hypot(mode.physCar.vel.x, mode.physCar.vel.y);
        controls = { steer: THREE.MathUtils.clamp(error * 3, -1, 1), throttle: stage === 3 ? (mode.physCar.pos.y < mode.setup.targets[0][1] - speed * speed / 7000 - 90 ? 1 : speed > 80 ? -1 : 0) : Math.abs(error) > 0.6 ? 0.3 : 1, boost: stage === 2 };
      } else {
        const second = tick === 45;
        controls = { jump: tick >= 5 && tick < (stage === 0 ? 6 : 29) || stage >= 2 && second, pitch: stage >= 3 && second ? mode.setup.dodge === "forward" ? -1 : mode.setup.dodge === "backward" ? 1 : 0 : 0, yaw: stage === 4 && second ? mode.setup.dodge === "right" ? 1 : mode.setup.dodge === "left" ? -1 : 0 : 0 };
      }
      stepCar(mode.physCar, controls, RL.DT);
      mode.onPhysicsStep(RL.DT, controls, null);
    }
    assert.equal(mode.result?.success, true, `${variant}/${stage}/${repetition}: ${mode.result?.message}, height=${mode.maxHeight}, pos=${mode.physCar.pos.toArray()}`);
    assert.equal(mode.physBall, null);
  }
});

test("turning targets accept angled arrivals while requiring steering and wheels-down entry", () => {
  for (const heading of [-Math.PI / 4, 0, Math.PI / 4, Math.PI]) {
    const mode = drillState(MovementMode, "driving");
    mode.masteryStep = 1;
    mode.setupRound();
    mode.physCar.pos.fromArray(mode.setup.targets[0]).setZ(mode.hitbox.restZ);
    mode.physCar.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), heading);
    mode.physCar.onGround = true;
    mode.evaluateDriving(RL.DT, {});
    assert.equal(mode.result, null, "Steering is still required");
    mode.steerTime = 0.1;
    mode.physCar.onGround = false;
    mode.evaluateDriving(RL.DT, {});
    assert.equal(mode.result, null, "Airborne entry does not count");
    mode.physCar.onGround = true;
    mode.evaluateDriving(RL.DT, {});
    assert.equal(mode.nextTarget, 1, `Arrival heading ${heading}`);
  }
});

test("boost target fails slow entry and accepts the minimum arrival speed", () => {
  for (const speed of [0, 80 / 0.036 - 1, 80 / 0.036, 2300]) {
    const mode = drillState(MovementMode, "driving");
    mode.masteryStep = 2;
    mode.setupRound();
    mode.boostTime = 0.8;
    mode.physCar.isBoosting = true;
    mode.physCar.onGround = true;
    mode.physCar.vel.set(0, speed, 0);
    mode.physCar.pos.fromArray(mode.setup.targets[0]).setZ(mode.hitbox.restZ);
    mode.physCar.pos.y -= mode.setup.targetRadius + 1;
    mode.evaluateDriving(RL.DT, {});
    assert.equal(mode.result, null, "Slow approaches outside the target are allowed");
    mode.physCar.pos.y += 1;
    mode.evaluateDriving(RL.DT, {});
    if (speed >= 80 / 0.036) {
      assert.equal(mode.result, null);
      assert.equal(mode.nextTarget, 1, `Arrival speed ${speed}`);
    } else assert.equal(mode.result?.success, false, `Arrival speed ${speed}`);
    if (speed < 80 / 0.036) assert.equal(mode.result.message, "Entered target too slowly");
  }
});

test("five-target driving routes only complete after the fifth ordered checkpoint", () => {
  for (const stage of [1, 2]) {
    const mode = drillState(MovementMode, "driving");
    mode.masteryStep = stage;
    mode.setupRound();
    assert.equal(mode.setup.targets.length, 5);
    mode.physCar.onGround = true;
    mode.physCar.isBoosting = stage === 2;
    mode.physCar.vel.set(0, mode.setup.minSpeed, 0);
    mode.boostTime = 1;
    mode.steerTime = 0.1;
    for (const [checkpoint, target] of mode.setup.targets.entries()) {
      mode.physCar.pos.fromArray(target).setZ(mode.hitbox.restZ);
      mode.evaluateDriving(RL.DT, {});
      assert.equal(mode.nextTarget, checkpoint + 1);
      if (checkpoint < 4) assert.equal(mode.result, null);
      else assert.equal(mode.result?.success, true);
    }
  }
});

test("revised driving rejects slow entries, token boost and skipped checkpoints", () => {
  for (const [stage, prepare, message] of [
    [0, mode => { mode.physCar.pos.fromArray(mode.setup.targets[0]); }, "Entered target too slowly"],
    [2, mode => { mode.physCar.pos.fromArray(mode.setup.targets[0]); mode.physCar.vel.set(0, mode.setup.minSpeed, 0); mode.boostTime = 0.79; }, "Not enough boost"],
    [2, mode => { mode.physCar.pos.x = 141; }, "Left the lane"],
    [2, mode => { mode.physCar.pos.fromArray(mode.setup.targets[1]); }, "Skipped checkpoint"],
    [2, mode => { mode.physCar.pos.fromArray(mode.setup.targets[0]); mode.physCar.vel.set(0, mode.setup.minSpeed, 0); mode.boostTime = 1; }, "Boost through each target"],
    [1, mode => { mode.physCar.pos.fromArray(mode.setup.targets[1]); }, "Skipped checkpoint"],
    [4, mode => { mode.physCar.pos.fromArray(mode.setup.targets[0]); mode.physCar.vel.set(0, 649, 0); }, "Entered target too slowly"],
    [4, mode => { mode.physCar.isBoosting = true; }, "Throttle only"],
  ]) {
    const mode = drillState(MovementMode, "driving");
    mode.masteryStep = stage;
    mode.setupRound();
    mode.physCar.onGround = true;
    prepare(mode);
    mode.evaluateDriving(RL.DT, {});
    assert.equal(mode.result?.message, message);
    assert.equal(mode.result?.success, false);
  }
});

test("high-speed stop requires a continuous half-second precise hold", () => {
  const mode = drillState(MovementMode, "driving");
  mode.masteryStep = 3;
  mode.setupRound();
  assert.equal(mode.physCar.vel.y, 50 / 0.036);
  mode.physCar.pos.fromArray(mode.setup.targets[0]);
  mode.physCar.onGround = true;
  mode.physCar.vel.set(0, 0, 0);
  for (let tick = 0; tick < 59; tick++) mode.evaluateDriving(RL.DT, { throttle: -1 });
  assert.equal(mode.result, null);
  mode.physCar.pos.x = 101;
  mode.evaluateDriving(RL.DT, {});
  assert.equal(mode.hold, 0);
  mode.physCar.pos.x = 0;
  for (let tick = 0; tick < 60; tick++) mode.evaluateDriving(RL.DT, {});
  assert.equal(mode.result?.success, true);
});

test("movement rejects unwanted actions and preserves full retry setups and separate mastery", () => {
  for (const [variant, stage, prepare, label] of [
    ["driving", 0, mode => { mode.physCar.isBoosting = true; }, "Throttle only"],
    ["driving", 0, mode => { mode.physCar.pos.x = 181; }, "Left the lane"],
    ["dodges", 0, mode => { mode.physCar.hasDoubleJumped = true; }, "Single jump only"],
    ["dodges", 2, mode => { mode.physCar.hasFlipped = true; }, "Neutral second jump required"],
  ]) {
    const mode = drillState(MovementMode, variant);
    mode.masteryStep = stage;
    mode.setupRound();
    prepare(mode);
    mode.evaluateStep(RL.DT, {});
    assert.equal(mode.result.message, label);
  }
  for (const variant of ["driving", "dodges"]) {
    assert.deepEqual(generateMovementSetup(variant, 4, false, 0), generateMovementSetup(variant, 4, false, 8));
    const mode = drillState(MovementMode, variant);
    const setup = structuredClone(mode.setup);
    mode.finishRound(false, "Miss");
    mode.retrySetup = setup;
    mode.practiceRetry = true;
    mode.setupRound();
    assert.deepEqual(mode.setup, setup);
    mode.result = null;
    mode.finishRound(true, "Retry");
    assert.equal(mode.setAttempts.length, 1);
    const attempts = Array.from({ length: 10 }, (_, index) => ({ success: index < 8, label: "Miss" }));
    MOVEMENT_TRAINING[variant].history.record(0, false, attempts);
    MOVEMENT_TRAINING[variant].history.record(0, false, attempts);
    assert.equal(MOVEMENT_TRAINING[variant].history.summary(0, false).mastered, true);
    assert.equal(MOVEMENT_TRAINING[variant].history.summary(0, true).mastered, false);
  }
});

function drillState(Mode, variant) {
  const mode = Object.create(Mode.prototype);
  Object.assign(mode, {
    variant, hitbox: makePhysCar().hitbox, upAxis: new THREE.Vector3(),
    startPosition: new THREE.Vector3(), hits: 0, streak: 0, best: 0,
    elapsed: 0, touches: 0, contactHeld: false, result: null, resultTime: 0,
    roundLimit: 15, modeId: `test-${variant}`,
  });
  mode.setupRound();
  return mode;
}

function rollContactState(step, options = {}) {
  const mode = drillState(BallContactMode, "rollTouch");
  mode.masteryStep = step;
  mode.physCar.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  mode.rollInput = 0.1;
  mode.rollTravel = 0.2;
  mode.elapsed = 0.5;
  mode.touches = 1;
  mode.stepContact = { normal: new THREE.Vector3(0, 1, 0) };
  Object.assign(mode, options);
  return mode;
}

test("roll stages reject missing roll, grounded, tilted and wrong-face contacts", () => {
  for (const [step, prepare, label] of [
    [0, mode => { mode.rollInput = 0; }, "No deliberate air roll"],
    [0, mode => { mode.rollTravel = 0; }, "No deliberate air roll"],
    [0, mode => { mode.physCar.onGround = true; }, "Grounded contact"],
    [1, mode => { mode.physCar.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); }, "Touch before alignment"],
    [2, mode => { mode.stepContact.normal.set(1, 0, 0); }, "Side contact"],
  ]) {
    const mode = rollContactState(step);
    prepare(mode);
    mode.evaluateStep(RL.DT, {}, true);
    assert.equal(mode.result.message, label);
    assert.equal(mode.result.success, false);
  }
  for (const step of [0, 1, 2]) {
    const mode = rollContactState(step);
    mode.evaluateStep(RL.DT, {}, true);
    assert.equal(mode.result.success, true);
  }
});

test("roll release samples total ball speed after contact and enforces the pace band", () => {
  for (const speed of [299, 300, 900, 901]) {
    const mode = rollContactState(3);
    mode.physBall.vel.set(speed, 0, 0);
    mode.evaluateStep(RL.DT, {}, true);
    assert.equal(mode.result, null);
    mode.elapsed += 0.1;
    mode.evaluateStep(RL.DT, {}, false);
    assert.equal(mode.result.success, speed >= 300 && speed <= 900);
  }
});

test("all roll stages complete through shared physics with ordinary roll inputs", () => {
  for (const step of [0, 1, 2, 3, 4]) {
    const mode = drillState(BallContactMode, "rollTouch");
    mode.masteryStep = step;
    mode.varied = false;
    mode.setupRound();
    for (let tick = 0; tick < 1801 && !mode.result; tick++) {
      const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(mode.physCar.q);
      const up = new THREE.Vector3(0, 0, 1).applyQuaternion(mode.physCar.q);
      const angle = Math.atan2(up.x, up.z);
      const axial = mode.physCar.omega.dot(forward);
      const controls = { roll: THREE.MathUtils.clamp(angle * 8 + axial * 0.8, -1, 1), throttle: 0 };
      mode.onPhysicsStep(RL.DT, controls, stepCarBall(mode.physCar, mode.physBall, controls, tick, RL.DT));
    }
    assert.equal(mode.result?.success, true, `${step}: ${mode.result?.message}`);
    assert.equal(mode.touches, 1);
  }
});

test("roll recovery requires sustained upright landing and rejects extra or late contacts", () => {
  const mode = rollContactState(4);
  mode.physBall.vel.set(450, 0, 0);
  mode.evaluateStep(RL.DT, {}, true);
  mode.elapsed += 0.1;
  mode.evaluateStep(RL.DT, {}, false);
  mode.physCar.onGround = true;
  mode.physCar.omega.set(0, 0, 0);
  for (let tick = 0; tick < 41; tick++) { mode.elapsed += RL.DT; mode.evaluateStep(RL.DT, {}, false); }
  assert.equal(mode.result, null);
  mode.elapsed += RL.DT;
  mode.evaluateStep(RL.DT, {}, false);
  assert.equal(mode.result.success, true);
  const late = rollContactState(4);
  late.physBall.vel.set(450, 0, 0);
  late.evaluateStep(RL.DT, {}, true);
  late.elapsed += 3;
  late.evaluateStep(RL.DT, {}, false);
  assert.equal(late.result.message, "Recovery timeout");
  const extra = rollContactState(3);
  extra.touches = 2;
  extra.evaluateStep(RL.DT, {}, true);
  assert.equal(extra.result.message, "Extra touch");
});

test("roll setups and histories preserve fixed repetitions, bounded variation and unscored retries", () => {
  assert.deepEqual(generateRollTouchSetup(2, false, 0), generateRollTouchSetup(2, false, 4));
  for (let index = 0; index < 30; index++) {
    const setup = generateRollTouchSetup(4, true, index);
    assert(setup.position.every(Number.isFinite));
    assert(Math.hypot(...setup.position.slice(0, 2)) >= 350 - 1e-9);
    assert(Math.hypot(...setup.position.slice(0, 2)) <= 450 + 1e-9);
    assert(setup.position[2] >= 550 && setup.position[2] <= 650);
  }
  const mode = drillState(BallContactMode, "rollTouch");
  mode.finishRound(false, "Touch before alignment");
  const saved = structuredClone(mode.setup);
  mode.resetState = function () { this.result = null; this.setupRound(); };
  mode.retrySameSetup();
  assert.deepEqual(mode.setup, saved);
  mode.finishRound(true, "Aligned aerial touch");
  assert.equal(mode.setAttempts.length, 1);
  assert.equal(mode.result.message, "Practice: Aligned aerial touch");
  const softBefore = softBallSummary(4, false).sets.length;
  recordRollTouchSet(4, false, Array.from({ length: 10 }, () => ({ success: true })));
  recordRollTouchSet(4, false, Array.from({ length: 10 }, () => ({ success: true })));
  assert.equal(rollTouchSummary(4, false).mastered, true);
  assert.equal(softBallSummary(4, false).sets.length, softBefore);
});

test("arena drills share the completion guard and Free Play rendering, camera and input path", () => {
  for (const Mode of [BallContactMode, DribbleBridgeMode, RingsMode]) {
    assert(Mode.prototype instanceof ArenaDrillBase);
    assert.equal(Mode.prototype._stepOnce, ArenaDrillBase.prototype._stepOnce);
    for (const method of ["syncMeshes", "updateCamera", "pollUtilityKeys", "updateBoostMeter"]) {
      assert.equal(Mode.prototype[method], FreePlayMode.prototype[method], method);
    }
  }
});

test("a drill tick matches direct shared car-ball physics without modifying impulses", () => {
  const mode = drillState(BallContactMode, "recovery");
  mode.masteryStep = 3;
  mode.setupRound();
  const car = makePhysCar(mode.physCar.pos.clone(), Math.PI / 2, mode.hitbox);
  car.id = 1;
  car.boost = mode.physCar.boost;
  car.onGround = false;
  car.vel.copy(mode.physCar.vel);
  car.q.copy(mode.physCar.q);
  const ball = makeBall(mode.physBall.pos.clone());
  ball.vel.copy(mode.physBall.vel);
  const input = { throttle: 0.5, pitch: 0.2, yaw: -0.1, roll: 0.4, boost: true };
  for (let tick = 0; tick < 40; tick++) {
    stepCarBall(car, ball, input, tick, RL.DT);
    const contact = stepCarBall(mode.physCar, mode.physBall, input, tick, RL.DT);
    mode.onPhysicsStep(RL.DT, input, contact);
    for (const key of ["pos", "vel", "q", "omega"]) assert.deepEqual(mode.physCar[key], car[key]);
    for (const key of ["pos", "vel", "omega"]) assert.deepEqual(mode.physBall[key], ball[key]);
  }
});

test("stationary drill is reachable through actual driving and contacts", () => {
  for (const variant of ["static"]) {
    const mode = drillState(BallContactMode, variant);
    for (let tick = 0; tick < 600 && !mode.result; tick++) {
      const controls = { throttle: variant === "soft" ? 0.25 : 1 };
      const contact = stepCarBall(mode.physCar, mode.physBall, controls, tick, RL.DT);
      mode.onPhysicsStep(RL.DT, controls, contact);
    }
    assert(mode.result?.success, `${variant}: ${mode.result?.message ?? "no contact"}`);
    assert.equal(mode.touches, 1);
  }
});

test("recovery needs a real landing and sustained wheels-down state", () => {
  const mode = drillState(BallContactMode, "recovery");
  mode.touches = 1;
  for (let tick = 0; tick < 50; tick++) mode.evaluateStep(RL.DT, {}, false);
  assert.equal(mode.result, null);
  mode.physCar.onGround = true;
  mode.physCar.omega.set(0, 0, 0);
  mode.physCar.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  for (let tick = 0; tick < 43; tick++) { mode.elapsed += RL.DT; mode.evaluateStep(RL.DT, {}, false); }
  assert(mode.result?.success);
});

test("all recovery stages complete through ordinary roll and throttle inputs", () => {
  for (const step of [0, 1, 2, 3, 4]) {
    const mode = drillState(BallContactMode, "recovery");
    mode.masteryStep = step;
    mode.varied = false;
    mode.setupRound();
    for (let tick = 0; tick < 1801 && !mode.result; tick++) {
      const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(mode.physCar.q);
      const up = new THREE.Vector3(0, 0, 1).applyQuaternion(mode.physCar.q);
      const controls = { roll: THREE.MathUtils.clamp(Math.atan2(up.x, up.z) * 8 + mode.physCar.omega.dot(forward) * 0.8, -1, 1), throttle: mode.physCar.onGround ? 1 : 0 };
      const contact = mode.physBall ? stepCarBall(mode.physCar, mode.physBall, controls, tick, RL.DT) : (stepCar(mode.physCar, controls, RL.DT), null);
      mode.onPhysicsStep(RL.DT, controls, contact);
    }
    assert.equal(mode.result?.success, true, `${step}: ${mode.result?.message}`);
    assert.equal(mode.touches, step >= 3 ? 1 : 0);
    assert.equal(Boolean(mode.physBall), step >= 3);
  }
});

test("ball-free stages have no ball and contact stages restore it", () => {
  const mode = drillState(BallContactMode, "recovery");
  assert.equal(mode.physBall, null);
  assert.equal(mode.setup.ballPosition, null);
  mode.masteryStep = 3;
  mode.setupRound();
  assert(mode.physBall);
  mode.masteryStep = 2;
  mode.setupRound();
  assert.equal(mode.physBall, null);
  const rings = Object.create(RingsMode.prototype);
  Object.assign(rings, { hitbox: mode.hitbox, previousPosition: new THREE.Vector3(), rings: [] });
  rings.setupRound();
  assert.equal(rings.physBall, null);
});

test("recovery hold resets on instability and rejects slow or wrong-facing landings", () => {
  const mode = drillState(BallContactMode, "recovery");
  mode.masteryStep = 1;
  mode.physCar.onGround = true;
  mode.physCar.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  mode.physCar.omega.set(0, 0, 0);
  for (let tick = 0; tick < 41; tick++) { mode.elapsed += RL.DT; mode.evaluateStep(RL.DT, {}, false); }
  assert.equal(mode.result, null);
  mode.physCar.omega.z = 0.6;
  mode.elapsed += RL.DT;
  mode.evaluateStep(RL.DT, {}, false);
  assert.equal(mode.recoverHold, 0);
  mode.physCar.omega.z = 0;
  for (const velocity of [[0, 299, 0], [0, -450, 0]]) {
    mode.physCar.vel.fromArray(velocity);
    mode.elapsed += RL.DT;
    mode.evaluateStep(RL.DT, {}, false);
    assert.equal(mode.recoverHold, 0);
  }
  mode.elapsed = 4.01;
  mode.evaluateStep(RL.DT, {}, false);
  assert.equal(mode.result.message, "Landing timeout");
});

test("recovery touch and exit reject ground contacts, extra touches and late exits", () => {
  for (const [grounded, touches, label] of [[true, 1, "Grounded contact"], [false, 2, "Extra touch"]]) {
    const mode = drillState(BallContactMode, "recovery");
    mode.masteryStep = 4;
    mode.touches = touches;
    mode.physCar.onGround = grounded;
    mode.evaluateStep(RL.DT, {}, true);
    assert.equal(mode.result.message, label);
  }
  const mode = drillState(BallContactMode, "recovery");
  mode.masteryStep = 2;
  mode.landingTime = 1;
  mode.landingOrigin = mode.physCar.pos.clone();
  mode.exitDirection = new THREE.Vector3(0, 1, 0);
  mode.elapsed = 2.51;
  mode.evaluateStep(RL.DT, {}, false);
  assert.equal(mode.result.message, "Exit timeout");
  const missing = drillState(BallContactMode, "recovery");
  missing.masteryStep = 3;
  missing.elapsed = 15;
  missing.evaluateStep(RL.DT, {}, false);
  assert.equal(missing.result.message, "No contact");
});

test("recovery setups, retry and history remain bounded and isolated", () => {
  assert.deepEqual(generateRecoverySetup(4, false, 0), generateRecoverySetup(4, false, 9));
  for (let index = 0; index < 30; index++) {
    const setup = generateRecoverySetup(4, true, index);
    assert(setup.position.every(Number.isFinite));
    assert(setup.position[2] >= 550 && setup.position[2] <= 650);
    assert(Math.hypot(...setup.carVelocity) >= 400 && Math.hypot(...setup.carVelocity) <= 500);
    assert.equal(Math.sign(setup.roll), index % 2 ? -1 : 1);
  }
  const mode = drillState(BallContactMode, "recovery");
  mode.finishRound(false, "Landing timeout");
  const setup = structuredClone(mode.setup);
  mode.resetState = function () { this.result = null; this.setupRound(); };
  mode.retrySameSetup();
  assert.deepEqual(mode.setup, setup);
  mode.finishRound(true, "Stable landing complete");
  assert.equal(mode.setAttempts.length, 1);
  const before = rollTouchSummary(1, false).sets.length;
  const attempts = Array.from({ length: 10 }, (_, index) => ({ success: index < 8, label: "Landing timeout" }));
  recordRecoverySet(1, false, attempts);
  recordRecoverySet(1, false, attempts);
  assert.equal(recoverySummary(1, false).mastered, true);
  assert.equal(rollTouchSummary(1, false).sets.length, before);
  recordRecoverySet(1, false, attempts.map((attempt, index) => ({ ...attempt, skipped: index === 9 })));
  assert.equal(recoverySummary(1, false).mastered, false);
});

test("a sustained contact counts once and a completed attempt records once", () => {
  const mode = drillState(BallContactMode, "static");
  const before = recentAttempts(mode.modeId, 40).length;
  for (let tick = 0; tick < 20; tick++) mode.onPhysicsStep(RL.DT, {}, true);
  mode.finishRound(false, "duplicate");
  assert.equal(mode.touches, 1);
  assert.equal(mode.hits, 1);
  assert.equal(recentAttempts(mode.modeId, 40).length, before + 1);
});

test("all air-dribble variants initialize finite, gravity-driven states", () => {
  for (const variant of ["popChase", "boostTap", "hover", "wallAir", "steerDribble"]) {
    const mode = drillState(DribbleBridgeMode, variant);
    const height = mode.physBall.pos.z;
    for (let tick = 0; tick < 12; tick++) {
      const contact = stepCarBall(mode.physCar, mode.physBall, {}, tick, RL.DT);
      mode.onPhysicsStep(RL.DT, {}, contact);
    }
    assert(mode.physBall.pos.toArray().every(Number.isFinite), variant);
    assert.notEqual(mode.physBall.pos.z, height, variant);
    assert.equal(mode.physCar.boost, 100, variant);
  }
});

test("air-dribble variations preserve fixed starts and mirror wall setups", () => {
  for (const variant of ["popChase", "boostTap", "hover", "wallAir", "steerDribble"]) {
    const mode = drillState(DribbleBridgeMode, variant);
    mode.varied = false;
    mode.round = 1;
    mode.setupRound();
    const fixed = mode.physCar.pos.clone();
    mode.round = 2;
    mode.setupRound();
    assert.deepEqual(mode.physCar.pos.toArray(), fixed.toArray());
    mode.varied = true;
    mode.setupRound();
    assert(mode.physCar.pos.toArray().every(Number.isFinite));
    assert(mode.physBall.pos.toArray().every(Number.isFinite));
    if (variant === "wallAir") {
      assert(mode.physCar.pos.x < 0);
      mode.physCar.pos.x = -RL.HALF_W + 300;
      mode.physCar.wheelsContact = false;
      mode.evaluateStep(RL.DT, {}, true);
      assert.equal(mode.result?.success, true);
    }
  }
});

test("rings vary across six course shapes and fixed practice repeats", () => {
  const mode = Object.create(RingsMode.prototype);
  Object.assign(mode, {
    hitbox: { restZ: 17 }, varied: true, previousPosition: new THREE.Vector3(),
    rings: Array.from({ length: 7 }, () => ({ center: new THREE.Vector3(), normal: new THREE.Vector3(), mesh: new THREE.Object3D() })),
    spawn(position) { this.physCar = { pos: new THREE.Vector3(...position) }; }, refreshRings() {},
  });
  const courses = [];
  for (let round = 1; round <= 6; round++) {
    mode.round = round;
    mode.setupRound();
    courses.push(mode.rings.map(ring => ring.center.x));
    for (const ring of mode.rings) {
      assert(Math.abs(ring.normal.length() - 1) < 1e-9);
      assert(ring.mesh.position.toArray().every(Number.isFinite));
    }
  }
  assert.equal(new Set(courses.map(course => JSON.stringify(course))).size, 6);
  mode.varied = false;
  mode.setupRound();
  const fixed = mode.rings.map(ring => ring.center.toArray());
  mode.round = 10;
  mode.setupRound();
  assert.deepEqual(mode.rings.map(ring => ring.center.toArray()), fixed);
});

test("rings score forward swept crossings inside the hoop, not near misses or reverse crossings", () => {
  const mode = Object.create(RingsMode.prototype);
  Object.assign(mode, {
    nextIndex: 0, previousPosition: new THREE.Vector3(0, -10, 500),
    crossing: new THREE.Vector3(), offset: new THREE.Vector3(),
    physCar: { pos: new THREE.Vector3(0, 10, 500) },
    rings: [{ center: new THREE.Vector3(0, 0, 500), normal: new THREE.Vector3(0, 1, 0) }],
    refreshRings() {}, finishRound(success) { this.completed = success; },
  });
  mode.physCar.pos.x = 300;
  mode.previousPosition.x = 300;
  mode.evaluateStep();
  assert.equal(mode.nextIndex, 0);
  mode.previousPosition.set(0, 10, 500);
  mode.physCar.pos.set(0, -10, 500);
  mode.evaluateStep();
  assert.equal(mode.nextIndex, 0);
  mode.physCar.pos.set(0, 10, 500);
  mode.evaluateStep();
  assert.equal(mode.nextIndex, 1);
  assert.equal(mode.completed, true);
});

test("static mastery classifies physical nose, side, rear and roof normals", () => {
  const car = makePhysCar();
  for (const [normal, label] of [[[1, 0, 0], "Front contact"], [[0, 1, 0], "Side contact"], [[-1, 0, 0], "Rear contact"], [[0, 0, 1], "Roof contact"]]) {
    assert.equal(classifyStaticContact(car, { normal: new THREE.Vector3(...normal).applyQuaternion(car.q) }), label);
  }
});

test("static target scores swept centre crossings and rejects high, wide and reverse balls", () => {
  const direction = new THREE.Vector3(0, 1, 0);
  for (const [position, label] of [[[0, 1500, 93], "Target hit"], [[301, 1500, 93], "Missed left"], [[-301, 1500, 93], "Missed right"], [[0, 1500, 201], "Too high"]]) {
    const current = new THREE.Vector3(...position);
    const previous = current.clone(); previous.y = 1300;
    assert.equal(staticGateCrossing(previous, current, direction).label, label);
    assert.equal(staticGateCrossing(current, previous, direction), null);
  }
});

test("direction labels match the driver's local sides at varied headings", () => {
  for (const yaw of [0, Math.PI / 2, -Math.PI / 3, Math.PI]) {
    const direction = new THREE.Vector3(Math.cos(yaw), Math.sin(yaw), 0);
    const right = new THREE.Vector3(-direction.y, direction.x, 0);
    for (const side of [-1, 1]) {
      const previous = direction.clone().multiplyScalar(1300).addScaledVector(right, side * 350).setZ(93);
      const current = direction.clone().multiplyScalar(1500).addScaledVector(right, side * 350).setZ(93);
      assert.equal(staticGateCrossing(previous, current, direction).label, side > 0 ? "Missed right" : "Missed left");
    }
  }
  for (let index = 0; index < 18; index++) {
    const mode = drillState(BallContactMode, "soft");
    mode.masteryStep = 2;
    mode.varied = true;
    mode.setupIndex = index;
    mode.setupRound();
    mode.firstTouchTime = 1;
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(mode.physCar.q);
    const right = new THREE.Vector3(0, 1, 0).applyQuaternion(mode.physCar.q);
    const incoming = new THREE.Vector3(...mode.setup.direction);
    const exit = new THREE.Vector3(-incoming.y, incoming.x, 0).multiplyScalar(mode.setup.exitSide);
    assert(forward.dot(incoming) < -0.99);
    const expected = exit.dot(right) > 0 ? "right" : "left";
    const feedback = new DrillCoach().update(mode, {}, 0, "Receive");
    assert.equal(feedback.title, `Guide the reception ${expected}`);
  }
});

test("driving variations mix start offsets, route widths and checkpoint spacing", () => {
  for (let stage = 0; stage < 5; stage++) {
    const fixed = generateMovementSetup("driving", stage, false, 0, () => 0);
    assert.deepEqual(fixed, generateMovementSetup("driving", stage, false, 200, () => 1));
    const setups = Array.from({ length: 162 }, (_, index) => generateMovementSetup("driving", stage, true, index, () => 0.5));
    assert(new Set(setups.map(setup => setup.position[0])).size >= 3);
    if (stage === 1 || stage === 4) assert(new Set(setups.map(setup => JSON.stringify(setup.targets))).size >= 18);
    for (const setup of setups) {
      assert(Math.abs(setup.position[0]) <= (stage === 0 ? 48 : stage === 2 ? 72 : 120));
      assert.equal(setup.minSpeed, fixed.minSpeed);
      assert.equal(setup.targetRadius, fixed.targetRadius);
      assert(setup.targets.every(target => target.every(Number.isFinite) && Math.abs(target[0]) < 2100 && target[1] < (stage === 2 ? 4800 : 3600)));
    }
    const mode = drillState(MovementMode, "driving");
    mode.masteryStep = stage;
    mode.retrySetup = setups[0];
    mode.setupRound();
    assert.equal(mode.physCar.pos.x, setups[0].position[0]);
  }
});

test("varied Foundations setups provide larger balanced pools without changing fixed practice", () => {
  for (let step = 0; step < 5; step++) {
    for (const generate of [generateStaticBallSetup, generateSoftBallSetup, generateRollTouchSetup, generateRecoverySetup]) {
      assert.deepEqual(generate(step, false, 0, () => 0), generate(step, false, 53, () => 1));
      const setups = Array.from({ length: 54 }, (_, index) => generate(step, true, index, () => 0.5));
      assert.equal(new Set(setups.map(setup => JSON.stringify(setup.direction))).size, 9);
      assert(setups.every(setup => Object.values(setup).flat().filter(value => typeof value === "number").every(Number.isFinite)));
      for (let index = 1; index < 9; index += 2) assert(Math.abs(setups[index].direction[0] + setups[index + 1].direction[0]) < 1e-9);
    }
  }
  const routes = Array.from({ length: 6 }, (_, index) => generateMovementSetup("driving", 4, true, index, () => 0.5).targets);
  assert.equal(new Set(routes.map(route => JSON.stringify(route))).size, 6);
  for (let index = 0; index < 6; index += 2) assert.deepEqual(routes[index].map(([horizontal, forward, height]) => [-horizontal, forward, height]), routes[index + 1]);
  const dodges = Array.from({ length: 27 }, (_, index) => generateMovementSetup("dodges", 4, true, index, () => 0.5));
  assert.equal(new Set(dodges.map(setup => `${setup.yaw}/${setup.dodge}`)).size, 27);
});

test("static setup bounds stay finite, fixed repeats and directions balance", () => {
  assert.deepEqual(generateStaticBallSetup(2, false), generateStaticBallSetup(2, false));
  const directions = [0, 1, 2].map(index => generateStaticBallSetup(2, true, index, () => 0.5).direction[0]);
  assert.equal(directions[0], 0); assert(directions[1] < 0); assert(directions[2] > 0);
});

test("static mastery enforces pace and sustained follow-through after the gate", () => {
  for (const [speed, success] of [[799, false], [800, true], [1200, true], [1201, false]]) {
    const mode = drillState(BallContactMode, "static"); mode.masteryStep = 3; mode.setupRound();
    mode.touches = 1; mode.previousBall.set(0, 1300, 93); mode.physBall.pos.set(0, 1500, 93); mode.physBall.vel.set(0, speed, 0);
    mode.evaluateStep(RL.DT, {}, false);
    assert.equal(mode.result.success, success);
  }
  const mode = drillState(BallContactMode, "static"); mode.masteryStep = 4; mode.setupRound();
  mode.gateHit = true; mode.touches = 1; mode.physCar.pos.set(0, 1200, 17); mode.physBall.pos.set(0, 1500, 93); mode.physCar.onGround = true;
  for (let tick = 0; tick < 61; tick++) mode.evaluateStep(RL.DT, {}, false);
  assert.equal(mode.result.success, true);
});

test("Square the Nose succeeds with an actual shared-physics front touch", () => {
  const mode = drillState(BallContactMode, "static"); mode.masteryStep = 1; mode.varied = false; mode.setupRound();
  for (let tick = 0; tick < 600 && !mode.result; tick++) {
    const input = { throttle: 1 };
    mode.onPhysicsStep(RL.DT, input, stepCarBall(mode.physCar, mode.physBall, input, tick, RL.DT));
  }
  assert.equal(mode.result?.success, true, mode.result?.message);
});

test("retry preserves the intended miss while skipping an active scored setup", () => {
  const mode = drillState(BallContactMode, "static");
  mode.finishRound(false, "No contact");
  const missedSetup = structuredClone(mode.setup);
  mode.setup = generateStaticBallSetup(0, true, 1, () => 0.9);
  mode.result = null; mode.elapsed = 1;
  mode.resetState = function () { this.result = null; this.setupRound(); };
  mode.retrySameSetup();
  assert.deepEqual(mode.setup, missedSetup);
  assert.equal(mode.setAttempts.length, 2);
  assert.equal(mode.setAttempts[1].skipped, true);
  mode.finishRound(true, "Ball contacted");
  assert.equal(mode.setAttempts.length, 2);
  assert.equal(mode.result.message, "Practice: Ball contacted");
});

test("mastery requires consecutive complete sets without skips and isolates variation", () => {
  const attempts = Array.from({ length: 10 }, (_, index) => ({ success: index < 8, label: "No contact" }));
  recordStaticBallSet(101, true, attempts);
  recordStaticBallSet(101, true, attempts);
  assert.equal(staticBallSummary(101, true).mastered, true);
  assert.equal(staticBallSummary(101, false).latest, null);
  recordStaticBallSet(101, true, [{ success: false, skipped: true, label: "Skipped" }]);
  assert.equal(staticBallSummary(101, true).mastered, false);
  recordStaticBallSet(101, true, [...attempts.slice(0, 9), { success: false, skipped: true, label: "Skipped" }]);
  assert.equal(staticBallSummary(101, true).mastered, false);
});

test("front contact cone rejects side-biased corners", () => {
  const car = makePhysCar();
  const normal = new THREE.Vector3(1, 1, 0).normalize().applyQuaternion(car.q);
  assert.equal(classifyStaticContact(car, { normal }), "Side contact");
});

test("target stages reject correction touches before the gate", () => {
  const mode = drillState(BallContactMode, "static");
  mode.masteryStep = 2; mode.touches = 2;
  mode.evaluateMastery(RL.DT, true);
  assert.equal(mode.result.message, "Extra touch");
  assert.equal(mode.result.success, false);
});

test("follow-through hold resets when facing is lost and times out", () => {
  const mode = drillState(BallContactMode, "static");
  mode.masteryStep = 4; mode.touches = 1; mode.gateHit = true;
  mode.physCar.pos.set(0, 1200, mode.hitbox.restZ);
  mode.physBall.pos.set(0, 1500, RL.BALL_REST_Z);
  mode.physCar.onGround = true;
  for (let tick = 0; tick < 30; tick++) mode.evaluateMastery(RL.DT, false);
  assert(mode.followHold > 0.2);
  mode.physCar.q.identity();
  mode.evaluateMastery(RL.DT, false);
  assert.equal(mode.followHold, 0);
  for (let tick = 0; tick < 400 && !mode.result; tick++) mode.evaluateMastery(RL.DT, false);
  assert.equal(mode.result.message, "Facing away");
  assert.equal(mode.result.success, false);
});

function receptionState(step, speed = 300) {
  const mode = drillState(BallContactMode, "soft");
  mode.masteryStep = step; mode.varied = false; mode.setupRound();
  mode.physBall.pos.set(0, 150, RL.BALL_REST_Z);
  mode.physBall.vel.set(0, -speed, 0);
  mode.touches = 1;
  mode.evaluateReception(RL.DT, true);
  return mode;
}

function advanceReception(mode, duration) {
  for (let tick = 0; tick < Math.round(duration / RL.DT) && !mode.result; tick++) {
    mode.elapsed += RL.DT;
    mode.evaluateReception(RL.DT, false);
  }
}

test("soft reception measures a 40 percent reduction after 0.1 seconds", () => {
  for (const [speed, success] of [[300, true], [301, false]]) {
    const mode = receptionState(0, speed);
    advanceReception(mode, 0.09);
    assert.equal(mode.result, null);
    advanceReception(mode, 0.02);
    assert.equal(mode.result.success, success);
    assert.equal(mode.incomingSpeed, 500);
  }
});

test("soft close reception requires the full hold and rejects loose or high balls", () => {
  const mode = receptionState(1);
  advanceReception(mode, 0.4);
  assert.equal(mode.result, null);
  advanceReception(mode, 0.1);
  assert.equal(mode.result.success, true);
  for (const [position, message] of [[[0, 451, 93], "Too far away"], [[0, 150, 201], "Reception too high"]]) {
    const miss = receptionState(1);
    miss.physBall.pos.fromArray(position);
    advanceReception(miss, RL.DT);
    assert.equal(miss.result.message, message);
  }
});

test("soft exit requires the requested nearby area as well as close control", () => {
  for (const [horizontal, success] of [[200, true], [-200, false], [100, false]]) {
    const mode = receptionState(2);
    mode.physBall.pos.x = horizontal;
    advanceReception(mode, success ? 0.5 : 3);
    assert.equal(mode.result.success, success);
  }
});

test("second touch must be distinct, after reception and within three seconds", () => {
  const mode = receptionState(4);
  advanceReception(mode, 0.5);
  assert.equal(mode.result, null);
  assert.equal(mode.receptionReady, true);
  mode.touches = 2;
  mode.evaluateReception(RL.DT, true);
  assert.equal(mode.result.success, true);
  const early = receptionState(4);
  early.touches = 2; early.evaluateReception(RL.DT, true);
  assert.equal(early.result.success, false);
  const timeout = receptionState(4);
  advanceReception(timeout, 3);
  assert.equal(timeout.result.message, "Second touch timeout");
});

test("soft setups repeat when fixed and bound incoming variation and separate history", () => {
  assert.deepEqual(generateSoftBallSetup(4, false), generateSoftBallSetup(4, false, 9));
  for (const random of [() => 0, () => 1]) for (let index = 0; index < 3; index++) {
    const setup = generateSoftBallSetup(3, true, index, random);
    const speed = Math.hypot(...setup.ballVelocity);
    assert(speed >= 400 - 1e-9 && speed <= 800 + 1e-9);
    assert(setup.ballPosition.every(Number.isFinite));
  }
  const attempts = Array.from({length: 10}, () => ({success: true}));
  recordSoftBallSet(102, true, attempts); recordSoftBallSet(102, true, attempts);
  assert.equal(softBallSummary(102, true).mastered, true);
  assert.equal(softBallSummary(102, false).latest, null);
  assert.equal(staticBallSummary(102, true).latest, null);
});

test("incoming soft stages succeed through actual shared-physics receptions", () => {
  for (const step of [0, 1, 3, 4]) {
    const mode = drillState(BallContactMode, "soft");
    mode.masteryStep = step; mode.varied = false; mode.setupRound();
    for (let tick = 0; tick < 1800 && !mode.result; tick++) {
      const controls = { throttle: mode.receptionReady ? 0.2 : 0 };
      const contact = stepCarBall(mode.physCar, mode.physBall, controls, tick, RL.DT);
      mode.onPhysicsStep(RL.DT, controls, contact);
    }
    assert.equal(mode.result?.success, true, `${step}: ${mode.result?.message}`);
    assert.equal(mode.touches, step === 4 ? 2 : 1);
    assert(mode.receivedSpeed <= mode.incomingSpeed * 0.6);
  }
});

test("soft retry preserves incoming velocity and excludes practice from scored sets", () => {
  const mode = drillState(BallContactMode, "soft");
  mode.finishRound(false, "No contact");
  const saved = structuredClone(mode.setup);
  mode.setup = generateSoftBallSetup(3, true, 1, () => 0.9);
  mode.result = null; mode.elapsed = 1;
  mode.resetState = function () { this.result = null; this.setupRound(); };
  mode.retrySameSetup();
  assert.deepEqual(mode.setup, saved);
  assert.deepEqual(mode.physBall.vel.toArray(), saved.ballVelocity);
  assert.equal(mode.setAttempts[1].skipped, true);
  mode.finishRound(true, "Arrival cushioned");
  assert.equal(mode.setAttempts.length, 2);
  assert.equal(mode.result.message, "Practice: Arrival cushioned");
});

test("an angled shared-physics reception reaches the requested exit", () => {
  const mode = drillState(BallContactMode, "soft");
  mode.masteryStep = 2; mode.varied = false; mode.setupRound();
  mode.physCar.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 - Math.PI / 9);
  mode.physCar.pos.x = -30;
  for (let tick = 0; tick < 1801 && !mode.result; tick++) {
    const controls = { throttle: 0 };
    mode.onPhysicsStep(RL.DT, controls, stepCarBall(mode.physCar, mode.physBall, controls, tick, RL.DT));
  }
  assert.equal(mode.result?.message, "Requested exit reached");
  assert.equal(mode.result.success, true);
});

test("result dialog controller navigation supports vertical input, reversal and disabled actions", () => {
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
  const originalGamepads = navigator.getGamepads;
  const originalFocus = document.activeElement;
  navigator.getGamepads = () => [pad];
  try {
    const buttons = Array.from({ length: 3 }, () => ({ focus() { document.activeElement = this; } }));
    buttons[1].disabled = true;
    buttons[0].focus();
    const view = Object.create(DrillCoachView.prototype);
    view.failure = { open: true, querySelectorAll: () => buttons };
    const feedback = { id: "objective", title: "Ready", detail: "Ready" };
    view.lastTip = "objective:Ready:Ready";
    pad.buttons[13].pressed = true;
    view.render(feedback);
    assert.equal(document.activeElement, buttons[2]);
    view.render(feedback);
    assert.equal(document.activeElement, buttons[2]);
    pad.buttons[13].pressed = false;
    pad.axes[1] = -1;
    view.render(feedback);
    assert.equal(document.activeElement, buttons[0]);
    pad.axes[1] = 0;
    view.render(feedback);
    pad.buttons[14].pressed = true;
    view.render(feedback);
    assert.equal(document.activeElement, buttons[2]);
  } finally {
    navigator.getGamepads = originalGamepads;
    document.activeElement = originalFocus;
  }
});

test("top banner uses the drill-page summary while preserving urgent warnings", () => {
  const view = Object.create(DrillCoachView.prototype);
  view.briefing = { title: MOVEMENT_TRAINING.driving.steps[1].goal, detail: MOVEMENT_TRAINING.driving.steps[1].requirements.join(' / ') };
  view.failure = { open: false, close() {} };
  view.root = { dataset: {} };
  view.title = {};
  view.detail = {};
  view.render({ id: "action-drive", title: "Take corner checkpoint 1 of 3", detail: "Long coaching text", priority: 1 });
  assert.equal(view.title.textContent, "Follow the five targets around the corners.");
  assert.equal(view.detail.textContent, view.briefing.detail);
  view.render({ id: "turn-direction", title: "Turn right toward the target", detail: "Steer toward the yellow target.", priority: 3 });
  assert.equal(view.title.textContent, "Turn right toward the target");
});