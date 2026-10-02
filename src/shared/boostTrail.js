import * as THREE from "three";

/**
 * Soft gold exhaust plumes and world-space embers.
 */
export class BoostTrail {
  /**
   * @param {THREE.Object3D} parent
   * @param {{ max?: number, exhaustLocal?: THREE.Vector3 }} [opts]
   */
  constructor(parent, opts = {}) {
    this.parent = parent;
    this.max = opts.max ?? 160;
    this.exhaustLocal = (opts.exhaustLocal ?? new THREE.Vector3(0, 0.15, -1.45)).clone();
    this._world = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._emitAccumulator = 0;
    this._time = 0;

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

    this.flames = new THREE.Group();
    for (const x of [-0.22, 0.22]) {
      const jet = new THREE.Group();
      jet.position.set(x, 0.2, -1.35);
      jet.visible = false;
      for (let segment = 0; segment < 14; segment++) {
        const progress = segment / 13;
        const material = new THREE.SpriteMaterial({
          map: this.mat.map, color: progress < 0.25 ? 0xe9f3ff : 0xffa342,
          transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, toneMapped: false,
        });
        const puff = new THREE.Sprite(material);
        puff.userData.progress = progress;
        puff.position.z = -progress * 1.6;
        jet.add(puff);
      }
      this.flames.add(jet);
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
  update(car, boosting, dt, speed = 0) {
    this._time += Math.min(dt, 0.1);
    const stretch = THREE.MathUtils.clamp(speed / 23, 0, 1);
    for (const flame of this.flames.children) {
      flame.visible = boosting;
      if (boosting) {
        const pulse = Math.sin(this._time * 47 + flame.position.x * 9);
        flame.scale.z = 0.85 + stretch * 0.7 + pulse * 0.08;
        flame.scale.x = flame.scale.y = 0.95 + pulse * 0.06;
        for (const puff of flame.children) {
          const progress = puff.userData.progress;
          const flutter = Math.sin(this._time * 31 - progress * 15 + flame.position.x * 7);
          const width = (0.12 + Math.sin(progress * Math.PI) * 0.23) * (1 + flutter * 0.06);
          puff.scale.set(width, width, 1);
          puff.position.x = flutter * progress * 0.09;
          puff.position.y = Math.cos(this._time * 23 - progress * 11) * progress * 0.07;
          puff.material.opacity = (1 - progress) ** 1.4 * (progress < 0.25 ? 0.85 : 0.42 + flutter * 0.04);
          puff.material.rotation = this._time * 0.7 + progress * 4;
        }
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
      this._emitAccumulator += Math.min(dt, 0.1) * 320;
      const emit = Math.floor(this._emitAccumulator);
      this._emitAccumulator -= emit;
      for (let i = 0; i < emit; i++) {
        const particle = this._pool.pop() ?? this.particles.shift();
        particle.pos.set(
          this.exhaustLocal.x + (Math.random() - 0.5) * 0.3,
          this.exhaustLocal.y + (Math.random() - 0.5) * 0.14,
          this.exhaustLocal.z - Math.random() * 0.6,
        ).applyMatrix4(car.matrixWorld).addScaledVector(this._fwd, -0.15 * Math.random());
        particle.velocity.set((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2, -6 - Math.random() * 5).applyQuaternion(this._q);
        particle.life = 0;
        particle.maxLife = 0.18 + stretch * 0.12 + Math.random() * 0.18;
        particle.size = 0.04 + Math.random() * 0.12;
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
      const g = 0.85 - t * 0.45;
      const b = 0.38 * (1 - t);
      const fade = (1 - t) ** 1.5;
      colAttr.setXYZ(i, r * fade, g * fade, b * fade);
      sizeAttr.setX(i, p.size * (1 + t * 0.5));
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    this.geo.setDrawRange(0, this.particles.length);
    this.mat.opacity = boosting || this.particles.length ? 0.45 : 0;
  }

  dispose() {
    this.parent.remove(this.points);
    this.flames.removeFromParent();
    this.geo.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
    const geometries = new Set();
    this.flames.traverse(flame => {
      if (!flame.material) return;
      if (flame.isMesh) geometries.add(flame.geometry);
      flame.material.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
  }
}
