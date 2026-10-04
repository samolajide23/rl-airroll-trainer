import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeCar } from '../../src/shared/carSim.js';
import { makeBall } from '../../src/shared/rl-physics.js';
import { createSoccarBoostPads } from '../../src/shared/boostPads.js';
import { NEXTO_ACTIONS, nextoObservation, nextoControls } from '../../src/shared/nextoObservation.js';
import { spawnPythonSync } from '../python-runner.mjs';
import { NextoBot } from '../../src/shared/nextoBot.js';

test('Nexto uses 90 distinct upstream actions and valid controls', () => {
  assert.equal(NEXTO_ACTIONS.length, 90);
  assert.equal(new Set(NEXTO_ACTIONS.map(JSON.stringify)).size, 90);
  for (const action of NEXTO_ACTIONS) {
    assert.equal(action.length, 8);
    const controls = nextoControls(action);
    assert.equal(typeof controls.jump, 'boolean');
    assert.ok(!controls.boost || controls.throttle === 1);
  }
});

test('Nexto 1v1 observations preserve input state and put self first', () => {
  const self = makeCar(new THREE.Vector3(100, 200, 17), 0.4);
  const opponent = makeCar(new THREE.Vector3(-100, -200, 17), -0.8);
  self.team = 1; opponent.team = 0;
  const ball = makeBall(new THREE.Vector3(0, 0, 93.15));
  const pads = createSoccarBoostPads();
  const before = JSON.stringify(pads);
  const observation = nextoObservation(self, opponent, ball, pads, NEXTO_ACTIONS[20]);
  assert.equal(observation.query.length, 32);
  assert.equal(observation.entities.length, 37 * 24);
  assert.equal(observation.mask.length, 37);
  assert.deepEqual(Array.from(observation.query.slice(0, 5)), [1, 1, 0, 0, 0]);
  assert.ok(observation.entities.slice(5, 8).every(value => value === 0));
  assert.equal(observation.entities[24 + 2], 1);
  assert.equal(observation.entities[48 + 3], 1);
  assert.deepEqual(Array.from(observation.query.slice(24)), NEXTO_ACTIONS[20]);
  assert.equal(JSON.stringify(pads), before);
});

test('Nexto observations and action ordering match pinned upstream Python for both teams', () => {
  for (const team of [0, 1]) {
    const self = makeCar(new THREE.Vector3(123, -456, 350), 0.4);
    const opponent = makeCar(new THREE.Vector3(-678, 987, 17), -0.8);
    self.team = team; opponent.team = 1 - team;
    self.q.setFromEuler(new THREE.Euler(0.3, -0.2, 1.1));
    self.vel.set(300, -200, 100); self.omega.set(0.1, 0.2, -0.3);
    self.onGround = false; self.hasFlipped = true;
    opponent.isDemoed = true;
    const ball = makeBall(new THREE.Vector3(50, 100, 200));
    ball.vel.set(400, 500, -100); ball.omega.set(0.4, -0.5, 0.6);
    const pads = createSoccarBoostPads();
    pads.forEach((pad, index) => { pad.active = index % 3 !== 0; });
    const ordered = [...pads].sort((first, second) => first.y - second.y || first.x - second.x);
    for (const y of [-1024, 1024]) {
      const [center] = ordered.splice(ordered.findIndex(pad => pad.x === 0 && pad.y === y), 1);
      ordered.splice(ordered.findIndex(pad => pad.x === -2048 && Math.sign(pad.y) === Math.sign(y)) + 1, 0, center);
    }
    const action = NEXTO_ACTIONS[72];
    const pack = car => ({pos: car.pos.toArray(), vel: car.vel.toArray(), q: car.q.toArray(),
      omega: car.omega.toArray(), team: car.team, boost: car.boost, demo: Boolean(car.isDemoed),
      ground: Boolean(car.onGround), flip: !car.hasFlipped && !car.hasDoubleJumped});
    const result = spawnPythonSync(['tools/nexto/observation_reference.py'], {encoding: 'utf8',
      input: JSON.stringify({cars: [pack(self), pack(opponent)], ball: {pos: ball.pos.toArray(),
        vel: ball.vel.toArray(), omega: ball.omega.toArray()}, pads: ordered.map(pad => Number(pad.active)), action})});
    assert.equal(result.status, 0, result.stderr);
    const expected = JSON.parse(result.stdout);
    assert.deepEqual(NEXTO_ACTIONS, expected.actions);
    const actual = nextoObservation(self, opponent, ball, pads, action);
    for (const key of ['query', 'entities', 'mask']) actual[key].forEach((value, index) => {
      assert.ok(Math.abs(value - expected[key][index]) < 1e-6, `${team} ${key}[${index}]: ${value} != ${expected[key][index]}`);
    });
  }
});

test('Nexto scheduler holds eight ticks, rejects stale replies and disposes its worker', () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = class {
    messages = [];
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
  };
  const bot = new NextoBot();
  try {
    const self = makeCar(new THREE.Vector3(0, 100, 17), 0);
    const opponent = makeCar(new THREE.Vector3(0, -100, 17), 0);
    self.team = 1; opponent.team = 0;
    const args = [self, opponent, makeBall(new THREE.Vector3(0, 0, 93.15)), createSoccarBoostPads()];
    bot.request(...args);
    assert.equal(bot.worker.messages.length, 1);
    bot.worker.onmessage({data: {type: 'ready'}});
    bot.request(...args); bot.request(...args);
    assert.equal(bot.worker.messages.length, 2);
    const generation = bot.generation;
    bot.reset();
    bot.worker.onmessage({data: {type: 'action', generation, action: 20}});
    assert.equal(bot.remaining, 0);
    bot.request(...args);
    bot.worker.onmessage({data: {type: 'action', generation: bot.generation, action: 20, milliseconds: 2}});
    assert.equal(bot.remaining, 8);
    assert.equal(bot.decisions, 1);
    for (let tick = 0; tick < 8; tick++) { bot.request(...args); bot.remaining -= 1; }
    assert.equal(bot.worker.messages.length, 3);
    bot.request(...args);
    assert.equal(bot.worker.messages.length, 4);
    bot.worker.onmessage({data: {type: 'error', generation: bot.generation, message: 'failed'}});
    assert.equal(bot.pending, false);
    bot.request(...args);
    assert.equal(bot.worker.messages.length, 4);
    bot.dispose();
    assert.equal(bot.worker.terminated, true);
  } finally {
    bot.dispose();
    globalThis.Worker = originalWorker;
  }
});