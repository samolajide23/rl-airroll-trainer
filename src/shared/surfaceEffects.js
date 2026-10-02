import * as THREE from "three";
import { BoostTrail } from "./boostTrail.js";
import { raycastArena } from "./arenaMesh.js";

export function updateGroundShadow(shadow, position, width, depth, restHeight = 0.17) {
  const altitude = Math.max(0, position.y - restHeight);
  shadow.position.set(position.x, 0.025, position.z);
  shadow.scale.set(width * (1 + altitude * 0.025), depth * (1 + altitude * 0.025), 1);
  shadow.material.opacity = 0.78 / (1 + altitude * 0.24);
}

export function styleContactEffect(mesh, age, duration, event) {
  mesh.position.fromArray(event.position);
  mesh.scale.setScalar(0.2 + age * (event.type === "goal" ? 12 : event.type === "demo" ? 5 : 2));
  mesh.rotation.set(age, age * 2, age * 0.7);
  mesh.material.wireframe = event.type === "goal" || event.type === "demo";
  mesh.material.blending = THREE.AdditiveBlending;
  mesh.material.color.setHex(event.type === "demo" ? 0xffd17c : event.team === 1 ? 0xffa047 : 0x48aaff);
  mesh.material.opacity = (1 - age / duration) ** 2 * (mesh.material.wireframe ? 0.8 : 0.45);
}

export class SurfaceEffects {
  constructor(scene) {
    this.smoke = new BoostTrail(scene, { max: 64 });
    this.marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x151916, transparent: true, opacity: 0.18,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 64);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    scene.add(this.marks);
    this.markTransform = new THREE.Object3D();
    this.history = [];
    this.time = 0;
    this.nextEmission = 0;
    this.lastPosition = null;
  }

  render(particles) {
    const samples = particles.slice(-64);
    const { position, color, size } = this.smoke.geo.attributes;
    samples.forEach((particle, index) => {
      const progress = particle.age / 0.4;
      const shade = 0.55 * (1 - progress) ** 1.5;
      position.setXYZ(index, particle.position.x, particle.position.y, particle.position.z);
      color.setXYZ(index, shade, shade, shade);
      size.setX(index, particle.size * 0.55 * (1 + progress * 1.5));
    });
    position.needsUpdate = color.needsUpdate = size.needsUpdate = true;
    this.smoke.geo.setDrawRange(0, samples.length);
    this.smoke.points.visible = samples.length > 0;
    this.smoke.mat.opacity = 0.22;
    this.smoke.mat.blending = THREE.NormalBlending;
    let markCount = 0;
    for (const particle of samples) {
      const origin = new THREE.Vector3(particle.position.x, particle.position.z, particle.position.y + 0.2).multiplyScalar(100);
      const hit = raycastArena(origin, new THREE.Vector3(0, 0, -1), 150);
      if (!hit || hit.normal.z < 0.8) continue;
      const transform = this.markTransform;
      transform.position.set(particle.position.x, origin.z * 0.01 - hit.dist * 0.01 + 0.005, particle.position.z);
      const normal = new THREE.Vector3(hit.normal.x, hit.normal.z, hit.normal.y);
      transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      transform.scale.setScalar(Math.max(0, 1 - particle.age / 0.4));
      transform.updateMatrix();
      this.marks.setMatrixAt(markCount++, transform.matrix);
    }
    this.marks.count = markCount;
    this.marks.visible = markCount > 0;
    this.marks.instanceMatrix.needsUpdate = true;
  }

  update(car, sliding, speed, dt) {
    this.time += Math.max(0, dt);
    if (this.lastPosition && this.lastPosition.distanceTo(car.position) > 15) this.reset();
    this.lastPosition = car.position.clone();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quaternion);
    if (car.visible && sliding && speed >= 200 && up.y >= 0.8 && this.time >= this.nextEmission) {
      const rear = new THREE.Vector3(0, 0, -0.35).applyQuaternion(car.quaternion);
      const lateral = new THREE.Vector3(0.35, 0, 0).applyQuaternion(car.quaternion);
      for (const side of [-1, 1]) {
        const position = car.position.clone().add(rear).addScaledVector(lateral, side).addScaledVector(up, -0.12);
        this.history.push({ position, time: this.time, size: 0.45 });
      }
      this.nextEmission = this.time + 1 / 60;
    }
    this.history = this.history.filter(particle => this.time - particle.time < 0.4).slice(-64);
    this.render(car.visible ? this.history.map(particle => {
      const age = this.time - particle.time;
      return { position: particle.position.clone().add(new THREE.Vector3(0, age * 0.7, 0)), age, size: particle.size };
    }) : []);
  }

  reset() {
    this.history = [];
    this.lastPosition = null;
    this.nextEmission = this.time;
    this.render([]);
  }

  dispose() {
    this.smoke.dispose();
    this.marks.geometry.dispose();
    this.marks.material.dispose();
    this.marks.removeFromParent();
  }
}

export class ContactEffects {
  constructor(scene) {
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.age = 1;
    this.cooldown = 0;
    this.event = null;
  }

  hit(position) {
    if (this.cooldown > 0) return;
    this.event = { type: "hit", position: position.toArray(), team: 0 };
    this.age = 0;
    this.cooldown = 0.12;
  }

  update(dt) {
    this.age += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.mesh.visible = Boolean(this.event) && this.age < 0.35;
    if (this.mesh.visible) styleContactEffect(this.mesh, this.age, 0.35, this.event);
  }

  reset() { this.event = null; this.age = 1; this.cooldown = 0; this.mesh.visible = false; }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}