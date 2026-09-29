/**
 * Screen-space / paint-side orientation checks for Free Play (carSim +
 * applyToCarModel) and aerial drills (AerialBody).
 *
 * Chase-cam looking along car forward: screen-right = lookAt camera +X.
 * Run: `node tools/orientation-signs.mjs`
 */
import * as THREE from "three";
import { makeCar, stepCar } from "../src/shared/carSim.js";
import { applyToCarModel, physToThree, axes } from "../src/shared/rl-physics.js";
import { AerialBody } from "../src/shared/aerial.js";

const idle = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  boost: false,
  jump: false,
  handbrake: false,
};

function screenRight(forward) {
  const up = new THREE.Vector3(0, 1, 0);
  const z = forward.clone().negate().normalize();
  return up.clone().cross(z).normalize();
}

function makeMesh() {
  const visual = new THREE.Object3D();
  visual.scale.set(1, 1, 1);
  return {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    userData: { visual },
  };
}

/** World direction of painted car-right after applyToCarModel's X-mirror. */
function geomRightWorld(mesh) {
  return new THREE.Vector3(mesh.userData.visual.scale.x, 0, 0).applyQuaternion(
    mesh.quaternion,
  );
}

function airCar(yaw = Math.PI / 2) {
  const car = makeCar(new THREE.Vector3(0, 0, 500), yaw);
  car.onGround = false;
  car.wheelsContact = false;
  car.numWheelsInContact = 0;
  for (const w of car.wheels) w.inContact = false;
  return car;
}

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log("PASS", name);
  } else {
    fail += 1;
    console.log("FAIL", name);
  }
}

// Ground steer right → nose screen-right
{
  const car = makeCar(new THREE.Vector3(0, 0, 17), Math.PI / 2);
  const mesh = makeMesh();
  applyToCarModel(car, mesh, 0.01);
  const f0 = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
  for (let i = 0; i < 60; i++) stepCar(car, { ...idle, throttle: 1, steer: 1, yaw: 1 });
  applyToCarModel(car, mesh, 0.01);
  const f1 = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
  check(
    "ground steer-right → nose screen-right",
    f1.clone().sub(f0).dot(screenRight(f0)) > 0.05,
  );
}

// Air yaw / roll / pitch (Free Play)
{
  const car = airCar();
  const mesh = makeMesh();
  applyToCarModel(car, mesh, 0.01);
  const f0 = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
  for (let i = 0; i < 30; i++) stepCar(car, { ...idle, yaw: 1 });
  applyToCarModel(car, mesh, 0.01);
  const f1 = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
  check(
    "air +yaw → nose screen-right",
    f1.clone().sub(f0).dot(screenRight(f0)) > 0.1,
  );
}

{
  const car = airCar();
  const mesh = makeMesh();
  applyToCarModel(car, mesh, 0.01);
  const r0 = geomRightWorld(mesh).y;
  for (let i = 0; i < 30; i++) stepCar(car, { ...idle, roll: 1 });
  applyToCarModel(car, mesh, 0.01);
  check("air +roll → painted-right down", geomRightWorld(mesh).y < r0 - 0.2);
}

{
  const car = airCar();
  const mesh = makeMesh();
  applyToCarModel(car, mesh, 0.01);
  const r0 = geomRightWorld(mesh).y;
  for (let i = 0; i < 30; i++) stepCar(car, { ...idle, roll: -1 });
  applyToCarModel(car, mesh, 0.01);
  check("air -roll → painted-right up", geomRightWorld(mesh).y > r0 + 0.2);
}

{
  const car = airCar();
  const mesh = makeMesh();
  applyToCarModel(car, mesh, 0.01);
  const y0 = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).y;
  for (let i = 0; i < 30; i++) stepCar(car, { ...idle, pitch: 1 });
  applyToCarModel(car, mesh, 0.01);
  const y1 = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).y;
  check("air +pitch → nose up", y1 > y0 + 0.2);
}

{
  const car = airCar();
  const mesh = makeMesh();
  applyToCarModel(car, mesh, 0.01);
  const painted = geomRightWorld(mesh).normalize();
  const physR = physToThree(axes(car.q).l).normalize();
  check("painted right ∥ physics right", painted.dot(physR) > 0.95);
}

// AerialBody (drill modes)
{
  const ab = new AerialBody();
  const obj = new THREE.Object3D();
  const f0 = new THREE.Vector3(0, 0, 1);

  ab.reset();
  obj.quaternion.identity();
  for (let i = 0; i < 30; i++) ab.step(obj, 0, 0, 1, 1 / 120);
  check(
    "AerialBody +yaw → nose screen-right",
    new THREE.Vector3(0, 0, 1)
      .applyQuaternion(obj.quaternion)
      .sub(f0)
      .dot(screenRight(f0)) > 0.1,
  );

  ab.reset();
  obj.quaternion.identity();
  for (let i = 0; i < 30; i++) ab.step(obj, 0, 0, -1, 1 / 120);
  check(
    "AerialBody -yaw → nose screen-left",
    new THREE.Vector3(0, 0, 1)
      .applyQuaternion(obj.quaternion)
      .sub(f0)
      .dot(screenRight(f0)) < -0.1,
  );

  ab.reset();
  obj.quaternion.identity();
  for (let i = 0; i < 30; i++) ab.step(obj, 1, 0, 0, 1 / 120);
  check(
    "AerialBody +roll → right-wing down",
    new THREE.Vector3(1, 0, 0).applyQuaternion(obj.quaternion).y < -0.2,
  );

  ab.reset();
  obj.quaternion.identity();
  for (let i = 0; i < 30; i++) ab.step(obj, -1, 0, 0, 1 / 120);
  check(
    "AerialBody -roll → right-wing up",
    new THREE.Vector3(1, 0, 0).applyQuaternion(obj.quaternion).y > 0.2,
  );

  ab.reset();
  obj.quaternion.identity();
  for (let i = 0; i < 30; i++) ab.step(obj, 0, 1, 0, 1 / 120);
  check(
    "AerialBody +pitch → nose up",
    new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion).y > 0.2,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
