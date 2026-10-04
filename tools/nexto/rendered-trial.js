import * as THREE from 'three';
import { NextoBot } from '../../src/shared/nextoBot.js';
import { resetRocketSimMatch } from '../../src/shared/rocketSimRuntime.js';
import { createTrialScenarios, mirrorTrialScenario } from './trial-scenarios.js';

function summary(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    p99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0, maxMs: sorted.at(-1) ?? 0 };
}

export async function runRenderedNextoTrial({ seconds = 300, wallLimitSeconds = 420,
  selfPlay = false, varied = false, seed = 1, scenarioSeconds = 20,
  swapped = false, advanceOnGoal = true } = {}) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(wallLimitSeconds) || wallLimitSeconds <= 0 ||
      !Number.isFinite(scenarioSeconds) || scenarioSeconds <= 0) throw new Error('Trial durations must be positive and finite');
  const mode = globalThis.__activeMode;
  const renderer = globalThis.__gameRenderer;
  if (mode?.modeId !== 'arena-1v1' || !renderer) throw new Error('Launch the development Nexto arena first');
  if (mode.__nextoTrialRunning) throw new Error('A rendered trial is already running');
  mode.__nextoTrialRunning = true;
  const playerBot = selfPlay ? new NextoBot() : null;
  if (playerBot) {
    try {
      await new Promise((resolve, reject) => {
        const start = performance.now();
        const check = () => {
          if (playerBot.error) return reject(new Error(playerBot.error));
          if (globalThis.__activeMode !== mode) return reject(new Error('Arena changed during loading'));
          if (playerBot.ready && mode.nexto.ready) return resolve();
          if (performance.now() - start > 35000) return reject(new Error('Self-play loading timed out'));
          requestAnimationFrame(check);
        };
        check();
      });
    } catch (error) {
      playerBot.dispose();
      delete mode.__nextoTrialRunning;
      throw error;
    }
  }
  const update = mode.update;
  const step = mode._stepOnce;
  const render = renderer.render;
  const resetKickoff = mode.resetKickoff;
  const request = mode.nexto.request;
  const samples = { frame: [], update: [], step: [], render: [], reset: [], roundTrip: [], inference: [] };
  const slowFrames = [];
  const longTaskEvents = [];
  let frameCosts = { update: 0, step: 0, render: 0, reset: 0 };
  let previousFrame, sentAt, completed = 0, applied = 0, missed = 0, goals = 0, finite = true;
  let hiddenFrames = 0, longTasks = 0, longTaskMs = 0;
  const playerSamples = { roundTrip: [], inference: [] };
  const playerTotals = { completed: 0, applied: 0, missed: 0 };
  let playerSentAt;
  const scenarios = [];
  const outcomes = [];
  let activeScenario;
  let outcome;
  let timedReset = false;
  let scenarioStarted = 0;
  let scenarioResets = 0;
  const nextScenario = createTrialScenarios(seed);
  const applyScenario = () => {
    if (playerBot) { playerBot.reset(); playerBot.startKickoff(); }
    if (!varied) return;
    if (!activeScenario || advanceOnGoal || timedReset) {
      if (outcome) outcomes.push({ ...outcome, durationSeconds: mode.matchElapsed - scenarioStarted });
      const generated = nextScenario();
      activeScenario = swapped ? mirrorTrialScenario(generated) : generated;
      scenarioStarted = mode.matchElapsed;
      outcome = { name: activeScenario.name, goals: [0, 0], recoverySeconds: [null, null],
        boostPickedUp: [0, 0], maxSpeed: [0, 0] };
    }
    const scenario = activeScenario;
    scenarios.push({ ...scenario, atSimulationSeconds: mode.matchElapsed });
    resetRocketSimMatch(mode);
    [mode.physCar, mode.opponent].forEach((body, index) => {
      const config = scenario.cars[index];
      body.pos.fromArray(config.position);
      body.vel.set(0, 0, 0);
      body.omega.set(0, 0, 0);
      body.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), config.yaw);
      if (config.inverted) body.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
      body.boost = config.boost;
      body.onGround = config.position[2] === 17;
    });
    mode.physBall.pos.fromArray(scenario.ball.position);
    mode.physBall.vel.fromArray(scenario.ball.velocity);
    if (!scenario.scriptedKickoff) {
      mode.nexto.kickoffTick = -1;
      if (playerBot) playerBot.kickoffTick = -1;
    }
  };
  const playerReply = ({ data }) => {
    if (data.type !== 'action' || data.generation !== playerBot.generation) return;
    if (playerSentAt !== undefined) playerSamples.roundTrip.push(performance.now() - playerSentAt);
    playerSamples.inference.push(data.milliseconds);
  };
  const requestPlayer = () => {
    if (!playerBot) return;
    const pending = playerBot.pending;
    const start = performance.now();
    playerBot.request(mode.physCar, mode.opponent, mode.physBall, mode.pads);
    if (!pending && playerBot.pending) playerSentAt = start;
  };
  const observer = typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes.includes('longtask')
    ? new PerformanceObserver(list => { for (const entry of list.getEntries()) {
      longTasks++; longTaskMs += entry.duration;
      longTaskEvents.push({ startMs: entry.startTime, durationMs: entry.duration });
    } }) : null;
  const reply = ({ data }) => {
    if (data.type !== 'action' || data.generation !== mode.nexto.generation) return;
    if (sentAt !== undefined) samples.roundTrip.push(performance.now() - sentAt);
    samples.inference.push(data.milliseconds);
  };
  const timed = (values, callback) => {
    const start = performance.now();
    try { return callback(); } finally {
      const duration = performance.now() - start;
      values.push(duration);
      const name = Object.keys(frameCosts).find(key => samples[key] === values);
      if (name) frameCosts[name] += duration;
    }
  };
  mode.nexto.request = function (...args) {
    const wasPending = this.pending;
    const start = performance.now();
    const result = request.apply(this, args);
    if (!wasPending && this.pending) sentAt = start;
    return result;
  };
  mode.nexto.worker.addEventListener('message', reply);
  playerBot?.worker.addEventListener('message', playerReply);
  mode.resetKickoff = function (...args) {
    completed += this.nexto.decisions;
    applied += this.nexto.appliedDecisions;
    missed += this.nexto.missedDeadlines;
    if (playerBot) {
      playerTotals.completed += playerBot.decisions;
      playerTotals.applied += playerBot.appliedDecisions;
      playerTotals.missed += playerBot.missedDeadlines;
    }
    goals++;
    return timed(samples.reset, () => {
      const result = resetKickoff.apply(this, args);
      applyScenario();
      return result;
    });
  };
  mode._stepOnce = function (dt) {
    const scoreBefore = [...this.score];
    const boostsBefore = [this.physCar.boost, this.opponent.boost];
    const trackOutcome = () => {
      if (!outcome) return;
      [this.physCar, this.opponent].forEach((body, index) => {
        outcome.goals[index] += this.score[index] - scoreBefore[index];
        outcome.boostPickedUp[index] += Math.max(0, body.boost - boostsBefore[index]);
        outcome.maxSpeed[index] = Math.max(outcome.maxSpeed[index], body.vel.length());
        if (activeScenario.cars[index].inverted && outcome.recoverySeconds[index] === null &&
            body.onGround && new THREE.Vector3(0, 0, 1).applyQuaternion(body.q).z > 0.8) {
          outcome.recoverySeconds[index] = this.matchElapsed - scenarioStarted;
        }
      });
    };
    if (playerBot) {
      if (this.finished || this.goalPause > 0 || !this.nexto.ready) return;
      requestPlayer();
      const input = playerBot.inputForTick(this.physBall);
      const result = timed(samples.step, () => step.call(this, dt, input));
      trackOutcome();
      playerBot.advanceTick();
      if (!this.finished && this.goalPause <= 0) requestPlayer();
      return result;
    }
    const delta = this.physBall.pos.clone().sub(this.physCar.pos);
    const forward = this.physCar.pos.clone().set(1, 0, 0).applyQuaternion(this.physCar.q);
    const angle = Math.atan2(forward.x * delta.y - forward.y * delta.x, forward.x * delta.x + forward.y * delta.y);
    const result = timed(samples.step, () => step.call(this, dt, {
      throttle: 1, steer: Math.max(-1, Math.min(1, angle * 3)), boost: Math.abs(angle) < 0.15,
    }));
    trackOutcome();
    return result;
  };
  mode.update = function (dt, now) {
    if (previousFrame !== undefined) {
      const gapMs = now - previousFrame;
      samples.frame.push(gapMs);
      if (gapMs > 33.333) slowFrames.push({ startMs: previousFrame, gapMs, ...frameCosts,
        simulationSeconds: this.matchElapsed, scenario: activeScenario?.name,
        unexplainedMs: Math.max(0, gapMs - frameCosts.update - frameCosts.render - frameCosts.reset) });
    }
    frameCosts = { update: 0, step: 0, render: 0, reset: 0 };
    previousFrame = now;
    if (document.hidden) hiddenFrames++;
    if (varied && !this.finished && this.goalPause <= 0 && this.matchElapsed - scenarioStarted >= scenarioSeconds) {
      timedReset = true;
      try { this.resetKickoff(); } finally { timedReset = false; }
      goals--;
      scenarioResets++;
    }
    const result = timed(samples.update, () => update.call(this, dt, now));
    finite &&= [this.physCar, this.opponent, this.physBall].every(body =>
      [...body.pos.toArray(), ...body.vel.toArray(), ...(body.omega?.toArray() ?? []),
        ...(body.q?.toArray() ?? [])].every(Number.isFinite));
    return result;
  };
  renderer.render = function (...args) { return timed(samples.render, () => render.apply(this, args)); };
  observer?.observe({ type: 'longtask', buffered: false });
  const start = performance.now();
  const initialElapsed = 0;
  try {
    mode.resetState();
    goals = 0;
    completed = applied = missed = 0;
    playerTotals.completed = playerTotals.applied = playerTotals.missed = 0;
    await new Promise((resolve, reject) => {
      const check = () => {
        if (globalThis.__activeMode !== mode) return reject(new Error('Arena changed during benchmark'));
        if (mode.nexto.error) return reject(new Error(mode.nexto.error));
        if (playerBot?.error) return reject(new Error(playerBot.error));
        if (mode.finished || mode.matchElapsed - initialElapsed >= seconds) return resolve();
        if (performance.now() - start > wallLimitSeconds * 1000) return reject(new Error('Rendered trial wall-time limit exceeded'));
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
    return { wallSeconds: (performance.now() - start) / 1000, simulationSeconds: mode.matchElapsed - initialElapsed,
      scorePlayerNexto: [...mode.score], finished: mode.finished, goals, finite, hiddenFrames,
      completedDecisions: completed + mode.nexto.decisions, appliedDecisions: applied + mode.nexto.appliedDecisions,
      missedDeadlines: missed + mode.nexto.missedDeadlines, longTasks, longTaskMs,
      selfPlay, varied, seed, scenarioSeconds, scenarioResets, scenarios, swapped, advanceOnGoal,
      outcomes: outcome ? [...outcomes, { ...outcome, durationSeconds: mode.matchElapsed - scenarioStarted }] : [],
      slowFrames, longTaskEvents,
      playerPolicy: playerBot ? {
        completedDecisions: playerTotals.completed + playerBot.decisions,
        appliedDecisions: playerTotals.applied + playerBot.appliedDecisions,
        missedDeadlines: playerTotals.missed + playerBot.missedDeadlines,
        timings: Object.fromEntries(Object.entries(playerSamples).map(([name, values]) => [name, summary(values)])),
      } : null,
      timings: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, summary(values)])),
      framesOver33Ms: samples.frame.filter(value => value > 33.333).length,
      framesOver50Ms: samples.frame.filter(value => value > 50).length,
      viewport: { width: innerWidth, height: innerHeight, pixelRatio: renderer.getPixelRatio() },
      opponent: selfPlay ? 'Two independent Nexto workers; not a competitive rating benchmark'
        : 'Deterministic ball chaser; not a competitive strength benchmark',
      renderTiming: 'CPU submission only; does not measure GPU execution' };
  } finally {
    mode.update = update;
    mode._stepOnce = step;
    mode.resetKickoff = resetKickoff;
    mode.nexto.request = request;
    renderer.render = render;
    mode.nexto.worker.removeEventListener('message', reply);
    observer?.disconnect();
    playerBot?.worker.removeEventListener('message', playerReply);
    playerBot?.dispose();
    if (selfPlay && globalThis.__activeMode === mode && !mode.finished) mode.resetKickoff();
    delete mode.__nextoTrialRunning;
  }
}