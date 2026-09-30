import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeCar, stepCarBall } from "../../src/shared/carSim.js";
import { RL, axes, carHitbox, makeBall, stepBall } from "../../src/shared/rl-physics.js";
import { applyFreePlayBallControl } from "../../src/shared/freePlayBallControls.js";

test("possession and dribble place the ball relative to the current car without moving it", () => {
  const car = makeCar(new THREE.Vector3(300, -700, 17), 0.8);
  car.vel.set(400, 200, 0);
  const original = car.pos.clone();
  const ball = makeBall(new THREE.Vector3(2000, 1000, 1000));
  const possession = applyFreePlayBallControl("takePossession", car, ball);
  assert(possession.pos.clone().sub(car.pos).dot(axes(car.q).f) > RL.BALL_RADIUS);
  assert.equal(possession.pos.z, RL.BALL_REST_Z);
  assert.deepEqual(possession.vel.toArray(), car.vel.toArray());
  const dribble = applyFreePlayBallControl("startDribble", car, ball);
  const box = carHitbox(car);
  assert(dribble.pos.clone().sub(box.center).dot(box.u) > box.half[2] + RL.BALL_RADIUS);
  assert.deepEqual(car.pos, original);
});

test("launch, pass, nearest-goal shot and reset produce finite bounded state", () => {
  const car = makeCar(new THREE.Vector3(300, -700, 17));
  for (const goalSide of [-1, 1]) {
    const ball = makeBall(new THREE.Vector3(-500, goalSide * 1200, 600));
    ball.omega.set(1, 2, 3);
    applyFreePlayBallControl("launchBall", car, ball);
    assert(ball.vel.z > 0);
    assert.equal(ball.vel.x, 0);
    assert.equal(ball.omega.length(), 0);
    applyFreePlayBallControl("passBall", car, ball);
    assert(ball.vel.x * (car.pos.x - ball.pos.x) > 0);
    applyFreePlayBallControl("defendShot", car, ball);
    assert.equal(Math.sign(ball.vel.y), goalSide);
    assert(ball.vel.toArray().every(Number.isFinite));
    assert(ball.vel.length() <= RL.BALL_MAX_SPEED);
    const reset = applyFreePlayBallControl("resetBall", car, ball);
    assert.deepEqual(reset.pos.toArray(), [0, 0, RL.BALL_REST_Z]);
    assert.equal(reset.vel.length(), 0);
  }
});

test("stationary start dribble falls onto the hood instead of sleeping in midair", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 17), 0);
  const ball = applyFreePlayBallControl("startDribble", car, makeBall());
  const initialHeight = ball.pos.z;
  assert(ball.vel.lengthSq() > 0);
  let contacted = false;
  for (let tick = 0; tick < 60; tick++) {
    if (stepCarBall(car, ball, {}, tick)) contacted = true;
  }
  assert(contacted);
  assert(ball.pos.z < initialHeight);
});

test("pass intercepts a moving car using the ball's discrete damping and gravity", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 17), 0);
  car.vel.set(600, 200, 0);
  const ball = makeBall(new THREE.Vector3(-1000, -500, 500));
  applyFreePlayBallControl("passBall", car, ball);
  let closest = Infinity;
  for (let tick = 1; tick <= 240; tick++) {
    stepBall(ball, RL.DT, { arena: false });
    const target = car.pos.clone().addScaledVector(car.vel, tick * RL.DT);
    target.z = RL.BALL_REST_Z;
    closest = Math.min(closest, ball.pos.distanceTo(target));
  }
  assert(closest < 1, `pass missed by ${closest} uu`);
});

test("a nearby pass avoids an instantaneous downward spike", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 17), 0);
  const ball = applyFreePlayBallControl("startDribble", car, makeBall());
  applyFreePlayBallControl("passBall", car, ball);
  assert(Math.abs(ball.vel.z) < 500);
});

test("defend shot reaches the selected goal height and launch rises then falls", () => {
  const car = makeCar();
  for (const side of [-1, 1]) {
    const ball = makeBall(new THREE.Vector3(300, side * 3500, 700));
    applyFreePlayBallControl("defendShot", car, ball);
    const goal = new THREE.Vector3(0, side * RL.HALF_L, RL.BALL_RADIUS + 120);
    let closest = Infinity;
    for (let tick = 0; tick < 240; tick++) {
      stepBall(ball, RL.DT, { arena: false });
      closest = Math.min(closest, ball.pos.distanceTo(goal));
    }
    assert(closest < 1, `shot missed by ${closest} uu`);
  }
  const ball = makeBall();
  applyFreePlayBallControl("launchBall", car, ball);
  const initialHeight = ball.pos.z;
  for (let tick = 0; tick < 120; tick++) stepBall(ball, RL.DT, { arena: false });
  assert(ball.pos.z > initialHeight);
  for (let tick = 0; tick < 240; tick++) stepBall(ball, RL.DT, { arena: false });
  assert(ball.vel.z < 0);
});