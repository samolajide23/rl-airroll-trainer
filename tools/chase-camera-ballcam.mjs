/**
 * Smoke-test RL ball-cam Focus − Forward×Distance geometry.
 * Run: node tools/chase-camera-ballcam.mjs
 */
import * as THREE from "three";

// Minimal localStorage so settings.js can load under Node.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

const { ChaseCamera, RL_CAMERA, UU } = await import(
  "../src/shared/chaseCamera.js"
);
const { setCamera, DEFAULT_CAMERA } = await import("../src/shared/settings.js");

let pass = 0;
let fail = 0;

/** @param {string} name @param {boolean} cond @param {string} [detail] */
function check(name, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log("PASS", name, detail ? `— ${detail}` : "");
  } else {
    fail += 1;
    console.log("FAIL", name, detail ? `— ${detail}` : "");
  }
}

function near(a, b, eps = 1e-3) {
  return Math.abs(a - b) <= eps;
}

setCamera("ballCam", true);
setCamera("distance", DEFAULT_CAMERA.distance);
setCamera("height", DEFAULT_CAMERA.height);
setCamera("angle", DEFAULT_CAMERA.angle);

const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 500);
const chase = new ChaseCamera();
const car = new THREE.Vector3(0, 0, 0);
const forward = new THREE.Vector3(0, 0, 1);
// Ball ahead and above the car.
const ball = new THREE.Vector3(0, 20, 40);

chase.update(cam, 1 / 60, {
  target: car,
  forward,
  lookAt: ball,
  ballCam: true,
  snap: true,
});

const heightM = DEFAULT_CAMERA.height * UU;
const distM = DEFAULT_CAMERA.distance * UU;
const focus = new THREE.Vector3(0, heightM, 0);
const toBall = ball.clone().sub(focus);
const horiz = Math.hypot(toBall.x, toBall.z);
const angleRad = THREE.MathUtils.degToRad(DEFAULT_CAMERA.angle);
const rawPitch = Math.atan2(toBall.y, horiz);
const pitch = Math.max(angleRad, Math.min(RL_CAMERA.BALL_CAM_MAX_PITCH, rawPitch));
const yaw = Math.atan2(toBall.x, toBall.z);
const expectedFwd = new THREE.Vector3(
  Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  Math.cos(yaw) * Math.cos(pitch),
).normalize();
const expectedPos = focus.clone().addScaledVector(expectedFwd, -distM);
// ClipToField — same soft floor as ChaseCamera.
expectedPos.y = Math.max(expectedPos.y, RL_CAMERA.CLIP_MIN_Z_UU * UU);

check(
  "ball cam: car between camera and ball (dot)",
  (() => {
    const camToCar = car.clone().sub(cam.position);
    const camToBall = ball.clone().sub(cam.position);
    return camToCar.dot(camToBall) > 0 && camToCar.length() < camToBall.length();
  })(),
);

check(
  "ball cam: position ≈ Focus − Forward×Distance",
  near(cam.position.x, expectedPos.x, 0.05) &&
    near(cam.position.y, expectedPos.y, 0.05) &&
    near(cam.position.z, expectedPos.z, 0.05),
  `got ${cam.position.toArray().map((n) => n.toFixed(3))} expected ${expectedPos.toArray().map((n) => n.toFixed(3))}`,
);

// Ground ball: pitch should clamp to Angle (not dive into the floor).
const groundBall = new THREE.Vector3(0, 0.9, 30);
chase.invalidate();
chase.update(cam, 1 / 60, {
  target: car,
  forward,
  lookAt: groundBall,
  ballCam: true,
  snap: true,
});
const lookDir = new THREE.Vector3()
  .subVectors(chase.smoothLook, cam.position)
  .normalize();
const lookPitch = Math.asin(THREE.MathUtils.clamp(lookDir.y, -1, 1));
check(
  "ball cam: ground ball pitch ≥ Angle",
  lookPitch >= angleRad - 0.02,
  `pitch=${lookPitch.toFixed(4)} angle=${angleRad.toFixed(4)}`,
);

// Car cam: arm stays behind car forward.
setCamera("ballCam", false);
chase.invalidate();
chase.update(cam, 1 / 60, {
  target: car,
  forward,
  lookAt: ball,
  ballCam: false,
  snap: true,
});
check(
  "car cam: behind car on −Z",
  cam.position.z < -distM * 0.5 && Math.abs(cam.position.x) < 0.5,
  `pos=${cam.position.toArray().map((n) => n.toFixed(3))}`,
);

// TransitionSpeed: BakkesMod linterp finishes in ~1/(speed*scale) seconds.
setCamera("transitionSpeed", 1.0);
chase.invalidate();
chase.update(cam, 1 / 60, {
  target: car,
  forward,
  lookAt: ball,
  ballCam: false,
  snap: true,
});
chase.update(cam, 1 / 60, {
  target: car,
  forward,
  lookAt: ball,
  ballCam: true,
});
check(
  "transition: starts near 0 after toggle",
  chase.ballCamBlend < 0.15,
  `blend=${chase.ballCamBlend.toFixed(3)}`,
);
const scale = RL_CAMERA.TRANSITION_SPEED_SCALE;
const dt = 1 / 60;
let steps = 0;
while (chase.ballCamBlend < 0.999 && steps < 120) {
  chase.update(cam, dt, {
    target: car,
    forward,
    lookAt: ball,
    ballCam: true,
  });
  steps += 1;
}
const expectedSteps = Math.ceil(60 / (1.0 * scale));
check(
  "transition: completes near 1/(speed*scale) s",
  steps <= expectedSteps + 1 && chase.ballCamBlend >= 0.999,
  `steps=${steps} expected≈${expectedSteps} blend=${chase.ballCamBlend.toFixed(3)}`,
);

// --- Car-cam follow: translation never lags; yaw softens with stiffness. ---
setCamera("ballCam", false);
setCamera("stiffness", 0.5);
setCamera("distance", DEFAULT_CAMERA.distance);
setCamera("height", DEFAULT_CAMERA.height);
chase.invalidate();
const driveCar = new THREE.Vector3(0, 0, 0);
const driveFwd = new THREE.Vector3(0, 0, 1);
chase.update(cam, 1 / 60, {
  target: driveCar,
  forward: driveFwd,
  snap: true,
});
driveCar.z = 50;
chase.update(cam, 1 / 60, { target: driveCar, forward: driveFwd });
const jumpErr = Math.hypot(
  cam.position.x - 0,
  cam.position.y - heightM,
  cam.position.z - (50 - distM),
);
check(
  "car cam: body snaps with car on 50m jump (no TransitionSpeed crawl)",
  jumpErr < 1e-4,
  `err=${jumpErr.toExponential(2)} pos=${cam.position.toArray().map((n) => n.toFixed(3))}`,
);

// After a hard 90° turn at default stiffness, settle within ~10 frames (~167ms).
chase.invalidate();
driveCar.set(0, 0, 0);
driveFwd.set(0, 0, 1);
chase.update(cam, 1 / 60, {
  target: driveCar,
  forward: driveFwd,
  snap: true,
});
driveFwd.set(1, 0, 0);
let turnSteps = 0;
let turnErr = Infinity;
while (turnSteps < 30) {
  chase.update(cam, 1 / 60, { target: driveCar, forward: driveFwd });
  const ideal = new THREE.Vector3(
    driveCar.x - distM,
    heightM,
    driveCar.z,
  );
  turnErr = cam.position.distanceTo(ideal);
  turnSteps += 1;
  if (turnErr < 0.08) break;
}
check(
  "car cam: stiff 0.5 settles 90° turn within ~10 frames",
  turnSteps <= 12 && turnErr < 0.08,
  `steps=${turnSteps} err=${turnErr.toFixed(3)}`,
);

// Stiffness 1 is a metal pole — nearly locked within 3 frames (~50ms).
setCamera("stiffness", 1);
chase.invalidate();
driveCar.set(0, 0, 0);
driveFwd.set(0, 0, 1);
chase.update(cam, 1 / 60, {
  target: driveCar,
  forward: driveFwd,
  snap: true,
});
driveFwd.set(1, 0, 0);
for (let i = 0; i < 3; i++) {
  chase.update(cam, 1 / 60, { target: driveCar, forward: driveFwd });
}
const poleIdeal = new THREE.Vector3(-distM, heightM, 0);
const poleErr = cam.position.distanceTo(poleIdeal);
check(
  "car cam: stiff 1.0 metal-pole within 3 frames",
  poleErr < 0.05,
  `err=${poleErr.toFixed(4)}`,
);

// Forward flip tumble: chase yaw must not whip ~180° (RL keeps momentum/stable yaw).
setCamera("stiffness", 0.5);
setCamera("ballCam", false);
chase.invalidate();
const flipCar = new THREE.Vector3(0, 2, 0);
const flipFwd = new THREE.Vector3(0, 0, 1);
const flipVel = new THREE.Vector3(0, 0, 15); // forward momentum
chase.update(cam, 1 / 60, {
  target: flipCar,
  forward: flipFwd,
  velocity: flipVel,
  onGround: false,
  snap: true,
});
let maxFlipYawJump = 0;
let prevFlipYaw = chase._followYaw;
for (let i = 0; i < 78; i++) {
  const pitch = (i / 78) * Math.PI * 2;
  flipFwd.set(0, Math.sin(pitch), Math.cos(pitch));
  flipCar.z += flipVel.z / 60;
  chase.update(cam, 1 / 60, {
    target: flipCar,
    forward: flipFwd,
    velocity: flipVel,
    onGround: false,
  });
  let dYaw = chase._followYaw - prevFlipYaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  maxFlipYawJump = Math.max(maxFlipYawJump, Math.abs(dYaw));
  prevFlipYaw = chase._followYaw;
}
check(
  "car cam: flip tumble does not whip yaw (>45°/frame)",
  maxFlipYawJump < Math.PI / 4,
  `maxJumpRad=${maxFlipYawJump.toFixed(3)}`,
);

// Stationary flip (no momentum): must hold yaw, not reverse when nose faces back.
chase.invalidate();
flipCar.set(0, 2, 0);
flipFwd.set(0, 0, 1);
const zeroVel = new THREE.Vector3(0, 0, 0);
chase.update(cam, 1 / 60, {
  target: flipCar,
  forward: flipFwd,
  velocity: zeroVel,
  onGround: false,
  snap: true,
});
maxFlipYawJump = 0;
prevFlipYaw = chase._followYaw;
for (let i = 0; i < 78; i++) {
  const pitch = (i / 78) * Math.PI * 2;
  flipFwd.set(0, Math.sin(pitch), Math.cos(pitch));
  chase.update(cam, 1 / 60, {
    target: flipCar,
    forward: flipFwd,
    velocity: zeroVel,
    onGround: false,
  });
  let dYaw = chase._followYaw - prevFlipYaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  maxFlipYawJump = Math.max(maxFlipYawJump, Math.abs(dYaw));
  prevFlipYaw = chase._followYaw;
}
check(
  "car cam: stationary flip holds yaw (no reverse whip)",
  maxFlipYawJump < 0.05,
  `maxJumpRad=${maxFlipYawJump.toFixed(3)}`,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
