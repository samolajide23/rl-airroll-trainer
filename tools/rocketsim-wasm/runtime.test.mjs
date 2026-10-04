import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { loadSoccar } from './soccar.mjs';
import { makeCar } from '../../src/shared/carSim.js';
import { makeBall } from '../../src/shared/rl-physics.js';
import { stepCarBall } from '../../src/shared/carPhysics.js';
import { AerialBody } from '../../src/shared/aerial.js';
import { applyToCarModel } from '../../src/shared/rl-physics.js';
import { createSoccarBoostPads } from '../../src/shared/boostPads.js';
import { configureRocketSim, stepRocketSim, stepRocketSimMatch, disposeRocketSimWorlds, rocketSimDiagnostics, syncRocketSimPads, releaseRocketSimWorld, resetRocketSimMatch } from '../../src/shared/rocketSimRuntime.js';

const build = process.env.ROCKETSIM_TEST_BUILD ?? 'build';
const { default: createRocketSim } = await import(`./${build}/rocketsim.mjs`);
const module = await createRocketSim({ wasmBinary: await readFile(new URL(`./${build}/rocketsim.wasm`, import.meta.url)) });
const meshRoot = new URL('../physics-compare/collision_meshes/', import.meta.url);
await loadSoccar(module, JSON.parse(await readFile(new URL('manifest.json', meshRoot))), name => readFile(new URL(`soccar/${name}`, meshRoot)), webcrypto);
module._rs_destroy();
configureRocketSim(module);

const parityLimits = Object.freeze({ pos: 0.5, vel: 0.5, ang_vel: 0.001, basis: 0.001, boost: 0.01, air_time: 0.0003 });

test('1v1 reset reuses its world with fresh-world car, ball and pad behavior', () => {
  disposeRocketSimWorlds();
  const reused = {}, fresh = {};
  const setup = () => {
    const cars = [makeCar(new THREE.Vector3(0, -4608, 17), Math.PI / 2),
      makeCar(new THREE.Vector3(0, 4608, 17), -Math.PI / 2)];
    cars.forEach((car, index) => { car.team = index; car.boost = 33.333333; });
    return { cars, ball: makeBall(new THREE.Vector3(0, 0, 93.15)) };
  };
  const previous = setup();
  for (let tick = 0; tick < 360; tick++) stepRocketSimMatch(reused, previous.cars, previous.ball,
    [{ throttle: 1, boost: true, jump: tick === 100 }, { throttle: 1, boost: true }]);
  const originalCreate = module._rs_world_create;
  let creates = 0;
  module._rs_world_create = (...args) => { creates++; return originalCreate(...args); };
  try {
    resetRocketSimMatch(reused);
    const reusedState = setup(), freshState = setup();
    for (let tick = 0; tick < 240; tick++) {
      const controls = [{ throttle: 1, boost: true, jump: tick === 70 }, { throttle: 1, steer: 0.2 }];
      stepRocketSimMatch(reused, reusedState.cars, reusedState.ball, controls);
      stepRocketSimMatch(fresh, freshState.cars, freshState.ball, controls);
      for (let index = 0; index < 2; index++) {
        assert.deepEqual(reusedState.cars[index].pos.toArray(), freshState.cars[index].pos.toArray());
        assert.deepEqual(reusedState.cars[index].vel.toArray(), freshState.cars[index].vel.toArray());
        assert.deepEqual(reusedState.cars[index].q.toArray(), freshState.cars[index].q.toArray());
        assert.equal(reusedState.cars[index].boost, freshState.cars[index].boost);
      }
      assert.deepEqual(reusedState.ball.pos.toArray(), freshState.ball.pos.toArray());
      const reusedPads = createSoccarBoostPads(), freshPads = createSoccarBoostPads();
      syncRocketSimPads(reusedPads, reused); syncRocketSimPads(freshPads, fresh);
      assert.deepEqual(reusedPads.map(pad => [pad.active, pad.timer]), freshPads.map(pad => [pad.active, pad.timer]));
    }
    assert.equal(creates, 1);
  } finally {
    module._rs_world_create = originalCreate;
    disposeRocketSimWorlds();
  }
});

test('1v1 cars share one native world, one tick and physical bumps', () => {
  disposeRocketSimWorlds();
  const owner = {};
  const blue = makeCar(new THREE.Vector3(-300, 0, 17), 0);
  const orange = makeCar(new THREE.Vector3(300, 0, 17), Math.PI);
  blue.team = 0; orange.team = 1;
  const ball = makeBall(new THREE.Vector3(0, 2000, 93.15));
  for (let tick = 0; tick < 120; tick++) stepRocketSimMatch(owner, [blue, orange], ball, [{}, {}]);
  assert.equal(rocketSimDiagnostics().worlds, 1);
  assert.equal(blue.onGround, true);
  assert.equal(orange.onGround, true);
  for (let tick = 0; tick < 120; tick++) stepRocketSimMatch(owner, [blue, orange], ball, [{ throttle: 1 }, { throttle: 1 }]);
  assert.ok(blue.pos.x < orange.pos.x, 'cars must not pass through each other');
  assert.ok(blue.pos.x > -300 && orange.pos.x < 300);
  assert.ok(Math.abs(blue.pos.x + orange.pos.x) < 5, 'symmetric inputs advance together');
  const pads = createSoccarBoostPads();
  assert.equal(syncRocketSimPads(pads, owner), true);
  blue.pos.set(-1000, -1000, 1000); orange.pos.set(1000, 1000, 1000);
  blue.vel.set(0, 0, 0); orange.vel.set(0, 0, 0);
  stepRocketSimMatch(owner, [blue, orange], ball, [{}, {}]);
  assert.ok(blue.pos.z > 999 && orange.pos.z > 999);
  releaseRocketSimWorld(owner);
  assert.equal(rocketSimDiagnostics().worlds, 0);
});

test('native lifecycle parity covers all hitboxes, demos, pads and complete control sequences', () => {
  const executable = fileURLToPath(new URL('./build-native-msvc-sse/native_wall_probe.exe', import.meta.url));
  const meshDirectory = fileURLToPath(meshRoot);
  const stateAt = module._rs_world_state_at;
  const setCarAt = module._rs_world_set_car_at;
  const raw = [];
  let resets = 0;
  module._rs_world_state_at = (handle, index) => {
    const pointer = stateAt(handle, index);
    raw[index] = Array.from(module.HEAPF32.subarray(pointer / 4, pointer / 4 + 67));
    return pointer;
  };
  module._rs_world_set_car_at = (...args) => { resets++; return setCarAt(...args); };
  try {
    let comparedTicks = 0;
    const presets = ['octane', 'dominus', 'plank', 'breakout', 'hybrid', 'merc'];
    const maneuvers = ['half-flip', 'speedflip', 'wavedash', 'ceiling reset', 'dribble', 'flick', 'air-dribble', 'double-tap', 'pinch'];
    const hitboxFilter = process.env.ROCKETSIM_MANEUVER_HITBOX;
    assert.ok(!hitboxFilter || presets.includes(hitboxFilter), `Unknown lifecycle hitbox: ${hitboxFilter}`);
    let comparedScenarios = 0;
    for (let caseIndex = 0; caseIndex < 114; caseIndex++) {
      if (process.env.ROCKETSIM_MANEUVER_CASE && caseIndex !== Number(process.env.ROCKETSIM_MANEUVER_CASE)) continue;
      const scenario = caseIndex >= 60 ? 10 + (caseIndex - 60) % 9 : caseIndex % 10;
      const preset = caseIndex >= 60 ? Math.floor((caseIndex - 60) / 9) : Math.floor(caseIndex / 10);
      if (hitboxFilter && presets[preset] !== hitboxFilter) continue;
      comparedScenarios++;
      disposeRocketSimWorlds(); resets = 0;
      const result = spawnSync(executable, [meshDirectory, 'lifecycle_parity', String(caseIndex)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr);
      const reference = JSON.parse(result.stdout);
      const owner = {};
      const cars = reference.initial.map((state, index) => {
        const car = makeCar(new THREE.Vector3().fromArray(state), 0, presets[preset]);
        car.team = scenario === 9 ? 0 : index; car.vel.fromArray(state, 3); car.boost = state[18];
        car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().fromArray(state, 9), new THREE.Vector3().fromArray(state, 12), new THREE.Vector3().fromArray(state, 15)));
        car.hasJumped = Boolean(state[26]); car.hasDoubleJumped = Boolean(state[27]); car.hasFlipped = Boolean(state[28]);
        car.jumpTime = state[30]; car.flipTime = state[31]; car.airTime = state[32]; car.airTimeSinceJump = state[33];
        car.isDemoed = Boolean(state[20]); car.demoRespawnTimer = state[21];
        if ((scenario === 1 || scenario === 9) && index === 0) { car.isSupersonic = true; car.supersonicTime = 1; }
        return car;
      });
      const ball = makeBall(new THREE.Vector3().fromArray(reference.ball));
      ball.vel.fromArray(reference.ball, 3);
      const pads = createSoccarBoostPads();
      let nativeRespawned = false, wasmRespawned = false, sawDemo = false, sawPickup = false, sawReactivation = false;
      let sawAir = false, sawFlip = false, sawLanding = false, sawBump = false;
      let carryTicks = 0, airborneTouches = 0, previousTouch = false, sawWall = false, sawSecondTouch = false, sawRestored = false, sawResetDodge = false;
      let maximumBallSpeed = 0, maximumFlickVelocity = 0, sawWaveDodge = false, earlySpeed = 0;
      let alignedLandingTicks = 0, completedExit = false;
      let flickDodgeTick = -1;
      let cancelTicks = 0, rollTicks = 0, preDodgeCarryTicks = 0;
      let ceilingWheelTick = -1, ceilingSeparationTick = -1, ceilingDodgeTick = -1;
      let pinchContactTick = -1, pinchExitSpeed = 0;
      let firstAirTouchTick = -1, lastAirTouchTick = -1, closeAirTicks = 0;
      for (let tick = 0; tick < reference.frames.length; tick++) {
        const frame = reference.frames[tick];
        const input = Object.fromEntries(['throttle', 'steer', 'pitch', 'yaw', 'roll', 'jump', 'boost', 'handbrake'].map((name, index) => [name, frame[3][index]]));
        stepRocketSimMatch(owner, cars, ball, [input, {}]);
        comparedTicks++;
        sawAir ||= !frame[0][19]; sawFlip ||= Boolean(frame[0][28]);
        sawLanding ||= sawAir && tick > 100 && Boolean(frame[0][19]);
        sawBump ||= Math.abs(frame[1][3]) > 100;
        const state = frame[0], ballState = frame[4];
        const touch = Boolean(state[34]) && state[35] === tick;
        if (scenario === 10 && state[28] && input.pitch < -.5) cancelTicks++;
        if (scenario === 10 && state[28] && Math.abs(input.roll) > .1) rollTicks++;
        if (scenario === 15 && flickDodgeTick < 0 && state[19] && Math.abs(ballState[0] - state[0]) < 80 && ballState[2] - state[2] > 110 && ballState[2] - state[2] < 160) preDodgeCarryTicks++;
        if (scenario === 13 && ceilingWheelTick < 0 && state[2] > 1900 && state.slice(22, 26).every(Boolean) && !state[28]) ceilingWheelTick = tick;
        if (ceilingWheelTick >= 0 && ceilingSeparationTick < 0 && !state[19]) ceilingSeparationTick = tick;
        if (ceilingSeparationTick >= 0 && ceilingDodgeTick < 0 && state[28] && input.jump && !state[19]) ceilingDodgeTick = tick;
        if (scenario === 18 && pinchContactTick < 0 && touch && ballState[0] > 3900) pinchContactTick = tick;
        if (pinchContactTick >= 0 && tick - pinchContactTick < 40 && ballState[3] < 0) pinchExitSpeed = Math.max(pinchExitSpeed, Math.hypot(...ballState.slice(3, 6)));
        if (touch && !previousTouch && state[2] > 300) {
          airborneTouches++;
          if (firstAirTouchTick < 0) firstAirTouchTick = tick;
          lastAirTouchTick = tick;
        }
        if (scenario === 16 && tick < 240 && !state[19] && state[2] > 300 && ballState[2] > 300 && Math.hypot(...ballState.slice(0, 3).map((value, axis) => value - state[axis])) < 250) closeAirTicks++;
        const goalBackboard = scenario === 17 && presets[preset] === 'octane';
        if (airborneTouches > 0 && (goalBackboard ? ballState[1] > 4900 && ballState[4] < 0 : ballState[0] > 3900 && ballState[3] < 0)) sawWall = true;
        sawSecondTouch ||= sawWall && touch && !previousTouch && state[2] > 300 && ballState[2] > 300;
        previousTouch = touch;
        if (state[19] && ballState[2] > 110 && ballState[2] < 200 && Math.abs(ballState[0] - state[0]) < 80) carryTicks++;
        maximumBallSpeed = Math.max(maximumBallSpeed, Math.hypot(...ballState.slice(3, 6)));
        if (scenario === 15 && state[28] && flickDodgeTick < 0) flickDodgeTick = tick;
        if (flickDodgeTick >= 0 && tick - flickDodgeTick < 40 && touch) maximumFlickVelocity = Math.max(maximumFlickVelocity, ballState[5]);
        if (scenario === 13 && !state[28]) sawRestored = true;
        sawResetDodge ||= sawRestored && Boolean(state[28]) && !state[19];
        sawWaveDodge ||= Boolean(state[28]) && state[2] < 60 && tick > 48;
        if (tick < 200 && sawFlip) earlySpeed = Math.max(earlySpeed, state[3]);
        const heading = scenario === 10 ? -1 : 1;
        alignedLandingTicks = sawFlip && state[19] && state[9] * heading > .85 && state[17] > .9 && state[3] * heading > 200 ? alignedLandingTicks + 1 : 0;
        completedExit ||= alignedLandingTicks >= 18;
        for (const [offset, source, limit] of [[10, 0, parityLimits.pos], [13, 3, parityLimits.vel], [16, 6, parityLimits.ang_vel]]) {
          const error = Math.hypot(...raw[0].slice(offset, offset + 3).map((value, axis) => value - frame[4][source + axis]));
          assert.ok(error <= limit, `case ${caseIndex} tick ${tick} ball field ${offset}: ${error}`);
        }
        for (let index = 0; index < 2; index++) {
          const expected = frame[index];
          const actual = raw[index];
          if (index === 1 && (scenario === 1 || scenario === 2)) {
            sawDemo ||= Boolean(expected[20]);
            if (sawDemo && !expected[20] && !nativeRespawned) {
              assert.ok([2304, 2688].includes(Math.abs(expected[0])) && expected[1] === 4608 && expected[2] === 36);
              assert.ok(Math.abs(expected[18] - 100 / 3) <= parityLimits.boost);
              assert.ok(Math.abs(expected[10] + 1) <= parityLimits.basis && Math.abs(expected[17] - 1) <= parityLimits.basis);
            }
            if (sawDemo && !actual[58] && !wasmRespawned) {
              assert.ok([2304, 2688].includes(Math.abs(actual[0])) && actual[1] === 4608 && actual[2] === 36);
              assert.ok(Math.abs(actual[9] - 100 / 3) <= parityLimits.boost);
              assert.ok(Math.abs(actual[21] + 1) <= parityLimits.basis && Math.abs(actual[28] - 1) <= parityLimits.basis);
            }
            nativeRespawned ||= sawDemo && !expected[20];
            wasmRespawned ||= sawDemo && !actual[58];
          }
          if (!(index === 1 && (nativeRespawned || wasmRespawned))) {
            for (const [offset, source, limit] of [[0, 0, parityLimits.pos], [3, 3, parityLimits.vel], [6, 6, parityLimits.ang_vel], [20, 9, parityLimits.basis], [23, 12, parityLimits.basis], [26, 15, parityLimits.basis]]) {
              const error = Math.hypot(...actual.slice(offset, offset + 3).map((value, axis) => value - expected[source + axis]));
              assert.ok(error <= limit, `scenario ${scenario} tick ${tick} car ${index} field ${offset}: ${error}`);
            }
            assert.ok(Math.abs(actual[9] - expected[18]) <= parityLimits.boost);
            assert.equal(actual[19], expected[19]);
            for (let wheel = 0; wheel < 4; wheel++) assert.equal(actual[50 + wheel], expected[22 + wheel]);
            for (const [offset, source] of [[29, 26], [30, 27], [31, 28], [33, 29]]) assert.equal(actual[offset], expected[source]);
            for (const [offset, source] of [[34, 30], [35, 31], [36, 32], [37, 33]]) assert.ok(Math.abs(actual[offset] - expected[source]) <= parityLimits.air_time);
          }
          if (index === 1 && (scenario === 1 || scenario === 2)) {
            assert.equal(actual[58], expected[20], `demo scenario ${scenario} tick ${tick}`);
            assert.ok(Math.abs(actual[59] - expected[21]) <= parityLimits.air_time);
          }
          if (scenario === 9) { assert.equal(actual[58], 0); assert.equal(expected[20], 0); }
        }
        if (reference.pad >= 0) {
          assert.equal(syncRocketSimPads(pads, owner), true);
          const expected = frame[2];
          const candidate = pads.find(pad => Math.abs(pad.x - (reference.initial[0][0] + 200)) < .01 && Math.abs(pad.y - reference.initial[0][1]) < .01);
          assert.ok(candidate);
          assert.equal(Number(candidate.active), expected[0]);
          assert.ok(Math.abs(candidate.timer - expected[1]) <= parityLimits.air_time);
          sawPickup ||= !expected[0]; sawReactivation ||= sawPickup && Boolean(expected[0]);
        }
      }
      assert.equal(resets, 2, 'each car is seeded exactly once');
      if (scenario === 0 || scenario === 9) assert.ok(sawBump, `case ${caseIndex} must physically accelerate the target car`);
      if (scenario === 1 || scenario === 2) assert.ok(sawDemo && nativeRespawned && wasmRespawned, 'demo must count down and respawn');
      if (scenario === 3 || scenario === 4) assert.ok(sawPickup && sawReactivation, 'pad must be collected and reactivate');
      if (scenario >= 5 && scenario <= 8) assert.ok(sawAir && sawLanding && (scenario === 8 || sawFlip), `maneuver ${scenario} must take off, dodge when commanded and land`);
      if (scenario >= 10) {
        const final = reference.frames.at(-1)[0];
        const evidence = { caseIndex, maneuver: maneuvers[scenario - 10], sawAir, sawFlip, sawLanding, carryTicks, airborneTouches, sawWall, sawSecondTouch, sawRestored, sawResetDodge, sawWaveDodge, earlySpeed, maximumBallSpeed, maximumFlickVelocity, cancelTicks, rollTicks, preDodgeCarryTicks, ceilingWheelTick, ceilingSeparationTick, ceilingDodgeTick, pinchContactTick, pinchExitSpeed, final: final.slice(0, 18) };
        console.log(JSON.stringify(evidence));
        if (scenario === 10) assert.ok(completedExit, 'half-flip must land upright facing backward and drive away for 18 consecutive ticks');
        if (scenario === 11) assert.ok(completedExit && earlySpeed > 1400, 'speedflip must accelerate, recover upright and retain forward heading');
        if (scenario === 12) assert.ok(sawWaveDodge && sawLanding && earlySpeed > 1100, 'wavedash must dodge near the floor and gain forward speed');
        if (scenario === 13) assert.ok(sawRestored && sawResetDodge, 'ceiling contact must restore an exhausted dodge and allow its airborne use');
        if (scenario === 14) assert.ok(carryTicks >= 60 && reference.frames[120][4][0] - reference.ball[0] > 300, 'dribble must carry the ball above the car while traveling');
        if (scenario === 15) assert.ok(carryTicks >= 30 && sawFlip && maximumFlickVelocity > 400, 'flick must follow a carry and launch the ball upward on contact');
        if (scenario === 16) assert.ok(airborneTouches >= 2 && reference.frames.some(frame => frame[0][2] > 400 && frame[4][0] - reference.ball[0] > 300), 'air-dribble must have separated airborne touches and transport the ball');
        if (scenario === 17) assert.ok(sawWall && sawSecondTouch, 'double-tap must touch, rebound from the wall and touch again');
        if (scenario === 18) assert.ok(reference.frames.some(frame => frame[0][34]) && maximumBallSpeed > 2000, 'pinch must contact the ball at the wall and eject it faster than approach');
        if (presets[preset] === 'octane') {
          if (scenario === 10) assert.ok(cancelTicks >= 6 && rollTicks >= 10 && completedExit, 'Octane half-flip requires cancellation, roll recovery and stable drive-away');
          if (scenario === 13) assert.ok(ceilingWheelTick >= 0 && ceilingSeparationTick > ceilingWheelTick && ceilingDodgeTick >= ceilingSeparationTick, 'Octane ceiling reset requires four-wheel contact, separation and an airborne dodge in order');
          if (scenario === 15) assert.ok(preDodgeCarryTicks >= 30 && flickDodgeTick >= 0 && maximumFlickVelocity > 400, 'Octane flick requires pre-dodge carry and an upward dodge-window contact');
          if (scenario === 16) assert.ok(closeAirTicks >= 60 && lastAirTouchTick - firstAirTouchTick >= 24, 'Octane air-dribble requires sustained nearby airborne carry and separated contacts');
          if (scenario === 18) assert.ok(pinchContactTick >= 0 && pinchExitSpeed > 2000, 'Octane pinch requires near-wall contact followed by prompt outward ejection');
        }
      }
      releaseRocketSimWorld(owner);
    }
    assert.ok(comparedScenarios > 0, 'Lifecycle filters must select at least one scenario');
    console.log(JSON.stringify({ nativeLifecycleScenarios: comparedScenarios, hitbox: hitboxFilter || 'all', comparedTicks, status: 'passed', respawnPositions: 'valid native spawn set; random choice not paired' }));
  } finally {
    module._rs_world_state_at = stateAt; module._rs_world_set_car_at = setCarAt;
    disposeRocketSimWorlds();
  }
});

test('WASM car trajectories stay within native recording limits', async () => {
  const limits = parityLimits;
  const summary = [];
  const failures = [];
  const index = JSON.parse(await readFile(new URL('../physics-compare/out/rocketsim/index.json', import.meta.url)));
  assert.equal(index.engine, 'rocketsim');
  assert.ok(index.scenarios.length > 0);
  assert.equal(new Set(index.scenarios.map(scenario => scenario.id)).size, index.scenarios.length);
  const routes = JSON.parse(await readFile(new URL('../physics-compare/out/movement-bot/scenarios.json', import.meta.url)));
  const routeIndex = JSON.parse(await readFile(new URL('../physics-compare/out/movement-bot/rocketsim/index.json', import.meta.url)));
  const routeCases = routeIndex.scenarios.filter(scenario => scenario.id.startsWith('movement_bot_'));
  assert.equal(routeCases.length, 6);
  const cases = [
    ...index.scenarios.map(scenario => ({ ...scenario, directory: 'rocketsim', settleTicks: 240 })),
    ...routeCases.map(scenario => {
      const definition = routes.scenarios.find(candidate => candidate.id === scenario.id);
      assert.ok(definition, `${scenario.id} missing scenario definition`);
      return { ...scenario, directory: 'movement-bot/rocketsim', settleTicks: definition.settle_ticks ?? routes.defaults.settle_ticks };
    }),
  ];
  for (const { id, path, directory, settleTicks } of cases) {
    const reference = JSON.parse(await readFile(new URL(`../physics-compare/out/${directory}/${path}`, import.meta.url)));
    assert.equal(reference.id, id);
    assert.equal(reference.rocketsim_version, '2.2.1');
    assert.ok(['void', 'soccar'].includes(reference.game_mode));
    assert.equal(reference.frames.length, reference.ticks + 1);
    const first = reference.frames[0];
    const preset = reference.initial.hitbox ?? 'octane';
    const car = makeCar(new THREE.Vector3().fromArray(first.pos), 0, preset);
    car.arenaCollisions = reference.game_mode === 'soccar';
    car.vel.fromArray(first.vel); car.omega.fromArray(first.ang_vel);
    car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3().fromArray(first.rot.forward),
      new THREE.Vector3().fromArray(first.rot.right),
      new THREE.Vector3().fromArray(first.rot.up),
    ));
    car.onGround = first.on_ground; car.boost = first.boost; car.airTime = first.air_time;
    if (reference.game_mode === 'soccar') {
      const rotation = car.q.clone();
      const restore = position => {
        Object.assign(car, makeCar(position, 0, preset));
        car.q.copy(rotation); car.vel.fromArray(reference.initial.vel);
        car.omega.fromArray(reference.initial.ang_vel); car.boost = reference.initial.boost;
      };
      car.pos.fromArray(reference.initial.pos); car.vel.set(0, 0, 0); car.omega.set(0, 0, 0);
      if (reference.initial.on_ground) {
        for (let tick = 0; tick < settleTicks; tick++) stepRocketSim(car, null, {});
        restore(new THREE.Vector3(reference.initial.pos[0], reference.initial.pos[1], car.pos.z));
        stepRocketSim(car, null, {});
        restore(car.pos.clone());
      } else {
        stepRocketSim(car, null, {});
        restore(new THREE.Vector3().fromArray(reference.initial.pos));
      }
    }
    if (reference.initial.air_time_since_jump !== undefined) {
      car.hasJumped = reference.initial.has_jumped ?? true;
      car.jumping = false;
      car.airTimeSinceJump = reference.initial.air_time_since_jump;
    }
    const maxima = { pos: 0, vel: 0, ang_vel: 0, basis: 0, boost: 0, air_time: 0 };
    const setCar = module._rs_world_set_car;
    let stateResets = 0;
    module._rs_world_set_car = (...args) => { stateResets++; return setCar(...args); };
    try {
      for (let tick = 1; tick <= reference.ticks; tick++) {
        const resetsBeforeTick = stateResets;
        stepRocketSim(car, null, reference.frames[tick].controls);
        if (tick > 1) assert.equal(stateResets, resetsBeforeTick, `${id} tick ${tick} unexpectedly reset native state`);
        const expected = reference.frames[tick];
        assert.equal(expected.tick, tick);
        for (const [field, actual] of [['pos', car.pos], ['vel', car.vel], ['ang_vel', car.omega]]) {
          const error = actual.distanceTo(new THREE.Vector3().fromArray(expected[field]));
          maxima[field] = Math.max(maxima[field], error);
          if (error > limits[field] && !failures.some(failure => failure.id === id && failure.field === field)) failures.push({ id, tick, field, error, limit: limits[field] });
        }
        for (const [axis, vector] of [['forward', new THREE.Vector3(1, 0, 0)], ['right', new THREE.Vector3(0, 1, 0)], ['up', new THREE.Vector3(0, 0, 1)]]) {
          const error = vector.applyQuaternion(car.q).distanceTo(new THREE.Vector3().fromArray(expected.rot[axis]));
          maxima.basis = Math.max(maxima.basis, error);
          if (error > limits.basis && !failures.some(failure => failure.id === id && failure.field === 'basis')) failures.push({ id, tick, field: 'basis', error, limit: limits.basis });
        }
        const boostError = Math.abs(car.boost - expected.boost);
        maxima.boost = Math.max(maxima.boost, boostError);
        if (boostError > limits.boost && !failures.some(failure => failure.id === id && failure.field === 'boost')) failures.push({ id, tick, field: 'boost', error: boostError, limit: limits.boost });
        const airTimeError = Math.abs(car.airTime - expected.air_time);
        assert.ok(Number.isFinite(airTimeError), `${id} tick ${tick} missing airtime evidence`);
        maxima.air_time = Math.max(maxima.air_time, airTimeError);
        if (airTimeError > limits.air_time && !failures.some(failure => failure.id === id && failure.field === 'air_time')) failures.push({ id, tick, field: 'air_time', error: airTimeError, limit: limits.air_time });
        if (car.onGround !== expected.on_ground && !failures.some(failure => failure.id === id && failure.field === 'grounding')) failures.push({ id, tick, field: 'grounding', actual: car.onGround, expected: expected.on_ground });
      }
    } finally {
      module._rs_world_set_car = setCar;
      releaseRocketSimWorld(car);
    }
    summary.push({ id, maximumError: maxima, stateResets });
  }
  for (const result of summary) console.log(JSON.stringify({ nativeCarComparison: result }));
  const maximumError = Object.fromEntries(Object.keys(limits).map(field => [field, Math.max(...summary.map(result => result.maximumError[field]))]));
  console.log(JSON.stringify({ nativeCarScenarios: summary.length, maximumError, limits }));
  assert.deepEqual(failures, [], `Native trajectory failures: ${JSON.stringify(failures)}`);
});

test('aerial drills match native rendered car orientation', () => {
  for (const controls of [{ roll: 1 }, { pitch: 1 }, { yaw: -1 }, { pitch: 0.5, yaw: -0.5, roll: 0.5 }]) {
    const car = makeCar(new THREE.Vector3(0, 0, 1000));
    car.arenaCollisions = false;
    const rendered = new THREE.Object3D();
    const drill = new THREE.Object3D();
    const body = new AerialBody();
    applyToCarModel(car, rendered); drill.quaternion.copy(rendered.quaternion);
    for (let tick = 0; tick < 90; tick++) {
      stepRocketSim(car, null, controls);
      applyToCarModel(car, rendered);
      body.step(drill, controls.roll ?? 0, controls.pitch ?? 0, controls.yaw ?? 0, 1 / 120);
      assert.ok(rendered.quaternion.angleTo(drill.quaternion) < 0.001, `${JSON.stringify(controls)} tick ${tick}`);
    }
    body.reset(); disposeRocketSimWorlds();
  }
});

test('gameplay ball adapter preserves all native ball recordings', async () => {
  const suite = JSON.parse(await readFile(new URL('../physics-compare/ball-scenarios.json', import.meta.url)));
  const limits = parityLimits;
  for (const scenario of suite.scenarios) {
    const reference = JSON.parse(await readFile(new URL(`../physics-compare/out/ball/rocketsim/${scenario.id}.json`, import.meta.url)));
    const initial = { ...suite.defaults.initial, ...scenario.initial };
    assert.deepEqual(reference.initial, initial);
    assert.equal(reference.rocketsim_version, '2.2.1');
    assert.equal(reference.frames.length, scenario.ticks + 1);
    const ball = makeBall(new THREE.Vector3().fromArray(initial.pos));
    ball.vel.fromArray(initial.vel); ball.omega.fromArray(initial.ang_vel);
    try {
      for (let tick = 1; tick <= scenario.ticks; tick++) {
        stepRocketSim(null, ball, {}, 1 / 120, scenario.game_mode === 'soccar');
        for (const [field, actual] of [['pos', ball.pos], ['vel', ball.vel], ['ang_vel', ball.omega]]) {
          const error = actual.distanceTo(new THREE.Vector3().fromArray(reference.frames[tick][field]));
          assert.ok(error <= limits[field], `${scenario.id} tick ${tick} ${field}: ${error} > ${limits[field]}`);
        }
      }
    } finally {
      releaseRocketSimWorld(ball);
    }
  }
});

test('coupled car-ball mechanics preserve native contact recordings', async () => {
  const suite = JSON.parse(await readFile(new URL('../physics-compare/contact-scenarios.json', import.meta.url)));
  const limits = parityLimits;
  for (const scenario of suite.scenarios) {
    const reference = JSON.parse(await readFile(new URL(`../physics-compare/out/contact/rocketsim/${scenario.id}.json`, import.meta.url)));
    assert.equal(reference.engine, 'rocketsim');
    assert.equal(reference.rocketsim_version, '2.2.1');
    assert.equal(reference.frames.length, scenario.ticks + 1);
    assert.deepEqual(reference.initial, { ...suite.defaults.initial, ...scenario.initial });
    assert.deepEqual(reference.ball_initial, scenario.ball);
    const first = reference.frames[0];
    const car = makeCar(new THREE.Vector3().fromArray(first.pos), reference.initial.yaw);
    car.arenaCollisions = reference.game_mode === 'soccar';
    car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3().fromArray(first.rot.forward),
      new THREE.Vector3().fromArray(first.rot.right),
      new THREE.Vector3().fromArray(first.rot.up),
    ));
    if (car.arenaCollisions && reference.initial.on_ground) {
      const rotation = car.q.clone();
      for (let tick = 0; tick < 240; tick++) stepRocketSim(car, null, {});
      Object.assign(car, makeCar(new THREE.Vector3(reference.initial.pos[0], reference.initial.pos[1], car.pos.z), 0));
      car.q.copy(rotation);
      car.vel.fromArray(reference.initial.vel); car.omega.fromArray(reference.initial.ang_vel);
      stepRocketSim(car, null, {});
      Object.assign(car, makeCar(car.pos.clone(), 0));
      car.q.copy(rotation);
    }
    car.pos.fromArray(first.pos); car.vel.fromArray(first.vel); car.omega.fromArray(first.ang_vel);
    car.boost = first.boost; car.onGround = first.on_ground; car.airTime = first.air_time;
    const ball = makeBall(new THREE.Vector3().fromArray(first.ball.pos));
    ball.vel.fromArray(first.ball.vel); ball.omega.fromArray(first.ball.ang_vel);
    const setCar = module._rs_world_set_car;
    let stateResets = 0;
    module._rs_world_set_car = (...args) => { stateResets++; return setCar(...args); };
    try {
      for (let tick = 1; tick <= scenario.ticks; tick++) {
        const expected = reference.frames[tick];
        const resetsBeforeTick = stateResets;
        stepRocketSim(car, ball, expected.controls);
        if (tick > 1) assert.equal(stateResets, resetsBeforeTick, `${scenario.id} tick ${tick} unexpectedly reset native state`);
        for (const [name, actual, recorded] of [['car', car, expected], ['ball', ball, expected.ball]]) {
          for (const [field, vector] of [['pos', actual.pos], ['vel', actual.vel], ['ang_vel', actual.omega]]) {
            const error = vector.distanceTo(new THREE.Vector3().fromArray(recorded[field]));
            assert.ok(error <= limits[field], `${scenario.id} tick ${tick} ${name}.${field}: ${error}`);
          }
        }
        for (const [axis, vector] of [['forward', new THREE.Vector3(1, 0, 0)], ['right', new THREE.Vector3(0, 1, 0)], ['up', new THREE.Vector3(0, 0, 1)]]) {
          const error = vector.applyQuaternion(car.q).distanceTo(new THREE.Vector3().fromArray(expected.rot[axis]));
          assert.ok(error <= parityLimits.basis, `${scenario.id} tick ${tick} car.${axis}: ${error}`);
        }
        assert.ok(Math.abs(car.airTime - expected.air_time) <= parityLimits.air_time, `${scenario.id} tick ${tick} airtime`);
        assert.equal(car.onGround, expected.on_ground, `${scenario.id} tick ${tick} grounding`);
        assert.ok(Math.abs(car.boost - expected.boost) <= parityLimits.boost);
      }
      console.log(JSON.stringify({ nativeContactScenario: scenario.id, ticks: scenario.ticks, status: 'passed' }));
    } finally {
      module._rs_world_set_car = setCar;
      releaseRocketSimWorld(car);
    }
  }
});

test('expanded mechanics sweeps preserve native motion and published timers', async () => {
  const directory = '../physics-compare/out/expanded-audit-v1/rocketsim/';
  const index = JSON.parse(await readFile(new URL(`${directory}index.json`, import.meta.url)));
  const scenarios = index.scenarios.filter(scenario => scenario.id.startsWith('sweep_') && !scenario.id.startsWith('sweep_ball_'));
  assert.ok(scenarios.length > 0);
  const timerFields = {
    air_time: 'airTime', air_time_since_jump: 'airTimeSinceJump', jump_time: 'jumpTime',
    flip_time: 'flipTime', boosting_time: 'boostingTime', handbrake_val: 'handbrakeVal',
    supersonic_time: 'supersonicTime', auto_flip_timer: 'autoFlipTimer',
    auto_flip_torque_scale: 'autoFlipTorqueScale', demo_respawn_timer: 'demoRespawnTimer',
  };
  const flagFields = {
    is_on_ground: 'onGround', has_jumped: 'hasJumped', has_double_jumped: 'hasDoubleJumped',
    has_flipped: 'hasFlipped', is_jumping: 'jumping', is_flipping: 'isFlipping',
    is_supersonic: 'isSupersonic', is_auto_flipping: 'isAutoFlipping', is_demoed: 'isDemoed',
  };
  let comparedTicks = 0;
  for (const scenario of scenarios) {
    const reference = JSON.parse(await readFile(new URL(`${directory}${scenario.path}`, import.meta.url)));
    assert.equal(reference.engine, 'rocketsim');
    assert.equal(reference.rocketsim_version, '2.2.1');
    assert.equal(reference.frames.length, reference.ticks + 1);
    const first = reference.frames[0];
    const initial = reference.initial;
    const car = makeCar(new THREE.Vector3().fromArray(initial.pos), 0, initial.hitbox ?? 'octane');
    car.arenaCollisions = reference.game_mode === 'soccar';
    car.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3().fromArray(first.rot.forward),
      new THREE.Vector3().fromArray(first.rot.right),
      new THREE.Vector3().fromArray(first.rot.up),
    ));
    const rotation = car.q.clone();
    const restore = position => {
      Object.assign(car, makeCar(position, 0, initial.hitbox ?? 'octane'));
      car.arenaCollisions = reference.game_mode === 'soccar';
      car.q.copy(rotation); car.vel.fromArray(initial.vel); car.omega.fromArray(initial.ang_vel);
      car.boost = initial.boost;
    };
    if (initial.on_ground) {
      for (let tick = 0; tick < reference.audit_setup.settle_ticks; tick++) stepRocketSim(car, null, {});
      restore(new THREE.Vector3(initial.pos[0], initial.pos[1], car.pos.z));
      stepRocketSim(car, null, {});
      restore(car.pos.clone());
    } else {
      stepRocketSim(car, null, {});
      restore(new THREE.Vector3().fromArray(initial.pos));
    }
    const ball = makeBall(new THREE.Vector3().fromArray(first.ball.pos));
    ball.vel.fromArray(first.ball.vel); ball.omega.fromArray(first.ball.ang_vel);
    const setCar = module._rs_world_set_car;
    let stateResets = 0;
    module._rs_world_set_car = (...args) => { stateResets++; return setCar(...args); };
    try {
      for (let tick = 1; tick <= reference.ticks; tick++) {
        const expected = reference.frames[tick];
        const resetsBeforeTick = stateResets;
        stepRocketSim(car, ball, expected.controls);
        if (tick > 1) assert.equal(stateResets, resetsBeforeTick, `${scenario.id} tick ${tick} native reset`);
        const label = `${scenario.id} tick ${tick}`;
        for (const [name, actual, recorded] of [['car', car, expected], ['ball', ball, expected.ball]]) {
          for (const [field, vector, limit] of [['pos', actual.pos, parityLimits.pos], ['vel', actual.vel, parityLimits.vel], ['ang_vel', actual.omega, parityLimits.ang_vel]]) {
            const error = vector.distanceTo(new THREE.Vector3().fromArray(recorded[field]));
            assert.ok(error <= limit, `${label} ${name}.${field}: ${error}`);
          }
        }
        for (const [axis, vector] of [['forward', new THREE.Vector3(1, 0, 0)], ['right', new THREE.Vector3(0, 1, 0)], ['up', new THREE.Vector3(0, 0, 1)]]) {
          assert.ok(vector.applyQuaternion(car.q).distanceTo(new THREE.Vector3().fromArray(expected.rot[axis])) <= parityLimits.basis, `${label} ${axis}`);
        }
        assert.ok(Math.abs(car.boost - expected.boost) <= parityLimits.boost, `${label} boost`);
        for (const [nativeField, field] of Object.entries(timerFields)) {
          const error = Math.abs(car[field] - expected.audit.car[nativeField]);
          assert.ok(error <= parityLimits.air_time, `${label} ${nativeField}: ${error}`);
        }
        for (const [nativeField, field] of Object.entries(flagFields)) {
          assert.equal(car[field], expected.audit.car[nativeField], `${label} ${nativeField}`);
        }
        assert.deepEqual(car.wheels.map(wheel => wheel.inContact), expected.audit.car.wheels_with_contact, `${label} wheels`);
        comparedTicks++;
      }
    } finally {
      module._rs_world_set_car = setCar;
      releaseRocketSimWorld(car);
    }
  }
  console.log(JSON.stringify({ nativeMechanicsSweepScenarios: scenarios.length, comparedTicks, status: 'passed' }));
});

test('expanded ball surface sweeps preserve native rebounds and spin', async () => {
  const directory = '../physics-compare/out/expanded-audit-v1/rocketsim/';
  const index = JSON.parse(await readFile(new URL(`${directory}index.json`, import.meta.url)));
  const scenarios = index.scenarios.filter(scenario => scenario.id.startsWith('sweep_ball_'));
  assert.equal(scenarios.length, 18);
  let comparedTicks = 0;
  for (const scenario of scenarios) {
    const reference = JSON.parse(await readFile(new URL(`${directory}${scenario.path}`, import.meta.url)));
    assert.equal(reference.engine, 'rocketsim');
    assert.equal(reference.rocketsim_version, '2.2.1');
    assert.equal(reference.frames.length, reference.ticks + 1);
    const first = reference.frames[0];
    const ball = makeBall(new THREE.Vector3().fromArray(first.pos));
    ball.vel.fromArray(first.vel); ball.omega.fromArray(first.ang_vel);
    try {
      for (let tick = 1; tick <= reference.ticks; tick++) {
        stepRocketSim(null, ball, {}, 1 / 120, reference.game_mode === 'soccar');
        const expected = reference.frames[tick];
        for (const [field, vector, limit] of [['pos', ball.pos, parityLimits.pos], ['vel', ball.vel, parityLimits.vel], ['ang_vel', ball.omega, parityLimits.ang_vel]]) {
          const error = vector.distanceTo(new THREE.Vector3().fromArray(expected[field]));
          assert.ok(error <= limit, `${scenario.id} tick ${tick} ${field}: ${error}`);
        }
        comparedTicks++;
      }
    } finally {
      releaseRocketSimWorld(ball);
    }
  }
  console.log(JSON.stringify({ nativeBallSweepScenarios: scenarios.length, comparedTicks, status: 'passed' }));
});

test('wheel-on-ball contact acquires and uses an exhausted flip', () => {
  const executable = fileURLToPath(new URL('./build-native-msvc-sse/native_wall_probe.exe', import.meta.url));
  const meshes = fileURLToPath(meshRoot);
  for (const withBall of [true, false]) {
    const result = spawnSync(executable, [meshes, withBall ? 'flip_reset_ball' : 'flip_reset_control'], { encoding: 'utf8' });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split(/\r?\n/);
    const reference = JSON.parse(lines.find(line => line.startsWith('[[0,')));
    const car = makeCar(new THREE.Vector3(0, 0, 880));
    car.arenaCollisions = false;
    car.vel.set(0, 0, 300);
    car.q.set(1, 0, 0, 0);
    car.hasJumped = true; car.hasFlipped = true; car.jumpTime = 0.3; car.airTimeSinceJump = 2;
    const ball = makeBall(new THREE.Vector3(13.8757, 0, 1000));
    let acquired = false;
    let used = false;
    const setCar = module._rs_world_set_car;
    let stateResets = 0;
    module._rs_world_set_car = (...args) => { stateResets++; return setCar(...args); };
    try {
      for (let tick = 1; tick <= 90; tick++) {
        const resetsBeforeTick = stateResets;
        stepRocketSim(car, withBall ? ball : null, { jump: tick === 31 || tick === 43, pitch: tick === 43 ? -1 : 0 });
        if (tick > 1) assert.equal(stateResets, resetsBeforeTick, `tick ${tick} reset native state`);
        const expected = reference[tick];
        for (const [vector, offset, limit] of [[car.pos, 1, parityLimits.pos], [car.vel, 4, parityLimits.vel], [car.omega, 7, parityLimits.ang_vel]]) {
          assert.ok(vector.distanceTo(new THREE.Vector3().fromArray(expected, offset)) <= limit, `ball=${withBall} tick ${tick} offset ${offset}`);
        }
        for (const [axis, offset] of [[new THREE.Vector3(1, 0, 0), 10], [new THREE.Vector3(0, 1, 0), 13], [new THREE.Vector3(0, 0, 1), 16]]) {
          assert.ok(axis.applyQuaternion(car.q).distanceTo(new THREE.Vector3().fromArray(expected, offset)) <= parityLimits.basis);
        }
        if (withBall) {
          for (const [vector, offset, limit] of [[ball.pos, 19, parityLimits.pos], [ball.vel, 22, parityLimits.vel], [ball.omega, 25, parityLimits.ang_vel]]) {
            assert.ok(vector.distanceTo(new THREE.Vector3().fromArray(expected, offset)) <= limit, `tick ${tick} ball offset ${offset}`);
          }
        }
        assert.deepEqual([car.hasJumped, car.hasFlipped, car.onGround, car.isFlipping], expected.slice(28, 32).map(Boolean), `ball=${withBall} tick ${tick} flags`);
        assert.deepEqual(car.wheels.map(wheel => wheel.inContact), expected.slice(32, 36).map(Boolean));
        acquired ||= tick < 31 && !car.hasFlipped && car.wheels.every(wheel => wheel.inContact);
        used ||= tick >= 31 && car.hasFlipped && car.isFlipping;
      }
      assert.equal(acquired, withBall, 'only ball wheel contact restores the exhausted flip');
      assert.equal(used, withBall, 'only the acquired reset enables the later dodge');
    } finally {
      module._rs_world_set_car = setCar;
      releaseRocketSimWorld(car);
    }
  }
});

test('native tiny-angle cosine keeps float intermediate rounding', () => {
  const executable = fileURLToPath(new URL('./build-native-msvc-sse/native_wall_probe.exe', import.meta.url));
  const result = spawnSync(executable, ['unused', 'cosine_parity'], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split(/\r?\n/);
  assert.equal(rows.length, 8193);
  for (const row of rows) {
    const [input, expected] = row.split(',').map(Number);
    const angle = Math.fround(input);
    const actual = angle >= 1 / 128 ? Math.fround(Math.cos(angle)) : Math.fround(1 - Math.fround(Math.fround(angle * angle) * 0.5));
    assert.equal(actual, Math.fround(expected), `native cosine ${angle}`);
  }
});

test('native off-grid cosine keeps verified rounding across rotation angles', () => {
  const executable = fileURLToPath(new URL('./build-native-msvc-sse/native_wall_probe.exe', import.meta.url));
  const result = spawnSync(executable, ['unused', 'cosine_random_parity'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split(/\r?\n/);
  assert.equal(rows.length, 65536);
  const differences = [];
  for (const row of rows) {
    const [input, expected] = row.split(',').map(Number);
    const angle = Math.fround(input);
    const actual = angle >= 1 / 128 ? Math.fround(Math.cos(angle)) : Math.fround(1 - Math.fround(Math.fround(angle * angle) * 0.5));
    if (actual !== Math.fround(expected)) differences.push({ angle, actual, expected });
  }
  console.log(JSON.stringify({ cosineRandomSamples: rows.length, differences: differences.length, firstDifferences: differences.slice(0, 5) }));
  assert.equal(differences.length, 0, 'Off-grid native cosine must match the compatibility shim');
});

test('native small-angle sine agrees with float-rounded double sine', () => {
  const executable = fileURLToPath(new URL('./build-native-msvc-sse/native_wall_probe.exe', import.meta.url));
  const result = spawnSync(executable, [fileURLToPath(meshRoot), 'sine_parity'], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split(/\r?\n/);
  assert.equal(rows.length, 8193);
  const differences = [];
  for (const row of rows) {
    const [input, expected] = row.split(',').map(Number);
    const actual = Math.fround(Math.sin(Math.fround(input)));
    if (actual !== Math.fround(expected)) differences.push({ input, actual, expected });
  }
  console.log(JSON.stringify({ sineSamples: rows.length, differences: differences.length, firstDifferences: differences.slice(0, 5) }));
  assert.deepEqual(differences, []);
});

test('deterministic mixed-input native parity across all hitboxes and contact starts', () => {
  disposeRocketSimWorlds();
  const executable = fileURLToPath(new URL('./build-native-msvc-sse/native_wall_probe.exe', import.meta.url));
  const presets = ['octane', 'dominus', 'plank', 'breakout', 'hybrid', 'merc'];
  const extended = process.env.ROCKETSIM_EXTENDED_PARITY === '1';
  const ticks = Number(process.env.ROCKETSIM_PARITY_TICKS ?? (extended ? 1800 : 600));
  assert.ok(Number.isInteger(ticks) && ticks > 0 && ticks <= 14400, 'Parity duration must be 1..14400 ticks');
  const scenarioCount = extended ? 66 : 18;
  const seeds = process.env.ROCKETSIM_PARITY_SEED ? [Number(process.env.ROCKETSIM_PARITY_SEED)] : extended ? [12345, 987654321, 4294967000] : [12345];
  const hitboxFilter = process.env.ROCKETSIM_MANEUVER_HITBOX;
  assert.ok(!hitboxFilter || presets.includes(hitboxFilter), `Unknown parity hitbox: ${hitboxFilter}`);
  const scenarios = (process.env.ROCKETSIM_PARITY_SCENARIO ? [Number(process.env.ROCKETSIM_PARITY_SCENARIO)] : Array.from({ length: scenarioCount }, (_, index) => index)).filter(scenario => !hitboxFilter || presets[scenario % 6] === hitboxFilter);
  assert.ok(scenarios.length > 0, 'Parity filters must select at least one scenario');
  const maximumErrors = {};
  const firstDifferences = [];
  let comparedTicks = 0;
  const failures = [];
  for (const seed of seeds) for (const scenario of scenarios) {
    const result = spawnSync(executable, [fileURLToPath(meshRoot), 'deterministic_parity', String(scenario), String(ticks), String(seed)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const rows = JSON.parse(result.stdout.split(/\r?\n/).find(line => line.startsWith('[[0,')));
    assert.equal(rows.length, ticks);
    const variant = Math.floor(scenario / 6);
    const car = makeCar(new THREE.Vector3(variant === 2 ? 3500 : -700, 0, variant === 1 ? 1200 : 17), 0, presets[scenario % 6]);
    car.vel.set(variant === 1 ? 500 : 1200, 0, 0);
    car.boost = 37;
    const ball = makeBall(new THREE.Vector3(variant === 2 ? 3900 : 0, 0, variant === 1 ? 1200 : 93.15));
    if (variant === 3) { car.pos.set(2900, 3900, 120); car.vel.set(900, 900, -200); ball.pos.set(3200, 4200, 200); ball.vel.set(600, 700, -100); }
    if (variant === 4) { car.pos.set(850, 4700, 120); car.vel.set(200, 1200, 0); ball.pos.set(900, 5000, 200); ball.vel.set(0, 900, 0); }
    if (variant === 5) { car.pos.set(0, 0, 1900); car.vel.set(700, 0, 900); ball.pos.set(200, 0, 1850); ball.vel.set(0, 0, 1000); }
    if (variant === 6) { car.pos.set(3900, 500, 280); car.vel.set(500, 300, -600); ball.pos.set(3980, 800, 150); ball.vel.set(300, 100, -400); }
    if (variant === 7 || variant === 8) { car.vel.set(variant === 7 ? 2299 : 2301, 0, 0); car.boost = variant === 7 ? .01 : 0; }
    if (variant === 10) { car.pos.z = 1500; car.hasJumped = true; car.jumpTime = .2; car.airTimeSinceJump = 1.24; }
    if (variant === 9) ball.pos.y = 135;
    let random = (seed + scenario) >>> 0;
    let firstDifference;
    const axis = () => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return (((random >>> 16) % 9) - 4) * 0.25;
    };
    let controls;
    let rawState;
    const stateGetter = module._rs_world_state;
    module._rs_world_state = (...args) => {
      const pointer = stateGetter(...args);
      rawState = Array.from(module.HEAPF32.subarray(pointer / 4, pointer / 4 + 67));
      return pointer;
    };
    const carSetter = module._rs_world_set_car;
    const ballSetter = module._rs_world_set_ball;
    let carResets = 0;
    let ballResets = 0;
    module._rs_world_set_car = (...args) => { carResets++; return carSetter(...args); };
    module._rs_world_set_ball = (...args) => { ballResets++; return ballSetter(...args); };
    try {
      for (let tick = 0; tick < ticks; tick++) {
        if (tick % 12 === 0) controls = { throttle: axis(), steer: axis(), pitch: axis(), yaw: axis(), roll: axis(), boost: axis() > 0, jump: axis() > 0.5, handbrake: axis() > 0.5 };
        if (variant === 7 || variant === 8) controls = { throttle: 1, boost: true };
        if (variant === 10) controls = { jump: tick === 3, pitch: -1 };
        stepRocketSim(car, ball, controls);
        assert.equal(carResets, 1, `scenario ${scenario} tick ${tick} car reseeded`);
        assert.equal(ballResets, 1, `scenario ${scenario} tick ${tick} ball reseeded`);
        const expected = rows[tick];
        assert.equal(expected.length, 62, 'Native stress probe must include extended state fields');
        const context = `seed ${seed} scenario ${scenario} (${presets[scenario % 6]}) tick ${tick}`;
        for (const [value, offset] of [[car.pos, 1], [car.vel, 4], [car.omega, 7], [new THREE.Vector3().fromArray(rawState, 20), 10], [new THREE.Vector3().fromArray(rawState, 23), 13], [new THREE.Vector3().fromArray(rawState, 26), 16], [ball.pos, 19], [ball.vel, 22], [ball.omega, 25]]) {
          const error = value.distanceTo(new THREE.Vector3().fromArray(expected, offset));
          maximumErrors[offset] = Math.max(maximumErrors[offset] ?? 0, error);
          if (!firstDifference && value.toArray().some((component, index) => Math.fround(component) !== Math.fround(expected[offset + index]))) {
            firstDifference = { seed, scenario, tick, field: offset, actual: value.toArray(), expected: expected.slice(offset, offset + 3) };
            firstDifferences.push(firstDifference);
          }
        }
        const scalars = [car.boost, car.onGround, car.hasJumped, car.hasDoubleJumped, car.hasFlipped, car.isFlipping, ...car.wheels.map(wheel => wheel.inContact), car.jumpTime, car.flipTime, car.airTimeSinceJump];
        for (const [index, value] of scalars.entries()) {
          const offset = index + 28;
          maximumErrors[offset] = Math.max(maximumErrors[offset] ?? 0, Math.abs(Number(value) - expected[offset]));
          if (!firstDifference && Math.fround(Number(value)) !== Math.fround(expected[offset])) {
            firstDifference = { seed, scenario, tick, field: offset, actual: Number(value), expected: expected[offset] };
            firstDifferences.push(firstDifference);
          }
        }
        try {
        for (const [offset, source] of [[32, 41], [41, 46], [43, 48], [46, 51], [49, 54], [54, 55], [58, 59], [61, 61]]) {
          assert.equal(rawState[offset], expected[source], `${context} raw flag ${offset}`);
        }
        for (const [offset, source, limit] of [[36, 42, parityLimits.air_time], [42, 47, parityLimits.air_time], [44, 49, parityLimits.air_time], [45, 50, parityLimits.basis], [47, 52, parityLimits.air_time], [48, 53, parityLimits.basis], [59, 60, parityLimits.air_time]]) {
          assert.ok(Math.abs(rawState[offset] - expected[source]) <= limit, `${context} raw scalar ${offset}`);
        }
        for (const [offset, source] of [[38, 43], [55, 56]]) {
          assert.ok(new THREE.Vector3().fromArray(rawState, offset).distanceTo(new THREE.Vector3().fromArray(expected, source)) <= parityLimits.basis, `${context} raw vector ${offset}`);
        }
        if (variant === 7 || variant === 8) {
          assert.ok(car.vel.length() <= 2300.001, `${context} speed cap`);
          if (tick === 0) assert.equal(car.boost, 0, `${context} boost depletion`);
        }
        if (variant === 10 && tick === 3) assert.equal(car.hasFlipped, false, `${context} expired airborne dodge`);
        for (const [value, offset, limit] of [[car.pos, 1, parityLimits.pos], [car.vel, 4, parityLimits.vel], [car.omega, 7, parityLimits.ang_vel], [ball.pos, 19, parityLimits.pos], [ball.vel, 22, parityLimits.vel], [ball.omega, 25, parityLimits.ang_vel]]) {
          const error = value.distanceTo(new THREE.Vector3().fromArray(expected, offset));
          assert.ok(error <= limit, `${context} field ${offset} error ${error} exceeds ${limit}`);
        }
        for (const [value, offset] of [[new THREE.Vector3(1, 0, 0), 10], [new THREE.Vector3(0, 1, 0), 13], [new THREE.Vector3(0, 0, 1), 16]]) {
          assert.ok(value.applyQuaternion(car.q).distanceTo(new THREE.Vector3().fromArray(expected, offset)) <= parityLimits.basis, `${context} basis ${offset}`);
          assert.ok(new THREE.Vector3().fromArray(rawState, offset + 10).distanceTo(new THREE.Vector3().fromArray(expected, offset)) <= parityLimits.basis, `${context} raw basis ${offset}`);
        }
        assert.ok(Math.abs(car.boost - expected[28]) <= parityLimits.boost, `${context} boost`);
        assert.deepEqual([car.onGround, car.hasJumped, car.hasDoubleJumped, car.hasFlipped, car.isFlipping], expected.slice(29, 34).map(Boolean), `${context} flags`);
        assert.deepEqual(car.wheels.map(wheel => wheel.inContact), expected.slice(34, 38).map(Boolean), `${context} wheels`);
        for (const [value, offset] of [[car.jumpTime, 38], [car.flipTime, 39], [car.airTimeSinceJump, 40]]) assert.ok(Math.abs(value - expected[offset]) <= parityLimits.air_time, `${context} timer ${offset}`);
        } catch (error) {
          if (!failures.some(failure => failure.scenario === scenario && failure.seed === seed)) failures.push({ seed, scenario, firstFailingTick: tick, message: error.message });
        }
        comparedTicks++;
      }
    } finally {
      module._rs_world_state = stateGetter;
      module._rs_world_set_car = carSetter;
      module._rs_world_set_ball = ballSetter;
      releaseRocketSimWorld(car);
    }
  }
  console.log(JSON.stringify({ deterministicNativeScenarios: scenarios.length * seeds.length, ticksPerScenario: ticks, comparedTicks, passingScenarios: scenarios.length * seeds.length - failures.length, limits: parityLimits, maximumErrors, firstDifferences, failures, status: failures.length ? 'failed' : 'passed' }));
  assert.deepEqual(failures, [], 'mixed-input native parity must satisfy documented practical limits in every scenario');
});

test('continuous reconstructed reset separates and directly dodges only with a ball', () => {
  const script = fileURLToPath(new URL('../telemetry/reset-reconstruction.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const reports = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  const successful = reports.filter(report => report.directDodge);
  assert.equal(successful.length, 1);
  assert.equal(successful[0].id, 'zen-reset-319');
  assert.equal(successful[0].approachSeconds, 0.1);
  assert.equal(successful[0].noBallControlPassed, true);
  assert.deepEqual(successful[0].events.map(event => event.type), ['four-wheel-reset', 'airborne-separation', 'direct-dodge']);
  assert.ok(successful[0].events[0].tick > 0, 'acquisition must occur after continuous approach');
  assert.ok(successful[0].events[0].tick < successful[0].events[1].tick);
  assert.equal(successful[0].events[2].tick, successful[0].events[1].tick + 1);
  assert.equal(reports.at(-1).successfulReconstructions, 1);
});

test('orientation, boost, isolated worlds and external resets', () => {
  const car = makeCar(new THREE.Vector3(0, 0, 2000), 0.8);
  car.arenaCollisions = false; car.onGround = false;
  car.wheels.forEach(wheel => { wheel.inContact = false; });
  const initial = car.q.clone();
  stepRocketSim(car, null, { roll: 1, boost: true });
  assert.ok(car.q.angleTo(initial) > 0);
  assert.ok(car.boost < 100);
  const second = makeCar(new THREE.Vector3(0, 0, 1500), 0);
  second.arenaCollisions = false;
  stepRocketSim(second, null, {});
  assert.equal(rocketSimDiagnostics().worlds, 2);
  car.pos.set(100, 200, 2500); car.vel.set(0, 0, 0); car.omega.set(0, 0, 0);
  car.isBoosting = false; car.boostingTime = 0;
  stepRocketSim(car, null, {});
  assert.ok(Math.abs(car.pos.x - 100) < 0.01);
  assert.ok(car.pos.z > 2499);
  assert.ok(second.pos.z < 1500);
  disposeRocketSimWorlds();
  assert.equal(rocketSimDiagnostics().worlds, 0);
});

test('held jump retains timers and double jump state', () => {
  const car = makeCar(new THREE.Vector3(-2000, 0, 17), 0);
  for (let tick = 0; tick < 120; tick++) stepRocketSim(car, null, {});
  assert.equal(car.onGround, true);
  for (let tick = 0; tick < 10; tick++) stepRocketSim(car, null, { jump: true });
  assert.equal(car.hasJumped, true);
  assert.ok(car.jumpTime > 0.07);
  stepRocketSim(car, null, {});
  stepRocketSim(car, null, { jump: true });
  assert.equal(car.hasDoubleJumped, true);
  disposeRocketSimWorlds();
});

test('all six native hitboxes step and released reset worlds do not accumulate', () => {
  for (const preset of ['octane', 'dominus', 'plank', 'breakout', 'hybrid', 'merc']) {
    const car = makeCar(new THREE.Vector3(-2000, 0, 100), 0, preset);
    for (let tick = 0; tick < 120; tick++) stepRocketSim(car, null, { throttle: 1 });
    assert.ok(car.pos.x > -1900);
    assert.equal(car.onGround, true);
    releaseRocketSimWorld(car);
    assert.equal(rocketSimDiagnostics().worlds, 0);
  }
});

test('repeated coupled resets match fresh state and release prediction worlds', () => {
  disposeRocketSimWorlds();
  let previousCar;
  let baseline;
  try {
    for (let cycle = 0; cycle < 30; cycle++) {
      releaseRocketSimWorld(previousCar);
      assert.equal(rocketSimDiagnostics().worlds, 0);
      const car = makeCar(new THREE.Vector3(-2000, 0, 100));
      const ball = makeBall(new THREE.Vector3(0, 0, 93.15));
      stepRocketSim(car, ball, {});
      const snapshot = [car.pos.toArray(), car.vel.toArray(), car.omega.toArray(), car.boost, car.hasJumped, car.hasDoubleJumped, ball.pos.toArray(), ball.vel.toArray()];
      baseline ??= snapshot;
      assert.deepEqual(snapshot, baseline, `reset ${cycle} retained previous state`);
      for (let tick = 0; tick < 60; tick++) stepRocketSim(car, ball, { throttle: 1, jump: tick < 10, boost: true, roll: 1 });
      const prediction = makeBall(ball.pos.clone());
      prediction.vel.copy(ball.vel);
      prediction.omega.copy(ball.omega);
      const liveBall = [ball.pos.toArray(), ball.vel.toArray()];
      try {
        for (let tick = 0; tick < 120; tick++) stepRocketSim(null, prediction, {});
        assert.equal(rocketSimDiagnostics().worlds, 2);
        assert.deepEqual([ball.pos.toArray(), ball.vel.toArray()], liveBall);
      } finally {
        releaseRocketSimWorld(prediction);
      }
      assert.equal(rocketSimDiagnostics().worlds, 1);
      previousCar = car;
    }
  } finally {
    disposeRocketSimWorlds();
  }
  assert.equal(rocketSimDiagnostics().worlds, 0);
});

test('detached balls cannot collide and can be reattached', () => {
  const car = makeCar(new THREE.Vector3(0, 0, 100));
  const ball = makeBall(new THREE.Vector3(1000, 0, 100));
  stepRocketSim(car, ball, {});
  ball.pos.copy(car.pos);
  ball.vel.set(0, 0, 0);
  for (let tick = 0; tick < 30; tick++) assert.equal(stepRocketSim(car, null, {}), null);
  stepRocketSim(car, ball, {});
  assert.equal(ball.physicsProfile, 'wasm');
  assert.equal(rocketSimDiagnostics().worlds, 1);
  releaseRocketSimWorld(car);
});

test('native car-ball touch and boost-pad pickup', () => {
  const car = makeCar(new THREE.Vector3(-400, 0, 17), 0);
  car.vel.set(1000, 0, 0);
  const ball = makeBall(new THREE.Vector3(0, 0, 93.15));
  let contact;
  for (let tick = 0; tick < 60; tick++) {
    const hit = stepCarBall(car, ball, { throttle: 1 }, tick, 1 / 120);
    contact ||= hit;
  }
  assert.ok(contact?.point.isVector3);
  assert.ok(ball.vel.x > 100);
  disposeRocketSimWorlds();
  const pickup = makeCar(new THREE.Vector3(0, -1024, 17), 0);
  pickup.boost = 0;
  stepRocketSim(pickup, null, {});
  assert.ok(pickup.boost >= 12);
  const pads = createSoccarBoostPads();
  assert.equal(syncRocketSimPads(pads, pickup), true);
  assert.equal(pads.find(pad => pad.x === 0 && pad.y === -1024).active, false);
  disposeRocketSimWorlds();
});