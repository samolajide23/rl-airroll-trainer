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
  mode.physCar.pos.y = 600;
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
  assert.match(resultCoaching(soft, "Cushion").value, /limit 600/);
  jump.result = { success: false, message: "Wrong dodge direction" };
  jump.setup.dodge = "left";
  assert.equal(resultCoaching(jump, "Dodge").value, "Requested: left");
});

test("all thirty Foundations stages provide coaching and repeated misses inform retries", () => {
  for (const variant of ["driving", "dodges", "static", "soft", "rollTouch", "recovery"]) for (let stage = 0; stage < 5; stage++) {
    const mode = drillState(["driving", "dodges"].includes(variant) ? MovementMode : BallContactMode, variant);
    mode.masteryStep = stage;
    mode.setupRound();
    mode.coach = new DrillCoach();
    mode.refreshCoaching({}, 0);
    assert.equal(mode.coaching.id, "objective", `${variant}/${stage}`);
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

test("all movement stages complete using ordinary shared physics inputs", () => {
  for (const variant of ["driving", "dodges"]) for (const repetition of [-1, 0, 1, 2]) for (let stage = 0; stage < 5; stage++) {
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
        controls = { jump: tick >= 5 && tick < (stage === 0 ? 6 : 29) || stage >= 2 && second, pitch: stage >= 3 && second ? mode.setup.dodge === "forward" ? -1 : mode.setup.dodge === "backward" ? 1 : 0 : 0, yaw: stage === 4 && second ? mode.setup.dodge === "right" ? -1 : mode.setup.dodge === "left" ? 1 : 0 : 0 };
      }
      stepCar(mode.physCar, controls, RL.DT);
      mode.onPhysicsStep(RL.DT, controls, null);
    }
    assert.equal(mode.result?.success, true, `${variant}/${stage}/${repetition}: ${mode.result?.message}, height=${mode.maxHeight}, pos=${mode.physCar.pos.toArray()}`);
    assert.equal(mode.physBall, null);
  }
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

test("arena drills inherit the exact Free Play simulation, rendering, camera and input path", () => {
  for (const Mode of [BallContactMode, DribbleBridgeMode, RingsMode]) {
    assert(Mode.prototype instanceof ArenaDrillBase);
    for (const method of ["_stepOnce", "syncMeshes", "updateCamera", "pollUtilityKeys", "updateBoostMeter"]) {
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
  for (const [position, label] of [[[0, 1500, 93], "Target hit"], [[301, 1500, 93], "Missed right"], [[0, 1500, 201], "Too high"]]) {
    const current = new THREE.Vector3(...position);
    const previous = current.clone(); previous.y = 1300;
    assert.equal(staticGateCrossing(previous, current, direction).label, label);
    assert.equal(staticGateCrossing(current, previous, direction), null);
  }
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