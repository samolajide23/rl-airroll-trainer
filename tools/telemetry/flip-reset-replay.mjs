import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSync, get_replay_frames_data } from '@rlrml/subtr-actor';

export function extractResetWindows(data, playerName, windows) {
  const metadata = data.frame_data.metadata_frames;
  const track = data.frame_data.players.find(([, player]) => player.frames.some(frame => frame.Data?.player_name === playerName))?.[1];
  if (!track) throw new Error(`Replay player not found: ${playerName}`);
  const origin = metadata[0].time;
  return windows.map(({ id, start, end, contactTime, dodgeTime }) => {
    const frames = [];
    let lastJumpTime = null;
    let lastDodgeTime = null;
    let priorJump = false;
    let priorDodge = false;
    for (let index = 0; index < metadata.length; index++) {
      const time = metadata[index].time;
      const car = track.frames[index]?.Data;
      if (!car) continue;
      if (car.jump_active && !priorJump && time < contactTime) lastJumpTime = time;
      if (car.dodge_active && !priorDodge && time < contactTime) lastDodgeTime = time;
      priorJump = car.jump_active;
      priorDodge = car.dodge_active;
      if (time < start || time > end) continue;
      const ball = data.frame_data.ball_data.frames[index]?.Data;
      if (!ball) continue;
      frames.push({ time, elapsed: time - origin, car: car.rigid_body, ball: ball.rigid_body,
        boostAmount: car.boost_amount, boostActive: car.boost_active,
        jumpActive: car.jump_active, doubleJumpActive: car.double_jump_active,
        dodgeActive: car.dodge_active, input: car.input ?? {} });
    }
    const closest = target => frames.reduce((best, frame) => !best || Math.abs(frame.time - target) < Math.abs(best.time - target) ? frame : best, null);
    const summarize = frame => {
      if (!frame) throw new Error(`No recorded frames for ${id}`);
      const car = frame.car.location;
      const ball = frame.ball.location;
      const delta = [ball.x - car.x, ball.y - car.y, ball.z - car.z];
      const distance = Math.hypot(...delta);
      const rotation = frame.car.rotation;
      const up = [2 * (rotation.x * rotation.z + rotation.w * rotation.y),
        2 * (rotation.y * rotation.z - rotation.w * rotation.x),
        1 - 2 * (rotation.x ** 2 + rotation.y ** 2)];
      return { time: frame.time, elapsed: frame.elapsed, carHeight: car.z, ballHeight: ball.z,
        separation: distance, wheelSideAlignment: -up.reduce((sum, value, index) => sum + value * delta[index], 0) / distance,
        jumpActive: frame.jumpActive, dodgeActive: frame.dodgeActive };
    };
    const contact = summarize(closest(contactTime));
    const dodge = summarize(closest(dodgeTime));
    const between = frames.filter(frame => frame.time >= contact.time && frame.time <= dodge.time);
    const inputKeys = [...new Set(frames.flatMap(frame => Object.keys(frame.input)))];
    const intervals = frames.slice(1).map((frame, index) => frame.time - frames[index].time);
    return { id, player: playerName, confirmation: 'User identified this sequence as a flip reset; telemetry does not expose four-wheel contact or reset availability.',
      start, end, origin, contact, dodge, lastJumpBeforeContact: lastJumpTime, lastDodgeBeforeContact: lastDodgeTime,
      timeFromLastJumpToDodge: lastJumpTime === null ? null : dodge.time - lastJumpTime,
      jumpPressesBetweenContactAndDodge: between.filter((frame, index) => frame.jumpActive && !(index ? between[index - 1].jumpActive : frames[frames.indexOf(frame) - 1]?.jumpActive)).map(frame => frame.time),
      minimumCarHeightBetweenContactAndDodge: Math.min(...between.map(frame => frame.car.location.z)),
      inputKeys, missingAerialAxes: ['pitch', 'yaw', 'roll'].filter(axis => !inputKeys.includes(axis)),
      maximumFrameInterval: Math.max(...intervals), frames };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = new URL('../../public/replays/001e6892-e801-4815-952e-732ff39531a3.replay', import.meta.url);
  const bytes = readFileSync(source);
  initSync({ module: readFileSync(new URL('../../node_modules/@rlrml/subtr-actor/rl_replay_subtr_actor_bg.wasm', import.meta.url)) });
  const data = get_replay_frames_data(bytes);
  const windows = extractResetWindows(data, 'zen', [
    { id: 'zen-reset-247', start: 242, end: 250, contactTime: 247.4574432373047, dodgeTime: 247.97613525390625 },
    { id: 'zen-reset-319', start: 317, end: 324, contactTime: 319.5868835449219, dodgeTime: 321.1344299316406 },
  ]);
  const report = { source: source.pathname.split('/').at(-1), sha256: createHash('sha256').update(bytes).digest('hex'),
    evidence: 'Recorded Rocket League network states; not reconstructed controls or a continuous physics parity gate.',
    resetEventsRecorded: data.dodge_refreshed_events.length, windows };
  const output = resolve(process.argv[2] ?? 'tools/physics-compare/out/replay-resets/zen-reset-windows.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, sha256: report.sha256, resetEventsRecorded: report.resetEventsRecorded,
    windows: windows.map(({ frames, ...summary }) => ({ ...summary, frameCount: frames.length })) }, null, 2));
}