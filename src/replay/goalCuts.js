import { frameAt, samplePose } from "./timeline.js";

const cache = new WeakMap();
const kickoffCache = new WeakMap();

export function replayKickoffs(replay) {
  if (kickoffCache.has(replay)) return kickoffCache.get(replay);
  const kickoffs = [];
  const goals = (replay.events ?? []).filter(event => event.type === "goal").sort((first, second) => first.time - second.time);
  const windows = [{ start: 0, limit: Math.min(25, goals[0]?.time ?? Infinity), initial: true },
    ...goals.map((event, index) => ({ start: event.time + 2,
      limit: Math.min(event.time + 25, goals[index + 1]?.time ?? Infinity), initial: false }))];
  for (const window of windows) {
    let reset;
    for (let index = frameAt(replay.times, window.start).index; index < replay.times.length; index++) {
      const time = replay.times[index];
      if (time >= window.limit) break;
      const cursor = { index, next: index, blend: 0 };
      const ball = samplePose(replay.ball, cursor);
      const centered = ball && Math.hypot(ball.position.x, ball.position.z) < 0.3 && ball.velocity.length() < 0.1;
      if (reset === undefined && centered) reset = time;
      if (reset === undefined) continue;
      const moving = replay.players.some(player => {
        const car = samplePose(player.frames, cursor);
        return car && car.velocity.length() > 1;
      });
      if (moving) {
        kickoffs.push({ start: window.start, time: window.initial ? time : reset,
          poseTime: window.initial ? Math.max(reset, time - 0.1) : reset });
        break;
      }
    }
  }
  kickoffCache.set(replay, kickoffs);
  return kickoffs;
}

export function replayPlaybackSegments(replay, start, end) {
  const segments = [];
  for (const kickoff of replayKickoffs(replay)) {
    if (kickoff.time < start || kickoff.time >= end) continue;
    if (kickoff.start > start) segments.push({ start, end: kickoff.start, duration: kickoff.start - start });
    segments.push({ start: kickoff.poseTime, end: kickoff.poseTime, duration: 3, countdown: true });
    start = kickoff.time;
  }
  if (start < end) segments.push({ start, end, duration: end - start });
  return segments;
}

export function replayPlaybackSample(segments, time) {
  for (const segment of segments) {
    if (time < segment.duration) return { time: segment.countdown ? segment.start : segment.start + time,
      countdown: segment.countdown ? 3 - Math.floor(Math.max(0, time)) : null };
    time -= segment.duration;
  }
  return { time: segments.at(-1)?.end ?? 0, countdown: null };
}

export function replayPlaybackOffset(segments, time, previousOffset) {
  if (Number.isFinite(previousOffset) && previousOffset >= 0) {
    const previous = replayPlaybackSample(segments, previousOffset);
    if (previous.countdown !== null && previous.time === time) return previousOffset;
  }
  let offset = 0;
  for (const segment of segments) {
    if (segment.countdown && time <= segment.start) return offset;
    if (!segment.countdown && time < segment.end) return offset + Math.max(0, time - segment.start);
    offset += segment.duration;
  }
  return offset;
}

export function replayGoalCuts(replay) {
  if (cache.has(replay)) return cache.get(replay);
  const cuts = [];
  const goals = (replay.events ?? []).filter(event => event.type === "goal").sort((first, second) => first.time - second.time);
  for (const [goalIndex, goal] of goals.entries()) {
    const start = goal.time + 2;
    const limit = Math.min(goal.time + 25, goals[goalIndex + 1]?.time ?? Infinity);
    let reset = false;
    for (let index = frameAt(replay.times, start).next; index < replay.times.length; index++) {
      const time = replay.times[index];
      if (time >= limit) break;
      const cursor = { index, next: index, blend: 0 };
      const ball = samplePose(replay.ball, cursor);
      if (ball && Math.hypot(ball.position.x, ball.position.z) < 0.3 && ball.velocity.length() < 0.1) reset = true;
      if (!reset) continue;
      const moving = replay.players.some(player => {
        const car = samplePose(player.frames, cursor);
        return car && car.velocity.length() > 1;
      });
      if (moving) {
        const end = time - 0.25;
        if (end > start + 0.5) cuts.push({ start, end });
        break;
      }
    }
  }
  cache.set(replay, cuts);
  return cuts;
}

export function skipReplayGoalPause(replay, time) {
  const cut = replayGoalCuts(replay).find(range => time >= range.start && time < range.end);
  return cut ? cut.end : time;
}

export function replayClipSegments(replay, start, end) {
  const segments = [];
  for (const cut of replayGoalCuts(replay)) {
    if (cut.end <= start || cut.start >= end) continue;
    if (cut.start > start) segments.push({ start, end: cut.start });
    start = Math.max(start, cut.end);
  }
  if (start < end) segments.push({ start, end });
  return segments;
}

export function replayClipTime(segments, time) {
  for (const segment of segments) {
    const duration = segment.end - segment.start;
    if (time < duration) return segment.start + time;
    time -= duration;
  }
  return segments.at(-1)?.end;
}