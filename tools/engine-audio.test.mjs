import test from "node:test";
import assert from "node:assert/strict";
import { EngineAudio, BoostAudio, JumpAudio, engineSoundParameters, jumpSoundOffset } from "../src/shared/engineAudio.js";

const car = { vel: { x: 0, y: 0, z: 0 }, onGround: true };

test("engine pitch follows speed and forward/reverse throttle", () => {
  const idle = engineSoundParameters(car);
  const accelerating = engineSoundParameters(car, { throttle: 1 });
  assert.ok(idle.gain > 0);
  assert.ok(accelerating.rate > idle.rate);
  assert.ok(accelerating.gain > idle.gain);
  assert.deepEqual(engineSoundParameters(car, { throttle: -1 }), accelerating);
  assert.ok(engineSoundParameters({ ...car, vel: { x: 2300, y: 0, z: 0 } }, { throttle: 1 }).rate > accelerating.rate);
  assert.equal(engineSoundParameters({ ...car, isDemoed: true }).gain, 0);
  assert.equal(engineSoundParameters(null).gain, 0);
});

test("engine loads once, loops, stops on pause and restarts on resume", async () => {
  let downloads = 0;
  let starts = 0;
  let stops = 0;
  const samples = new Float32Array([0, 0.01, -0.02]);
  const parameter = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
  const context = {
    state: "suspended", currentTime: 0, destination: {},
    async resume() { this.state = "running"; },
    async decodeAudioData() { return { numberOfChannels: 1, getChannelData: () => samples }; },
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; },
    createBufferSource() {
      return { playbackRate: parameter(), connect() {}, disconnect() {}, start() { starts++; }, stop() { stops++; } };
    },
    close() { this.state = "closed"; },
  };
  const audio = new EngineAudio({ createContext: () => context, fetchAudio: async () => {
    downloads++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  } });
  audio.update(car);
  assert.equal(starts, 0);
  await audio.unlock();
  await audio.unlock();
  assert.equal(downloads, 1);
  assert.ok(Math.abs(samples[2] + 0.7) < 0.000001);
  audio.update(car, { throttle: 1 });
  assert.equal(audio.source.loop, true);
  assert.equal(starts, 1);
  audio.update(car);
  assert.equal(starts, 1);
  audio.update(car, {}, false);
  assert.equal(stops, 1);
  audio.update(car);
  assert.equal(starts, 2);
  audio.update(null);
  assert.equal(stops, 2);
  audio.dispose();
  assert.equal(context.state, "closed");
});

test("boost loops only during actual boosting and stops on release, pause or demolition", () => {
  let starts = 0;
  let stops = 0;
  const context = {
    state: "running", currentTime: 0, destination: {},
    createGain: () => ({ gain: { setTargetAtTime() {} }, connect() {}, disconnect() {} }),
    createBufferSource: () => ({ playbackRate: { setTargetAtTime() {} }, connect() {}, disconnect() {},
      start() { starts++; }, stop() { stops++; } }),
  };
  const audio = new BoostAudio();
  audio.context = context;
  audio.buffer = {};
  audio.update(car, { boost: true });
  assert.equal(starts, 0);
  const boosting = { ...car, isBoosting: true };
  audio.update(boosting);
  assert.equal(audio.source.loop, true);
  audio.update(boosting);
  assert.equal(starts, 1);
  audio.update(car);
  assert.equal(stops, 1);
  audio.update(boosting);
  audio.update(boosting, {}, false);
  assert.equal(stops, 2);
  audio.update(boosting);
  audio.update({ ...boosting, isDemoed: true });
  assert.equal(stops, 3);
  audio.update(null);
  assert.equal(starts, 3);
});

test("jump skips quiet lead-in across channels without cutting its attack", () => {
  const samples = new Float32Array(1000);
  samples[200] = 0.001;
  samples[400] = 0.1;
  samples[450] = 1;
  const buffer = { length: samples.length, sampleRate: 1000, numberOfChannels: 2,
    getChannelData: channel => channel ? samples : new Float32Array(1000) };
  assert.equal(jumpSoundOffset(buffer), 0.399);
  samples.fill(0);
  assert.equal(jumpSoundOffset(buffer), 0);
});

test("jump plays once per first jump, double jump or dodge, not held input, pause or car changes", () => {
  const sources = [];
  const audio = new JumpAudio();
  audio.context = {
    state: "running", destination: {},
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
    createBufferSource() {
      const source = { starts: 0, stops: 0, playbackRate: { value: 1 }, connect() {}, disconnect() {},
        start(when, offset) { this.starts++; this.offset = offset; }, stop() { this.stops++; } };
      sources.push(source);
      return source;
    },
  };
  audio.buffer = {};
  audio.startOffset = 0.165;
  const jumpingCar = { ...car, hasJumped: false, hasDoubleJumped: false };
  audio.update(jumpingCar, { jump: true });
  assert.equal(sources.length, 0);
  jumpingCar.hasJumped = true;
  audio.update(jumpingCar);
  audio.update(jumpingCar, { jump: true });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].loop, false);
  assert.equal(sources[0].playbackRate.value, 0.35);
  assert.equal(sources[0].starts, 1);
  assert.equal(sources[0].offset, 0.165);
  jumpingCar.hasFlipped = false;
  audio.update(jumpingCar);
  assert.equal(sources.length, 1);
  jumpingCar.hasDoubleJumped = true;
  audio.update(jumpingCar);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].stops, 1);
  sources[0].onended();
  assert.equal(audio.source, sources[1]);
  sources[1].onended();
  assert.equal(audio.source, null);
  audio.update(jumpingCar, {}, false);
  audio.update(jumpingCar);
  audio.update({ ...jumpingCar });
  assert.equal(sources.length, 2);
  jumpingCar.hasJumped = false;
  jumpingCar.hasDoubleJumped = false;
  audio.update(jumpingCar);
  jumpingCar.hasJumped = true;
  audio.update(jumpingCar);
  assert.equal(sources.length, 3);
  jumpingCar.hasFlipped = true;
  audio.update(jumpingCar);
  audio.update(jumpingCar, { jump: true });
  assert.equal(sources.length, 4);
  assert.equal(sources[3].starts, 1);
  assert.equal(sources[3].loop, false);
  audio.update({ ...jumpingCar, isDemoed: true });
  assert.equal(sources[3].stops, 1);
});