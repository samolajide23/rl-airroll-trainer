import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { prepareCarVisual, syncCarWheels, BODY_WHEEL_REFERENCE } from "../../src/shared/carVisualCalibration.js";
import { alignCarVisualToHitbox, applyToCarModel } from "../../src/shared/rl-physics.js";
import { makeCar } from "../../src/shared/carSim.js";

const near = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test("wheelbase calibration preserves geometry and matches independent tire radii", () => {
  for (const id of ["octane", "fennec", "dominus"]) {
    const car = new THREE.Group(), visual = new THREE.Group(); car.add(visual);
    for (const corner of ["FR", "FL", "BR", "BL"]) {
      const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.4), new THREE.MeshBasicMaterial());
      wheel.name = `Tire_-_${corner}_0`;
      wheel.position.set(corner.endsWith("R") ? -0.6 : 0.6, -0.3, corner.startsWith("F") ? 1 : -1);
      visual.add(wheel);
    }
    prepareCarVisual(visual, id);
    near(visual.userData.calibration.metersPerUnit, (BODY_WHEEL_REFERENCE[id].front - BODY_WHEEL_REFERENCE[id].rear) * 0.01 / 2);
    car.userData.visual = visual;
    car.userData.visualBounds = new THREE.Box3().setFromObject(visual);
    car.userData.refLength = 2.4;
    const physics = makeCar(undefined, Math.PI / 2, id);
    applyToCarModel(physics, car);
    alignCarVisualToHitbox(car, physics.hitbox);
    const original = car.scale.x;
    syncCarWheels(car, physics, 1 / 120);
    for (const wheel of visual.userData.calibratedWheels) {
      const config = wheel.corner.startsWith("F") ? physics.hitbox.wheels.front : physics.hitbox.wheels.back;
      near(wheel.radius * wheel.pivot.scale.x * original, config.radius * 0.01);
      assert(wheel.pivot.position.toArray().every(Number.isFinite));
    }
    syncCarWheels(car, physics, 1 / 120);
    near(car.scale.x, original);
    const wheels = visual.userData.calibratedWheels;
    visual.updateWorldMatrix(true, true);
    const before = wheels.map(wheel => wheel.meshes[0].getWorldQuaternion(new THREE.Quaternion()));
    physics.vel.set(600, 0, 0).applyQuaternion(physics.q);
    syncCarWheels(car, physics, 1 / 120);
    visual.updateWorldMatrix(true, true);
    wheels.forEach((wheel, index) => {
      const radius = wheel.corner.startsWith("F") ? physics.hitbox.wheels.front.radius : physics.hitbox.wheels.back.radius;
      near(wheel.roll, 5 / radius);
      assert(before[index].angleTo(wheel.meshes[0].getWorldQuaternion(new THREE.Quaternion())) > 0.1);
    });
    physics.vel.negate();
    syncCarWheels(car, physics, 1 / 120);
    for (const wheel of wheels) near(wheel.roll, 0);
    for (const state of physics.wheels) {
      state.inContact = true;
      state.suspensionLength = state.restLength + 8;
    }
    syncCarWheels(car, physics);
    for (const wheel of wheels) {
      const state = physics.wheels.find(state => state.front === wheel.corner.startsWith("F"));
      near(wheel.visualSuspensionLength, state.suspensionLength);
    }
    for (const state of physics.wheels) {
      state.inContact = false;
      state.suspensionLength = state.restLength + 12;
    }
    syncCarWheels(car, physics, 1 / 120);
    const airborneLengths = wheels.map(wheel => wheel.visualSuspensionLength);
    syncCarWheels(car, physics);
    wheels.forEach((wheel, index) => near(wheel.visualSuspensionLength, airborneLengths[index]));
    for (let tick = 0; tick < 60; tick++) syncCarWheels(car, physics, 1 / 120);
    for (const wheel of wheels) {
      const state = physics.wheels.find(state => state.front === wheel.corner.startsWith("F"));
      assert(Math.abs(wheel.visualSuspensionLength - state.restLength) < 0.001);
      near(state.suspensionLength, state.restLength + 12);
    }
    for (const state of physics.wheels) {
      state.inContact = true;
      state.suspensionLength = state.restLength - 3;
    }
    syncCarWheels(car, physics);
    for (const wheel of wheels) {
      const state = physics.wheels.find(state => state.front === wheel.corner.startsWith("F"));
      near(wheel.visualSuspensionLength, state.suspensionLength);
    }
  }
});

test("procedural wheel animation converts physics travel into visual units", () => {
  const car = new THREE.Group(), visual = new THREE.Group();
  car.add(visual);
  car.userData.visual = visual;
  car.scale.setScalar(0.5);
  const spin = new THREE.Group();
  visual.add(spin);
  visual.userData.spinWheels = distance => { spin.rotation.x += distance / 0.25; };
  const physics = makeCar();
  physics.vel.set(600, 0, 0).applyQuaternion(physics.q);
  syncCarWheels(car, physics, 1 / 120);
  near(spin.rotation.x, 0.4);
  syncCarWheels(car, physics);
  near(spin.rotation.x, 0.4);
});

test("procedural wheel groups retract in flight and follow suspension on landing", () => {
  const car = new THREE.Group(), visual = new THREE.Group();
  car.add(visual);
  car.userData.visual = visual;
  visual.userData.wheels = [];
  for (const forward of [1, -1]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side, 0.4, forward);
      pivot.userData.radius = 0.4;
      visual.add(pivot);
      visual.userData.wheels.push(pivot);
    }
  }
  const physics = makeCar();
  for (const state of physics.wheels) state.suspensionLength = state.restLength + 12;
  syncCarWheels(car, physics, 1 / 120);
  for (const wheel of visual.userData.calibratedWheels) {
    const state = physics.wheels.find(state => state.front === wheel.corner.startsWith("F") && state.left === (wheel.center.x > 0));
    near(wheel.pivot.position.y, (state.connection.z - state.restLength) * 0.01);
    near(wheel.radius * wheel.pivot.scale.x, state.radius * 0.01);
    state.inContact = true;
    state.suspensionLength = state.restLength - 4;
  }
  syncCarWheels(car, physics);
  for (const wheel of visual.userData.calibratedWheels) {
    const state = physics.wheels.find(state => state.front === wheel.corner.startsWith("F"));
    near(wheel.pivot.position.y, (state.connection.z - state.suspensionLength) * 0.01);
  }
});