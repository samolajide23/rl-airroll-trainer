import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeCar, stepCar } from "../../src/shared/carSim.js";
import { RL, makeBall, stepBall, carHitbox, collideCarBall, alignCarVisualToHitbox } from "../../src/shared/rl-physics.js";
import { HITBOX_PRESETS } from "../../src/shared/hitboxPresets.js";
import { stepCarBall } from "../../src/shared/carSim.js";
import { sphereArenaContacts } from "../../src/shared/arenaMesh.js";
import { compareScenario, failuresFor } from "./trajectory.mjs";

const close = (a, b, tolerance = 1e-6) => assert(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test("visual calibration uses actual length, grounds wheels, and is idempotent", () => {
  for (const preset of Object.values(HITBOX_PRESETS)) {
    const car = new THREE.Group();
    const visual = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 4.2), new THREE.MeshBasicMaterial());
    visual.geometry.translate(0, 0.7, 0.2);
    car.add(visual);
    const bounds = new THREE.Box3().setFromObject(visual);
    car.userData.visual = visual;
    car.userData.visualBounds = bounds;
    car.userData.refLength = bounds.max.z - bounds.min.z;
    car.position.y = preset.restZ * 0.01;
    for (let i = 0; i < 3; i++) {
      alignCarVisualToHitbox(car, preset);
      car.updateMatrixWorld(true);
      const actual = new THREE.Box3().setFromObject(visual);
      close(actual.min.y, 0);
      close(actual.max.z - actual.min.z, preset.size[0] * 0.01);
      close(actual.getCenter(new THREE.Vector3()).z, preset.offset[0] * 0.01);
    }
    visual.geometry.dispose(); visual.material.dispose();
  }
});

test("ball damping precedes gravity and uses Bullet exponential decay", () => {
  const ball = makeBall(new THREE.Vector3(0, 0, 1000));
  ball.vel.set(1000, 0, 0);
  stepBall(ball, RL.DT, { arena: false });
  close(ball.vel.x, 1000 * (1 - RL.BALL_DRAG) ** RL.DT);
  close(ball.vel.z, -RL.GRAVITY * RL.DT);
  close(ball.pos.x, ball.vel.x * RL.DT);
});

test("zero-velocity kickoff ball sleeps until an impulse", () => {
  const ball = makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
  for (let i = 0; i < 120; i++) stepBall(ball);
  close(ball.pos.z, RL.BALL_REST_Z);
  ball.vel.x = 10;
  stepBall(ball);
  assert(ball.pos.x > 0);
});

test("ball speed is capped after integrating its position", () => {
  const ball = makeBall(new THREE.Vector3(0, 0, 1000));
  ball.vel.x = 7000;
  ball.omega.x = 10;
  stepBall(ball, RL.DT, { arena: false });
  assert(ball.pos.x > RL.BALL_MAX_SPEED * RL.DT);
  close(ball.vel.length(), RL.BALL_MAX_SPEED);
  close(ball.omega.length(), RL.BALL_MAX_SPIN);
});

test("THE_VOID car and ball do not collide with the floor", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  car.arenaCollisions = false;
  const ball = makeBall(new THREE.Vector3(0, 0, 1000));
  ball.vel.z = 0.001;
  for (let i = 0; i < 240; i++) {
    stepCar(car, {});
    stepBall(ball, RL.DT, { arena: false });
  }
  assert(car.pos.z < 0 && ball.pos.z < 0);
  assert.equal(car.numWheelsInContact, 0);
});

test("goal mouth has no phantom contact with distant roof planes", () => {
  assert.equal(sphereArenaContacts(new THREE.Vector3(0, 5200, 300), RL.BALL_RADIUS).length, 0);
});

test("floor bounce matches measured RocketSim first two ticks", () => {
  const ball = makeBall(new THREE.Vector3(0, 0, 100));
  ball.vel.z = -1000;
  stepBall(ball);
  close(ball.pos.z, 91.62364196777344, 0.001);
  assert(ball.vel.z < 0);
  stepBall(ball);
  close(ball.pos.z, 96.64817810058594, 0.001);
  close(ball.vel.z, 602.9447631835938, 0.001);
});

test("inside-OBB ball exits the nearest face, including exact centre", () => {
  for (const offset of [0, 5, -5]) {
    const car = makeCar(new THREE.Vector3(0, 0, 1000), 0.3);
    const box = carHitbox(car);
    const ball = makeBall(box.center.clone().addScaledVector(box.u, offset));
    const hit = collideCarBall(car, ball, 10);
    assert(hit);
    close(hit.normal.length(), 1);
    close(Math.abs(ball.pos.clone().sub(box.center).dot(box.u)), box.half[2] + RL.BALL_RADIUS);
  }
});

test("car-ball impulses cannot leave over-cap state", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  const box = carHitbox(car);
  const ball = makeBall(box.center.clone().addScaledVector(box.f, box.half[0] + 90));
  car.vel.x = 2300; ball.vel.x = -6000; ball.omega.set(6, 0, 0);
  assert(collideCarBall(car, ball, 10));
  assert(ball.vel.length() <= RL.BALL_MAX_SPEED + 1e-6);
  assert(ball.omega.length() <= RL.BALL_MAX_SPIN + 1e-6);
  assert(car.vel.length() <= RL.MAX_SPEED + 1e-6);
  assert(car.omega.length() <= RL.MAX_ANG_VEL + 1e-6);
});

function fixture() {
  return { id: "ball", entity: "ball", game_mode: "void", scenario_sha256: "test", ticks: 1, tick_rate: 120, tick_time: 1 / 120, initial: {}, frames: [0, 1].map(tick => ({ tick, pos: [0, 0, 0], vel: [0, 0, 0], ang_vel: [0, 0, 0] })) };
}

test("comparison rejects malformed, stale, and truncated trajectories", () => {
  for (const corrupt of [
    f => f.frames.pop(), f => f.frames[1].tick++, f => f.frames[1].pos[0] = NaN,
    f => f.frames[0].vel = [0], f => f.scenario_sha256 = "stale", f => f.game_mode = "soccar",
    f => f.initial = { different: true }, f => f.tick_rate = 60,
  ]) {
    const a = fixture(), b = fixture(); corrupt(b);
    assert.throws(() => compareScenario(a, b));
  }
});

test("numerical divergence fails budgets instead of just printing a report", () => {
  const a = fixture(), b = fixture();
  assert.equal(compareScenario(a, b).pos_max, 0);
  b.frames[1].pos[0] = 5;
  assert.equal(failuresFor(compareScenario(a, b), { defaults: { pos_max: 0.2 } }).length, 1);
  assert.throws(() => failuresFor(compareScenario(a, b), { defaults: { typo: 1 } }));
});

test("coupled comparison validates and measures the ball, not just the car", () => {
  // Use valid car frames because coupled scenarios contain both entities.
  const a = fixture(), b = fixture();
  for (const data of [a, b]) {
    data.entity = "car"; data.ball_initial = { pos: [0, 0, 0] };
    for (const frame of data.frames) {
      frame.rot = { forward: [1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] };
      frame.boost = 100; frame.air_time = 0; frame.on_ground = false;
      frame.ball = { pos: [0, 0, 0], vel: [0, 0, 0], ang_vel: [0, 0, 0] };
    }
  }
  b.frames[1].ball.pos[0] = 10;
  const result = compareScenario(a, b);
  assert.equal(result.pos_max, 0);
  assert.equal(result.ball_pos_max, 10);
  assert.equal(failuresFor(result, { defaults: { ball_pos_max: 0.2 } }).length, 1);
  b.frames[1].ball.vel[0] = NaN;
  assert.throws(() => compareScenario(a, b));
});

test("coupled nose contact begins on RocketSim tick 13, not tick 12", () => {
  const car = makeCar(new THREE.Vector3(0, 0, 1000), 0);
  car.arenaCollisions = false; car.vel.x = 1000;
  const ball = makeBall(new THREE.Vector3(260, 0, 1020.755));
  ball.vel.z = 0.001;
  for (let tick = 0; tick < 12; tick++) assert.equal(stepCarBall(car, ball, {}, tick), null);
  close(ball.vel.x, 0);
  assert(stepCarBall(car, ball, {}, 12));
  assert(ball.vel.x > 1400 && ball.vel.x < 1500);
  const velocity = ball.vel.x;
  for (let tick = 13; tick < 17; tick++) stepCarBall(car, ball, {}, tick);
  assert(ball.vel.x <= velocity); // no spurious repeated extra impulse
});

test("coupled step preserves stationary ball sleep without contact", () => {
  const car = makeCar(new THREE.Vector3(-2000, 0, 1000), 0);
  car.arenaCollisions = false;
  const ball = makeBall(new THREE.Vector3(0, 0, 93.15));
  for (let tick = 0; tick < 120; tick++) stepCarBall(car, ball, {}, tick);
  close(ball.pos.z, 93.15);
  close(ball.vel.length(), 0);
});