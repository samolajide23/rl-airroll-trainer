import * as THREE from "three";
import { cloneGlbCar, isCarReady } from "./carAssets.js";
import { getHitboxForCarId } from "./hitboxPresets.js";
import { getSelectedCarId } from "./loadout.js";
import { prepareCarVisual } from "./carVisualCalibration.js";

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

/** Opacity / transparency flags shared by ghost + solid cars. */
export function matOpts(opacity = 1) {
  return { transparent: opacity < 1, opacity, depthWrite: opacity >= 1 };
}

/** Procedural Titanium White marble / swirl paint. */
export function createMarbleTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 40 + Math.random() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(120,130,145,${0.15 + Math.random() * 0.25})`);
    g.addColorStop(1, "rgba(120,130,145,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.moveTo(x, y);
    const segs = 8 + Math.floor(Math.random() * 10);
    for (let s = 0; s < segs; s++) {
      x += (Math.random() - 0.45) * 70;
      y += (Math.random() - 0.5) * 55;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${30 + Math.random() * 40},${35 + Math.random() * 40},${45 + Math.random() * 40},${0.35 + Math.random() * 0.45})`;
    ctx.lineWidth = 3 + Math.random() * 14;
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.4) * 50;
      y += (Math.random() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.4})`;
    ctx.lineWidth = 2 + Math.random() * 6;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Glowing Zomba-style hub face. */
export function createZombaTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  ctx.fillStyle = "#0a0a0c";
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.fill();
  for (let ring = 0; ring < 6; ring++) {
    const r = size * (0.1 + ring * 0.06);
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2 + ring * 0.35;
      const wobble = 1 + Math.sin(i * 0.7 + ring) * 0.08;
      const x = cx + Math.cos(a) * r * wobble;
      const y = cy + Math.sin(a) * r * wobble;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + ring * 0.08})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    const a1 = a0 + Math.PI / 16;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, size * 0.42, a0, a1);
    ctx.closePath();
    ctx.fillStyle =
      i % 2 === 0 ? "rgba(255,255,255,0.55)" : "rgba(200,210,230,0.2)";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dark diamond mesh for the roof scoop. */
function createMeshTexture() {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#08080a";
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = "#3b3d44";
  ctx.lineWidth = 2;
  for (let i = -s; i < s * 2; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + s, s);
    ctx.moveTo(i + s, 0);
    ctx.lineTo(i, s);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Cylinder between two points. */
function tube(a, b, r, mat, seg = 10) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, va.distanceTo(vb), seg),
    mat,
  );
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    vb.clone().sub(va).normalize(),
  );
  return m;
}

/* ------------------------------------------------------------------ */
/*  Lofted body                                                        */
/* ------------------------------------------------------------------ */

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function sampleStations(keys, perSeg) {
  const out = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[Math.max(i - 1, 0)];
    const b = keys[i];
    const c = keys[i + 1];
    const d = keys[Math.min(i + 2, keys.length - 1)];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const o = {};
      for (const k of Object.keys(b)) {
        o[k] = catmull(a[k], b[k], c[k], d[k], t);
      }
      out.push(o);
    }
  }
  out.push({ ...keys[keys.length - 1] });
  return out;
}

/**
 * keys: [{ z, hw, yb, yt, n }]
 */
function loft(keys, { segs = 8, ring = 44 } = {}) {
  const st = sampleStations(keys, segs);
  const rows = st.length;
  const pos = [];
  const uv = [];
  const idx = [];

  for (let j = 0; j < rows; j++) {
    const s = st[j];
    const hw = Math.max(s.hw, 0.005);
    const yb = s.yb;
    const yt = Math.max(s.yt, yb + 0.01);
    const cy = (yb + yt) / 2;
    const hh = (yt - yb) / 2;
    const e = 2 / Math.max(s.n || 4, 2);
    for (let i = 0; i <= ring; i++) {
      const a = (i / ring) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      pos.push(
        hw * Math.sign(c) * Math.pow(Math.abs(c), e),
        cy + hh * Math.sign(sn) * Math.pow(Math.abs(sn), e),
        s.z,
      );
      uv.push((i / ring) * 2, (j / (rows - 1)) * 2);
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < ring; i++) {
      const a = j * (ring + 1) + i;
      const b = a + 1;
      const c = a + ring + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const n = geo.attributes.normal;
  for (let j = 0; j < rows; j++) {
    const a = j * (ring + 1);
    const b = a + ring;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }

  const capGeo = new THREE.BufferGeometry();
  const cp = [];
  const cn = [];
  const cu = [];
  const addCap = (row, dir) => {
    const base = row * (ring + 1) * 3;
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let i = 0; i < ring; i++) {
      mx += pos[base + i * 3];
      my += pos[base + i * 3 + 1];
      mz += pos[base + i * 3 + 2];
    }
    mx /= ring;
    my /= ring;
    mz /= ring;
    for (let i = 0; i < ring; i++) {
      const p0 = [
        pos[base + i * 3],
        pos[base + i * 3 + 1],
        pos[base + i * 3 + 2],
      ];
      const p1 = [
        pos[base + (i + 1) * 3],
        pos[base + (i + 1) * 3 + 1],
        pos[base + (i + 1) * 3 + 2],
      ];
      const tri = dir > 0 ? [[mx, my, mz], p0, p1] : [[mx, my, mz], p1, p0];
      for (const p of tri) {
        cp.push(...p);
        cn.push(0, 0, dir);
        cu.push(0.5, 0.5);
      }
    }
  };
  addCap(0, -1);
  addCap(rows - 1, 1);
  capGeo.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
  capGeo.setAttribute("normal", new THREE.Float32BufferAttribute(cn, 3));
  capGeo.setAttribute("uv", new THREE.Float32BufferAttribute(cu, 2));

  return { geo, capGeo };
}

function loftMesh(keys, mat, opts) {
  const { geo, capGeo } = loft(keys, opts);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  g.add(new THREE.Mesh(capGeo, mat));
  return g;
}

function makeFender(wheelR, width, side, paint, trimMat) {
  const g = new THREE.Group();
  const Ro = wheelR + 0.075;
  const Ri = wheelR + 0.03;
  const A0 = Math.PI * 0.1;
  const A1 = Math.PI * 0.9;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, Ro, A0, A1, false);
  shape.absarc(0, 0, Ri, A1, A0, true);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    curveSegments: 28,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(Math.PI / 2);
  g.add(new THREE.Mesh(geo, paint));

  for (const [dx, rr] of [
    [side * (width / 2 + 0.005), Ro + 0.005],
    [-side * (width / 2 + 0.005), Ro],
  ]) {
    const tg = new THREE.TorusGeometry(rr, 0.02, 8, 40, A1 - A0);
    tg.rotateZ(A0);
    tg.rotateY(Math.PI / 2);
    const t = new THREE.Mesh(tg, trimMat);
    t.position.x = dx;
    g.add(t);
  }
  return g;
}

/**
 * @param {number} opacity
 * @param {{radius?:number,width?:number,side?:1|-1,zombaTex?:THREE.Texture|null}} [opt]
 */
export function makeWheel(
  opacity = 1,
  { radius = 0.4, width = 0.36, side = 1, zombaTex = null } = {},
) {
  const o = matOpts(opacity);
  const wheel = new THREE.Group();
  const spin = new THREE.Group();
  wheel.add(spin);
  wheel.userData.spin = spin;
  wheel.userData.radius = radius;

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d0f,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
    ...o,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x0f0f12,
    roughness: 0.32,
    metalness: 0.9,
    ...o,
  });
  const spokeMat = new THREE.MeshStandardMaterial({
    color: 0x1b1c20,
    roughness: 0.3,
    metalness: 0.95,
    ...o,
  });
  const grooveMat = new THREE.MeshStandardMaterial({
    color: 0x050506,
    roughness: 1,
    ...o,
  });

  const prof = [
    [0.6, -0.5],
    [0.86, -0.5],
    [0.96, -0.42],
    [1.0, -0.22],
    [1.0, 0.22],
    [0.96, 0.42],
    [0.86, 0.5],
    [0.6, 0.5],
  ].map(([r, x]) => new THREE.Vector2(r * radius, x * width));
  const tireGeo = new THREE.LatheGeometry(prof, 48);
  tireGeo.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(tireGeo, tireMat));

  for (const dx of [-0.24, -0.08, 0.08, 0.24]) {
    const tg = new THREE.TorusGeometry(radius * 1.001, 0.011, 6, 56);
    tg.rotateY(Math.PI / 2);
    const gr = new THREE.Mesh(tg, grooveMat);
    gr.position.x = dx * width;
    spin.add(gr);
  }

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius * 0.64,
      radius * 0.64,
      width * 0.92,
      32,
      1,
      true,
    ),
    rimMat,
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.material.side = THREE.DoubleSide;
  spin.add(barrel);
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 0.02, 32),
    rimMat,
  );
  dish.rotation.z = Math.PI / 2;
  dish.position.x = side * width * 0.3;
  spin.add(dish);

  const spokeCount = 8;
  for (let i = 0; i < spokeCount; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i / spokeCount) * Math.PI * 2;
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, radius * 0.5, radius * 0.11),
      spokeMat,
    );
    s.position.set(side * width * 0.34, radius * 0.36, 0);
    s.rotation.x = 0.38;
    arm.add(s);
    spin.add(arm);
  }

  const lipG = new THREE.TorusGeometry(radius * 0.64, 0.02, 8, 40);
  lipG.rotateY(Math.PI / 2);
  const lip = new THREE.Mesh(lipG, spokeMat);
  lip.position.x = side * width * 0.46;
  spin.add(lip);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, 0.07, 20),
    spokeMat,
  );
  hub.rotation.z = Math.PI / 2;
  hub.position.x = side * width * 0.4;
  spin.add(hub);

  if (zombaTex) {
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.17, 32),
      new THREE.MeshBasicMaterial({ map: zombaTex, toneMapped: false, ...o }),
    );
    face.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    face.position.x = side * (width * 0.4 + 0.04);
    spin.add(face);
  }
  return wheel;
}

/**
 * Full Octane-style car. Origin on the ground under the car centre.
 * @param {{color?:number, marble?:boolean, opacity?:number, zomba?:boolean}} [opt]
 * @returns {THREE.Group}
 */
export function createCar({
  color = 0xffffff,
  marble = true,
  opacity = 1,
  zomba = true,
} = {}) {
  const o = matOpts(opacity);
  const car = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({
    color,
    map: marble ? createMarbleTexture() : null,
    roughness: 0.28,
    metalness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    ...o,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0b1015,
    roughness: 0.04,
    metalness: 0.1,
    clearcoat: 1,
    transparent: true,
    opacity: Math.min(0.88, opacity),
    depthWrite: false,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x111113,
    roughness: 0.55,
    metalness: 0.6,
    ...o,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x5b5d63,
    roughness: 0.32,
    metalness: 0.92,
    ...o,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x2a2b2f,
    roughness: 0.35,
    metalness: 0.9,
    ...o,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    ...o,
  });
  const redGlow = new THREE.MeshStandardMaterial({
    color: 0x9a1010,
    emissive: 0xff2200,
    emissiveIntensity: 0.9,
    roughness: 0.5,
    ...o,
  });

  const bodyKeys = [
    { z: -1.6, hw: 0.55, yb: 0.42, yt: 0.68, n: 3 },
    { z: -1.45, hw: 0.74, yb: 0.34, yt: 0.78, n: 3.4 },
    { z: -1.0, hw: 0.84, yb: 0.28, yt: 0.8, n: 3.8 },
    { z: -0.3, hw: 0.86, yb: 0.27, yt: 0.76, n: 4 },
    { z: 0.3, hw: 0.86, yb: 0.27, yt: 0.72, n: 4 },
    { z: 0.8, hw: 0.84, yb: 0.27, yt: 0.64, n: 3.8 },
    { z: 1.2, hw: 0.74, yb: 0.28, yt: 0.5, n: 3.4 },
    { z: 1.5, hw: 0.62, yb: 0.3, yt: 0.41, n: 3 },
    { z: 1.58, hw: 0.5, yb: 0.32, yt: 0.37, n: 3 },
  ];
  car.add(loftMesh(bodyKeys, paint));

  const cabinKeys = [
    { z: -1.0, hw: 0.54, yb: 0.68, yt: 0.9, n: 3.5 },
    { z: -0.9, hw: 0.6, yb: 0.68, yt: 1.05, n: 4 },
    { z: -0.4, hw: 0.63, yb: 0.68, yt: 1.1, n: 4 },
    { z: 0.15, hw: 0.6, yb: 0.68, yt: 1.08, n: 4 },
    { z: 0.5, hw: 0.52, yb: 0.68, yt: 0.92, n: 3.6 },
    { z: 0.78, hw: 0.42, yb: 0.68, yt: 0.76, n: 3 },
  ];
  car.add(loftMesh(cabinKeys, glass));

  const roofKeys = [
    { z: -0.95, hw: 0.4, yb: 1.02, yt: 1.07, n: 3 },
    { z: -0.75, hw: 0.56, yb: 1.03, yt: 1.11, n: 3 },
    { z: -0.2, hw: 0.6, yb: 1.05, yt: 1.13, n: 3 },
    { z: 0.2, hw: 0.56, yb: 1.03, yt: 1.1, n: 3 },
    { z: 0.42, hw: 0.44, yb: 0.97, yt: 1.02, n: 3 },
  ];
  car.add(loftMesh(roofKeys, paint));

  for (const sx of [-1, 1]) {
    car.add(
      tube([sx * 0.56, 0.7, 0.58], [sx * 0.55, 1.03, 0.25], 0.035, trim),
    );
    car.add(tube([sx * 0.6, 0.7, -1.0], [sx * 0.57, 1.04, -0.9], 0.04, trim));
  }

  for (const sx of [-1, 1]) {
    car.add(
      tube([sx * 0.885, 0.62, 0.7], [sx * 0.89, 0.54, -0.6], 0.013, trim),
    );
    car.add(
      tube([sx * 0.88, 0.44, 0.68], [sx * 0.885, 0.42, -0.55], 0.011, trim),
    );
  }

  const under = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 2.7), dark);
  under.position.set(0, 0.26, 0.03);
  car.add(under);
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 1.5), trim);
    skirt.position.set(sx * 0.865, 0.31, -0.05);
    car.add(skirt);
  }

  const zombaTex = zomba ? createZombaTexture() : null;
  const wheelDefs = [
    { x: 0.9, z: 0.98, r: 0.38 },
    { x: -0.9, z: 0.98, r: 0.38 },
    { x: 0.9, z: -0.95, r: 0.44 },
    { x: -0.9, z: -0.95, r: 0.44 },
  ];
  const wheels = [];
  const fenderW = 0.5;
  for (const w of wheelDefs) {
    const side = Math.sign(w.x);
    const wheel = makeWheel(opacity, {
      radius: w.r,
      width: 0.48,
      side,
      zombaTex,
    });
    wheel.position.set(w.x, w.r, w.z);
    car.add(wheel);
    wheels.push(wheel);

    const fender = makeFender(w.r, fenderW, side, paint, trim);
    fender.position.set(w.x, w.r, w.z);
    car.add(fender);
  }
  for (const z of [0.98, -0.95]) {
    const r = z > 0 ? 0.38 : 0.44;
    car.add(tube([-0.6, r, z], [0.6, r, z], 0.05, dark, 12));
    for (const sx of [-1, 1]) {
      car.add(
        tube([sx * 0.55, r + 0.06, z], [sx * 0.75, r + 0.24, z], 0.025, metal),
      );
    }
  }

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.08), dark);
  grille.position.set(0, 0.42, 1.56);
  car.add(grille);
  for (let i = -5; i <= 5; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.2, 0.05), metal);
    bar.position.set(i * 0.06, 0.42, 1.6);
    bar.rotation.z = i * 0.02;
    car.add(bar);
  }
  const bumper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.2, 10),
    metal,
  );
  bumper.rotation.z = Math.PI / 2;
  bumper.position.set(0, 0.33, 1.68);
  car.add(bumper);
  const upperBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.72, 10),
    metal,
  );
  upperBar.rotation.z = Math.PI / 2;
  upperBar.position.set(0, 0.55, 1.62);
  car.add(upperBar);
  for (const sx of [-1, 1]) {
    car.add(tube([sx * 0.3, 0.3, 1.66], [sx * 0.3, 0.58, 1.6], 0.028, metal));
    car.add(tube([sx * 0.6, 0.33, 1.68], [sx * 0.7, 0.36, 1.45], 0.026, metal));
    car.add(tube([sx * 0.3, 0.55, 1.62], [sx * 0.5, 0.5, 1.5], 0.02, metal));
  }

  const addLight = (x, y, z, R, big) => {
    const g = new THREE.Group();
    const bezel = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.2, R * 1.3, 0.09, 24),
      dark,
    );
    bezel.rotation.x = Math.PI / 2;
    g.add(bezel);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.2, 0.012, 8, 24),
      metal,
    );
    ring.position.z = 0.045;
    g.add(ring);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(R, 24), lensMat);
    lens.position.z = 0.047;
    g.add(lens);
    if (big) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        const dot = new THREE.Mesh(new THREE.CircleGeometry(R * 0.3, 12), dark);
        dot.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0.05);
        g.add(dot);
      }
    }
    g.position.set(x, y, z);
    car.add(g);
  };
  for (const sx of [-1, 1]) {
    addLight(sx * 0.6, 0.42, 1.66, 0.085, true);
    addLight(sx * 0.2, 0.3, 1.74, 0.05, false);
  }

  const meshTex = createMeshTexture();
  const scoopBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.34), trim);
  scoopBody.position.set(0, 1.14, -1.1);
  scoopBody.rotation.x = -0.12;
  car.add(scoopBody);
  const scoopFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.09),
    new THREE.MeshStandardMaterial({
      map: meshTex,
      roughness: 0.5,
      metalness: 0.7,
      ...o,
    }),
  );
  scoopFace.position.set(0, 1.145, -0.925);
  scoopFace.rotation.x = -0.12;
  car.add(scoopFace);

  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.022 - i * 0.002, 0.1 - i * 0.008, 8),
        trim,
      );
      spike.position.set(
        sx * (0.5 - i * 0.015),
        1.12 - i * 0.006,
        -0.62 + i * 0.14,
      );
      spike.rotation.z = -sx * 0.25;
      car.add(spike);
    }
  }

  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.3), redGlow);
  engine.position.set(0, 0.85, -1.3);
  car.add(engine);

  const rearBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.03), redGlow);
  rearBar.position.set(0, 0.56, -1.61);
  car.add(rearBar);

  for (const sx of [-1, 1]) {
    car.add(
      tube([sx * 0.42, 0.74, -1.32], [sx * 0.42, 1.13, -1.5], 0.028, metal),
    );
    car.add(
      tube([sx * 0.5, 0.74, -1.15], [sx * 0.42, 1.13, -1.5], 0.018, metal),
    );
  }

  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.2, 0);
  wingShape.quadraticCurveTo(0, 0.09, 0.2, 0.02);
  wingShape.lineTo(0.2, 0);
  wingShape.quadraticCurveTo(0, 0.04, -0.2, 0);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 1.9,
    bevelEnabled: false,
  });
  wingGeo.translate(0, 0, -0.95);
  wingGeo.rotateY(Math.PI / 2);
  const wing = new THREE.Mesh(wingGeo, paint);
  wing.position.set(0, 1.13, -1.5);
  wing.rotation.x = -0.1;
  car.add(wing);

  for (const sx of [-1, 1]) {
    const ep = new THREE.Shape();
    ep.moveTo(-0.2, -0.02);
    ep.quadraticCurveTo(0.02, 0.05, 0.22, 0.24);
    ep.lineTo(0.16, 0.24);
    ep.quadraticCurveTo(-0.02, 0.1, -0.2, 0.04);
    const eg = new THREE.ExtrudeGeometry(ep, {
      depth: 0.035,
      bevelEnabled: false,
    });
    eg.scale(1.35, 1.35, 1);
    eg.rotateY(Math.PI / 2);
    const plate = new THREE.Mesh(eg, paint);
    plate.position.set(sx * 0.95 - (sx > 0 ? 0 : 0.035), 1.11, -1.5);
    car.add(plate);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.4), trim);
    edge.position.set(sx * 0.95, 1.13, -1.5);
    car.add(edge);
  }

  const flameGeo = new THREE.ConeGeometry(0.15, 1, 16, 1, true);
  flameGeo.translate(0, 0.5, 0);
  flameGeo.rotateX(-Math.PI / 2);
  const flame = new THREE.Mesh(
    flameGeo,
    new THREE.MeshBasicMaterial({
      color: 0xff8a1e,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  flame.position.set(0, 0.5, -1.55);
  flame.scale.set(1, 1, 0.9);
  flame.visible = false;
  car.add(flame);

  car.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  flame.castShadow = false;

  car.userData.wheels = wheels;
  car.userData.spinWheels = (distance) => {
    for (const w of wheels) {
      w.userData.spin.rotation.x += distance / w.userData.radius;
    }
  };
  car.userData.setBoost = (on) => {
    flame.visible = !!on;
    if (on) flame.scale.z = 0.7 + Math.random() * 0.5;
  };
  return car;
}

/**
 * @param {THREE.Object3D} visual
 * @param {number} opacity
 */
function applyGhostLook(visual, opacity) {
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x5eead4,
    transparent: true,
    opacity: 0.95,
  });
  visual.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(obj.geometry, 25),
      edgeMat,
    );
    edges.position.copy(obj.position);
    edges.rotation.copy(obj.rotation);
    edges.scale.copy(obj.scale);
    obj.parent?.add(edges);

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.transparent = true;
      mat.opacity = Math.min(opacity, 0.35);
      mat.depthWrite = false;
      if ("color" in mat) mat.color = new THREE.Color(0x5eead4);
      if ("emissive" in mat) {
        mat.emissive = new THREE.Color(0x0d3d38);
        mat.emissiveIntensity = 0.35;
      }
      if ("map" in mat) mat.map = null;
    }
  });
}

/**
 * Build the visual body for the currently equipped (or requested) car.
 * Falls back to Classic if a GLB is not ready yet.
 * @param {{
 *   color?: number,
 *   opacity?: number,
 *   ghost?: boolean,
 *   carId?: string,
 * }} [opts]
 * @returns {THREE.Group}
 */
function buildVisual(opts = {}) {
  const isGhost = Boolean(opts.ghost);
  const solid = (opts.opacity ?? 1) >= 1 && !isGhost;
  const carId = opts.carId ?? getSelectedCarId();

  if (carId !== "classic" && isCarReady(carId)) {
    const glb = cloneGlbCar(carId);
    if (glb) {
      prepareCarVisual(glb, carId);
      if (isGhost) applyGhostLook(glb, opts.opacity ?? 0.32);
      glb.userData.spinWheels = () => {};
      glb.userData.setBoost = () => {};
      return glb;
    }
  }

  return createCar({
    color: isGhost ? 0x5eead4 : (opts.color ?? 0xffffff),
    marble: solid,
    opacity: isGhost ? Math.min(opts.opacity ?? 0.32, 0.35) : (opts.opacity ?? 1),
    zomba: solid,
  });
}

/**
 * Trainer wrapper: CoM / aerial pivot at local origin + align markers.
 * @param {number} [color=0xffffff]
 * @param {number} [opacity=1]
 * @param {{ ghost?: boolean, carId?: string, markers?: boolean }} [opts]
 * @returns {THREE.Group}
 */
export function makeCar(color = 0xffffff, opacity = 1, opts = {}) {
  const root = new THREE.Group();
  const isGhost = Boolean(opts.ghost);
  const solid = opacity >= 1 && !isGhost;
  const carId = opts.carId ?? getSelectedCarId();
  const showMarkers = opts.markers !== false && !isGhost;
  const visual = buildVisual({ color, opacity, ghost: isGhost, carId });

  // Procedural body sits on the ground; GLB is already centered on CoM.
  const COM_Y = carId === "classic" || !isCarReady(carId) ? 0.55 : 0;
  if (COM_Y !== 0) visual.position.y = -COM_Y;
  root.add(visual);

  if (isGhost && (carId === "classic" || !isCarReady(carId))) {
    applyGhostLook(visual, opacity);
  }

  if (showMarkers) {
    const noseMarker = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0xffd166,
        emissive: 0x664400,
        emissiveIntensity: solid ? 0.45 : 0.15,
        ...matOpts(opacity),
      }),
    );
    noseMarker.position.set(0, 0.42 - COM_Y, 1.62);
    root.add(noseMarker);

    const roofMarker = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.04, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0x6dff9a,
        emissive: 0x146b3a,
        emissiveIntensity: solid ? 0.4 : 0.12,
        ...matOpts(opacity),
      }),
    );
    roofMarker.position.set(0, 1.04 - COM_Y, -0.1);
    root.add(roofMarker);

    const axisLen = 1.5;
    const makeAxis = (dir, col) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        dir.clone().multiplyScalar(axisLen),
      ]);
      return new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.45,
        }),
      );
    };
    root.add(makeAxis(new THREE.Vector3(0, 0, 1), 0xffd166));
    root.add(makeAxis(new THREE.Vector3(0, 1, 0), 0x6dff9a));
    root.add(makeAxis(new THREE.Vector3(1, 0, 0), 0xff6b7a));
  }

  root.userData.visual = visual;
  root.userData.carId = carId;
  // Measure the geometry actually returned (including the procedural fallback),
  // not the requested GLB's nominal length. Store bounds before later transforms.
  visual.updateWorldMatrix(true, true);
  const visualBounds = new THREE.Box3().setFromObject(visual);
  visualBounds.min.sub(visual.position);
  visualBounds.max.sub(visual.position);
  root.userData.visualBounds = visualBounds;
  root.userData.refLength = visualBounds.max.z - visualBounds.min.z;
  root.userData.hitboxPreset = getHitboxForCarId(carId);
  root.userData.spinWheels = visual.userData.spinWheels ?? (() => {});
  root.userData.setBoost = visual.userData.setBoost ?? (() => {});
  return root;
}

/**
 * Thick local axes that show the target orientation around the player car.
 * @returns {THREE.Group}
 */
export function makeTargetGuide() {
  const group = new THREE.Group();

  const addArm = (dir, color, len = 2.1, radius = 0.045) => {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, len, 10),
      mat,
    );
    arm.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    arm.position.copy(dir).normalize().multiplyScalar(len * 0.5);
    group.add(arm);

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.8, 12, 12),
      mat,
    );
    tip.position.copy(dir).normalize().multiplyScalar(len);
    group.add(tip);
  };

  addArm(new THREE.Vector3(0, 0, 1), 0xffd166);
  addArm(new THREE.Vector3(0, 1, 0), 0x6dff9a);
  addArm(new THREE.Vector3(1, 0, 0), 0xff6b7a);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.35, 0.03, 8, 48),
    new THREE.MeshBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  return group;
}

export default createCar;
