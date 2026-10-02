import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ChaseCamera } from "../../src/shared/chaseCamera.js";
import { getCamera, setCamera } from "../../src/shared/settings.js";

test("chase heading holds through jumps and sideways flips until landing", () => {
  for (const fps of [30, 60, 120]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = {
      target: new THREE.Vector3(0, 3, 0),
      forward: new THREE.Vector3(0, 0, 1),
      velocity: new THREE.Vector3(0, 0, 10),
      onGround: true,
    };
    chase.update(camera, 0, { ...options, snap: true });
    const takeoffYaw = chase._followYaw;
    for (let frame = 0; frame < fps; frame++) {
      options.forward.set(Math.sin(frame), Math.cos(frame), 0);
      options.velocity.set(10, 2, 0);
      options.onGround = false;
      chase.update(camera, 1 / fps, options);
      assert.equal(chase._followYaw, takeoffYaw);
    }
    options.forward.set(1, 0, 0);
    options.onGround = true;
    chase.update(camera, 1 / fps, options);
    assert(chase._followYaw > takeoffYaw);
    assert(chase._followYaw < Math.PI / 2, "Landing catches up rather than snapping");
    for (let frame = 0; frame < fps * 3; frame++) chase.update(camera, 1 / fps, options);
    assert(Math.abs(chase._followYaw - Math.PI / 2) < 0.001);
    options.onGround = false;
    options.velocity.set(0, 0, -10);
    chase.update(camera, 0, { ...options, snap: true });
    assert(Math.abs(chase._followYaw) === Math.PI, "Airborne respawns initialize their own heading");
  }
});

test("swivel speed changes response rate, not angular range, independently of FPS", () => {
  const previous = getCamera().swivelSpeed;
  const simulate = (speed, fps, seconds) => {
    setCamera("swivelSpeed", speed);
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 3, 0), forward: new THREE.Vector3(0, 0, 1), lookRight: 1 };
    chase.update(camera, 0, { ...options, snap: true });
    for (let frame = 0; frame < fps * seconds; frame++) chase.update(camera, 1 / fps, options);
    return chase.swivelYaw;
  };
  try {
    assert(simulate(10, 60, 0.1) > simulate(1, 60, 0.1));
    assert(Math.abs(simulate(1, 60, 5) - simulate(10, 60, 5)) < 1e-8);
    assert(Math.abs(simulate(2.5, 30, 1) - simulate(2.5, 120, 1)) < 1e-10);
  } finally {
    setCamera("swivelSpeed", previous);
  }
});