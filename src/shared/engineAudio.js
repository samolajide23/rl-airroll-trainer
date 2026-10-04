const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function engineSoundParameters(car, controls = {}) {
  if (!car || car.isDemoed) return { gain: 0, rate: 0.8 };
  const speed = clamp(Math.hypot(car.vel.x, car.vel.y, car.vel.z) / 2300, 0, 1);
  const throttle = clamp(Math.abs(controls.throttle ?? 0), 0, 1);
  const load = car.onGround ? speed : throttle * 0.55;
  return {
    gain: 0.12 + throttle * 0.12 + speed * 0.06,
    rate: 0.8 + load * 1.1 + throttle * 0.25,
  };
}

export class EngineAudio {
  constructor({ createContext = () => new AudioContext(), fetchAudio = url => fetch(url), url = `${import.meta.env?.BASE_URL ?? "/"}audio/engine/loop_0.wav`, parameters = engineSoundParameters } = {}) {
    this.createContext = createContext;
    this.fetchAudio = fetchAudio;
    this.url = url;
    this.parameters = parameters;
    this.active = false;
    this.disposed = false;
  }

  async unlock() {
    if (this.disposed) return;
    try {
      this.context ??= this.createContext();
      await this.context.resume();
      if (!this.loading) {
        this.loading = this.load().catch(error => {
          this.loading = null;
          console.warn("Engine audio unavailable", error);
        });
      }
      await this.loading;
    } catch (error) {
      console.warn("Engine audio unavailable", error);
    }
  }

  async load() {
    const response = await this.fetchAudio(this.url);
    if (!response.ok) throw new Error(`Engine sample HTTP ${response.status}`);
    const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 0) {
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let index = 0; index < samples.length; index++) samples[index] *= 0.7 / peak;
      }
    }
    if (!this.disposed) this.buffer = buffer;
  }

  update(car, controls = {}, active = true) {
    this.active = Boolean(active && car && !car.isDemoed);
    if (!this.active) return this.stop();
    if (!this.buffer || this.context?.state !== "running" || this.disposed) return;
    if (!this.source) {
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
      this.source = this.context.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.loop = true;
      this.source.connect(this.gain);
      this.source.start();
    }
    const { gain, rate } = this.parameters(car, controls);
    this.gain.gain.setTargetAtTime(gain, this.context.currentTime, 0.08);
    this.source.playbackRate.setTargetAtTime(rate, this.context.currentTime, 0.12);
  }

  stop() {
    this.source?.stop();
    this.source?.disconnect();
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.context?.close();
  }
}

export class BoostAudio extends EngineAudio {
  constructor(options = {}) {
    super({
      url: `${import.meta.env?.BASE_URL ?? "/"}audio/boost/qubodupFireLoop.ogg`,
      parameters: () => ({ gain: 0.12, rate: 1.5 }),
      ...options,
    });
  }

  update(car, controls = {}, active = true) {
    super.update(car, controls, active && Boolean(car?.isBoosting));
  }
}

export function jumpSoundOffset(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  let peak = 0;
  for (const samples of channels) {
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  }
  if (!peak) return 0;
  for (let index = 0; index < buffer.length; index++) {
    if (channels.some(samples => Math.abs(samples[index]) >= peak * 0.02)) {
      return Math.max(0, index / buffer.sampleRate - 0.001);
    }
  }
  return 0;
}

export class JumpAudio extends EngineAudio {
  constructor(options = {}) {
    super({
      url: `${import.meta.env?.BASE_URL ?? "/"}audio/jump/thump-105302.mp3`,
      ...options,
    });
  }

  async load() {
    await super.load();
    if (this.buffer) this.startOffset = jumpSoundOffset(this.buffer);
  }

  update(car, controls = {}, active = true) {
    if (!active || !car || car.isDemoed || this.disposed) return this.stop();
    const jumped = this.trackedCar === car &&
      ((car.hasJumped && !this.hasJumped) || (car.hasDoubleJumped && !this.hasDoubleJumped) ||
        (car.hasFlipped && !this.hasFlipped));
    this.trackedCar = car;
    this.hasJumped = Boolean(car.hasJumped);
    this.hasDoubleJumped = Boolean(car.hasDoubleJumped);
    this.hasFlipped = Boolean(car.hasFlipped);
    if (!jumped || !this.buffer || this.context?.state !== "running") return;
    super.stop();
    const gain = this.context.createGain();
    gain.gain.value = 0.3;
    gain.connect(this.context.destination);
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = false;
    source.playbackRate.value = 0.35;
    source.connect(gain);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.source === source) {
        this.source = null;
        this.gain = null;
      }
    };
    this.source = source;
    this.gain = gain;
    source.start(0, this.startOffset ?? 0);
  }

  stop() {
    super.stop();
    this.trackedCar = null;
  }
}