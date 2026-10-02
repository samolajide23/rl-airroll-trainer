import * as THREE from "three";
import { formatSpeed } from "../shared/rl-units.js";
import { createIcons, icons } from "lucide";
import { FreePlayMode } from "./freePlay.js";
import "./referenceReplay.css";

const recordings = import.meta.glob("../../tools/physics-compare/out/skybot/rocketsim/skybot-recording.json", { eager: true, import: "default" });
const recording = Object.values(recordings)[0];
export const hasReferenceRecording = Boolean(recording);

export class ReferenceReplayMode extends FreePlayMode {
  constructor(ctx) {
    if (!hasReferenceRecording) throw new Error("RocketSim reference recording is unavailable.");
    super(ctx, { diagnostics: false });
    this.title = "RocketSim Reference";
    this.modeId = "rocketsim-replay";
    this.playhead = 0;
    this.playing = true;
    this.rate = 1;
    this.duration = recording.ticks * recording.tick_time;
    this.frameRotation = new THREE.Quaternion();
    this.basis = new THREE.Matrix4();
    this.recordedBallRotations = [new THREE.Quaternion()];
    for (let index = 1; index < recording.frames.length; index++) {
      const velocity = recording.frames[index].ball.ang_vel;
      const spin = new THREE.Vector3(-velocity[0], -velocity[2], -velocity[1]);
      const rotation = this.recordedBallRotations[index - 1].clone();
      if (spin.lengthSq() > 0) {
        const angle = spin.length() * recording.tick_time;
        rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(spin.normalize(), angle));
      }
      this.recordedBallRotations.push(rotation);
    }
  }

  start() {
    super.start();
    this.ctx.hud.help.textContent = "";
    this.panel = document.createElement("section");
    this.panel.className = "reference-replay";
    this.panel.setAttribute("aria-label", "RocketSim replay");
    this.panel.innerHTML = `<header><strong>RocketSim 2.2.1</strong><span>REFERENCE RECORDING</span></header>
      <div class="replay-transport">
        <button type="button" data-restart title="Restart" aria-label="Restart"><i data-lucide="rotate-ccw"></i></button>
        <button type="button" data-play title="Pause" aria-label="Pause"><i data-lucide="pause"></i></button>
        <button type="button" data-step title="Next tick" aria-label="Next tick"><i data-lucide="step-forward"></i></button>
        <input data-seek type="range" min="0" max="${recording.ticks}" step="1" value="0" aria-label="Replay tick">
        <output data-time></output>
        <select data-speed aria-label="Playback speed"><option value="0.1">0.1x</option><option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option></select>
        <label><input data-overview type="checkbox"> Overview</label>
      </div><div class="replay-state"><output data-state></output></div>`;
    document.body.append(this.panel);
    createIcons({ icons, root: this.panel });
    this.playButton = this.panel.querySelector("[data-play]");
    this.seek = this.panel.querySelector("[data-seek]");
    this.panel.querySelector("[data-restart]").onclick = () => {
      this.playhead = 0;
      this.chase.invalidate();
      this.setPlaying(true);
    };
    this.playButton.onclick = () => {
      if (this.playhead >= this.duration) this.playhead = 0;
      this.setPlaying(!this.playing);
    };
    this.panel.querySelector("[data-step]").onclick = () => {
      this.setPlaying(false);
      this.playhead = Math.min(this.duration, (Math.floor(this.playhead / recording.tick_time + 1e-6) + 1) * recording.tick_time);
    };
    this.seek.oninput = () => {
      this.setPlaying(false);
      this.playhead = Number(this.seek.value) * recording.tick_time;
      this.chase.invalidate();
    };
    this.panel.querySelector("[data-speed]").onchange = event => { this.rate = Number(event.target.value); };
    this.panel.querySelector("[data-overview]").onchange = event => {
      this.overview = event.target.checked;
      this.chase.invalidate();
    };
    this.update(0);
  }

  setPlaying(playing) {
    this.playing = playing;
    const label = playing ? "Pause" : "Play";
    this.playButton.title = label;
    this.playButton.setAttribute("aria-label", label);
    this.playButton.innerHTML = `<i data-lucide="${playing ? "pause" : "play"}"></i>`;
    createIcons({ icons, root: this.playButton });
  }

  update(dt) {
    if (this.playing) {
      this.playhead = Math.min(this.duration, this.playhead + dt * this.rate);
      if (this.playhead >= this.duration) this.setPlaying(false);
    }
    const fractionalTick = this.playhead / recording.tick_time;
    const index = Math.min(recording.ticks, Math.floor(fractionalTick));
    const nextIndex = Math.min(recording.ticks, index + 1);
    const frame = recording.frames[index];
    const next = recording.frames[nextIndex];
    const blend = fractionalTick - index;
    for (const [field, target] of [["pos", this.physCar.pos], ["vel", this.physCar.vel], ["ang_vel", this.physCar.omega]]) {
      target.fromArray(frame[field]).lerp(new THREE.Vector3(...next[field]), blend);
    }
    const orientation = state => this.frameRotation.setFromRotationMatrix(this.basis.makeBasis(
      ...["forward", "right", "up"].map(axis => new THREE.Vector3(...state.rot[axis])),
    )).normalize();
    this.physCar.q.copy(orientation(frame));
    this.physCar.q.slerp(orientation(next), blend);
    this.physCar.boost = frame.boost + (next.boost - frame.boost) * blend;
    this.physCar.onGround = frame.on_ground;
    this.physBall.pos.fromArray(frame.ball.pos).lerp(new THREE.Vector3(...next.ball.pos), blend);
    this.ballVisual.quaternion.copy(this.recordedBallRotations[index]).slerp(this.recordedBallRotations[nextIndex], blend);
    this.syncMeshes(false);
    this.updateBoostMeter();
    this.carMesh.userData.setBoost?.(this.playing && frame.controls.boost && frame.boost > 0);
    if (this.overview) {
      this.ctx.camera.position.set(35, 48, 72);
      this.ctx.camera.lookAt(0, 0, 12);
    } else this.updateCamera(Math.max(dt, 1 / 120), {});
    this.seek.value = String(index);
    this.panel.querySelector("[data-time]").textContent = `${this.playhead.toFixed(2)} / ${this.duration.toFixed(2)} s`;
    this.panel.querySelector("[data-state]").textContent = `Tick ${index} / ${recording.ticks} | Car ${formatSpeed(this.physCar.vel.length())} | Ball ${formatSpeed(new THREE.Vector3(...frame.ball.vel).length())}`;
    this.ctx.hud.status.textContent = "RocketSim reference";
  }

  stop() {
    this.panel?.remove();
    super.stop();
  }
}