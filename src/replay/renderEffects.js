import * as THREE from "three";
import { BoostTrail } from "../shared/boostTrail.js";
import { syncCarExhaust } from "../shared/carVisualCalibration.js";
import { sampleBoostTrail, formatMatchClock, createWheelTrack, frameAt, samplePose } from "./timeline.js";
import { raycastArena } from "../shared/arenaMesh.js";
import { SurfaceEffects } from "../shared/surfaceEffects.js";

export function groundReplayWheels(car, query = raycastArena) {
  const visual = car.userData.visual;
  const wheels = visual?.userData.calibratedWheels ?? [];
  if (!car.visible || !wheels.length) return;
  car.updateWorldMatrix(true, true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quaternion);
  const down = new THREE.Vector3(-up.x, -up.z, -up.y);
  const scale = Math.abs(visual.scale.y * car.scale.x);
  for (const wheel of wheels) {
    wheel.pivot.position.copy(wheel.center);
    const center = visual.localToWorld(wheel.center.clone());
    const radius = wheel.radius * scale;
    const origin = center.clone().addScaledVector(up, 0.12);
    const hit = query(new THREE.Vector3(origin.x, origin.z, origin.y).multiplyScalar(100),
      down, (radius + 0.24) * 100);
    if (!hit || (hit.normal && hit.normal.dot(down) > -0.5)) continue;
    const gap = hit.dist * 0.01 - 0.12 - radius;
    const fade = 1 - THREE.MathUtils.smoothstep(Math.max(0, gap), 0.08, 0.12);
    const travel = THREE.MathUtils.clamp(gap, -0.08, 0.08) * fade;
    wheel.pivot.position.copy(visual.worldToLocal(center.addScaledVector(up, -travel)));
  }
}

export class ReplayBoost {
  constructor(scene, car) {
    this.trail = new BoostTrail(scene, { max: 128 });
    this.trail.attachFlames(car);
    syncCarExhaust(car, this.trail);
    for (const flame of this.trail.flames.children) flame.scale.setScalar(0.55);
  }

  render(replay, index, time, car, boosting) {
    const trail = this.trail;
    trail._time = time;
    const pose = samplePose(replay.players[index].frames, frameAt(replay.times, time));
    trail.update(car, car.visible && boosting, 0, pose?.velocity?.length() ?? 0);
    for (const flame of trail.flames.children) {
      for (const puff of flame.children) puff.material.opacity *= 0.7;
    }
    const particles = car.visible ? sampleBoostTrail(replay, index, time) : [];
    const { position, color, size } = trail.geo.attributes;
    particles.forEach((particle, index) => {
      const progress = particle.age / 0.4;
      const fade = (1 - progress) ** 1.5;
      position.setXYZ(index, ...particle.position.toArray());
      color.setXYZ(index, fade, (0.85 - progress * 0.45) * fade, 0.38 * (1 - progress) * fade);
      size.setX(index, particle.size * 0.35 * (1 - progress * 0.5));
    });
    position.needsUpdate = color.needsUpdate = size.needsUpdate = true;
    trail.geo.setDrawRange(0, particles.length);
    trail.points.visible = particles.length > 0;
    trail.mat.opacity = 0.38;
  }

  dispose() { this.trail.dispose(); }
}

export class ReplayWheels {
  constructor(scene, replay, index, car) {
    this.sample = createWheelTrack(replay, index);
    this.car = car;
    this.surface = new SurfaceEffects(scene);
    this.smoke = this.surface.smoke;
    this.marks = this.surface.marks;
  }

  render(replay, index, time) {
    const state = this.sample(time);
    groundReplayWheels(this.car);
    const visual = this.car.userData.visual;
    for (const wheel of visual?.userData.calibratedWheels ?? []) {
      const radius = wheel.radius * Math.abs(visual.scale.y) * Math.abs(this.car.scale.x);
      wheel.pivot.rotation.set(state.distance / radius,
        wheel.corner.startsWith("F") ? -state.steer * 0.5 : 0, 0, "YXZ");
    }
    const particles = this.car.visible ? sampleBoostTrail(replay, index, time, true) : [];
    this.surface.render(particles);
  }

  dispose() {
    this.surface.dispose();
  }
}

export class ReplayHud {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 960;
    this.canvas.height = 540;
    this.context = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.mesh.position.z = -1;
    this.scene.add(this.mesh);
  }

  render(renderer, player, pose, ballCam, match, countdown = null) {
    const clock = formatMatchClock(match);
    const key = `${player?.name}:${pose?.boostAmount}:${pose?.boost}:${ballCam}:${match?.blue}:${match?.orange}:${clock}:${countdown}`;
    if (this.key !== key) {
      this.key = key;
      const context = this.context;
      context.clearRect(0, 0, 960, 540);
      context.fillStyle = "rgba(15,20,17,0.85)";
      context.fillRect(367, 16, 226, 52);
      context.fillStyle = "#167ac0";
      context.fillRect(367, 16, 52, 52);
      context.fillStyle = "#bd631d";
      context.fillRect(541, 16, 52, 52);
      context.textAlign = "center";
      context.fillStyle = "#ffffff";
      context.font = "600 32px 'Barlow Condensed', sans-serif";
      context.fillText(String(match?.blue ?? "--"), 393, 53);
      context.fillText(clock, 480, 53);
      context.fillText(String(match?.orange ?? "--"), 567, 53);
      if (countdown !== null) {
        context.save();
        context.font = "700 112px 'Barlow Condensed', sans-serif";
        context.textBaseline = "middle";
        context.lineWidth = 6;
        context.strokeStyle = "rgba(15,20,17,0.85)";
        context.strokeText(String(countdown), 480, 230);
        context.fillStyle = "#ffdc76";
        context.fillText(String(countdown), 480, 230);
        context.restore();
      }
      context.textAlign = "left";
      if (player && pose) {
      context.fillStyle = "rgba(15,20,17,0.78)";
      context.fillRect(24, 451, 320, 65);
      context.fillStyle = player.blue ? "#63bfff" : "#ffb36b";
      context.fillRect(24, 451, 3, 65);
      context.font = "600 20px 'Barlow Condensed', sans-serif";
      context.fillText(player.name, 40, 479, 290);
      context.font = "12px 'IBM Plex Sans', sans-serif";
      context.fillStyle = "#e8eee7";
      context.fillText(ballCam === null ? "PLAYER POV" : ballCam ? "BALL CAM" : "CAR CAM", 40, 501);
      context.beginPath();
      context.arc(881, 466, 49, 0, Math.PI * 2);
      context.fillStyle = "rgba(15,20,17,0.78)";
      context.fill();
      context.beginPath();
      context.arc(881, 466, 43, Math.PI * 0.75, Math.PI * 2.25);
      context.strokeStyle = "#ffffff30";
      context.lineWidth = 5;
      context.stroke();
      context.beginPath();
      context.arc(881, 466, 43, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * (pose.boostAmount ?? 0) / 100));
      context.strokeStyle = pose.boost ? "#fff0b0" : "#ffa941";
      context.stroke();
      context.textAlign = "center";
      context.fillStyle = "#ffffff";
      context.font = "600 36px 'Barlow Condensed', sans-serif";
      context.fillText(pose.boostAmount === null ? "--" : String(pose.boostAmount), 881, 474);
      context.font = "10px 'IBM Plex Sans', sans-serif";
      context.fillStyle = "#d9e0d6";
      context.fillText("BOOST", 881, 493);
      context.textAlign = "left";
      }
      this.texture.needsUpdate = true;
    }
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}