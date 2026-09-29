/**
 * Exhaustive air-control checks vs RocketSim formulas + body-axis roll.
 * Run: node tools/air-control-parity.mjs
 */
import * as THREE from "three";
import {
  AerialBody,
  RL,
  RS,
  aerialControlAxes,
  axes,
  makePhysCar,
  stepCar,
  withFreeAirRoll,
} from "../src/shared/carPhysics.js";

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

const idle = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  boost: false,
  jump: false,
  powerslide: false,
};

const scale = RS.CAR_TORQUE_SCALE;
check(
  "torque magnitudes match RocketSim×scale",
  Math.abs(RL.T_ROLL - RS.AIR_CONTROL_TORQUE.roll * scale) < 1e-12 &&
    Math.abs(RL.T_PITCH - RS.AIR_CONTROL_TORQUE.pitch * scale) < 1e-12 &&
    Math.abs(RL.T_YAW - RS.AIR_CONTROL_TORQUE.yaw * scale) < 1e-12,
  `T=${RL.T_ROLL.toFixed(6)}/${RL.T_PITCH.toFixed(6)}/${RL.T_YAW.toFixed(6)}`,
);
check(
  "damping magnitudes match RocketSim×scale",
  Math.abs(RL.D_ROLL + RS.AIR_CONTROL_DAMPING.roll * scale) < 1e-12 &&
    Math.abs(RL.D_PITCH + RS.AIR_CONTROL_DAMPING.pitch * scale) < 1e-12 &&
    Math.abs(RL.D_YAW + RS.AIR_CONTROL_DAMPING.yaw * scale) < 1e-12,
);

// Body-axis roll from many start pitches: ω must stay on −forward.
for (const pitchDeg of [0, 30, 45, 70, 90, 120, 150]) {
  const car = makePhysCar(new THREE.Vector3(0, 0, 600), 0);
  car.onGround = false;
  const pitch = (pitchDeg * Math.PI) / 180;
  // Apply pitch via controls until near target, or set via omega integration
  if (pitchDeg > 0) {
    const ticks = Math.round(((pitchDeg * Math.PI) / 180 / 5.5) * 120) + 5;
    for (let i = 0; i < ticks; i++) stepCar(car, { ...idle, pitch: 1 }, 1 / 120);
  }
  car.omega.set(0, 0, 0);
  let maxOff = 0;
  for (let i = 0; i < 48; i++) {
    stepCar(car, { ...idle, roll: 1 }, 1 / 120);
    const a = axes(car.q);
    const w = car.omega;
    if (w.length() < 0.2) continue;
    const wn = w.clone().normalize();
    maxOff = Math.max(maxOff, Math.hypot(wn.dot(a.l), wn.dot(a.u)));
  }
  check(
    `carSim roll body-axis from pitch ${pitchDeg}°`,
    maxOff < 0.02,
    `offAxis=${maxOff.toFixed(4)}`,
  );
}

// AerialBody matches carSim |ω|(t) for pure axes
for (const axis of /** @type {const} */ (["roll", "pitch", "yaw"])) {
  const car = makePhysCar(new THREE.Vector3(0, 0, 500), 0);
  car.onGround = false;
  const obj = new THREE.Object3D();
  const body = new AerialBody();
  let maxDw = 0;
  for (let i = 0; i < 90; i++) {
    stepCar(car, { ...idle, [axis]: 1 }, 1 / 120);
    body.step(
      obj,
      axis === "roll" ? 1 : 0,
      axis === "pitch" ? 1 : 0,
      axis === "yaw" ? 1 : 0,
      1 / 120,
    );
    maxDw = Math.max(maxDw, Math.abs(car.omega.length() - body.omega.length()));
  }
  check(`AerialBody |ω| matches carSim (${axis})`, maxDw < 1e-5, `maxΔ=${maxDw}`);
}

// Free air-roll remap
{
  const mapped = withFreeAirRoll(
    { ...idle, powerslide: true, yaw: 1, roll: 0 },
    { onGround: false },
  );
  check("free air-roll: yaw→roll", mapped.roll === 1 && mapped.yaw === 0);
  const grounded = withFreeAirRoll(
    { ...idle, powerslide: true, yaw: 1, roll: 0 },
    { onGround: true },
  );
  check("free air-roll: off on ground", grounded.roll === 0 && grounded.yaw === 1);
  const button = withFreeAirRoll(
    { ...idle, powerslide: true, yaw: 1, roll: -1 },
    { onGround: false },
  );
  check(
    "free air-roll: directional button wins",
    button.roll === -1 && button.yaw === 1,
  );
}

// aerialControlAxes used by drills
{
  const a = aerialControlAxes(
    { pitch: 0, yaw: 0.8, roll: 0, powerslide: true, airLeft: false, airRight: false },
    { onGround: false },
  );
  check("aerialControlAxes free-roll", Math.abs(a.roll - 0.8) < 1e-9 && a.yaw === 0);
}

// Roll damping always on; pitch damping off at full input
{
  const carR = makePhysCar(new THREE.Vector3(0, 0, 500), 0);
  carR.onGround = false;
  for (let i = 0; i < 50; i++) stepCar(carR, { ...idle, roll: 1 }, 1 / 120);
  const peakR = carR.omega.length();
  for (let i = 0; i < 30; i++) stepCar(carR, { ...idle }, 1 / 120);
  check(
    "roll damps while held at cap then coasts",
    peakR > 5.4 && carR.omega.length() < peakR * 0.55,
    `peak=${peakR.toFixed(3)} after=${carR.omega.length().toFixed(3)}`,
  );

  const carP = makePhysCar(new THREE.Vector3(0, 0, 500), 0);
  carP.onGround = false;
  for (let i = 0; i < 80; i++) stepCar(carP, { ...idle, pitch: 1 }, 1 / 120);
  check(
    "full pitch reaches ang-vel cap (damping off at full input)",
    carP.omega.length() > 5.49,
    `|w|=${carP.omega.length().toFixed(3)}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
