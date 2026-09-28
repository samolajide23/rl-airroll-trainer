import * as THREE from "three";

/**
 * World-space boost exhaust trail (orange → white sparks).
 */
export class BoostTrail {
  /**
   * @param {THREE.Object3D} parent
   * @param {{ max?: number, exhaustLocal?: THREE.Vector3 }} [opts]
   */
  constructor(parent, opts = {}) {
    this.parent = parent;
    this.max = opts.max ?? 96;
    this.exhaustLocal = (opts.exhaustLocal ?? new THREE.Vector3(0, 0.15, -1.45)).clone();
    this._world = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    /** @type {{ pos: THREE.Vector3, life: number, maxLife: number, size: number }[]} */
    this.particles = [];

    const positions = new Float32Array(this.max * 3);
    const colors = new Float32Array(this.max * 3);
    const sizes = new Float32Array(this.max);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    this.mat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);

    // Twin exhaust flame cones (local to car — caller parents to car)
    this.flames = new THREE.Group();
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const x of [-0.22, 0.22]) {
      const geo = new THREE.ConeGeometry(0.12, 0.85, 8, 1, true);
      geo.translate(0, 0.42, 0);
      geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, flameMat.clone());
      mesh.position.set(x, 0.2, -1.35);
      mesh.visible = false;
      this.flames.add(mesh);
    }
  }

  /**
   * Attach flame jets to the car root (local space).
   * @param {THREE.Object3D} car
   */
  attachFlames(car) {
    car.add(this.flames);
  }

  /**
   * @param {THREE.Object3D} car
   * @param {boolean} boosting
   * @param {number} dt
   */
  update(car, boosting, dt) {
    car.getWorldPosition(this._world);
    car.getWorldQuaternion(this._q);
    this._fwd.set(0, 0, 1).applyQuaternion(this._q);

    for (const flame of this.flames.children) {
      flame.visible = boosting;
      if (boosting) {
        flame.scale.z = 0.75 + Math.random() * 0.55;
        flame.scale.x = 0.85 + Math.random() * 0.3;
        const m = /** @type {THREE.Mesh} */ (flame);
        const mat = /** @type {THREE.MeshBasicMaterial} */ (m.material);
        mat.color.setHSL(0.08 + Math.random() * 0.06, 1, 0.55 + Math.random() * 0.15);
      }
    }

    if (boosting) {
      const emit = 4;
      for (let i = 0; i < emit; i++) {
        if (this.particles.length >= this.max) this.particles.shift();
        const local = this.exhaustLocal
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 0.35,
              (Math.random() - 0.5) * 0.2,
              -Math.random() * 0.4,
            ),
          );
        const pos = local.applyQuaternion(this._q).add(this._world);
        // Drift slightly opposite to nose
        pos.addScaledVector(this._fwd, -0.15 * Math.random());
        this.particles.push({
          pos,
          life: 0,
          maxLife: 0.28 + Math.random() * 0.35,
          size: 0.2 + Math.random() * 0.35,
        });
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.pos.addScaledVector(this._fwd, -6 * dt);
      p.pos.y += 0.4 * dt;
      if (p.life >= p.maxLife) this.particles.splice(i, 1);
    }

    const posAttr = this.geo.attributes.position;
    const colAttr = this.geo.attributes.color;
    const sizeAttr = this.geo.attributes.size;
    for (let i = 0; i < this.max; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        const t = p.life / p.maxLife;
        posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
        // orange → yellow → white fade
        const r = 1;
        const g = 0.45 + t * 0.5;
        const b = 0.15 + t * 0.7;
        colAttr.setXYZ(i, r, g, b);
        sizeAttr.setX(i, p.size * (1 - t));
      } else {
        posAttr.setXYZ(i, 0, -999, 0);
        sizeAttr.setX(i, 0);
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    this.mat.opacity = boosting || this.particles.length ? 0.95 : 0;
  }

  dispose() {
    this.parent.remove(this.points);
    this.flames.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    for (const f of this.flames.children) {
      /** @type {THREE.Mesh} */ (f).geometry.dispose();
      /** @type {THREE.Mesh} */ (f).material.dispose();
    }
  }
}
