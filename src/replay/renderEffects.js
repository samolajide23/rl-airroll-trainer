import * as THREE from "three";
import { BoostTrail } from "../shared/boostTrail.js";
import { syncCarExhaust } from "../shared/carVisualCalibration.js";
import { sampleBoostTrail, formatMatchClock, createWheelTrack } from "./timeline.js";

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
    trail.update(car, car.visible && boosting, 0);
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
      size.setX(index, particle.size * (1 + progress * 0.5));
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
    this.smoke = new BoostTrail(scene, { max: 64 });
  }

  render(replay, index, time) {
    const state = this.sample(time);
    const visual = this.car.userData.visual;
    for (const wheel of visual?.userData.calibratedWheels ?? []) {
      const radius = wheel.radius * Math.abs(visual.scale.y) * Math.abs(this.car.scale.x);
      wheel.pivot.rotation.set(state.distance / radius,
        wheel.corner.startsWith("F") ? -state.steer * 0.5 : 0, 0, "YXZ");
    }
    const particles = this.car.visible ? sampleBoostTrail(replay, index, time, true) : [];
    const { position, color, size } = this.smoke.geo.attributes;
    particles.forEach((particle, index) => {
      const progress = particle.age / 0.4;
      const shade = 0.65 * (1 - progress) ** 1.5;
      position.setXYZ(index, particle.position.x, particle.position.y, particle.position.z);
      color.setXYZ(index, shade, shade, shade);
      size.setX(index, particle.size * (1 + progress * 2));
    });
    position.needsUpdate = color.needsUpdate = size.needsUpdate = true;
    this.smoke.geo.setDrawRange(0, particles.length);
    this.smoke.points.visible = particles.length > 0;
    this.smoke.mat.opacity = 0.35;
    this.smoke.mat.blending = THREE.NormalBlending;
  }

  dispose() { this.smoke.dispose(); }
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

  render(renderer, player, pose, ballCam, match) {
    const clock = formatMatchClock(match);
    const key = `${player?.name}:${pose?.boostAmount}:${pose?.boost}:${ballCam}:${match?.blue}:${match?.orange}:${clock}`;
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