import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initSync, get_replay_frames_data, parse_replay } from "@rlrml/subtr-actor";
import { extractResetWindows } from "./flip-reset-replay.mjs";
import { normalizeReplay, resolveReplayPadLocations, prepareReplayMotion, frameAt, samplePose, sampleBoostTrail, createWheelTrack, formatMatchClock, exportSettings } from "../../src/replay/timeline.js";
import { PerspectiveCamera, Quaternion, Group } from "three";
import { groundReplayWheels, ReplayWheels, ReplayBoost } from "../../src/replay/renderEffects.js";
import { frameReplayGoal } from "../../src/replay/goalCamera.js";
import { replayGoalCuts, skipReplayGoalPause, replayClipSegments, replayClipTime, replayKickoffs,
  replayPlaybackSegments, replayPlaybackSample, replayPlaybackOffset } from "../../src/replay/goalCuts.js";
import { createPlayerCameraTrack, playerCameraSettings, constrainReplayCamera, inferReplayCameraSurface } from "../../src/replay/playerCamera.js";
import { analyzeReplayBall, compareBallWindow } from "../../src/replay/ballComparison.js";
import { makeBall, stepBall, RL } from "../../src/shared/rl-physics.js";
import { Vector3 } from "three";
import { ReplayMatchEffects, sampleEventEffects, synthesizeReplayAudio } from "../../src/replay/matchEffects.js";

test("replay boost length follows recorded speed and remains stable across seeks", context => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) }) };
  context.after(() => { globalThis.document = previous; });
  const scene = new Group(), car = new Group();
  scene.add(car);
  const effect = new ReplayBoost(scene, car);
  const frames = [0, 2300].map(speed => ({ Data: { boost_active: true, rigid_body: {
    location: { x: 0, y: 0, z: 17 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
    linear_velocity: { x: speed, y: 0, z: 0 },
  } } }));
  const replay = { times: [0, 1], players: [{ frames }] };
  effect.render(replay, 0, 0, car, true);
  const short = effect.trail.flames.children[0].scale.z;
  effect.render(replay, 0, 1, car, true);
  const long = effect.trail.flames.children[0].scale.z;
  assert(long > short * 1.4);
  effect.render(replay, 0, 0, car, true);
  assert.equal(effect.trail.flames.children[0].scale.z, short);
  effect.dispose();
});

test("goal cuts preserve unverified pauses and handle clips starting or ending inside a cut", () => {
  const times = Array.from({ length: 31 }, (_, index) => index);
  const frame = (centered, moving = false) => ({ Data: { rigid_body: {
    location: { x: centered ? 0 : 1000, y: 0, z: 93 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    linear_velocity: { x: moving ? 200 : 0, y: 0, z: 0 },
  } } });
  const replay = { times, events: [{ type: "goal", time: 1 }],
    ball: times.map(time => frame(time >= 8)),
    players: [{ frames: times.map(time => frame(false, time >= 10)) }] };
  assert.deepEqual(replayGoalCuts(replay), [{ start: 3, end: 9.75 }]);
  assert.deepEqual(replayClipSegments(replay, 5, 12), [{ start: 9.75, end: 12 }]);
  assert.deepEqual(replayClipSegments(replay, 0, 5), [{ start: 0, end: 3 }]);
  assert.equal(replayClipTime(replayClipSegments(replay, 5, 12), 0), 9.75);
  const noReset = { ...replay, ball: times.map(() => frame(false)) };
  assert.deepEqual(replayGoalCuts(noReset), []);
  assert.deepEqual(replayClipSegments(noReset, 0, 30), [{ start: 0, end: 30 }]);
  const nextGoal = { ...replay, events: [{ type: "goal", time: 1 }, { type: "goal", time: 7 }] };
  assert.deepEqual(replayGoalCuts(nextGoal), [{ start: 9, end: 9.75 }]);
});

test("countdown resume preserves elapsed time while explicit seeking resets it", () => {
  const segments = [{ start: 6, end: 6, duration: 3, countdown: true }, { start: 6, end: 10, duration: 4 }];
  for (const elapsed of [1.5, 2.5]) {
    const paused = replayPlaybackSample(segments, elapsed);
    const resumed = replayPlaybackOffset(segments, paused.time, elapsed);
    assert.equal(resumed, elapsed);
    assert.deepEqual(replayPlaybackSample(segments, resumed), paused);
    assert.equal(replayPlaybackSample(segments, resumed + 0.5).countdown, elapsed === 1.5 ? 1 : null);
  }
  assert.equal(replayPlaybackOffset(segments, 6), 0);
  assert.equal(replayPlaybackOffset(segments, 8, 1.5), 5);
});

test("replay boost pads remain visible without telemetry and preserve bases during pickups", () => {
  const effects = new ReplayMatchEffects(new Group());
  effects.render({ events: [] }, 0);
  assert.equal(effects.pads.length, 34);
  assert.equal(effects.pads.filter(pad => pad.big).length, 6);
  assert.ok(effects.pads.every(pad => pad.mesh.visible && pad.active));
  const pad = effects.pads[0];
  const replay = { events: [{ type: "pad", actor: 10, time: 1, active: false,
    position: [pad.x * 0.01, 0.7, pad.y * 0.01] },
  { type: "pad", actor: 10, time: 5, active: true, position: [pad.x * 0.01, 0.7, pad.y * 0.01] }] };
  effects.render(replay, 2);
  assert.equal(pad.active, false);
  assert.equal(pad.mesh.visible, true);
  assert.ok(pad.mesh.children.every(child => !child.visible));
  effects.render(replay, 6);
  assert.equal(pad.active, true);
  effects.render(replay, 2);
  assert.equal(pad.active, false);
  effects.render(replay, 0);
  assert.ok(effects.pads.every(candidate => candidate.active));
  effects.dispose();
});

test("contact flashes fade deterministically and restore wireframes for goal effects", () => {
  const effects = new ReplayMatchEffects(new Group());
  const replay = { events: [{ type: "hit", time: 1, position: [0, 1, 0], team: 1 },
    { type: "goal", time: 2, position: [0, 1, 5], team: 0 }] };
  effects.render(replay, 1.05);
  const initial = effects.rings[0].material.opacity;
  assert.equal(effects.rings[0].material.wireframe, false);
  effects.render(replay, 1.2);
  assert(effects.rings[0].material.opacity < initial);
  effects.render(replay, 2.1);
  assert.equal(effects.rings[0].material.wireframe, true);
  effects.render(replay, 1.05);
  assert.equal(effects.rings[0].material.opacity, initial);
  assert.equal(effects.rings[0].material.wireframe, false);
  effects.render(replay, 5);
  assert(effects.rings.every(mesh => !mesh.visible));
  effects.dispose();
});

test("skid marks stay bounded and deterministic across replay seeks", context => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) }) };
  context.after(() => { globalThis.document = originalDocument; });
  const scene = new Group();
  const car = new Group();
  const times = [0, 0.5, 1];
  const frames = times.map(time => ({ Data: { powerslide_active: true, rigid_body: {
    location: { x: time * 500, y: 0, z: 17 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    linear_velocity: { x: 500, y: 0, z: 0 },
  } } }));
  const replay = { times, players: [{ frames }] };
  const effects = new ReplayWheels(scene, replay, 0, car);
  effects.render(replay, 0, 0.5);
  assert(effects.marks.count > 0 && effects.marks.count <= 64);
  const matrices = Array.from(effects.marks.instanceMatrix.array);
  effects.render(replay, 0, 0.8);
  effects.render(replay, 0, 0.5);
  assert.deepEqual(Array.from(effects.marks.instanceMatrix.array), matrices);
  car.visible = false;
  effects.render(replay, 0, 0.5);
  assert.equal(effects.marks.count, 0);
  effects.dispose();
  assert.equal(effects.marks.parent, null);
});

test("pad location consensus rejects sparse, contradictory and colliding identities", () => {
  const makeEvent = (object, time, pickupPosition, active = false) => ({ type: "pad", object, time, active, position: null, pickupPosition });
  const first = [0, 0.17, -42.4];
  const second = [-17.92, 0.17, -41.84];
  const events = [makeEvent("valid", 1, first), makeEvent("valid", 5, first), makeEvent("valid", 9, null, true),
    makeEvent("sparse", 2, second), makeEvent("conflict", 3, first), makeEvent("conflict", 7, second)];
  resolveReplayPadLocations(events);
  assert.ok(events.filter(event => event.object === "valid").every(event => event.positionSource === "pickup-consensus"));
  assert.ok(events.filter(event => event.object !== "valid").every(event => event.position === null));
  const collision = [makeEvent("one", 1, first), makeEvent("one", 5, first), makeEvent("two", 2, first), makeEvent("two", 6, first)];
  resolveReplayPadLocations(collision);
  assert.ok(collision.every(event => event.position === null));
  const confirmed = makeEvent("confirmed", 1, [-10.48, 0.62, -31.1]);
  confirmed.smallPickupConfirmed = true;
  confirmed.pickupPath = [[-10.4, 0.9, -32.53]];
  const returned = makeEvent("confirmed", 5, null, true);
  resolveReplayPadLocations([confirmed, returned]);
  assert.deepEqual(confirmed.position, [-9.4, 0.7000000000000001, -33.08]);
  assert.deepEqual(returned.position, confirmed.position);
  const ambiguous = makeEvent("ambiguous", 1, first);
  ambiguous.smallPickupConfirmed = true;
  ambiguous.pickupPath = [second];
  resolveReplayPadLocations([ambiguous]);
  assert.equal(ambiguous.position, null);
});

test("new 2v2 and 3v3 replays preserve rosters, countdowns and resolved pad returns", () => {
  initSync({ module: readFileSync(new URL("../../node_modules/@rlrml/subtr-actor/rl_replay_subtr_actor_bg.wasm", import.meta.url)) });
  for (const [file, teamSize, goals, kickoffs] of [
    ["001964e4-15bf-4cd7-b715-30fa77bc84c3.replay", 3, 2, 3],
    ["001e6892-e801-4815-952e-732ff39531a3.replay", 2, 8, 8],
  ]) {
    const bytes = readFileSync(new URL(`../../public/replays/${file}`, import.meta.url));
    const replay = normalizeReplay(get_replay_frames_data(bytes), parse_replay(bytes));
    assert.equal(replay.players.filter(player => player.blue).length, teamSize);
    assert.equal(replay.players.filter(player => !player.blue).length, teamSize);
    assert.ok(replay.players.every(player => player.frames.length === replay.times.length && player.ballCam.length === replay.times.length));
    assert.equal(replay.events.filter(event => event.type === "goal").length, goals);
    assert.equal(replayKickoffs(replay).length, kickoffs);
    assert.equal(replayPlaybackSegments(replay, 0, replay.duration).filter(segment => segment.countdown).length, kickoffs);
    const padEvents = replay.events.filter(event => event.type === "pad");
    assert.ok(padEvents.every(event => event.position));
    assert.equal(new Set(padEvents.map(event => event.object)).size, 34);
    assert.equal(new Set(padEvents.map(event => JSON.stringify(event.position))).size, 34);
    const pickups = replay.events.filter(event => event.type === "pad" && event.position && !event.active);
    assert.equal(new Set(pickups.map(event => event.object)).size, 34);
    const effects = new ReplayMatchEffects(new Group());
    let checked = 0;
    for (const pickup of pickups) {
      const next = replay.events.find(event => event.type === "pad" && event.object === pickup.object && event.time > pickup.time);
      if (!next?.active) continue;
      const pad = effects.pads.find(pad => Math.hypot(pad.x * 0.01 - pickup.position[0], pad.y * 0.01 - pickup.position[2]) < 0.01);
      assert.ok(pad);
      effects.render(replay, pickup.time);
      assert.equal(pad.active, false);
      effects.render(replay, next.time);
      assert.equal(pad.active, true);
      effects.render(replay, pickup.time);
      assert.equal(pad.active, false);
      checked++;
      if (checked === 10) break;
    }
    assert.equal(checked, 10);
    effects.dispose();
  }
});

test("replay wheel grounding is bounded, surface-relative and independent of seek order", () => {
  const car = new Group();
  const visual = new Group();
  car.add(visual);
  car.userData.visual = visual;
  const pivot = new Group();
  visual.add(pivot);
  const center = new Vector3(0, -0.05, 0);
  visual.userData.calibratedWheels = [{ center, pivot, radius: 0.12 }];
  car.position.y = 0.21;
  const bodyPosition = car.position.clone();
  groundReplayWheels(car);
  assert.ok(Math.abs(pivot.getWorldPosition(new Vector3()).y - 0.12) < 1e-9);
  assert.deepEqual(car.position, bodyPosition);
  const grounded = pivot.position.clone();
  car.position.y = 3;
  groundReplayWheels(car);
  assert.deepEqual(pivot.position, center);
  car.position.copy(bodyPosition);
  groundReplayWheels(car);
  assert.ok(pivot.position.distanceTo(grounded) < 1e-9);
  car.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  groundReplayWheels(car, (origin, direction) => {
    assert.ok(direction.x > 0.99);
    assert.ok(Math.abs(direction.z) < 1e-9);
    return { dist: 1 };
  });
  assert.ok(pivot.position.distanceTo(center) <= 0.080000001);
});

test("confirmed replay reset windows preserve separated airborne dodge evidence", () => {
  initSync({ module: readFileSync(new URL("../../node_modules/@rlrml/subtr-actor/rl_replay_subtr_actor_bg.wasm", import.meta.url)) });
  const data = get_replay_frames_data(readFileSync(new URL("../../public/replays/001e6892-e801-4815-952e-732ff39531a3.replay", import.meta.url)));
  const windows = extractResetWindows(data, "zen", [
    { id: "zen-reset-247", start: 242, end: 250, contactTime: 247.4574432373047, dodgeTime: 247.97613525390625 },
    { id: "zen-reset-319", start: 317, end: 324, contactTime: 319.5868835449219, dodgeTime: 321.1344299316406 },
  ]);
  assert.equal(windows.length, 2);
  for (const window of windows) {
    assert.ok(window.frames.length > 800);
    assert.ok(window.frames.every(frame => frame.car.location && frame.car.rotation && frame.ball.location));
    assert.ok(window.frames.every((frame, index) => index === 0 || frame.time > window.frames[index - 1].time));
    assert.ok(window.maximumFrameInterval < 0.009);
    assert.ok(window.contact.separation < 110);
    assert.ok(window.contact.wheelSideAlignment > 0.95);
    assert.equal(window.contact.dodgeActive, false);
    assert.equal(window.dodge.dodgeActive, true);
    assert.ok(window.dodge.separation > 300);
    assert.ok(window.minimumCarHeightBetweenContactAndDodge > 300);
    assert.ok(window.timeFromLastJumpToDodge > 3);
    assert.deepEqual(window.jumpPressesBetweenContactAndDodge, []);
    assert.deepEqual(window.missingAerialAxes, ["pitch", "yaw", "roll"]);
    assert.ok(Math.abs(window.contact.time - window.contact.elapsed - window.origin) < 1e-9);
  }
});

test("supplied Rocket League replay decodes into playable tracks", () => {
  initSync({ module: readFileSync(new URL("../../node_modules/@rlrml/subtr-actor/rl_replay_subtr_actor_bg.wasm", import.meta.url)) });
  const bytes = readFileSync(new URL("../../public/replays/0000a984-75af-4b24-b5a6-cb3663fc4efa.replay", import.meta.url));
  const replay = normalizeReplay(get_replay_frames_data(bytes), parse_replay(bytes));
  assert.ok(replay.players.every(player => player.carId === "octane" && player.bodyId === 23));
  const padEvents = replay.events.filter(event => event.type === "pad");
  assert.ok(padEvents.every(event => event.position));
  assert.equal(new Set(padEvents.map(event => event.object)).size, 33);
  assert.equal(new Set(padEvents.map(event => JSON.stringify(event.position))).size, 33);
  assert.equal(replay.events.filter(event => event.type === "demo").length, 8);
  assert.equal(replay.events.filter(event => event.type === "goal").length, 9);
  const cuts = replayGoalCuts(replay);
  assert.equal(cuts.length, 9);
  const kickoffs = replayKickoffs(replay);
  assert.equal(kickoffs.length, 10);
  const playback = replayPlaybackSegments(replay, 0, replay.duration);
  assert.equal(playback.filter(segment => segment.countdown).length, 10);
  let outputTime = 0;
  for (const segment of playback) {
    if (segment.countdown) {
      for (const [elapsed, digit] of [[0, 3], [0.99, 3], [1, 2], [2, 1], [2.99, 1]]) {
        const sample = replayPlaybackSample(playback, outputTime + elapsed);
        assert.equal(sample.countdown, digit);
        assert.equal(sample.time, segment.start);
      }
      assert.equal(replayPlaybackSample(playback, outputTime + 3).countdown, null);
      assert.equal(replayPlaybackOffset(playback, segment.start), outputTime);
    }
    outputTime += segment.duration;
  }
  assert.equal(replayPlaybackSegments(replay, 10, 20).some(segment => segment.countdown), false);
  for (const cut of cuts) {
    assert.equal(skipReplayGoalPause(replay, cut.start), cut.end);
    assert.equal(skipReplayGoalPause(replay, cut.start - 0.01), cut.start - 0.01);
    const segments = replayClipSegments(replay, cut.start - 1, cut.end + 1);
    assert.deepEqual(segments, [{ start: cut.start - 1, end: cut.start }, { start: cut.end, end: cut.end + 1 }]);
    assert.equal(replayClipTime(segments, 1), cut.end);
    assert.equal(replayClipTime(segments, 1.5), cut.end + 0.5);
    assert.deepEqual(replayClipSegments(replay, cut.start, cut.end), []);
  }
  for (const goal of replay.events.filter(event => event.type === "goal")) {
    for (const aspect of [16 / 9, 9 / 16]) {
      const shot = new PerspectiveCamera(65, aspect, 0.1, 1500);
      const timestamp = goal.time - 1;
      assert.equal(frameReplayGoal(shot, replay, timestamp), 1);
      const position = shot.position.clone();
      const rotation = shot.quaternion.clone();
      shot.updateMatrixWorld(true);
      const sign = goal.team === 0 ? 1 : -1;
      const points = [-9.5, 9.5].flatMap(horizontal => [0, 7.5].map(height => new Vector3(horizontal, height, sign * 51.2)));
      points.push(samplePose(replay.ball, frameAt(replay.times, timestamp)).position.clone());
      for (const point of points) {
        point.project(shot);
        assert.ok(Math.abs(point.x) < 0.95 && Math.abs(point.y) < 0.95 && point.z < 1);
      }
      frameReplayGoal(shot, replay, goal.time + 1);
      frameReplayGoal(shot, replay, timestamp);
      assert.ok(shot.position.distanceTo(position) < 1e-9);
      assert.ok(shot.quaternion.angleTo(rotation) < 1e-7);
      assert.equal(frameReplayGoal(shot, replay, goal.time - 3), 0);
      assert.equal(frameReplayGoal(shot, replay, goal.time + 3), 0);
    }
  }
  assert.ok(replay.events.some(event => event.type === "pad" && event.active));
  assert.ok(replay.events.some(event => event.type === "pad" && !event.active));
  const demo = replay.events.find(event => event.type === "demo");
  assert.ok(demo.player >= 0);
  assert.equal(samplePose(replay.players[demo.player].frames, frameAt(replay.times, demo.time + 0.1)), null);
  assert.ok(samplePose(replay.players[demo.player].frames, frameAt(replay.times, demo.time + 4)));
  assert.ok(demo.position.every(Number.isFinite));
  assert.ok(!sampleEventEffects(replay, demo.time - 0.001).includes(demo));
  assert.ok(sampleEventEffects(replay, demo.time + 0.2).includes(demo));
  assert.ok(!sampleEventEffects(replay, demo.time + 1.1).includes(demo));
  const audio = synthesizeReplayAudio(replay, demo.time, 0.1);
  assert.equal(audio.length, 2400);
  assert.ok(audio.some(value => Math.abs(value) > 0.1));
  assert.ok(audio.every(value => Number.isFinite(value) && Math.abs(value) <= 0.8));
  assert.deepEqual(audio, synthesizeReplayAudio(replay, demo.time, 0.1));
  for (const player of replay.players) {
    assert.equal(player.ballCam.length, replay.times.length);
    assert.ok(player.ballCam.includes(true));
    assert.ok(player.ballCam.includes(false));
    assert.ok(player.steering.some(value => value > 0));
    assert.ok(player.steering.some(value => value < 0));
  }
  const automatic = createPlayerCameraTrack(replay, 0);
  const forcedOn = createPlayerCameraTrack(replay, 0, true);
  const early = frameAt(replay.times, 0);
  const autoCamera = new PerspectiveCamera(65, 16 / 9);
  const onCamera = new PerspectiveCamera(65, 16 / 9);
  automatic(autoCamera, early);
  forcedOn(onCamera, early);
  assert.ok(autoCamera.position.distanceTo(onCamera.position) < 1e-10);
  const offIndex = replay.players[0].ballCam.indexOf(false);
  const offCursor = frameAt(replay.times, replay.times[offIndex] + 0.05);
  automatic(autoCamera, offCursor);
  forcedOn(onCamera, offCursor);
  assert.ok(autoCamera.position.distanceTo(onCamera.position) > 0.01);
  const togglePosition = autoCamera.position.clone();
  automatic(autoCamera, early);
  automatic(autoCamera, offCursor);
  assert.ok(autoCamera.position.distanceTo(togglePosition) < 1e-10);
  assert.ok(replay.duration > 300);
  assert.deepEqual(replay.match[0], { blue: 0, orange: 0, seconds: 300, overtime: false });
  assert.equal(replay.match[frameAt(replay.times, 34).index].blue, 1);
  assert.equal(replay.match[frameAt(replay.times, 34).index].orange, 0);
  assert.equal(formatMatchClock(replay.match[0]), "5:00");
  assert.ok(replay.players.some(player => player.name === "OpTic AYYJAYY"));
  assert.equal(replay.times[0], 0);
  assert.equal(playerCameraSettings(replay.players[0]).fov, 109);
  assert.equal(playerCameraSettings(replay.players[0]).height, 90);
  const lookTrack = createPlayerCameraTrack(replay, 0);
  const lookCamera = new PerspectiveCamera(65, 16 / 9);
  lookTrack(lookCamera, frameAt(replay.times, 8.4));
  let maximumLookTurn = 0;
  for (let tick = 1009; tick <= 1032; tick++) {
    const previous = lookCamera.quaternion.clone();
    lookTrack(lookCamera, frameAt(replay.times, tick / 120));
    maximumLookTurn = Math.max(maximumLookTurn, previous.angleTo(lookCamera.quaternion));
  }
  assert.ok(maximumLookTurn > 0.1 && maximumLookTurn < 20 * Math.PI / 180);
  const camera = new PerspectiveCamera(65, 16 / 9);
  const track = createPlayerCameraTrack(replay, 0, true);
  const cursor = frameAt(replay.times, 20);
  track(camera, cursor);
  const position = camera.position.clone();
  const rotation = camera.quaternion.clone();
  track(camera, frameAt(replay.times, 2));
  track(camera, cursor);
  assert.ok(camera.position.distanceTo(position) < 1e-10);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
  assert.ok(camera.position.toArray().every(Number.isFinite));
  const cameraSpeed = samplePose(replay.players[0].frames, cursor).velocity.length();
  const expectedHorizontalFov = 109 + 5 * Math.min(cameraSpeed / 23, 1);
  assert.ok(Math.abs(2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * (16 / 9)) * 180 / Math.PI - expectedHorizontalFov) < 1e-8);
  createPlayerCameraTrack(replay, 1, true)(camera, cursor);
  assert.ok(camera.position.distanceTo(position) > 1);
  createPlayerCameraTrack(replay, 0, false)(camera, cursor);
  assert.ok(camera.position.distanceTo(position) > 0.1);
  const ball = samplePose(replay.ball, frameAt(replay.times, 0));
  assert.ok(Math.abs(ball.position.y - 0.9275) < 1e-5);
  assert.ok(Math.abs(ball.quaternion.length() - 1) < 1e-8);
  const comparison = analyzeReplayBall(replay);
  assert.equal(comparison.status, "diagnostic-only");
  assert.deepEqual(comparison.windows.map(window => window.kind), ["flight", "bounce"]);
  assert.ok(comparison.windows.every(window => window.rows.length === 16 && Number.isFinite(window.maxPositionErrorUU)));
  const speedJumps = (frames, start = 1717, end = 1739) => {
    let previous;
    let maximum = 0;
    for (let tick = start; tick <= end; tick++) {
      const time = tick / 120;
      const current = samplePose(frames, frameAt(replay.times, time));
      const earlier = samplePose(frames, frameAt(replay.times, time - 1 / 120));
      const speed = current.position.distanceTo(earlier.position) * 12000;
      if (previous !== undefined) maximum = Math.max(maximum, Math.abs(speed - previous));
      previous = speed;
    }
    return maximum;
  };
  assert.ok(speedJumps(replay.ball.slice()) > 2000);
  assert.ok(speedJumps(replay.ball) < 100);
  assert.ok(speedJumps(replay.ball.slice(), 1770, 1785) > 1400);
  assert.ok(speedJumps(replay.ball, 1770, 1785) < 100);
  let contactCandidates = 0;
  for (let index = 1; index < replay.times.length; index++) {
    const first = replay.ball[index - 1]?.Data?.rigid_body;
    const next = replay.ball[index]?.Data?.rigid_body;
    const interval = replay.times[index] - replay.times[index - 1];
    if (!first?.linear_velocity || !next?.linear_velocity || interval <= 0 || interval > 0.1) continue;
    const velocity = value => new Vector3(value.x, value.y, value.z);
    if (velocity(first.linear_velocity).distanceTo(velocity(next.linear_velocity)) <= 100) continue;
    contactCandidates++;
    for (const endpoint of [index - 1, index]) {
      const location = replay.ball[endpoint].Data.rigid_body.location;
      const expected = new Vector3(location.x, location.z, location.y).multiplyScalar(0.01);
      assert.ok(samplePose(replay.ball, frameAt(replay.times, replay.times[endpoint])).position.distanceTo(expected) < 1e-9);
    }
    const start = new Vector3(first.location.x, first.location.z, first.location.y).multiplyScalar(0.01);
    const finish = new Vector3(next.location.x, next.location.z, next.location.y).multiplyScalar(0.01);
    for (const blend of [0.25, 0.5, 0.75]) {
      const pose = samplePose(replay.ball, frameAt(replay.times, replay.times[index - 1] + interval * blend));
      assert.ok(pose.position.distanceTo(start.clone().lerp(finish, blend)) < 1e-8);
    }
  }
  assert.ok(contactCandidates > 400);
});

test("replay camera stays inside arena walls without moving an unobstructed camera", () => {
  const target = new Vector3(40, 2, 0);
  const blocked = new Vector3(44, 3, 0);
  assert.equal(constrainReplayCamera(blocked, target), true);
  assert.ok(blocked.x < 40.96);
  assert.ok(blocked.x > target.x);
  const clear = new Vector3(38, 3, 0);
  const original = clear.clone();
  assert.equal(constrainReplayCamera(clear, target), false);
  assert.deepEqual(clear.toArray(), original.toArray());
});

test("motion timing removes uneven observation cadence without shifting contact anchors", () => {
  const times = [0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30];
  const positions = [0, 100 / 6, 125 / 3, 100, 400 / 3, 150];
  const frames = positions.map(x => ({ Data: { rigid_body: {
    location: { x, y: 0, z: 100 }, linear_velocity: { x: 1000, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  } } }));
  frames.at(-1).Data.rigid_body.linear_velocity.x = -1000;
  frames[1].Data.boost_active = true;
  frames[1].Data.powerslide_active = true;
  frames[1].Data.boost_amount = 255;
  const replay = { times, ball: frames, players: [] };
  prepareReplayMotion(replay);
  for (let tick = 0; tick <= 16; tick++) {
    const time = tick / 120;
    assert.ok(Math.abs(samplePose(frames, frameAt(times, time)).position.x - time * 10) < 1e-10);
  }
  assert.equal(samplePose(frames, frameAt(times, times.at(-1))).position.x, 1.5);
  assert.equal(samplePose(frames, frameAt(times, times.at(-1))).velocity.x, -10);
  const beforeSwitch = samplePose(frames, frameAt(times, 0.025));
  assert.equal(beforeSwitch.boost, false);
  assert.equal(beforeSwitch.powerslide, false);
  const afterSwitch = samplePose(frames, frameAt(times, 0.05));
  assert.equal(afterSwitch.boost, true);
  assert.equal(afterSwitch.powerslide, true);
  assert.equal(afterSwitch.boostAmount, 100);
  const transferred = structuredClone(replay);
  prepareReplayMotion(transferred);
  assert.ok(Math.abs(samplePose(transferred.ball, frameAt(transferred.times, 0.025)).position.x - 0.25) < 1e-10);
});

test("replay motion reconstructs recorded ballistic arcs without curving inconsistent observations", () => {
  const duration = 1 / 30;
  const frame = time => ({ Data: { rigid_body: {
    location: { x: 1000 * time, y: 0, z: 300 + 400 * time - 325 * time * time },
    linear_velocity: { x: 1000, y: 0, z: 400 - 650 * time },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  } } });
  const frames = [frame(0), frame(duration)];
  const time = duration / 2;
  const pose = samplePose(frames, frameAt([0, duration], time));
  assert.ok(Math.abs(pose.position.y - (300 + 400 * time - 325 * time * time) * 0.01) < 1e-12);
  assert.ok(Math.abs(pose.velocity.y - (400 - 650 * time) * 0.01) < 1e-12);
  assert.deepEqual(samplePose(frames, frameAt([0, duration], 0)).position.toArray(), [0, 3, 0]);
  frames[1].Data.rigid_body.linear_velocity.x = -10000;
  assert.ok(Math.abs(samplePose(frames, frameAt([0, duration], time)).position.x - 1000 * time * 0.01) < 1e-12);
  frames[1].Data.rigid_body.location.x = 2000;
  assert.equal(samplePose(frames, frameAt([0, duration], time)).position.x, 0);
});

test("replay contacts avoid curved overshoot and motion speed follows sampled velocity", () => {
  const duration = 1 / 30;
  const frame = velocity => ({ Data: { rigid_body: {
    location: { x: 0, y: 0, z: 92.75 },
    linear_velocity: { x: 0, y: 0, z: velocity },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  } } });
  const frames = [frame(-600), frame(600)];
  for (const blend of [0, 0.25, 0.5, 0.75, 1]) {
    const pose = samplePose(frames, frameAt([0, duration], duration * blend));
    assert.ok(Math.abs(pose.position.y - 0.9275) < 1e-12);
    assert.ok(Math.abs(pose.speed - pose.velocity.length() * 100) < 1e-12);
  }
  frames[1].Data.rigid_body.location.x = 600 / 30;
  frames[0].Data.rigid_body.linear_velocity = { x: 600, y: 0, z: 0 };
  frames[1].Data.rigid_body.linear_velocity = { x: 600, y: 0, z: 0 };
  const midpoint = samplePose(frames, frameAt([0, duration], duration / 2));
  assert.ok(Math.abs(midpoint.position.x - 0.1) < 1e-12);
  assert.equal(midpoint.speed, 600);
});

test("replay rotations preserve signed native axes and antipodal quaternion continuity", () => {
  const nativeAxes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  const reflected = vector => new Vector3(vector.x, vector.z, vector.y);
  for (const axis of nativeAxes) {
    for (const angle of [-Math.PI / 2, Math.PI / 2]) {
      const rotation = new Quaternion().setFromAxisAngle(axis, angle);
      const frame = quaternion => ({ Data: { rigid_body: {
        location: { x: 0, y: 0, z: 100 },
        rotation: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
      } } });
      const negative = new Quaternion(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
      const pose = samplePose([frame(rotation), frame(negative)], frameAt([0, 1 / 30], 1 / 60));
      for (const direction of nativeAxes) {
        const expected = reflected(direction.clone().applyQuaternion(rotation));
        const actual = reflected(direction).applyQuaternion(pose.quaternion);
        assert.ok(actual.distanceTo(expected) < 1e-12);
      }
    }
  }
});

test("player camera motion is independent of network sampling rate and export order", () => {
  const recording = rate => {
    const times = Array.from({ length: rate + 1 }, (_, index) => index / rate);
    const frame = (time, ball = false) => ({ Data: { rigid_body: {
      location: { x: ball ? -1000 + 2300 * time : 300 * time, y: ball ? 1000 : 0, z: ball ? 300 : 17 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linear_velocity: { x: ball ? 2300 : 300, y: 0, z: 0 },
    } } });
    return { times, ball: times.map(time => frame(time, true)),
      players: [{ frames: times.map(time => frame(time)), ballCam: times.map(() => true) }] };
  };
  const sparse = recording(30);
  const dense = recording(120);
  const sparseTrack = createPlayerCameraTrack(sparse, 0);
  const denseTrack = createPlayerCameraTrack(dense, 0);
  const sparseCamera = new PerspectiveCamera(65, 16 / 9);
  const denseCamera = new PerspectiveCamera(65, 16 / 9);
  for (let index = 0; index <= 60; index++) {
    const time = index / 60;
    sparseTrack(sparseCamera, frameAt(sparse.times, time));
    denseTrack(denseCamera, frameAt(dense.times, time));
    assert.ok(sparseCamera.position.distanceTo(denseCamera.position) < 1e-9);
    assert.ok(sparseCamera.quaternion.angleTo(denseCamera.quaternion) < 1e-7);
  }
  const position = sparseCamera.position.clone();
  sparseTrack(sparseCamera, frameAt(sparse.times, 0.13));
  sparseTrack(sparseCamera, frameAt(sparse.times, 1));
  assert.ok(sparseCamera.position.distanceTo(position) < 1e-9);
});

test("recorded camera look transitions reconstruct between observations with stable seeking", () => {
  const times = [0, 1 / 30, 2 / 30, 3 / 30, 4 / 30];
  const frame = (yaw, ball = false) => ({ Data: { camera: { yaw, pitch: 128 }, rigid_body: {
    location: { x: ball ? 1000 : 0, y: 0, z: ball ? 100 : 17 },
    rotation: { x: 0, y: 0, z: 0, w: 1 }, linear_velocity: { x: 0, y: 0, z: 0 },
  } } });
  const replay = { times, ball: times.map(() => frame(128, true)),
    players: [{ frames: [128, 128, 255, 255, 128].map(yaw => frame(yaw)),
      cameraSettings: { swivel_speed: 10 }, ballCam: times.map(() => true) }] };
  const track = createPlayerCameraTrack(replay, 0);
  const camera = new PerspectiveCamera(65, 16 / 9);
  track(camera, frameAt(times, 1 / 30));
  const neutral = camera.quaternion.clone();
  track(camera, frameAt(times, 1 / 30 + 1 / 120));
  const earlyTurn = neutral.angleTo(camera.quaternion);
  assert.ok(earlyTurn > 0.01 && earlyTurn < 0.2);
  let maximum = 0;
  for (let tick = 6; tick <= 12; tick++) {
    const previous = camera.quaternion.clone();
    track(camera, frameAt(times, tick / 120));
    maximum = Math.max(maximum, previous.angleTo(camera.quaternion));
  }
  assert.ok(maximum < 0.45);
  const rotation = camera.quaternion.clone();
  track(camera, frameAt(times, 0));
  track(camera, frameAt(times, 0.1));
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
});

test("camera mode events preserve player ownership and apply only at their recorded time", () => {
  const decoded = { frame_data: {
    metadata_frames: [10, 11, 12, 13].map(time => ({ time })),
    players: [[{ Steam: "first" }, { frames: [] }], [{ Steam: "second" }, { frames: [] }]],
    ball_data: { frames: [] },
  } };
  const objects = ["Engine.PlayerReplicationInfo:UniqueId", "TAGame.CameraSettingsActor_TA:PRI",
    "TAGame.CameraSettingsActor_TA:bUsingSecondaryCamera", "TAGame.CameraSettingsActor_TA:bUsingBehindView"];
  const update = (actor_id, object_id, attribute) => ({ actor_id, object_id, attribute });
  const raw = { objects, network_frames: { frames: [
    { time: 10, updated_actors: [
      update(7, 2, { Boolean: true }),
      update(7, 3, { Boolean: false }),
      update(7, 1, { ActiveActor: { active: true, actor: 23 } }),
      update(23, 0, { UniqueId: { remote_id: { Steam: "first" } } }),
      update(8, 2, { Boolean: false }),
      update(8, 1, { ActiveActor: { active: true, actor: 6 } }),
      update(6, 0, { UniqueId: { remote_id: { Steam: "second" } } }),
    ] },
    { time: 11.5, updated_actors: [update(7, 2, { Boolean: false }), update(7, 3, { Boolean: true })] },
    { time: 13, updated_actors: [update(7, 2, { Boolean: true }), update(8, 2, { Boolean: true }), update(7, 3, { Boolean: false })] },
  ] } };
  const replay = normalizeReplay(decoded, raw);
  assert.deepEqual(replay.players[0].ballCam, [true, true, false, true]);
  assert.deepEqual(replay.players[1].ballCam, [false, false, false, true]);
  assert.deepEqual(replay.players[0].rearView, [false, false, true, false]);
  assert.deepEqual(replay.players[1].rearView, [null, null, null, null]);
  assert.deepEqual(normalizeReplay(decoded, { objects, network_frames: { frames: [] } }).players[0].ballCam,
    [null, null, null, null]);
});

test("replay camera surface inference distinguishes floor, wall and flight", () => {
  const pose = { position: new Vector3(0, 0.17, 0), quaternion: new Quaternion() };
  const floor = inferReplayCameraSurface(pose, "octane");
  assert.equal(floor.onGround, true);
  assert(floor.groundNormal.distanceTo(new Vector3(0, 1, 0)) < 1e-9);
  pose.position.y = 2;
  assert.equal(inferReplayCameraSurface(pose, "octane").onGround, false);
  pose.position.set(40.78, 5, 0);
  assert.equal(inferReplayCameraSurface(pose, "octane").onGround, false);
  pose.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  const wall = inferReplayCameraSurface(pose, "octane");
  assert.equal(wall.onGround, true);
  assert(wall.groundNormal.distanceTo(new Vector3(-1, 0, 0)) < 1e-9);
  pose.position.x = 39;
  assert.equal(inferReplayCameraSurface(pose, "octane").onGround, false);
  assert.equal(inferReplayCameraSurface(pose, "octane", () => null).onGround, false);
});

test("replay camera preserves speed FOV and recorded rear view across seeks", () => {
  const times = Array.from({ length: 181 }, (_, index) => index / 120);
  const frame = speed => ({ Data: { rigid_body: {
    location: { x: 0, y: 0, z: 500 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
    linear_velocity: { x: speed, y: 0, z: 0 },
  } } });
  const replay = { times, ball: times.map(() => frame(0)), players: [{
    frames: times.map(() => frame(2300)), cameraSettings: { fov: 108 },
    ballCam: times.map(() => false), rearView: times.map(time => time >= 0.5),
  }] };
  const track = createPlayerCameraTrack(replay, 0);
  const camera = new PerspectiveCamera(65, 4 / 3);
  track(camera, frameAt(times, 0));
  const forward = camera.quaternion.clone();
  const expectedFov = 2 * Math.atan(Math.tan(113 * Math.PI / 360) / (16 / 9)) * 180 / Math.PI;
  assert(Math.abs(camera.fov - expectedFov) < 1e-9);
  track(camera, frameAt(times, 1.5));
  assert(camera.quaternion.angleTo(forward) > 3);
  const rear = camera.quaternion.clone();
  track(camera, frameAt(times, 0));
  assert(camera.quaternion.angleTo(forward) < 1e-7);
  track(camera, frameAt(times, 1.5));
  assert(camera.quaternion.angleTo(rear) < 1e-7);
  assert(Math.abs(camera.fov - expectedFov) < 1e-9);
});

test("ball comparison integrates continuously and does not reseed from later observations", () => {
  const ball = makeBall(new Vector3(0, 0, 800));
  ball.vel.set(800, 0, 100);
  const samples = [];
  for (let index = 0; index < 16; index++) {
    samples.push({ time: index / 30, body: { location: { ...ball.pos }, linear_velocity: { ...ball.vel } } });
    for (let tick = 0; tick < 4; tick++) stepBall(ball, RL.DT, { arena: false });
  }
  assert.equal(compareBallWindow(samples, "flight").maxPositionErrorUU, 0);
  const before = compareBallWindow(samples, "flight").rows.at(-1).simulated;
  samples[5].body.location.x += 100;
  samples[5].body.linear_velocity.x += 500;
  const after = compareBallWindow(samples, "flight");
  assert.deepEqual(after.rows.at(-1).simulated, before);
  assert.equal(after.rows[5].positionErrorUU, 100);
  const replay = { times: samples.map(sample => sample.time), ball: samples.map(sample => ({ Data: { rigid_body: sample.body } })),
    players: [{ frames: samples.map(() => ({ Data: { rigid_body: { location: { x: 0, y: 0, z: 800 } } } })) }] };
  assert.equal(analyzeReplayBall(replay).windows.length, 0);
});

test("timeline clamps, interpolates and hides missing poses", () => {
  assert.deepEqual(frameAt([0, 1, 2], 0.5), { index: 0, next: 1, blend: 0.5, interval: 1 });
  assert.equal(frameAt([0, 1, 2], 5).index, 2);
  assert.equal(frameAt([0, 1, 2], -1).blend, 0);
  assert.equal(samplePose(["Empty"], { index: 0, next: 0, blend: 0 }), null);
  const pose = location => ({ Data: { rigid_body: { location, rotation: { x: 0, y: 0, z: 0, w: 1 } } } });
  const frames = [pose({ x: 0, y: 0, z: 100 }), pose({ x: 100, y: 200, z: 300 })];
  assert.deepEqual(samplePose(frames, { index: 0, next: 1, blend: 0.5 }).position.toArray(), [0.5, 2, 1]);
  frames[1] = pose({ x: 10000, y: 0, z: 100 });
  assert.equal(samplePose(frames, { index: 0, next: 1, blend: 0.5 }).position.x, 0);
});

test("ball comparison preserves continuous floor collision state and excludes timestamp gaps", () => {
  const ball = makeBall(new Vector3(0, 0, 180));
  ball.vel.set(600, 0, -600);
  const samples = [];
  for (let index = 0; index < 16; index++) {
    samples.push({ time: index / 30, body: { location: { ...ball.pos }, linear_velocity: { ...ball.vel } } });
    for (let tick = 0; tick < 4; tick++) stepBall(ball, RL.DT);
  }
  const comparison = compareBallWindow(samples, "bounce");
  assert.equal(comparison.maxPositionErrorUU, 0);
  assert.equal(comparison.maxVelocityErrorUUs, 0);
  assert.ok(samples.some(sample => sample.body.linear_velocity.z > 100));
  const replay = { times: samples.map(sample => sample.time), ball: samples.map(sample => ({ Data: { rigid_body: sample.body } })),
    players: [{ frames: samples.map(() => ({ Data: { rigid_body: { location: { x: 2000, y: 2000, z: 17 } } } })) }] };
  replay.times[8] += 0.1;
  assert.equal(analyzeReplayBall(replay).windows.length, 0);
});

test("replay boost meter and trails use recorded state and deterministic replay time", () => {
  const body = { location: { x: 0, y: 0, z: 100 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
  const frames = Array.from({ length: 61 }, (_, index) => ({ Data: {
    rigid_body: body, boost_active: index < 20, boost_amount: 128,
  } }));
  const replay = { times: frames.map((_, index) => index / 60), players: [{ frames }] };
  assert.equal(samplePose(frames, frameAt(replay.times, 0)).boostAmount, 50);
  const particles = sampleBoostTrail(replay, 0, 0.3);
  assert.ok(particles.length > 32 && particles.length <= 128);
  assert.deepEqual(sampleBoostTrail(replay, 0, 0.3), particles);
  assert.equal(sampleBoostTrail(replay, 0, 1).length, 0);
  frames[18].Data.rigid_body = { ...body, location: { x: 5000, y: 0, z: 100 } };
  assert.equal(sampleBoostTrail(replay, 0, 0.3).length, 2);
  delete frames[0].Data.boost_amount;
  assert.equal(samplePose(frames, frameAt(replay.times, 0)).boostAmount, null);
});

test("wheel distance supports reverse, stable seeking and powerslide smoke gating", () => {
  const frames = [0, 1, 2].map(index => ({ Data: { rigid_body: {
    location: { x: -100 * index, y: 0, z: 17 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
    linear_velocity: { x: -100, y: 0, z: 0 },
  }, powerslide_active: true } }));
  const replay = { times: [0, 1, 2], players: [{ frames, steering: [0, 1, -1] }] };
  const sample = createWheelTrack(replay, 0);
  assert.deepEqual(sample(1), { distance: -1, steer: 1 });
  const later = sample(1.5);
  sample(0);
  assert.deepEqual(sample(1.5), later);
  assert.equal(later.distance, -1.5);
  frames.forEach(frame => { frame.Data.rigid_body.linear_velocity.x = 500; });
  const smoke = sampleBoostTrail(replay, 0, 0.3, true);
  assert.ok(smoke.length > 0 && smoke.length <= 64);
  assert.deepEqual(sampleBoostTrail(replay, 0, 0.3, true), smoke);
  frames.forEach(frame => { frame.Data.rigid_body.location.z = 100; });
  assert.equal(sampleBoostTrail(replay, 0, 0.3, true).length, 0);
  frames.forEach(frame => { frame.Data.rigid_body.location.z = 17; frame.Data.powerslide_active = false; });
  assert.equal(sampleBoostTrail(replay, 0, 0.3, true).length, 0);
});

test("wheel seeking integrates changing speed and interpolates recorded steering", () => {
  const frame = (x, velocity) => ({ Data: { rigid_body: {
    location: { x, y: 0, z: 17 }, linear_velocity: { x: velocity, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  } } });
  const replay = { times: [0, 0.1, 0.2], players: [{
    frames: [frame(0, 0), frame(50, 1000), frame(150, 1000)], steering: [-1, 1, 0],
  }] };
  const track = createWheelTrack(replay, 0);
  assert.ok(Math.abs(track(0.05).distance - 0.125) < 1e-12);
  assert.equal(track(0.05).steer, 0);
  assert.ok(Math.abs(track(0.1).distance - 0.5) < 1e-12);
  assert.ok(Math.abs(track(0.2).distance - 1.5) < 1e-12);
  track(0.2);
  assert.ok(Math.abs(track(0.05).distance - 0.125) < 1e-12);
  replay.players[0].frames[1] = frame(10000, 1000);
  const discontinuous = createWheelTrack(replay, 0);
  assert.equal(discontinuous(0.05).distance, 0);
  assert.equal(discontinuous(0.05).steer, -1);
});

test("wheel rotation follows reconstructed pose cadence while steering keeps recorded timing", () => {
  const times = [0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30];
  const frames = [0, 100 / 6, 125 / 3, 100, 400 / 3, 150].map(x => ({ Data: { rigid_body: {
    location: { x, y: 0, z: 17 }, linear_velocity: { x: 1000, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  } } }));
  frames.at(-1).Data.rigid_body.linear_velocity.x = -1000;
  const replay = { times, ball: [], players: [{ frames, steering: [-1, 1, 0, 0, 0, 0] }] };
  prepareReplayMotion(replay);
  const track = createWheelTrack(replay, 0);
  for (const time of [0.025, 0.05, 0.1]) {
    assert.ok(Math.abs(track(time).distance - samplePose(frames, frameAt(times, time)).position.x) < 1e-10);
  }
  assert.ok(Math.abs(track(1 / 60).steer) < 1e-10);
  const state = track(0.05);
  track(0.15);
  assert.deepEqual(track(0.05), state);
});

test("recorded match scores and overtime apply at network timestamps", () => {
  const decoded = { frame_data: {
    metadata_frames: [10, 11, 12, 13].map((time, index) => ({ time, seconds_remaining: [1, 0, 0, 1][index] })),
    players: [["player", { frames: [] }]], ball_data: { frames: [] },
  } };
  const raw = { objects: ["Archetypes.Teams.Team0", "Archetypes.Teams.Team1",
    "Engine.TeamInfo:Score", "TAGame.GameEvent_Soccar_TA:bOverTime"], network_frames: { frames: [
    { time: 10, new_actors: [{ actor_id: 8, object_id: 0 }, { actor_id: 9, object_id: 1 }], updated_actors: [] },
    { time: 11.5, updated_actors: [{ actor_id: 9, object_id: 2, attribute: { Int: 1 } },
      { actor_id: 3, object_id: 3, attribute: { Boolean: true } }] },
    { time: 13, updated_actors: [{ actor_id: 8, object_id: 2, attribute: { Int: 1 } }] },
  ] } };
  const replay = normalizeReplay(decoded, raw);
  assert.deepEqual(replay.match.map(match => [match.blue, match.orange, match.overtime]),
    [[0, 0, false], [0, 0, false], [0, 1, true], [1, 1, true]]);
  assert.equal(formatMatchClock(replay.match[2]), "+0:00");
  assert.equal(formatMatchClock(replay.match[3]), "+0:01");
  assert.equal(replay.match[frameAt(replay.times, 0).index].orange, 0);
  assert.equal(normalizeReplay(decoded).match[0].blue, null);
});

test("match clock formats regulation, overtime and unavailable data", () => {
  assert.equal(formatMatchClock({ seconds: 61, overtime: false }), "1:01");
  assert.equal(formatMatchClock({ seconds: 9, overtime: true }), "+0:09");
  assert.equal(formatMatchClock({ seconds: 0, overtime: false }), "0:00");
  assert.equal(formatMatchClock({ seconds: null }), "--:--");
});

test("MP4 settings enforce clip bounds and exact frame counts", () => {
  for (const fps of [60, 120]) {
    assert.equal(exportSettings({ start: 14.6, end: 15, fps, width: 1280, height: 720 }, 20).frames, fps * 0.4);
  }
  const settings = { start: 1, end: 3, fps: 30, width: 1280, height: 720 };
  assert.equal(exportSettings(settings, 5).frames, 60);
  assert.equal(exportSettings({ ...settings, fps: 120 }, 5).frames, 240);
  assert.throws(() => exportSettings({ ...settings, end: 6 }, 5));
  assert.throws(() => exportSettings({ ...settings, start: 3 }, 5));
  assert.throws(() => exportSettings({ ...settings, fps: 24 }, 5));
});