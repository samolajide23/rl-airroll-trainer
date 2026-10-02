import * as THREE from "three";

export class RenderPose {
  constructor() {
    this.previousPosition = new THREE.Vector3();
    this.previousVelocity = new THREE.Vector3();
    this.previousRotation = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.source = null;
  }

  capture(source, rotation = source.q) {
    this.source = source;
    this.previousPosition.copy(source.pos);
    this.previousVelocity.copy(source.vel);
    this.previousRotation.copy(rotation);
  }

  sample(source, alpha, rotation = source.q) {
    const blend = this.source === source && this.previousPosition.distanceToSquared(source.pos) < 200 * 200
      ? THREE.MathUtils.clamp(alpha, 0, 1) : 1;
    this.position.copy(this.previousPosition).lerp(source.pos, blend);
    this.velocity.copy(this.previousVelocity).lerp(source.vel, blend);
    this.rotation.copy(this.previousRotation).slerp(rotation, blend);
    return this;
  }

  reset() {
    this.source = null;
  }
}