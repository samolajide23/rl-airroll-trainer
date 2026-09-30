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
    this._emitAccumulator = 0;

    /** @type {{ pos: THREE.Vector3, velocity: THREE.Vector3, life: number, maxLife: number, size: number }[]} */
    this.particles = [];
    this._pool = Array.from({ length: this.max }, () => ({
      pos: new THREE.Vector3(), velocity: new THREE.Vector3(),
      life: 0, maxLife: 0, size: 0,
    }));

    const positions = new Float32Array(this.max * 3);
    const colors = new Float32Array(this.max * 3);
    const sizes = new Float32Array(this.max);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    for (const attribute of Object.values(this.geo.attributes)) attribute.setUsage(THREE.DynamicDrawUsage);
    this.geo.setDrawRange(0, 0);

    this.mat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 32;
    const ctx = sprite.getContext("2d");
    const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.2, "rgba(255,255,255,.85)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 32, 32);
    this.mat.map = new THREE.CanvasTexture(sprite);
    this.mat.toneMapped = false;
    // PointsMaterial otherwise ignores the per-particle size attribute.
    this.mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("uniform float size;", "attribute float size;")
        .replace("gl_PointSize = size;", "gl_PointSize = size * 0.8;");
    };

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
      geo.rotateX(-Math.PI / 2);
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

    if (!boosting && this.particles.length === 0) {
      this._emitAccumulator = 0;
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    if (boosting) {
      car.updateWorldMatrix(true, false);
      car.matrixWorld.decompose(this._world, this._q, this._fwd);
      this._fwd.set(0, 0, 1).applyQuaternion(this._q);
      this._emitAccumulator += Math.min(dt, 0.1) * 160;
      const emit = Math.floor(this._emitAccumulator);
      this._emitAccumulator -= emit;
      for (let i = 0; i < emit; i++) {
        const particle = this._pool.pop() ?? this.particles.shift();
        particle.pos.set(
          this.exhaustLocal.x + (Math.random() - 0.5) * 0.35,
          this.exhaustLocal.y + (Math.random() - 0.5) * 0.2,
          this.exhaustLocal.z - Math.random() * 0.4,
        ).applyMatrix4(car.matrixWorld).addScaledVector(this._fwd, -0.15 * Math.random());
        particle.velocity.copy(this._fwd).multiplyScalar(-6);
        particle.life = 0;
        particle.maxLife = 0.28 + Math.random() * 0.35;
        particle.size = 0.2 + Math.random() * 0.35;
        this.particles.push(particle);
      }
    } else this._emitAccumulator = 0;

    let liveCount = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += dt;
      p.pos.addScaledVector(p.velocity, dt);
      p.pos.y += 0.4 * dt;
      if (p.life >= p.maxLife) {
        this._pool.push(p);
      } else {
        this.particles[liveCount++] = p;
      }
    }
    this.particles.length = liveCount;

    const posAttr = this.geo.attributes.position;
    const colAttr = this.geo.attributes.color;
    const sizeAttr = this.geo.attributes.size;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const t = p.life / p.maxLife;
      posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      const r = 1;
      const g = 0.45 + t * 0.5;
      const b = 0.15 + t * 0.7;
      colAttr.setXYZ(i, r, g, b);
      sizeAttr.setX(i, p.size * (1 - t));
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    this.geo.setDrawRange(0, this.particles.length);
    this.mat.opacity = boosting || this.particles.length ? 0.95 : 0;
  }

  dispose() {
    this.parent.remove(this.points);
    this.flames.removeFromParent();
    this.geo.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
    for (const f of this.flames.children) {
      /** @type {THREE.Mesh} */ (f).geometry.dispose();
      /** @type {THREE.Mesh} */ (f).material.dispose();
    }
  }
}
