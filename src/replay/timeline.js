import { Quaternion, Vector3 } from "three";

const field = (value, key) => value instanceof Map ? value.get(key) : value?.[key];
const identity = value => JSON.stringify(value instanceof Map ? Object.fromEntries(value) : value);

function recordedBallCam(raw, players, times, origin, steering = false, rearView = false) {
  const objects = field(raw, "objects") ?? [];
  const actors = new Map();
  const events = players.map(() => []);
  const playerIds = new Map(players.map((player, index) => [identity(player.id), index]));
  for (const frame of field(field(raw, "network_frames"), "frames") ?? []) {
    for (const actorId of field(frame, "deleted_actors") ?? []) actors.delete(actorId);
    for (const actor of field(frame, "new_actors") ?? []) actors.delete(field(actor, "actor_id"));
    for (const update of field(frame, "updated_actors") ?? []) {
      const actorId = field(update, "actor_id");
      const state = actors.get(actorId) ?? {};
      actors.set(actorId, state);
      const name = objects[field(update, "object_id")];
      const attribute = field(update, "attribute");
      if (name === "Engine.PlayerReplicationInfo:UniqueId") {
        state.playerId = identity(field(field(attribute, "UniqueId"), "remote_id"));
      } else if (name === (steering ? "Engine.Pawn:PlayerReplicationInfo" : "TAGame.CameraSettingsActor_TA:PRI")) {
        const reference = field(attribute, "ActiveActor");
        state.pri = field(reference, "active") ? field(reference, "actor") : undefined;
      } else if (name === (steering ? "TAGame.Vehicle_TA:ReplicatedSteer" : rearView ? "TAGame.CameraSettingsActor_TA:bUsingBehindView" : "TAGame.CameraSettingsActor_TA:bUsingSecondaryCamera")) {
        state.ballCam = steering ? Math.max(-1, Math.min(1, (field(attribute, "Byte") - 128) / 127)) : field(attribute, "Boolean");
      }
    }
    for (const state of actors.values()) {
      const playerIndex = playerIds.get(actors.get(state.pri)?.playerId);
      if (playerIndex === undefined || (steering ? !Number.isFinite(state.ballCam) : typeof state.ballCam !== "boolean")) continue;
      const track = events[playerIndex];
      if (track.at(-1)?.value !== state.ballCam) {
        track.push({ time: field(frame, "time") - origin, value: state.ballCam });
      }
    }
  }
  return events.map(track => {
    let cursor = 0;
    let value = null;
    return times.map(time => {
      while (cursor < track.length && track[cursor].time <= time) value = track[cursor++].value;
      return value;
    });
  });
}

function recordedMatch(raw, metadata) {
  const objects = field(raw, "objects") ?? [];
  const frames = field(field(raw, "network_frames"), "frames") ?? [];
  const teams = new Map();
  const scores = [null, null];
  let overtime = false;
  let cursor = 0;
  return metadata.map(sample => {
    while (cursor < frames.length && field(frames[cursor], "time") <= sample.time) {
      const frame = frames[cursor++];
      for (const actor of field(frame, "deleted_actors") ?? []) teams.delete(actor);
      for (const actor of field(frame, "new_actors") ?? []) {
        const actorId = field(actor, "actor_id");
        teams.delete(actorId);
        const name = objects[field(actor, "object_id")];
        if (name === "Archetypes.Teams.Team0" || name === "Archetypes.Teams.Team1") {
          const team = name.endsWith("Team0") ? 0 : 1;
          teams.set(actorId, { team, score: 0 });
          scores[team] = 0;
        }
      }
      for (const update of field(frame, "updated_actors") ?? []) {
        const name = objects[field(update, "object_id")];
        const attribute = field(update, "attribute");
        const actorId = field(update, "actor_id");
        if (name === "Engine.TeamInfo:TeamIndex") {
          const team = field(attribute, "Int") ?? field(attribute, "Byte");
          if (team === 0 || team === 1) {
            const state = teams.get(actorId) ?? { score: 0 };
            teams.set(actorId, { ...state, team });
            scores[team] = state.score;
          }
        } else if (name === "Engine.TeamInfo:Score") {
          const state = teams.get(actorId) ?? {};
          state.score = field(attribute, "Int");
          teams.set(actorId, state);
          if (state.team === 0 || state.team === 1) scores[state.team] = state.score;
        } else if (name === "TAGame.GameEvent_Soccar_TA:bOverTime") {
          overtime = field(attribute, "Boolean") === true;
        }
      }
    }
    return { blue: scores[0], orange: scores[1], overtime,
      seconds: Number.isFinite(sample.seconds_remaining) ? Math.abs(sample.seconds_remaining) : null };
  });
}

export function formatMatchClock(match) {
  if (!Number.isFinite(match?.seconds)) return "--:--";
  const seconds = Math.floor(match.seconds);
  return `${match.overtime ? "+" : ""}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function resolveReplayPadLocations(events) {
  const pads = [[0, -4240], [-1792, -4184], [1792, -4184], [-940, -3308], [940, -3308],
    [0, -2816], [-3584, -2484], [3584, -2484], [-1788, -2300], [1788, -2300],
    [-2048, -1036], [0, -1024], [2048, -1036], [-1024, 0], [1024, 0],
    [-2048, 1036], [0, 1024], [2048, 1036], [-1788, 2300], [1788, 2300],
    [-3584, 2484], [3584, 2484], [0, 2816], [-940, 3308], [940, 3308],
    [-1792, 4184], [1792, 4184], [0, 4240], [-3584, 0], [3584, 0],
    [-3072, 4096], [3072, 4096], [-3072, -4096], [3072, -4096]]
    .map(([x, y], index) => ({ x, y, z: index < 28 ? 70 : 73, big: index >= 28 }));
  const evidence = new Map();
  for (const event of events) {
    if (event.type !== "pad" || event.active || event.position || !event.pickupPosition || !event.object) continue;
    if (event.pickupPosition[1] > 1.4) continue;
    const positions = [event.pickupPosition, ...(event.smallPickupConfirmed ? event.pickupPath ?? [] : [])];
    const nearby = pads.filter(pad => (!event.smallPickupConfirmed || !pad.big) && positions.some(position =>
      position[1] <= 1.4 && Math.hypot(pad.x * 0.01 - position[0],
        pad.y * 0.01 - position[2]) < (pad.big ? 2.8 : 2.1)));
    if (nearby.length !== 1) continue;
    const votes = evidence.get(event.object) ?? [];
    votes.push({ pad: nearby[0], confirmed: event.smallPickupConfirmed === true });
    evidence.set(event.object, votes);
  }
  const resolved = new Map([...evidence].filter(([, votes]) => (votes.length >= 2 || votes.some(vote => vote.confirmed)) &&
    votes.every(vote => vote.pad === votes[0].pad))
    .map(([object, votes]) => [object, votes[0].pad]));
  const owners = new Map();
  for (const [object, pad] of resolved) {
    const names = owners.get(pad) ?? [];
    names.push(object);
    owners.set(pad, names);
  }
  for (const event of events) {
    if (event.type !== "pad" || event.position) continue;
    const pad = resolved.get(event.object);
    if (!pad || owners.get(pad).length !== 1) continue;
    event.position = [pad.x * 0.01, pad.z * 0.01, pad.y * 0.01];
    event.positionSource = "pickup-consensus";
  }
}

function recordedEvents(raw, replay, origin) {
  const objects = field(raw, "objects") ?? [];
  const actors = new Map();
  const seen = new Set();
  const events = [];
  for (const frame of field(field(raw, "network_frames"), "frames") ?? []) {
    const time = field(frame, "time") - origin;
    const pickups = [];
    for (const actor of field(frame, "new_actors") ?? []) {
      const location = field(field(actor, "initial_trajectory"), "location");
      const actorId = field(actor, "actor_id");
      seen.delete(actorId);
      actors.set(actorId, { name: objects[field(actor, "object_id")],
        position: location ? [field(location, "x") * 0.01, field(location, "z") * 0.01, field(location, "y") * 0.01] : null });
    }
    for (const update of field(frame, "updated_actors") ?? []) {
      const actor = field(update, "actor_id");
      const state = actors.get(actor) ?? {};
      actors.set(actor, state);
      const name = objects[field(update, "object_id")];
      const attribute = field(update, "attribute");
      if (name === "Engine.PlayerReplicationInfo:UniqueId") state.id = field(field(attribute, "UniqueId"), "remote_id");
      if (name === "Engine.Pawn:PlayerReplicationInfo" && field(field(attribute, "ActiveActor"), "active")) {
        state.pri = field(field(attribute, "ActiveActor"), "actor");
      }
      if (name === "TAGame.RBActor_TA:ReplicatedRBState") {
        const location = field(field(attribute, "RigidBody"), "location");
        if (location) state.position = [field(location, "x") * 0.01, field(location, "z") * 0.01, field(location, "y") * 0.01];
      }
      if (/VehiclePickup_TA:(NewReplicatedPickupData|ReplicatedPickupData)$/.test(name ?? "")) {
        const pickup = field(attribute, "PickupNew") ?? field(attribute, "Pickup");
        const value = field(pickup, "picked_up");
        if (value === undefined || !/VehiclePickup_Boost/.test(state.name ?? "")) continue;
        const active = value === 255 || value === false;
        if (state.active !== active) {
          const event = { type: "pad", time, actor, active, position: state.position, object: state.name };
          events.push(event);
          if (!active && state.active !== undefined) pickups.push({ event, instigator: field(pickup, "instigator") });
        }
        state.active = active;
      } else if (/Car_TA:ReplicatedDemolish/.test(name ?? "")) {
        const demo = field(attribute, "DemolishFx") ?? field(attribute, "Demolish");
        const victim = field(demo, "victim");
        if (victim === undefined || seen.has(victim)) continue;
        seen.add(victim);
        const victimState = actors.get(victim) ?? state;
        const id = actors.get(victimState.pri)?.id;
        events.push({ type: "demo", time, victim, player: replay.players.findIndex(player => identity(player.id) === identity(id)),
          position: victimState.position });
      } else if (name === "TAGame.Ball_TA:HitTeamNum") {
        const team = field(attribute, "Byte");
        if (team !== 0 && team !== 1) continue;
        const pose = samplePose(replay.ball, frameAt(replay.times, time));
        if (pose) events.push({ type: "hit", time, team, position: pose.position.toArray() });
      }
    }
    for (const { event, instigator } of pickups) {
      const collector = actors.get(instigator);
      const id = actors.get(collector?.pri)?.id;
      const player = replay.players.find(player => identity(player.id) === identity(id));
      const pose = player ? samplePose(player.frames, frameAt(replay.times, time)) : null;
      event.pickupPosition = pose?.position.toArray() ?? null;
      if (player) {
        const cursor = frameAt(replay.times, time);
        const previous = player.frames[cursor.index - 1]?.Data;
        const current = player.frames[cursor.index]?.Data;
        const nextIndex = cursor.index + 1;
        if (previous && current && replay.times[cursor.index] - replay.times[cursor.index - 1] <= 0.05 &&
          Math.abs(current.boost_amount - previous.boost_amount - 31) < 0.5 && !current.boost_active) {
          event.smallPickupConfirmed = true;
          if (replay.times[nextIndex] - time <= 0.05) {
            const next = samplePose(player.frames, { index: nextIndex, next: nextIndex, blend: 0 });
            if (next) event.pickupPath = [next.position.toArray()];
          }
        }
      }
    }
    for (const event of events) {
      if (event.type !== "demo" || event.player >= 0) continue;
      const id = actors.get(actors.get(event.victim)?.pri)?.id;
      event.player = replay.players.findIndex(player => identity(player.id) === identity(id));
    }
    for (const actor of field(frame, "deleted_actors") ?? []) {
      const demo = events.findLast(event => event.type === "demo" && event.victim === actor && event.end === undefined);
      if (demo) demo.end = time;
      actors.delete(actor);
      seen.delete(actor);
    }
  }
  replay.match.forEach((match, index) => {
    if (!index) return;
    const previous = replay.match[index - 1];
    for (const [team, key] of [[0, "blue"], [1, "orange"]]) {
      if (previous[key] !== null && match[key] > previous[key]) {
        const pose = samplePose(replay.ball, { index, next: index, blend: 0 });
        events.push({ type: "goal", time: replay.times[index], team, position: pose?.position.toArray() ?? [0, 2, team === 0 ? 51 : -51] });
      }
    }
  });
  for (const event of events) {
    if (event.type !== "demo" || event.player < 0) continue;
    const missing = replay.players[event.player].frames.findIndex((frame, index) => replay.times[index] >= event.time && !frame?.Data);
    if (missing >= 0) event.end = Math.min(event.end ?? Infinity, replay.times[missing]);
    replay.players[event.player].frames.forEach((frame, index) => {
      if (frame?.Data && replay.times[index] >= event.time && replay.times[index] <= (event.end ?? replay.duration)) frame.Data.demolished = true;
    });
  }
  resolveReplayPadLocations(events);
  return events.sort((first, next) => first.time - next.time);
}

const motionTimelines = new WeakMap();

export function prepareReplayMotion(replay) {
  for (const frames of [replay.ball, ...replay.players.map(player => player.frames)]) {
    const times = replay.times.slice();
    const contactIntervals = new Set();
    let start = 0;
    let durations = [];
    const finish = end => {
      if (durations.length >= 4) {
        const scale = (replay.times[end] - replay.times[start]) / durations.reduce((sum, value) => sum + value, 0);
        let time = replay.times[start];
        const candidates = durations.map(duration => { time += duration * scale; return time; });
        if (candidates.every((value, index) => Math.abs(value - replay.times[start + index + 1]) <= 0.05)) {
          candidates.forEach((value, index) => { times[start + index + 1] = value; });
          times[end] = replay.times[end];
        }
      }
    };
    for (let index = 1; index < replay.times.length; index++) {
      const first = frames[index - 1]?.Data;
      const next = frames[index]?.Data;
      const interval = replay.times[index] - replay.times[index - 1];
      const bodies = [first?.rigid_body, next?.rigid_body];
      let duration;
      if (interval > 0 && interval <= 0.1 && !first?.demolished && !next?.demolished &&
          bodies.every(body => body && [body.location, body.linear_velocity].every(value =>
            value && [value.x, value.y, value.z].every(Number.isFinite)))) {
        const vector = value => new Vector3(value.x, value.y, value.z);
        const displacement = vector(bodies[1].location).sub(vector(bodies[0].location));
        const velocity = vector(bodies[0].linear_velocity).add(vector(bodies[1].linear_velocity)).multiplyScalar(0.5);
        const inferred = displacement.dot(velocity) / velocity.lengthSq();
        const residual = displacement.clone().addScaledVector(velocity, -inferred).length();
        const velocityChange = vector(bodies[0].linear_velocity).distanceTo(vector(bodies[1].linear_velocity));
        if (frames === replay.ball && velocityChange > 100) contactIntervals.add(index);
        if (velocity.length() > 100 && displacement.length() < 1500 &&
          !contactIntervals.has(index) && velocityChange / interval <= 5000 &&
            inferred >= interval * 0.2 && inferred <= interval * 2 &&
            residual <= Math.max(2, displacement.length() * 0.1)) duration = inferred;
      }
      if (duration === undefined) {
        finish(index - 1);
        start = index;
        durations = [];
      } else durations.push(duration);
    }
    finish(replay.times.length - 1);
    motionTimelines.set(frames, { original: replay.times, times, contactIntervals });
  }
}

export function normalizeReplay(decoded, raw) {
  const data = decoded.frame_data;
  const metadata = data?.metadata_frames;
  if (!metadata || metadata.length < 2) throw new Error("Replay has no playable network frames.");
  const origin = metadata[0].time;
  const times = metadata.map(frame => frame.time - origin);
  if (times.some((time, index) => !Number.isFinite(time) || (index > 0 && time < times[index - 1]))) {
    throw new Error("Replay timestamps are invalid.");
  }
  const teams = [...(decoded.meta?.team_zero ?? []), ...(decoded.meta?.team_one ?? [])];
  const players = data.players.map(([id, track], index) => {
    const info = teams.find(player => JSON.stringify(player.remote_id) === JSON.stringify(id));
    const first = track.frames.find(frame => frame?.Data)?.Data;
    return { id, bodyId: info?.car_body_id ?? null, carId: ({ 23: "octane", 403: "dominus", 4284: "fennec" })[info?.car_body_id] ?? "classic",
      name: info?.name ?? first?.player_name ?? `Player ${index + 1}`,
      blue: first?.is_team_0 ?? true, cameraSettings: info?.camera_settings ?? null, frames: track.frames };
  });
  const duration = times.at(-1);
  if (!(duration > 0) || !players.length) throw new Error("Replay has no playable match.");
  if (raw) recordedBallCam(raw, players, times, origin).forEach((track, index) => { players[index].ballCam = track; });
  if (raw) recordedBallCam(raw, players, times, origin, false, true).forEach((track, index) => { players[index].rearView = track; });
  if (raw) recordedBallCam(raw, players, times, origin, true).forEach((track, index) => { players[index].steering = track; });
  const replay = { times, duration, players, ball: data.ball_data.frames, match: recordedMatch(raw, metadata) };
  replay.events = recordedEvents(raw, replay, origin);
  prepareReplayMotion(replay);
  return replay;
}

export function frameAt(times, time) {
  let lower = 0;
  let upper = times.length - 1;
  const clamped = Math.max(0, Math.min(times[upper], time));
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (times[middle] <= clamped) lower = middle;
    else upper = middle - 1;
  }
  const next = Math.min(lower + 1, times.length - 1);
  const interval = times[next] - times[lower];
  return { index: lower, next, blend: interval > 0 ? (clamped - times[lower]) / interval : 0, interval };
}

export function samplePose(frames, cursor) {
  const recorded = frames[cursor.index]?.Data;
  const timeline = motionTimelines.get(frames);
  if (timeline && cursor.interval !== undefined) {
    const time = timeline.original[cursor.index] + cursor.interval * cursor.blend;
    cursor = frameAt(timeline.times, time);
  }
  const first = frames[cursor.index]?.Data;
  if (!first?.rigid_body || first.demolished) return null;
  const second = frames[cursor.next]?.Data;
  const body = first.rigid_body;
  const next = second?.rigid_body ?? body;
  const position = value => new Vector3(value.x, value.z, value.y).multiplyScalar(0.01);
  const rotation = value => new Quaternion(-value.x, -value.z, -value.y, value.w).normalize();
  const start = position(body.location);
  const finish = position(next.location);
  const interpolate = start.distanceTo(finish) < 15 && second?.rigid_body &&
    !first.demolished && !second.demolished;
  const blend = interpolate ? cursor.blend : 0;
  const velocity = body.linear_velocity;
  const finiteVelocity = value => value && [value.x, value.y, value.z].every(Number.isFinite);
  const sampledVelocity = finiteVelocity(velocity) ? position(velocity) : new Vector3();
  const nextVelocity = next.linear_velocity;
  let sampledPosition = start.clone().lerp(finish, blend);
  if (interpolate && finiteVelocity(velocity) && finiteVelocity(nextVelocity)) {
    const finishVelocity = position(nextVelocity);
    sampledVelocity.lerp(finishVelocity, blend);
    const interval = cursor.interval;
    if (interval > 0 && interval <= 0.1) {
      const displacement = finish.clone().sub(start);
      const expected = position(velocity).add(finishVelocity).multiplyScalar(interval / 2);
      const acceleration = position(velocity).distanceTo(finishVelocity) / interval;
        if (!timeline?.contactIntervals.has(cursor.next) && acceleration <= 50 &&
          expected.distanceTo(displacement) <= Math.max(0.02, displacement.length() * 0.25)) {
        const squared = blend * blend;
        const cubed = squared * blend;
        sampledPosition = start.clone().multiplyScalar(2 * cubed - 3 * squared + 1)
          .addScaledVector(position(velocity), (cubed - 2 * squared + blend) * interval)
          .addScaledVector(finish, -2 * cubed + 3 * squared)
          .addScaledVector(finishVelocity, (cubed - squared) * interval);
      }
    }
  }
  return { position: sampledPosition,
    quaternion: rotation(body.rotation).slerp(rotation(next.rotation), blend),
    boost: Boolean(recorded?.boost_active),
    powerslide: Boolean(recorded?.powerslide_active),
    velocity: sampledVelocity,
    boostAmount: Number.isFinite(recorded?.boost_amount) ? Math.round(Math.max(0, Math.min(100, recorded.boost_amount * 100 / 255))) : null,
    speed: sampledVelocity.length() * 100 };
}

export function sampleBoostTrail(replay, playerIndex, time, smoke = false) {
  const samples = [];
  const frames = replay.players[playerIndex].frames;
  const rate = smoke ? 60 : 120;
  const firstTick = Math.max(0, Math.ceil((time - 0.4) * rate));
  const now = frameAt(replay.times, time);
  const earliest = frameAt(replay.times, firstTick / rate);
  let lastBreak = -1;
  let previous = samplePose(frames, { index: earliest.index, next: earliest.index, blend: 0 });
  for (let index = earliest.index + 1; index <= now.index; index++) {
    const next = samplePose(frames, { index, next: index, blend: 0 });
    if (!previous || !next || previous.position.distanceTo(next.position) > 15) lastBreak = index;
    previous = next;
  }
  for (let tick = firstTick; tick <= Math.floor(time * rate); tick++) {
    const emittedAt = tick / rate;
    const cursor = frameAt(replay.times, emittedAt);
    const pose = samplePose(frames, cursor);
    if (!pose || (smoke ? !pose.powerslide || pose.position.y > 0.35 || pose.speed < 200 ||
      new Vector3(0, 1, 0).applyQuaternion(pose.quaternion).y < 0.8 : !pose.boost)) continue;
    if (cursor.index < lastBreak) continue;
    const age = time - emittedAt;
    const rear = new Vector3(-1, 0, 0).applyQuaternion(pose.quaternion);
    const lateral = new Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
    const vertical = new Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
    for (const side of [-1, 1]) {
      const flutter = Math.sin(tick * 12.9898 + side * 78.233);
      const position = pose.position.clone().addScaledVector(rear, smoke ? 0.35 : 0.6 + age * 8)
        .addScaledVector(lateral, side * (smoke ? 0.35 : 0.18) + flutter * age * 0.4)
        .addScaledVector(vertical, smoke ? -0.12 + age * 0.7 : 0.1 + age * 0.4);
      samples.push({ position, age, size: (smoke ? 0.35 : 0.22) + Math.abs(flutter) * 0.2 });
    }
  }
  return samples;
}

export function createWheelTrack(replay, playerIndex) {
  const player = replay.players[playerIndex];
  const times = motionTimelines.get(player.frames)?.times ?? replay.times;
  const distances = [0];
  const speeds = [];
  const validIntervals = [];
  const speed = pose => pose.velocity.clone().applyQuaternion(pose.quaternion.clone().invert()).x;
  for (let index = 1; index < replay.times.length; index++) {
    const first = samplePose(player.frames, { index: index - 1, next: index - 1, blend: 0 });
    const next = samplePose(player.frames, { index, next: index, blend: 0 });
    const valid = first && next && first.position.distanceTo(next.position) < 15;
    speeds[index - 1] = first ? speed(first) : 0;
    speeds[index] = next ? speed(next) : 0;
    validIntervals[index - 1] = Boolean(valid);
    distances[index] = distances[index - 1] + (valid ? (speed(first) + speed(next)) / 2 *
      (times[index] - times[index - 1]) : 0);
  }
  return time => {
    const cursor = frameAt(times, time);
    const steeringCursor = frameAt(replay.times, time);
    const elapsed = cursor.interval * cursor.blend;
    const partialDistance = validIntervals[cursor.index] ? elapsed *
      (speeds[cursor.index] + (speeds[cursor.next] - speeds[cursor.index]) * cursor.blend / 2) : 0;
    const steer = player.steering?.[steeringCursor.index] ?? 0;
    const nextSteer = player.steering?.[steeringCursor.next] ?? steer;
    return { distance: distances[cursor.index] + partialDistance,
      steer: steer + (nextSteer - steer) * (validIntervals[steeringCursor.index] ? steeringCursor.blend : 0) };
  };
}

export function exportSettings({ start, end, fps, width, height }, duration) {
  if (![start, end, fps, width, height].every(Number.isFinite) || start < 0 ||
      end <= start || end > duration || ![30, 60, 120].includes(fps) ||
      ![[1280, 720], [1920, 1080]].some(size => size[0] === width && size[1] === height)) {
    throw new Error("Choose a valid clip range, resolution, and frame rate.");
  }
  return { start, end, fps, width, height, frames: Math.max(1, Math.ceil((end - start) * fps - 1e-9)) };
}