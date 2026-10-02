import { Vector3 } from "three";
import { makeBall, stepBall, RL } from "../shared/rl-physics.js";

const vector = value => new Vector3(value.x, value.y, value.z);
const finiteVector = value => value && [value.x, value.y, value.z].every(Number.isFinite);

export function compareBallWindow(samples, kind) {
  const first = samples[0];
  const ball = makeBall(vector(first.body.location));
  ball.vel.copy(vector(first.body.linear_velocity));
  let completedTicks = 0;
  const rows = samples.map(sample => {
    const elapsed = sample.time - first.time;
    const targetTicks = Math.round(elapsed / RL.DT);
    while (completedTicks < targetTicks) {
      stepBall(ball, RL.DT, { arena: kind === "bounce" });
      completedTicks++;
    }
    const recorded = vector(sample.body.location);
    return { time: sample.time, ticks: completedTicks,
      timingResidualSeconds: completedTicks * RL.DT - elapsed,
      recorded: recorded.toArray(), simulated: ball.pos.toArray(),
      positionErrorUU: ball.pos.distanceTo(recorded),
      velocityErrorUUs: ball.vel.distanceTo(vector(sample.body.linear_velocity)) };
  });
  return { kind, start: first.time, end: samples.at(-1).time, rows,
    maxPositionErrorUU: Math.max(...rows.map(row => row.positionErrorUU)),
    maxVelocityErrorUUs: Math.max(...rows.map(row => row.velocityErrorUUs)),
    maxTimingResidualSeconds: Math.max(...rows.map(row => Math.abs(row.timingResidualSeconds))) };
}

export function analyzeReplayBall(replay) {
  const samples = replay.times.map((time, index) => {
    const body = replay.ball[index]?.Data?.rigid_body;
    const valid = body && !body.sleeping && finiteVector(body.location) && finiteVector(body.linear_velocity);
    const safe = valid && replay.players.every(player => {
      const car = player.frames[index]?.Data?.rigid_body;
      return finiteVector(car?.location) && vector(car.location).distanceTo(vector(body.location)) > 500;
    });
    return { time, body, safe };
  });
  const windows = [];
  for (const kind of ["flight", "bounce"]) {
    for (let start = 0; start + 15 < samples.length; start++) {
      const candidate = samples.slice(start, start + 16);
      const valid = candidate.every((sample, index) => {
        if (!sample.safe) return false;
        const pos = sample.body.location;
        const interval = index ? sample.time - candidate[index - 1].time : 1 / 30;
        return interval >= 0.02 && interval <= 0.045 && Math.abs(pos.x) < 3000 &&
          Math.abs(pos.y) < 4000 && pos.z < 1600 && pos.z >= (kind === "flight" ? 300 : 85) &&
          (!index || vector(pos).distanceTo(vector(candidate[index - 1].body.location)) < 250);
      });
      if (!valid) continue;
      if (kind === "flight" && Math.hypot(candidate[0].body.linear_velocity.x, candidate[0].body.linear_velocity.y) < 300) continue;
      if (kind === "bounce") {
        const bounce = candidate.findIndex((sample, index) => index > 0 &&
          candidate[index - 1].body.linear_velocity.z < -100 && sample.body.linear_velocity.z > 100 &&
          Math.min(sample.body.location.z, candidate[index - 1].body.location.z) < 150);
        if (bounce < 3 || bounce > 12) continue;
      }
      windows.push(compareBallWindow(candidate, kind));
      break;
    }
  }
  return { status: "diagnostic-only", windows,
    limitations: ["Network timestamps are not synchronized 120 Hz physics ticks; cumulative elapsed time is rounded to ticks.",
      "Each simulation is initialized once; no intermediate recorded state resets or motion-derived timing are used.",
      "Contact exclusion uses a 500 uu car separation and interior bounds, not model-error filtering.",
      "Initial spin is zero because replay angular-velocity units are unverified; bounce friction is not certified.",
      "Sparse network updates can conceal contacts, teleports and timing phase; these errors are not parity pass/fail gates."] };
}