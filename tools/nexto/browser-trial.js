import { Vector3 } from 'three';
import { NextoBot } from '../../src/shared/nextoBot.js';
import { makePhysCar } from '../../src/shared/carPhysics.js';
import { makeBall } from '../../src/shared/rl-physics.js';
import { createSoccarBoostPads } from '../../src/shared/boostPads.js';
import { initializeRocketSim, rocketSimReady, stepRocketSimMatch, syncRocketSimPads, releaseRocketSimWorld } from '../../src/shared/rocketSimRuntime.js';

export async function runNextoTrials({ seconds = 20, repeats = 3 } = {}) {
  if (!rocketSimReady()) await initializeRocketSim();
  const bot = new NextoBot();
  const latency = [];
  let sentAt = 0;
  bot.worker.addEventListener('message', ({ data }) => {
    if (data.type === 'action' && data.generation === bot.generation) {
      latency.push({ workerMs: data.milliseconds, totalMs: performance.now() - sentAt });
    }
  });
  const request = (car, opponent, ball, pads) => {
    if (!bot.ready || bot.pending || bot.error || bot.queuedAction ||
      (bot.remaining !== 0 && bot.remaining !== 7) || bot.kickoffTick >= 0) return;
    sentAt = performance.now();
    bot.request(car, opponent, ball, pads);
  };
  const results = [];
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Nexto readiness timeout')), 31000);
      bot.worker.addEventListener('message', ({ data }) => {
        if (data.type === 'ready') { clearTimeout(timeout); resolve(); }
        if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); }
      });
    });
    for (const name of [...Array.from({ length: repeats }, (_, index) => `match-${index}`), 'shooting', 'defending', 'recovery', 'boost']) {
      const owner = {};
      const score = [0, 0];
      let car, opponent, ball, pads;
      const reset = () => {
        releaseRocketSimWorld(owner);
        bot.reset();
        car = makePhysCar(new Vector3(name === 'match-1' ? 256 : 0, 4608, 17), -Math.PI / 2);
        car.team = 1;
        opponent = makePhysCar(new Vector3(name === 'match-2' ? -256 : 0, -4608, 17), Math.PI / 2);
        opponent.team = 0;
        ball = makeBall(new Vector3(0, 0, 93.15));
        pads = createSoccarBoostPads();
        if (name.startsWith('match-')) bot.startKickoff();
        else {
          car.pos.set(0, 2000, 17);
          ball.pos.y = 500;
          if (name === 'defending') { car.pos.y = 4400; ball.pos.y = 3500; ball.vel.y = 1600; }
          if (name === 'recovery') { car.pos.z = 600; car.q.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI); car.onGround = false; }
          if (name === 'boost') car.boost = 0;
        }
      };
      reset();
      let ticks = 0, pendingTicks = 0, touches = 0, decisions = 0, maxBoost = car.boost;
      let missedDeadlines = 0, appliedDecisions = 0;
      let recovered = false, maxBacklog = 0;
      const duration = name.startsWith('match-') ? seconds : 5;
      let previous = performance.now(), accumulator = 0;
      try {
        await new Promise((resolve, reject) => {
          const frame = now => {
            try {
              if (bot.error) throw new Error(bot.error);
              const elapsed = (now - previous) / 1000;
              previous = now;
              maxBacklog = Math.max(maxBacklog, elapsed);
              accumulator += Math.min(elapsed, 0.25);
              while (accumulator >= 1 / 120 && ticks < duration * 120) {
                const input = bot.inputForTick(ball);
                request(car, opponent, ball, pads);
                if (bot.pending && !bot.queuedAction) pendingTicks++;
                const forward = new Vector3(1, 0, 0).applyQuaternion(opponent.q);
                const target = Math.atan2(ball.pos.y - opponent.pos.y, ball.pos.x - opponent.pos.x);
                const delta = target - Math.atan2(forward.y, forward.x);
                const angle = Math.atan2(Math.sin(delta), Math.cos(delta));
                const contacts = stepRocketSimMatch(owner, [opponent, car], ball, [
                  { throttle: 1, steer: Math.max(-1, Math.min(1, angle * 3)), boost: Math.abs(angle) < 0.15 }, input,
                ], 1 / 120);
                if (contacts[1]) touches++;
                bot.advanceTick();
                request(car, opponent, ball, pads);
                syncRocketSimPads(pads, owner);
                maxBoost = Math.max(maxBoost, car.boost);
                recovered ||= car.onGround && new Vector3(0, 0, 1).applyQuaternion(car.q).z > 0.9;
                ticks++;
                accumulator -= 1 / 120;
                if (Math.abs(ball.pos.y) > 5213 && Math.abs(ball.pos.x) < 893 && ball.pos.z < 642) {
                  score[ball.pos.y < 0 ? 1 : 0]++;
                  decisions += bot.decisions;
                  missedDeadlines += bot.missedDeadlines;
                  appliedDecisions += bot.appliedDecisions;
                  reset();
                }
              }
              if (ticks >= duration * 120) resolve();
              else requestAnimationFrame(frame);
            } catch (error) { reject(error); }
          };
          requestAnimationFrame(frame);
        });
        results.push({ name, seconds: ticks / 120, scoreBaselineNexto: score, touches,
          decisions: decisions + bot.decisions, pendingTicks, maxFrameGapMs: maxBacklog * 1000,
          missedDeadlines: missedDeadlines + bot.missedDeadlines,
          appliedDecisions: appliedDecisions + bot.appliedDecisions,
          recovered, maxBoost, finite: [...car.pos.toArray(), ...ball.pos.toArray()].every(Number.isFinite) });
      } finally { releaseRocketSimWorld(owner); }
    }
    const sorted = latency.map(sample => sample.totalMs).sort((first, second) => first - second);
    return { results, timing: { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)],
      p95Ms: sorted[Math.floor(sorted.length * 0.95)], maxMs: sorted.at(-1) },
      opponent: 'Deterministic throttle/steer ball chaser, not a competitive rating benchmark' };
  } finally { bot.dispose(); }
}