test('Car Soccer comparison camera preset preserves observed public settings', async () => {
  const { CAMERA_PRESETS, matchingCameraPreset } = await import('../../src/shared/cameraPresets.js');
  const preset = CAMERA_PRESETS.find(entry => entry.id === 'car-soccer');
  assert.deepEqual(preset.camera, { fov: 110, height: 100, angle: -3, distance: 270, stiffness: 0.35, swivelSpeed: 4, transitionSpeed: 1, shake: false, ballCamMode: 'toggle' });
  assert.equal(matchingCameraPreset(preset.camera), 'car-soccer');
  assert.equal(matchingCameraPreset({ ...preset.camera, stiffness: 0.36 }), 'custom');
});
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ChaseCamera, applyModeChaseCamera, horizontalFovToVertical } from "../../src/shared/chaseCamera.js";
import { getCamera, setCamera } from "../../src/shared/settings.js";

test("arena camera permits outside-wall and outside-ceiling views by default", () => {
  const views = [
    { target: new THREE.Vector3(40, 10, 0), forward: new THREE.Vector3(-1, 0, 0), outside: camera => camera.position.x > 40.96 },
    { target: new THREE.Vector3(-40, 10, 0), forward: new THREE.Vector3(1, 0, 0), outside: camera => camera.position.x < -40.96 },
    { target: new THREE.Vector3(0, 20, 0), forward: new THREE.Vector3(0, 0, 1), outside: camera => camera.position.y > 20.48 },
  ];
  for (const view of views) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    applyModeChaseCamera(chase, camera, 0, { ...view, onGround: true, snap: true });
    assert(view.outside(camera));
    assert.equal(chase.armLength, null);
    assert(camera.quaternion.toArray().every(Number.isFinite));
  }
});

test("grounded car camera pitches its arm on floor, wall and ceiling while preserving the horizon", () => {
  for (const groundNormal of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)]) {
    for (const lookBehind of [false, true]) {
      const chase = new ChaseCamera();
      const camera = new THREE.PerspectiveCamera();
      const target = new THREE.Vector3(0, 10, 0);
      const options = { target, forward: new THREE.Vector3(0, 0, 1), groundNormal,
        onGround: true, lookBehind, snap: true };
      applyModeChaseCamera(chase, camera, 0, options);
      const settings = getCamera();
      const angle = THREE.MathUtils.degToRad(settings.angle);
      const direction = options.forward.clone().multiplyScalar(lookBehind ? -Math.cos(angle) : Math.cos(angle))
        .addScaledVector(groundNormal, Math.sin(angle));
      const expected = target.clone().addScaledVector(groundNormal, settings.height * 0.01)
        .addScaledVector(direction, -settings.distance * 0.01);
      assert(camera.position.distanceTo(expected) < 1e-10);
      assert(camera.up.equals(new THREE.Vector3(0, 1, 0)));
      assert(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).distanceTo(direction) < 1e-10);
      chase.invalidate();
      assert.equal(chase.surfaceReady, false);
    }
  }
});

test("native FOV uses a 16:9 reference and expands five degrees at maximum speed", () => {
  for (const aspect of [9 / 16, 16 / 9, 1920 / 1071, 21 / 9]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera(50, aspect);
    const options = { target: new THREE.Vector3(0, 10, 0), forward: new THREE.Vector3(0, 0, 1),
      settings: { ...getCamera(), fov: 108 }, velocity: new THREE.Vector3() };
    chase.update(camera, 0, { ...options, snap: true });
    assert(Math.abs(camera.fov - horizontalFovToVertical(108, 16 / 9)) < 1e-10);
    options.velocity.set(23, 0, 0);
    for (let frame = 0; frame < 12; frame++) chase.update(camera, 1 / 60, options);
    assert(Math.abs(camera.fov - horizontalFovToVertical(113, 16 / 9)) < 1e-10);
    options.velocity.set(46, 0, 0);
    chase.update(camera, 1 / 60, options);
    assert(Math.abs(camera.fov - horizontalFovToVertical(113, 16 / 9)) < 1e-10);
  }
});

test("camera FOV settles in both directions at 25 horizontal degrees per second", () => {
  for (const fps of [30, 60, 120, 240]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const settings = { ...getCamera(), fov: 60 };
    const options = { target: new THREE.Vector3(0, 10, 0), forward: new THREE.Vector3(0, 0, 1), settings };
    chase.update(camera, 0, { ...options, snap: true });
    settings.fov = 90;
    for (let frame = 1; frame <= fps; frame++) {
      chase.update(camera, 1 / fps, options);
      assert(Math.abs(camera.fov - horizontalFovToVertical(60 + 25 * frame / fps, 16 / 9)) < 1e-10);
    }
    settings.fov = 60;
    for (let frame = 1; frame <= fps; frame++) {
      chase.update(camera, 1 / fps, options);
      assert(Math.abs(chase.horizontalFov - Math.max(60, 85 - 25 * frame / fps)) < 1e-10);
    }
    settings.fov = 90;
    chase.update(camera, 0, { ...options, snap: true });
    assert.equal(chase.horizontalFov, 90);
  }
});

test("profile height and distance follow measured stationary settling without delaying angle", () => {
  for (const fps of [30, 60, 120, 240]) {
    for (const ballCam of [false, true]) {
      const chase = new ChaseCamera();
      const camera = new THREE.PerspectiveCamera();
      const settings = { ...getCamera(), height: 40, distance: 100, angle: -3 };
      const options = { target: new THREE.Vector3(0, 10, 0), forward: new THREE.Vector3(0, 0, 1),
        lookAt: new THREE.Vector3(0, 11, 10), groundNormal: new THREE.Vector3(0, 1, 0),
        onGround: true, ballCam, settings };
      chase.update(camera, 0, { ...options, snap: true });
      settings.height = 200;
      settings.distance = 400;
      settings.angle = -15;
      for (let frame = 1; frame <= fps; frame++) {
        chase.update(camera, 1 / fps, options);
        assert(Math.abs(chase.profileHeight - (200 - 160 * Math.exp(-2.03 * frame / fps))) < 1e-10);
        assert(Math.abs(chase.profileDistance - (400 - 300 * Math.exp(-4.14 * frame / fps))) < 1e-10);
        assert(camera.position.toArray().every(Number.isFinite));
        if (!ballCam) assert(Math.abs(chase.surfacePitch - THREE.MathUtils.degToRad(-15)) < 1e-10);
      }
      const previousHeight = chase.profileHeight;
      const previousDistance = chase.profileDistance;
      settings.height = 40;
      settings.distance = 100;
      for (let frame = 1; frame <= fps; frame++) {
        chase.update(camera, 1 / fps, options);
        assert(Math.abs(chase.profileHeight - (40 + (previousHeight - 40) * Math.exp(-2.03 * frame / fps))) < 1e-10);
        assert(Math.abs(chase.profileDistance - (100 + (previousDistance - 100) * Math.exp(-4.14 * frame / fps))) < 1e-10);
      }
      chase.invalidate();
      chase.update(camera, 0, options);
      assert.equal(chase.profileHeight, 40);
      assert.equal(chase.profileDistance, 100);
    }
  }
});

test("wall tracking is frame-rate independent and recovers promptly on the floor", () => {
  const endpoints = [];
  for (const fps of [30, 60, 120]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 10, 0), forward: new THREE.Vector3(0, 0, 1),
      groundNormal: new THREE.Vector3(0, 1, 0), onGround: true,
      settings: { ...getCamera(), stiffness: 1 } };
    chase.update(camera, 0, { ...options, snap: true });
    options.groundNormal.set(1, 0, 0);
    for (let frame = 0; frame < fps / 2; frame++) chase.update(camera, 1 / fps, options);
    assert(chase.surfaceUp.x > 0.99);
    endpoints.push(camera.position.clone());
    options.groundNormal.set(0, 1, 0);
    for (let frame = 0; frame < fps / 10; frame++) chase.update(camera, 1 / fps, options);
    assert(chase.surfaceUp.y > 0.999);
    assert(camera.position.toArray().every(Number.isFinite));
  }
  for (const endpoint of endpoints) assert(endpoint.distanceTo(endpoints[0]) < 0.03);
});

test("wall takeoff releases the surface arm gradually and resets cleanly", () => {
  for (const fps of [30, 60, 120]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 10, 0), forward: new THREE.Vector3(0, 1, 1).normalize(),
      groundNormal: new THREE.Vector3(1, 0, 0), onGround: true,
      settings: { ...getCamera(), stiffness: 1 } };
    chase.update(camera, 0, { ...options, snap: true });
    const wallPosition = camera.position.clone();
    options.onGround = false;
    chase.update(camera, 1 / fps, options);
    assert.equal(chase.surfaceReady, true);
    assert(chase.surfaceUp.x > 0.9, "Wall orientation must not disappear on the first airborne frame");
    assert(camera.position.distanceTo(wallPosition) < 1);
    for (let frame = 0; frame < fps * 6; frame++) chase.update(camera, 1 / fps, options);
    assert.equal(chase.surfaceReady, false);
    assert(camera.position.toArray().every(Number.isFinite));
    options.onGround = true;
    chase.update(camera, 0, { ...options, snap: true });
    options.onGround = false;
    chase.update(camera, 0, { ...options, snap: true });
    assert.equal(chase.surfaceReady, false, "Airborne resets must not inherit the previous wall arm");
  }
});

test("steep wall views remain pitch-bounded through takeoff", () => {
  for (const fps of [30, 60, 120]) {
    for (const vertical of [-1, 1]) {
      const chase = new ChaseCamera();
      const camera = new THREE.PerspectiveCamera();
      const options = { target: new THREE.Vector3(0, 20, 0),
        forward: new THREE.Vector3(0, vertical, 0.01).normalize(),
        groundNormal: new THREE.Vector3(1, 0, 0), onGround: true };
      chase.update(camera, 0, { ...options, snap: true });
      for (let frame = 0; frame < fps; frame++) {
        const direction = camera.getWorldDirection(new THREE.Vector3());
        assert(Math.abs(Math.asin(direction.y)) <= 65 * Math.PI / 180 + 1e-10);
        assert(camera.quaternion.toArray().every(Number.isFinite));
        options.onGround = false;
        chase.update(camera, 1 / fps, options);
      }
    }
  }
});

test("floor ball camera holds the configured pitch for a resting ball and raises toward its lower edge", () => {
  const chase = new ChaseCamera();
  const camera = new THREE.PerspectiveCamera();
  const options = { target: new THREE.Vector3(0, 0.17, 0), forward: new THREE.Vector3(0, 0, 1),
    groundNormal: new THREE.Vector3(0, 1, 0), onGround: true, ballCam: true,
    settings: { fov: 108, height: 80, angle: -3, distance: 270, stiffness: 1, shake: false },
    lookAt: new THREE.Vector3(0, 0.93, 10) };
  chase.update(camera, 0, { ...options, snap: true });
  assert(Math.abs(chase._ballPitch - THREE.MathUtils.degToRad(-3)) < 1e-10);
  options.lookAt.y = 4;
  chase.update(camera, 0, { ...options, snap: true });
  assert(Math.abs(chase._ballPitch - Math.atan2(4 - 0.17 - 0.8 - 0.9125, 10)) < 1e-8);
});

test("ball camera bounds close-pass rotation and holds overhead heading across frame rates", () => {
  for (const fps of [30, 60, 120, 240]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = {
      target: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      lookAt: new THREE.Vector3(0, 2, 10),
      ballCam: true,
    };
    chase.update(camera, 0, { ...options, snap: true });
    options.lookAt.set(0, 10, -0.1);
    chase.update(camera, 1 / fps, options);
    assert.equal(chase._ballYaw, 0, "Near-overhead ball must not reverse heading");
    options.lookAt.set(0.9, 2, 0);
    for (let frame = 0; frame < fps / 2; frame++) chase.update(camera, 1 / fps, options);
    assert(Math.abs(chase._ballYaw - Math.PI / 2) < 0.02, "Close ball must converge promptly rather than trail a moving target");
    for (let frame = 0; frame < fps * 3; frame++) chase.update(camera, 1 / fps, options);
    assert(Math.abs(chase._ballYaw - Math.PI / 2) < 0.001, "Close ball tracking must not freeze inside 100 UU");
    options.lookAt.set(0, 10, -10);
    for (let frame = 0; frame < fps * 4; frame++) {
      const yaw = chase._ballYaw;
      const pitch = chase._ballPitch;
      chase.update(camera, 1 / fps, options);
      assert(Math.abs(chase._ballYaw - yaw) <= 3 * Math.PI / fps + 1e-10);
      assert(Math.abs(chase._ballPitch - pitch) <= Math.PI / (2 * fps) + 1e-10);
    }
    assert(Math.abs(Math.abs(chase._ballYaw) - Math.PI) < 0.001, "Tracking must still reach the ball");
  }
});

test("airborne rear view follows current car heading rather than held takeoff heading", () => {
  const chase = new ChaseCamera();
  const camera = new THREE.PerspectiveCamera();
  const options = { target: new THREE.Vector3(0, 10, 0), forward: new THREE.Vector3(0, 0, 1), onGround: true };
  chase.update(camera, 0, { ...options, snap: true });
  options.onGround = false;
  options.forward.set(1, 0, 0);
  options.lookBehind = true;
  chase.update(camera, 1 / 120, options);
  assert(camera.getWorldDirection(new THREE.Vector3()).x < -0.99);
  chase.wallFlight = true;
  chase.surfaceReady = true;
  chase.surfaceYaw = 0;
  chase.surfacePitch = 0;
  chase.surfaceUp.set(1, 0, 0);
  for (let frame = 0; frame < 120; frame++) chase.update(camera, 1 / 120, options);
  const view = camera.getWorldDirection(new THREE.Vector3());
  assert(view.x < -0.99);
  assert(Math.abs(view.z) < 1e-8);
  options.lookBehind = false;
  for (let frame = 0; frame < 120; frame++) chase.update(camera, 1 / 120, options);
  assert(camera.getWorldDirection(view).z > 0.99);
});

test("rear view keeps the hidden moving-ball tracker current before release", () => {
  for (const fps of [30, 60, 120, 240]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1),
      lookAt: new THREE.Vector3(0, 2, 10), ballCam: true, onGround: true };
    chase.update(camera, 0, { ...options, snap: true });
    options.lookBehind = true;
    options.lookAt.set(10, 2, 0);
    chase.update(camera, 1 / fps, options);
    assert(camera.getWorldDirection(new THREE.Vector3()).z < -0.99);
    for (let frame = 0; frame < fps * 3; frame++) chase.update(camera, 1 / fps, options);
    assert(Math.abs(chase._ballYaw - Math.PI / 2) < 0.001);
    const rearDirection = camera.getWorldDirection(new THREE.Vector3());
    assert(rearDirection.z < -0.99);
    assert(Math.abs(rearDirection.x) < 1e-8);
    options.lookBehind = false;
    chase.update(camera, 1 / fps, options);
    assert(Math.abs(chase._ballYaw - Math.PI / 2) < 0.001);
  }
});

test("airborne ball camera tracks below the car and recovers smoothly on landing", () => {
  for (const fps of [30, 60, 120]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 10, 0), forward: new THREE.Vector3(0, 0, 1),
      lookAt: new THREE.Vector3(0, 10, 10), ballCam: true, onGround: true };
    chase.update(camera, 0, { ...options, snap: true });
    options.onGround = false;
    options.lookAt.set(0, 0, 10);
    for (let frame = 0; frame < fps * 2; frame++) {
      const previous = camera.quaternion.clone();
      chase.update(camera, 1 / fps, options);
      assert(previous.angleTo(camera.quaternion) <= Math.PI / (2 * fps) + 1e-8);
    }
    assert(chase._ballPitch < -Math.PI / 6);
    options.onGround = true;
    for (let frame = 0; frame < fps * 2; frame++) {
      const previous = camera.quaternion.clone();
      chase.update(camera, 1 / fps, options);
      assert(previous.angleTo(camera.quaternion) <= Math.PI / (2 * fps) + 1e-8);
    }
    assert(Math.abs(chase._ballPitch - THREE.MathUtils.degToRad(getCamera().angle)) < 0.001);
  }
});

test("car camera eases into a sideways landing with a supplied ground normal", () => {
  const endpoints = [];
  const reference = {
    30: [[1, 0.03741455], [3, 0.20953368], [8, 0.78112793], [15, 0.99676514]],
    60: [[1, 0.01123047], [6, 0.21533202], [15, 0.76263428], [30, 0.99731445]],
    120: [[1, 0.00305176], [12, 0.21740723], [30, 0.77484131], [60, 0.99725342]],
  };
  for (const fps of [30, 60, 120]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 3, 0), forward: new THREE.Vector3(0, 0, 1),
      groundNormal: new THREE.Vector3(0, 1, 0), onGround: true, ballCam: false,
      settings: { ...getCamera(), stiffness: 0.35 } };
    chase.update(camera, 0, { ...options, snap: true });
    options.onGround = false;
    chase.update(camera, 1 / fps, options);
    options.forward.set(1, 0, 0);
    chase.update(camera, 1 / fps, options);
    const airborneRotation = camera.quaternion.clone();
    options.onGround = true;
    chase.update(camera, 0, options);
    assert(airborneRotation.angleTo(camera.quaternion) < 0.001, "Contact alone must not snap the view heading");
    chase.update(camera, 1 / fps, options);
    assert(airborneRotation.angleTo(camera.quaternion) < Math.PI / 4, "First landing frame must not turn directly behind the car");
    for (let frame = 1; frame <= fps; frame++) {
      if (frame > 1) chase.update(camera, 1 / fps, options);
      const sample = reference[fps].find(([sampleFrame]) => sampleFrame === frame);
      if (sample) assert(Math.abs(chase.surfaceYaw - sample[1] * Math.PI / 2) < 0.006,
        `Landing recovery differs from Car Soccer at ${fps} Hz, frame ${frame}`);
    }
    endpoints.push(camera.position.clone());
    for (let frame = 0; frame < fps * 2; frame++) chase.update(camera, 1 / fps, options);
    assert(Math.abs(chase.surfaceYaw - Math.PI / 2) < 0.001);
  }
  for (const endpoint of endpoints) assert(endpoint.distanceTo(endpoints[0]) < 0.03);
});

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
    assert(Math.abs(simulate(1, 60, 30) - simulate(10, 60, 30)) < 1e-8);
    assert(Math.abs(simulate(2.5, 30, 1) - simulate(2.5, 120, 1)) < 1e-10);
  } finally {
    setCamera("swivelSpeed", previous);
  }
});

test("native pitch swivel caches input and truncates the interpolated Unreal angle", () => {
  const previous = getCamera().swivelSpeed;
  try {
    for (const speed of [1, 5.5, 10]) {
      setCamera("swivelSpeed", speed);
      for (const fps of [30, 60, 120, 240]) {
        const chase = new ChaseCamera();
        const camera = new THREE.PerspectiveCamera();
        const options = { target: new THREE.Vector3(0, 3, 0), forward: new THREE.Vector3(0, 0, 1), lookUp: 1 };
        chase.update(camera, 0, { ...options, snap: true });
        chase.swivelPitch = 657 * Math.PI / 32768;
        let expectedUnits = 657;
        let cachedTarget = 0;
        const measured = [[1, 5500], [0, 0], [-1, -8900], [-0.5, -5353], [0.5, 3291], [0, 0]];
        for (const [lookUp, targetUnits] of measured.flatMap(sample => Array(fps).fill(sample))) {
          expectedUnits = Math.trunc(expectedUnits + (cachedTarget - expectedUnits) *
            Math.min(1, speed * (cachedTarget ? 1 : 2) / fps));
          cachedTarget = targetUnits;
          chase.update(camera, 1 / fps, { ...options, lookUp });
          assert.equal(Math.round(chase.swivelPitch * 32768 / Math.PI), expectedUnits);
        }
        chase.invalidate();
        chase.update(camera, 1 / fps, options);
        assert.equal(chase.swivelPitch, 0);
      }
    }
  } finally {
    setCamera("swivelSpeed", previous);
  }
});

test("moving wall orientation converges across render rates without vertical yaw flips", () => {
  const endpoints = [];
  for (const fps of [30, 60, 120, 240]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 20, 0), forward: new THREE.Vector3(0, 0, 1),
      groundNormal: new THREE.Vector3(1, 0, 0), onGround: true };
    chase.update(camera, 0, { ...options, snap: true });
    options.forward.set(0, 1, 0.01).normalize();
    for (let frame = 0; frame < fps; frame++) chase.update(camera, 1 / fps, options);
    const yaw = chase.surfaceYaw;
    options.forward.z *= -1;
    for (let frame = 0; frame < fps; frame++) chase.update(camera, 1 / fps, options);
    assert(Math.abs(chase.surfaceYaw - yaw) < 1e-10);
    endpoints.push(camera.quaternion.clone());
  }
  for (const endpoint of endpoints) assert(endpoint.angleTo(endpoints[0]) < 1e-6);
});

test("wall car-ball transitions retain their actual view and survive interrupted toggles", () => {
  for (const fps of [30, 60, 120]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 20, 0), forward: new THREE.Vector3(0, 1, 1).normalize(),
      groundNormal: new THREE.Vector3(1, 0, 0), onGround: true,
      lookAt: new THREE.Vector3(0, 30, 10), ballCam: false };
    applyModeChaseCamera(chase, camera, 0, { ...options, snap: true });
    const original = camera.quaternion.clone();
    options.ballCam = true;
    applyModeChaseCamera(chase, camera, 0, options);
    assert(camera.quaternion.angleTo(original) < 1e-7);
    for (let frame = 0; frame < 4; frame++) applyModeChaseCamera(chase, camera, 1 / fps, options);
    options.ballCam = false;
    const interrupted = camera.quaternion.clone();
    applyModeChaseCamera(chase, camera, 0, options);
    assert(camera.quaternion.angleTo(interrupted) < 1e-7);
    for (let frame = 0; frame < fps; frame++) applyModeChaseCamera(chase, camera, 1 / fps, options);
    assert.equal(chase.ballCamBlend, 0);
    assert(camera.quaternion.angleTo(original) < 1e-7);
  }
});

test("native camera transition duration and quadratic ease-out match low midpoint and maximum speeds", () => {
  for (const speed of [1, 1.5, 1.8, 2]) {
    for (const fps of [30, 60, 120, 240]) {
      const chase = new ChaseCamera();
      const camera = new THREE.PerspectiveCamera();
      const options = { target: new THREE.Vector3(0, 10, 0), forward: new THREE.Vector3(0, 0, 1),
        onGround: true, lookAt: new THREE.Vector3(10, 13, 6), ballCam: false,
        settings: { ...getCamera(), transitionSpeed: speed } };
      chase.update(camera, 0, { ...options, snap: true });
      const duration = (2 - speed) / 2;
      for (const ballCam of [true, false]) {
        options.ballCam = ballCam;
        for (let frame = 1; frame <= Math.ceil(fps * 0.5); frame++) {
          chase.update(camera, 1 / fps, options);
          const progress = duration > 0 ? Math.min(1, frame / fps / duration) : 1;
          const expected = ballCam ? 1 - (1 - progress) ** 2 : (1 - progress) ** 2;
          assert(Math.abs(chase.ballCamBlend - expected) < 1e-10);
        }
      }
    }
  }
});

test("floor car rear view switches on the recorded control edge", () => {
  for (const fps of [30, 60, 120, 240]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 0.17, 0), forward: new THREE.Vector3(0, 0, 1),
      groundNormal: new THREE.Vector3(0, 1, 0), onGround: true, ballCam: false };
    chase.update(camera, 0, { ...options, snap: true });
    const original = camera.quaternion.clone();
    chase.update(camera, 1 / fps, { ...options, lookBehind: true });
    assert.equal(chase.rearYaw, Math.PI);
    assert(Math.abs(camera.quaternion.angleTo(original) - Math.PI) < 1e-7);
    chase.update(camera, 1 / fps, { ...options, lookBehind: false });
    assert.equal(chase.rearYaw, 0);
    assert(camera.quaternion.angleTo(original) < 1e-7);
  }
});

test("airborne rear view switches immediately, holds steady and respawns discard inherited state", () => {
  for (const fps of [30, 60, 120]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 20, 0), forward: new THREE.Vector3(0, 0, 1), onGround: false };
    chase.update(camera, 0, { ...options, snap: true });
    const original = camera.quaternion.clone();
    options.lookBehind = true;
    for (let frame = 0; frame < fps; frame++) {
      const previous = camera.quaternion.clone();
      chase.update(camera, 1 / fps, options);
      if (frame === 0) assert(Math.abs(original.angleTo(camera.quaternion) - Math.PI) < 1e-7);
      else assert(previous.angleTo(camera.quaternion) < 1e-7);
    }
    assert.equal(chase.rearYaw, Math.PI);
    chase.wallFlight = true;
    chase.surfaceYaw = 2;
    chase.armLength = 0.1;
    chase.invalidate();
    assert.equal(chase.wallFlight, false);
    assert.equal(chase.surfaceYaw, null);
    assert.equal(chase.armLength, null);
    assert.equal(chase.rearYaw, 0);
    options.lookBehind = false;
    chase.update(camera, Number.NaN, { ...options, snap: true });
    assert(camera.position.toArray().every(Number.isFinite));
  }
});

test("wall rear-view press and release preserve the view at zero elapsed time", () => {
  for (const airborne of [false, true]) {
    const chase = new ChaseCamera();
    const camera = new THREE.PerspectiveCamera();
    const options = { target: new THREE.Vector3(0, 20, 0),
      forward: new THREE.Vector3(0, 1, 1).normalize(),
      groundNormal: new THREE.Vector3(1, 0, 0), onGround: true };
    chase.update(camera, 0, { ...options, snap: true });
    options.onGround = !airborne;
    for (const lookBehind of [true, false]) {
      const position = camera.position.clone();
      const rotation = camera.quaternion.clone();
      options.lookBehind = lookBehind;
      chase.update(camera, 0, options);
      assert(camera.position.distanceTo(position) < 1e-7);
      assert(camera.quaternion.angleTo(rotation) < 1e-7);
      for (let frame = 0; frame < 60; frame++) chase.update(camera, 1 / 120, options);
    }
  }
});

test("optional arena obstruction shortens immediately and extends smoothly", () => {
  const chase = new ChaseCamera();
  const camera = new THREE.PerspectiveCamera();
  const options = { target: new THREE.Vector3(40, 10, 0), forward: new THREE.Vector3(-1, 0, 0),
    onGround: true, arenaCollision: true };
  chase.update(camera, 0, { ...options, snap: true });
  assert(camera.position.x < 40.96);
  const shortened = chase.armLength;
  options.target.x = 0;
  chase.update(camera, 1 / 60, options);
  assert(chase.armLength > shortened);
  assert(chase.armLength < getCamera().distance * 0.01);
  for (let frame = 0; frame < 120; frame++) chase.update(camera, 1 / 60, options);
  assert(Math.abs(chase.armLength - getCamera().distance * 0.01) < 1e-5);
});