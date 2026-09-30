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
  }
});