import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createSoccarBoostPads, createBoostPadMeshes, stepBoostPads, resetBoostPads, BOOST_PAD_VISUAL } from "../../src/shared/boostPads.js";
import { RL } from "../../src/shared/rl-physics.js";
import { makeCar } from "../../src/shared/carSim.js";
import { createStadium } from "../../src/shared/stadium.js";

test("all 34 visible pads use standard coordinates, not pickup-volume sizing", () => {
  const pads = createSoccarBoostPads();
  const root = new THREE.Group();
  createBoostPadMeshes(root, pads);
  assert.equal(pads.length, 34);
  assert.equal(pads.filter(p => p.big).length, 6);
  for (const pad of pads) {
    assert.equal(pad.mesh.position.x, pad.x * 0.01);
    assert.equal(pad.mesh.position.z, pad.y * 0.01);
    const radius = (pad.big ? BOOST_PAD_VISUAL.BIG_RADIUS : BOOST_PAD_VISUAL.SMALL_RADIUS) * 0.01;
    assert.equal(pad.mesh.geometry.parameters.radiusTop, radius);
    assert(radius < pad.radius * 0.01);
  }
});

test("collected pad keeps its base and extinguishes all pickup graphics", () => {
  const pads = createSoccarBoostPads();
  createBoostPadMeshes(new THREE.Group(), pads);
  const pad = pads.find(p => p.big);
  const car = { pos: new THREE.Vector3(pad.x, pad.y, 17), boost: 0, id: 1 };
  stepBoostPads(pads, car, RL.DT);
  assert.equal(car.boost, 100);
  assert.equal(pad.active, false);
  assert.equal(pad.timer, 10);
  assert.equal(pad.mesh.visible, true);
  assert(pad.mesh.children.every(child => !child.visible));
  assert.equal(pad.mesh.material.emissiveIntensity, 0);
  resetBoostPads(pads);
  assert(pad.mesh.children.every(child => child.visible));
  assert.equal(pad.mesh.material.emissiveIntensity, 0.65);
});

test("neon-city scenery stays outside play and the floor retains soccar dimensions", () => {
  // Geometry checks don't require an actual browser canvas or WebGL context.
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) };
  try {
    const stadium = createStadium();
    const floor = stadium.getObjectByName("standard-soccar-floor");
    assert.equal(floor.geometry.parameters.width, RL.HALF_W * 0.02);
    assert.equal(floor.geometry.parameters.height, RL.HALF_L * 0.02);
    const city = stadium.getObjectByName("neon-city-backdrop");
    const towers = city.getObjectByName("city-towers");
    const matrix = new THREE.Matrix4(), center = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
    for (let i = 0; i < towers.count; i++) {
      towers.getMatrixAt(i, matrix); matrix.decompose(center, rotation, scale);
      assert(Math.abs(center.x) - scale.x / 2 > RL.HALF_W * 0.01 || Math.abs(center.z) - scale.z / 2 > (RL.HALF_L + RL.GOAL_DEPTH) * 0.01);
    }
    assert.equal(stadium.children.filter(o => o.name === "standard-goal-floor").length, 2);
    for (const goal of stadium.children.filter(o => o.name === "standard-goal-floor")) {
      assert.equal(goal.geometry.parameters.width, RL.GOAL_HALF_W * 0.02);
      assert.equal(goal.geometry.parameters.height, RL.GOAL_DEPTH * 0.01);
      assert.equal(Math.abs(goal.position.z), (RL.HALF_L + RL.GOAL_DEPTH / 2) * 0.01);
    }
    assert.equal(stadium.children.filter(o => o.name === "collision-matched-arena-surface").length, 3);
    stadium.userData.dispose();
  } finally { globalThis.document = previous; }
});

test("small-pad recollection matches RocketSim tick 481, without an extra idle tick", () => {
  const pads = createSoccarBoostPads();
  const pad = pads.find(p => !p.big && p.x === 0 && p.y === -4240);
  const car = { pos: new THREE.Vector3(pad.x, pad.y, 17), boost: 0, id: 1 };
  stepBoostPads(pads, car, RL.DT);
  assert.equal(car.boost, 12);
  stepBoostPads(pads, car, RL.DT);
  assert.equal(pad._lockedCarId, null); // grounded root no longer overlaps locked pad box
  for (let tick = 3; tick <= 480; tick++) stepBoostPads(pads, car, RL.DT);
  assert.equal(car.boost, 12);
  assert(pad.timer > 0);
  stepBoostPads(pads, car, RL.DT);
  assert.equal(car.boost, 24);
  assert.equal(pad.timer, 4);
});

test("pickup radius boundary is strict, not inclusive", () => {
  const pads = createSoccarBoostPads();
  const pad = pads[0];
  const car = { pos: new THREE.Vector3(pad.x + pad.radius, pad.y, pad.z), boost: 0, id: 1 };
  stepBoostPads([pad], car, RL.DT);
  assert.equal(car.boost, 0);
  car.pos.x -= 0.001;
  stepBoostPads([pad], car, RL.DT);
  assert.equal(car.boost, 12);
});

test("locked-pad contact intersects the car hitbox, not only its root", () => {
  const pad = createSoccarBoostPads()[0];
  const car = makeCar(new THREE.Vector3(pad.x, pad.y, 60), 0);
  car.id = 1; car.boost = 0;
  pad._lockedCarId = 1;
  // Car root is below pad.z, but the roof/hitbox overlaps its locked AABB.
  stepBoostPads([pad], car, RL.DT);
  assert.equal(car.boost, 12);
});

test("standard pad grid leaves pads available for full-boost and demoed cars", () => {
  for (const state of [{ boost: 100 }, { boost: 0, isDemoed: true }]) {
    const pad = createSoccarBoostPads()[0];
    const car = { pos: new THREE.Vector3(pad.x, pad.y, 17), id: 1, ...state };
    stepBoostPads([pad], car, RL.DT);
    assert.equal(pad.active, true);
    assert.equal(pad.timer, 0);
    assert.equal(pad._lockedCarId, null);
  }
});

test("standard dimensions use centimetres consistently across render and physics", () => {
  assert.equal(RL.HALF_W * 2, 8192);
  assert.equal(RL.HALF_L * 2, 10240);
  assert.equal(RL.CEILING, 2048);
  assert.equal(RL.GOAL_HALF_W * 2, 1785.51);
  assert.equal(RL.GOAL_HEIGHT, 642.775);
  assert.equal(RL.GOAL_DEPTH, 880);
  assert.equal(RL.BALL_RADIUS * 2, 182.5);
});