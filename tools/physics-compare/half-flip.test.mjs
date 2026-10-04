import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makePhysCar, stepCar, RL } from "../../src/shared/carPhysics.js";
import { HalfFlipCoach, HalfFlipEvaluator, halfFlipReference, HALF_FLIP_TYPES, prepareHalfFlipComponent } from "../../src/shared/halfFlipTraining.js";

test("coach requires consistent attempts and responds to repeated failures", () => {
  const coach = new HalfFlipCoach();
  coach.record(true); coach.record(true);
  assert.equal(coach.ready, false);
  coach.record(true);
  assert.equal(coach.ready, true);
  coach.advance();
  assert.equal(coach.threshold, 80);
  assert.equal(coach.readiness, 0);
  coach.record(false); coach.record(false); coach.record(false);
  assert.equal(coach.needsReview, true);
  coach.review();
  assert.equal(coach.level, 0);
  assert.equal(coach.needsReview, false);
});

function run(input, yaw = Math.PI / 2, component = "full", strictness = 0) {
  const car = makePhysCar(new THREE.Vector3(0, 0, 17), yaw);
  const evaluator = new HalfFlipEvaluator(car, { component, strictness });
  for (let tick = 0; tick < 720 && !evaluator.result; tick++) {
    const controls = input(tick * RL.DT);
    stepCar(car, controls, RL.DT);
    evaluator.step(car, controls, RL.DT);
  }
  return evaluator;
}

test("all six half-flip teaching types have distinct identifiers", () => {
  assert.equal(HALF_FLIP_TYPES.length, 6);
  assert.equal(new Set(HALF_FLIP_TYPES.map(type => type.id)).size, 6);
});

test("shared native physics reference completes a half flip across headings", () => {
  for (const yaw of [0, Math.PI / 2, -Math.PI / 3]) {
    const evaluator = run(halfFlipReference, yaw);
    assert.equal(evaluator.result?.success, true, JSON.stringify(evaluator.result));
    assert.ok(evaluator.events.backflip < evaluator.events.cancel);
    assert.ok(evaluator.events.cancel < evaluator.events.roll);
    assert.ok(evaluator.events.roll < evaluator.events.landing);
  }
});

test("missing cancel receives cancel feedback rather than landing feedback", () => {
  const evaluator = run(time => ({ ...halfFlipReference(time), pitch: time < .3 ? 1 : 0, roll: 0 }));
  assert.equal(evaluator.result?.success, false);
  assert.equal(evaluator.result?.phase, "Cancel");
});

test("a forward dodge does not qualify as a backward dodge", () => {
  const evaluator = run(time => ({ ...halfFlipReference(time), pitch: time < .3 ? -1 : 1 }));
  assert.equal(evaluator.result?.success, false);
  assert.equal(evaluator.result?.phase, "Backflip");
});

test("the cancellation workshop can succeed without a landing", () => {
  const evaluator = run(halfFlipReference, 0, "cancel");
  assert.equal(evaluator.result?.success, true);
  assert.equal(evaluator.events.landing, undefined);
});

test("prepared rotation and landing workshops can be completed", () => {
  for (const component of ["roll", "landing"]) {
    const car = makePhysCar(new THREE.Vector3(0, 0, 17), 0);
    prepareHalfFlipComponent(car, component);
    const evaluator = new HalfFlipEvaluator(car, { component });
    evaluator.exit.set(-1, 0, 0);
    for (let tick = 0; tick < 720 && !evaluator.result; tick++) {
      const time = tick * RL.DT;
      const controls = { roll: component === "roll" && time < .6 ? 1 : 0, throttle: 1 };
      stepCar(car, controls, RL.DT);
      evaluator.step(car, controls, RL.DT);
      if (component === "roll" && evaluator.events.roll !== undefined) break;
    }
    if (component === "roll") assert.notEqual(evaluator.events.roll, undefined);
    else assert.equal(evaluator.result?.success, true, JSON.stringify(evaluator.result));
  }
});

test("the reference remains achievable at every coach precision level", () => {
  for (const strictness of [0, 1, 2]) {
    assert.equal(run(halfFlipReference, 0, "full", strictness).result?.success, true);
  }
});