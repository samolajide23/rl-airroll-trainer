import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import * as THREE from 'three';
import { loadSoccar } from '../rocketsim-wasm/soccar.mjs';
import { makeCar } from '../../src/shared/carSim.js';
import { makeBall } from '../../src/shared/rl-physics.js';
import { configureRocketSim, stepRocketSim, releaseRocketSimWorld } from '../../src/shared/rocketSimRuntime.js';

const { default: createRocketSim } = await import('../rocketsim-wasm/build/rocketsim.mjs');
const module = await createRocketSim({ wasmBinary: await readFile(new URL('../rocketsim-wasm/build/rocketsim.wasm', import.meta.url)) });
const meshRoot = new URL('../physics-compare/collision_meshes/', import.meta.url);
await loadSoccar(module, JSON.parse(await readFile(new URL('manifest.json', meshRoot))), name => readFile(new URL(`soccar/${name}`, meshRoot)), webcrypto);
module._rs_destroy();
configureRocketSim(module);
const evidence = JSON.parse(await readFile(new URL('../physics-compare/out/replay-resets/zen-reset-windows.json', import.meta.url)));
const vector = value => new THREE.Vector3(value?.x ?? 0, value?.y ?? 0, value?.z ?? 0);
const rotation = value => new THREE.Quaternion(value.x, value.y, value.z, value.w).normalize();
const angularVelocity = value => vector(value).multiplyScalar(0.01);
const clamp = value => Math.max(-1, Math.min(1, value));

function createReconstructionCar(seed) {
  const car = makeCar(vector(seed.car.location));
  car.vel.copy(vector(seed.car.linear_velocity));
  car.omega.copy(angularVelocity(seed.car.angular_velocity));
  car.q.copy(rotation(seed.car.rotation));
  car.onGround = false;
  car.wheels.forEach(wheel => { wheel.inContact = false; });
  car.hasJumped = true;
  car.hasFlipped = true;
  car.flipTime = 2;
  car.jumpTime = 0.3;
  car.airTimeSinceJump = 2;
  car.boost = seed.boostAmount * 100 / 255;
  return car;
}

const candidates = [];
let successfulReconstructions = 0;
for (const window of evidence.windows) {
 for (const approachSeconds of [0.35, 0.2, 0.1, 0.05]) {
  const seed = window.frames.find(frame => frame.time >= window.contact.time - approachSeconds);
  const car = createReconstructionCar(seed);
  const ball = makeBall(vector(seed.ball.location));
  ball.vel.copy(vector(seed.ball.linear_velocity));
  ball.omega.copy(angularVelocity(seed.ball.angular_velocity));
  const events = [];
  const inputs = [];
  let acquired = false;
  let separated = false;
  let dodged = false;
  let cursor = 0;
  let nearest = Infinity;
  let resets = 0;
  const setter = module._rs_world_set_car;
  const ballSetter = module._rs_world_set_ball;
  let ballResets = 0;
  module._rs_world_set_car = (...args) => { resets++; return setter(...args); };
  module._rs_world_set_ball = (...args) => { ballResets++; return ballSetter(...args); };
  try {
    for (let tick = 0; tick < 240; tick++) {
      const time = seed.time + tick / 120;
      while (cursor < window.frames.length - 1 && window.frames[cursor + 1].time <= time + 1 / 120) cursor++;
      const target = window.frames[cursor];
      const error = rotation(target.car.rotation).multiply(car.q.clone().invert());
      if (error.w < 0) error.set(-error.x, -error.y, -error.z, -error.w);
      const correction = new THREE.Vector3(error.x, error.y, error.z).multiplyScalar(24);
      const desiredOmega = angularVelocity(target.car.angular_velocity).add(correction);
      const local = desiredOmega.sub(car.omega).applyQuaternion(car.q.clone().invert());
      const controls = { roll: clamp(-local.x), pitch: clamp(-local.y), yaw: clamp(local.z),
        boost: !acquired && Boolean(target.boostActive), throttle: 0 };
      if (separated && !dodged) {
        assert.equal(car.onGround, false);
        assert.equal(car.hasFlipped, false);
        assert.ok(car.wheels.every(wheel => !wheel.inContact));
        controls.jump = true;
        controls.pitch = -1;
        controls.roll = 0;
        controls.yaw = 0;
        dodged = true;
      }
      inputs.push({ ...controls });
      const previousResets = resets;
      const previousBallResets = ballResets;
      stepRocketSim(car, ball, controls);
      if (tick > 0 && resets !== previousResets) throw new Error('Continuous reconstruction unexpectedly reseeded car state');
      if (tick > 0 && ballResets !== previousBallResets) throw new Error('Continuous reconstruction unexpectedly reseeded ball state');
      const distance = car.pos.distanceTo(ball.pos);
      nearest = Math.min(nearest, distance);
      if (!acquired && distance < 150 && car.pos.z > 300 && ball.pos.z > 300 && !car.hasFlipped && car.wheels.every(wheel => wheel.inContact)) {
        acquired = true;
        events.push({ type: 'four-wheel-reset', tick, time: time + 1 / 120, distance });
      }
      if (acquired && !separated && !car.onGround && car.wheels.every(wheel => !wheel.inContact) && distance > 180) {
        separated = true;
        events.push({ type: 'airborne-separation', tick, time: time + 1 / 120, distance });
      }
      if (car.isFlipping && car.hasFlipped && dodged) {
        events.push({ type: 'direct-dodge', tick, time: time + 1 / 120, distance });
        break;
      }
    }
    const directDodge = events.some(event => event.type === 'direct-dodge');
    if (directDodge) {
      assert.equal(inputs.filter(input => input.jump).length, 1);
      assert.deepEqual(events.map(event => event.type), ['four-wheel-reset', 'airborne-separation', 'direct-dodge']);
      const control = createReconstructionCar(seed);
      try {
        for (const [tick, input] of inputs.entries()) {
          const previousResets = resets;
          stepRocketSim(control, null, input);
          if (tick > 0) assert.equal(resets, previousResets, 'no-ball control reseeded');
          assert.ok(control.pos.z > 300, 'no-ball control must remain airborne');
          assert.equal(control.hasFlipped, true, 'no-ball control must retain exhausted flip');
          assert.equal(control.isFlipping, false, 'same inputs without ball must not dodge');
          assert.ok(control.wheels.every(wheel => !wheel.inContact));
        }
      } finally {
        releaseRocketSimWorld(control);
      }
      successfulReconstructions++;
      candidates.push({ id: window.id, approachSeconds, seed, inputs, events, noBallControlPassed: true });
    }
    console.log(JSON.stringify({ id: window.id, approachSeconds, seedTime: seed.time, evidence: 'Reconstructed feedback inputs, not recorded controller inputs', nearest, acquired, separated, directDodge, noBallControlPassed: directDodge, events }));
  } finally {
    module._rs_world_set_car = setter;
    module._rs_world_set_ball = ballSetter;
    releaseRocketSimWorld(car);
  }
 }
}
await writeFile(new URL('../physics-compare/out/replay-resets/reconstructed-resets.json', import.meta.url), JSON.stringify({
  evidence: 'Reconstructed controls and assumed hidden jump state; not recorded inputs or exact replay parity',
  angularVelocityScale: 0.01, initialFlipTime: 2, candidates,
}, null, 2));
console.log(JSON.stringify({ successfulReconstructions, status: successfulReconstructions ? 'Continuous WASM reset and no-ball negative control passed; native parity unverified' : 'No continuous reset reproduced; not a passing maneuver gate' }));
if (!successfulReconstructions) process.exitCode = 1;