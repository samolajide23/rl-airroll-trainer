import * as THREE from "three";
import { ArenaDrillBase } from "../shared/arenaDrill.js";
import { physToThree } from "../shared/carPhysics.js";
import { ARENA_UU } from "../shared/soccarArena.js";
import { disposeScene } from "../shared/disposeScene.js";

const COURSE = [
  [0, -2200, 450], [250, -1500, 650], [500, -800, 900],
  [250, 0, 1100], [-250, 800, 900], [-500, 1500, 650], [0, 2200, 900],
];
const PASS_RADIUS = 230;

export class RingsMode extends ArenaDrillBase {
  constructor(ctx) {
    super(ctx, "Rings");
    this.modeId = "rings";
    this.roundLimit = 60;
    this.nextIndex = 0;
    this.previousPosition = new THREE.Vector3();
    this.crossing = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.ringGroup = new THREE.Group();
    this.root.add(this.ringGroup);
    this.rings = COURSE.map((point, index) => {
      const center = new THREE.Vector3(...point);
      const previous = index === 0 ? new THREE.Vector3(0, -3000, this.hitbox.restZ) : new THREE.Vector3(...COURSE[index - 1]);
      const normal = center.clone().sub(previous).normalize();
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(PASS_RADIUS * ARENA_UU, 0.12, 12, 48),
        new THREE.MeshStandardMaterial({ color: 0x83cdec, emissive: 0x83cdec, emissiveIntensity: 0.5 }),
      );
      physToThree(center, mesh.position).multiplyScalar(ARENA_UU);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), physToThree(normal, new THREE.Vector3()).normalize());
      this.ringGroup.add(mesh);
      return { center, normal, mesh };
    });
  }

  setupRound() {
    this.spawn([0, -3000, this.hitbox.restZ], null);
    this.nextIndex = 0;
    this.previousPosition.copy(this.physCar.pos);
    this.refreshRings();
  }

  refreshRings() {
    this.rings.forEach((ring, index) => {
      const color = index < this.nextIndex ? 0x6cda9a : index === this.nextIndex ? 0xffd166 : 0x83cdec;
      ring.mesh.material.color.setHex(color);
      ring.mesh.material.emissive.setHex(color);
    });
    this.prompt = `Ring ${Math.min(this.nextIndex + 1, this.rings.length)} / ${this.rings.length}`;
  }

  evaluateStep(dt, controls, newContact) {
    const ring = this.rings[this.nextIndex];
    if (!ring) return;
    const before = this.offset.copy(this.previousPosition).sub(ring.center).dot(ring.normal);
    const after = this.offset.copy(this.physCar.pos).sub(ring.center).dot(ring.normal);
    if (before < 0 && after >= 0) {
      this.crossing.lerpVectors(this.previousPosition, this.physCar.pos, before / (before - after));
      this.offset.copy(this.crossing).sub(ring.center);
      this.offset.addScaledVector(ring.normal, -this.offset.dot(ring.normal));
      if (this.offset.length() <= PASS_RADIUS) {
        this.nextIndex += 1;
        this.progress = this.nextIndex / this.rings.length;
        this.refreshRings();
        if (this.nextIndex === this.rings.length) this.finishRound(true, "Course complete");
      }
    }
    this.previousPosition.copy(this.physCar.pos);
  }

  stop() {
    disposeScene(this.ringGroup);
    super.stop();
  }
}