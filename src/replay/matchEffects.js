import * as THREE from "three";
import { frameAt, samplePose } from "./timeline.js";
import { createSoccarBoostPads, createBoostPadMeshes } from "../shared/boostPads.js";
import { styleContactEffect } from "../shared/surfaceEffects.js";

export function sampleEventEffects(replay, time) {
  return (replay.events ?? []).filter(event => event.position && time >= event.time &&
    time < event.time + (event.type === "goal" ? 2 : event.type === "demo" ? 1 : 0.35));
}

export class ReplayMatchEffects {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rings = Array.from({ length: 12 }, () => {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, wireframe: true, depthWrite: false, toneMapped: false }));
      this.group.add(mesh);
      return mesh;
    });
    this.pads = createSoccarBoostPads();
    createBoostPadMeshes(this.group, this.pads);
  }

  render(replay, time) {
    const effects = sampleEventEffects(replay, time).filter(event => event.type !== "pad").slice(-12);
    this.rings.forEach((mesh, index) => {
      const event = effects[index];
      mesh.visible = Boolean(event);
      if (!event) return;
      const age = time - event.time;
      const duration = event.type === "goal" ? 2 : event.type === "demo" ? 1 : 0.35;
      styleContactEffect(mesh, age, duration, event);
    });
    for (const pad of this.pads) pad.active = true;
    for (const event of replay.events ?? []) {
      if (event.time > time) break;
      if (event.type !== "pad" || !event.position) continue;
      const pad = this.pads.find(candidate => Math.hypot(candidate.x * 0.01 - event.position[0],
        candidate.y * 0.01 - event.position[2]) < 1);
      if (pad) pad.active = event.active;
    }
    for (const pad of this.pads) {
      pad.mesh.visible = true;
      pad.mesh.material.color.setHex(pad.active ? (pad.big ? 0xffc94a : 0xd4a017) : 0x313947);
      pad.mesh.material.emissiveIntensity = pad.active ? (pad.big ? 0.65 : 0.4) : 0;
      for (const child of pad.mesh.children) child.visible = pad.active;
    }
  }

  dispose() {
    this.group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    this.group.removeFromParent();
  }
}

export function synthesizeReplayAudio(replay, start, duration, sampleRate = 24000) {
  const output = new Float32Array(Math.ceil(duration * sampleRate));
  const events = (replay.events ?? []).filter(event => event.time >= start - 2 && event.time < start + duration && event.type !== "pad");
  const block = 240;
  for (let offset = 0; offset < output.length; offset += block) {
    const time = start + offset / sampleRate;
    const cursor = frameAt(replay.times, time);
    const poses = replay.players.map(player => samplePose(player.frames, cursor)).filter(Boolean);
    const speed = Math.max(0, ...poses.map(pose => pose.speed));
    const boosting = poses.some(pose => pose.boost);
    const sliding = poses.some(pose => pose.powerslide && pose.position.y < 0.35);
    const frequency = 45 + Math.min(2300, speed) / 20;
    const activeEvents = events.filter(event => time + block / sampleRate >= event.time && time < event.time + 2);
    for (let index = offset; index < Math.min(output.length, offset + block); index++) {
      const absolute = start + index / sampleRate;
      const noise = Math.sin((Math.floor(absolute * sampleRate) + 1) * 12.9898) * 43758.5453;
      const hiss = (noise - Math.floor(noise)) * 2 - 1;
      let value = Math.sin(absolute * frequency * Math.PI * 2) * 0.025 + hiss * (boosting ? 0.045 : sliding ? 0.025 : 0.003);
      for (const event of activeEvents) {
        const age = absolute - event.time;
        const length = event.type === "goal" ? 1.5 : event.type === "demo" ? 0.8 : 0.18;
        if (age >= 0 && age < length) value += (hiss * 0.18 + Math.sin(age * 280) * 0.12) * (1 - age / length) ** 2;
      }
      output[index] = Math.max(-0.8, Math.min(0.8, value));
    }
  }
  return output;
}

export class ReplayAudio {
  stop() {
    this.generation = (this.generation ?? 0) + 1;
    this.source?.stop();
    this.source = null;
  }

  async play(replay, time, speed) {
    this.stop();
    const generation = this.generation = (this.generation ?? 0) + 1;
    this.context ??= new AudioContext();
    await this.context.resume();
    if (generation !== this.generation) return;
    if (this.replay !== replay) {
      const samples = synthesizeReplayAudio(replay, 0, replay.duration);
      this.buffer = this.context.createBuffer(1, samples.length, 24000);
      this.buffer.copyToChannel(samples, 0);
      this.replay = replay;
    }
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = speed;
    source.connect(this.context.destination);
    source.start(0, Math.min(time, replay.duration));
    this.source = source;
  }
}