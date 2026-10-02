import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initSync, get_replay_frames_data, parse_replay } from "@rlrml/subtr-actor";
import { normalizeReplay, prepareReplayMotion, frameAt, samplePose, sampleBoostTrail, createWheelTrack, formatMatchClock, exportSettings } from "../../src/replay/timeline.js";
import { PerspectiveCamera, Quaternion } from "three";
import { createPlayerCameraTrack, playerCameraSettings, constrainReplayCamera } from "../../src/replay/playerCamera.js";
import { analyzeReplayBall, compareBallWindow } from "../../src/replay/ballComparison.js";
import { makeBall, stepBall, RL } from "../../src/shared/rl-physics.js";
import { Vector3 } from "three";
import { sampleEventEffects, synthesizeReplayAudio } from "../../src/replay/matchEffects.js";

test("supplied Rocket League replay decodes into playable tracks", () => {
  initSync({ module: readFileSync(new URL("../../node_modules/@rlrml/subtr-actor/rl_replay_subtr_actor_bg.wasm", import.meta.url)) });
  const bytes = readFileSync(new URL("../../public/replays/0000a984-75af-4b24-b5a6-cb3663fc4efa.replay", import.meta.url));
  const replay = normalizeReplay(get_replay_frames_data(bytes), parse_replay(bytes));
  assert.ok(replay.players.every(player => player.carId === "octane" && player.bodyId === 23));
  assert.equal(replay.events.filter(event => event.type === "demo").length, 8);
  assert.equal(replay.events.filter(event => event.type === "goal").length, 9);
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
  assert.ok(Math.abs(2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect) * 180 / Math.PI - 109) < 1e-8);
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

test("ball-cam events preserve player ownership and apply only at their recorded time", () => {
  const decoded = { frame_data: {
    metadata_frames: [10, 11, 12, 13].map(time => ({ time })),
    players: [[{ Steam: "first" }, { frames: [] }], [{ Steam: "second" }, { frames: [] }]],
    ball_data: { frames: [] },
  } };
  const objects = ["Engine.PlayerReplicationInfo:UniqueId", "TAGame.CameraSettingsActor_TA:PRI",
    "TAGame.CameraSettingsActor_TA:bUsingSecondaryCamera"];
  const update = (actor_id, object_id, attribute) => ({ actor_id, object_id, attribute });
  const raw = { objects, network_frames: { frames: [
    { time: 10, updated_actors: [
      update(7, 2, { Boolean: true }),
      update(7, 1, { ActiveActor: { active: true, actor: 23 } }),
      update(23, 0, { UniqueId: { remote_id: { Steam: "first" } } }),
      update(8, 2, { Boolean: false }),
      update(8, 1, { ActiveActor: { active: true, actor: 6 } }),
      update(6, 0, { UniqueId: { remote_id: { Steam: "second" } } }),
    ] },
    { time: 11.5, updated_actors: [update(7, 2, { Boolean: false })] },
    { time: 13, updated_actors: [update(7, 2, { Boolean: true }), update(8, 2, { Boolean: true })] },
  ] } };
  const replay = normalizeReplay(decoded, raw);
  assert.deepEqual(replay.players[0].ballCam, [true, true, false, true]);
  assert.deepEqual(replay.players[1].ballCam, [false, false, false, true]);
  assert.deepEqual(normalizeReplay(decoded, { objects, network_frames: { frames: [] } }).players[0].ballCam,
    [null, null, null, null]);
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