import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RL } from "./rl-physics.js";
import { UU } from "./rl-units.js";
import { SOCCAR_TRIS } from "./soccarMeshData.js";
import { createNeonCity } from "./neonCity.js";

const BLUE = 0x329cff, ORANGE = 0xff9b43;

/** Procedural textures keep the stadium offline-capable and lightweight. */
function turfTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? "#264146" : "#21383e";
    ctx.fillRect(0, i * 64, 1024, 64);
  }
  let seed = 8217;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 70000; i++) {
    ctx.fillStyle = random() > 0.5 ? "rgba(140,182,186,.1)" : "rgba(5,20,29,.16)";
    ctx.fillRect(random() * 1024, random() * 1024, 1, 1 + random() * 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function netTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = "rgba(210,235,255,.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(32, 12);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Visual-only stadium; playable curves come directly from the collision pack. */
export function createStadium() {
  const root = new THREE.Group();
  root.name = "soccar-arena";
  const hw = RL.HALF_W * UU, hl = RL.HALF_L * UU, height = RL.CEILING * UU;
  const gw = RL.GOAL_HALF_W * UU, gh = RL.GOAL_HEIGHT * UU, gd = RL.GOAL_DEPTH * UU;
  const turf = new THREE.MeshStandardMaterial({ map: turfTexture(), roughness: 0.72, metalness: 0.08 });
  const paint = new THREE.MeshBasicMaterial({ color: 0xd7eee4, transparent: true, opacity: 0.7, depthWrite: false });
  const dark = new THREE.MeshStandardMaterial({ color: 0x182c39, roughness: 0.55, metalness: 0.32, side: THREE.DoubleSide });
  const blue = new THREE.MeshStandardMaterial({ color: 0x214966, roughness: 0.48, metalness: 0.28, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false });
  const orange = new THREE.MeshStandardMaterial({ color: 0x654836, roughness: 0.48, metalness: 0.28, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false });
  const buckets = [[], [], []];
  for (let i = 0; i < SOCCAR_TRIS.length; i += 9) {
    const z = (SOCCAR_TRIS[i + 2] + SOCCAR_TRIS[i + 5] + SOCCAR_TRIS[i + 8]) / 3;
    const y = (SOCCAR_TRIS[i + 1] + SOCCAR_TRIS[i + 4] + SOCCAR_TRIS[i + 7]) / 3;
    const points = buckets[z < 260 ? 0 : y < 0 ? 1 : 2];
    for (let j = 0; j < 9; j += 3) points.push(SOCCAR_TRIS[i + j] * UU, SOCCAR_TRIS[i + j + 2] * UU, SOCCAR_TRIS[i + j + 1] * UU);
  }
  buckets.forEach((points, index) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, [dark, blue, orange][index]);
    mesh.name = "collision-matched-arena-surface";
    root.add(mesh);
  });
  const box = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hl * 2), turf);
  floor.name = "standard-soccar-floor";
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  const stripe = (w, d, x, z, material = paint) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.018, z); root.add(mesh);
  };
  const ring = (radius, width, x, z, material = paint) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius, radius + width, 96), material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.02, z); root.add(mesh);
  };
  // The halfway stripe crosses X, not the length of the pitch.
  stripe(hw * 2 - 12, 0.13, 0, 0);
  ring(9.15, 0.13, 0, 0); ring(0.32, 0.15, 0, 0);
  for (const sign of [-1, 1]) {
    const goalFloor = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, gd), turf);
    goalFloor.rotation.x = -Math.PI / 2;
    goalFloor.position.z = sign * (hl + gd / 2);
    goalFloor.name = "standard-goal-floor";
    root.add(goalFloor);
    const glow = new THREE.MeshBasicMaterial({ color: sign < 0 ? BLUE : ORANGE, toneMapped: false });
    const tint = new THREE.MeshBasicMaterial({ color: sign < 0 ? BLUE : ORANGE, transparent: true, opacity: 0.35, depthWrite: false });
    stripe(27, 0.16, 0, sign * (hl - 16));
    for (const x of [-13.5, 13.5]) stripe(0.16, 13, x, sign * (hl - 9.5));
    stripe(gw * 2, 0.3, 0, sign * (hl - 0.1), tint);
    ring(9.5, 0.08, 0, sign * (hl - 15), tint);
    const frame = new THREE.MeshStandardMaterial({ color: 0xc6d5df, roughness: 0.28, metalness: 0.75 });
    for (const x of [-gw, gw]) {
      box(0.22, gh, 0.22, x + Math.sign(x) * 0.11, gh / 2, sign * (hl + 0.12), frame);
      box(0.065, gh - 0.12, 0.065, x + Math.sign(x) * 0.035, gh / 2, sign * (hl - 0.02), glow);
    }
    box(gw * 2 + 0.44, 0.22, 0.22, 0, gh + 0.11, sign * (hl + 0.12), frame);
    box(gw * 2, 0.06, 0.06, 0, gh + 0.035, sign * (hl - 0.02), glow);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, gh), new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    net.position.set(0, gh / 2, sign * (hl + gd - 0.1)); root.add(net);
    for (const xs of [-1, 1]) box(hw - gw - 1, 0.1, 0.12, xs * (gw + (hw - gw) / 2), 3.1, sign * (hl + 0.25), glow);
    for (const x of [-hw, hw]) box(0.1, 0.12, hl - 1, x + Math.sign(x) * 0.14, 3.1, sign * hl / 2, glow);
  }
  const glass = new THREE.MeshStandardMaterial({ color: 0x78b7d0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 });
  for (const x of [-hw, hw]) {
    box(0.15, 3.2, hl * 2, x + Math.sign(x) * 0.08, 1.6, 0, dark);
    box(0.06, height - 3.2, hl * 2, x + Math.sign(x) * 0.1, (height + 3.2) / 2, 0, glass);
    for (let z = -hl; z <= hl; z += 12.8) box(0.1, height - 3.2, 0.1, x, (height + 3.2) / 2, z, dark);
  }

  // Instanced seating avoids thousands of individual draw calls.
  const stands = new THREE.MeshStandardMaterial({ color: 0x182535, roughness: 0.85 });
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.32, 0.5), new THREE.MeshStandardMaterial({ roughness: 0.65 }), 2940);
  const dummy = new THREE.Object3D(); let index = 0;
  for (const side of [-1, 1]) for (let row = 0; row < 7; row++) {
    const y = 7 + row * 0.8;
    box(1.6, 0.65, hl * 2 + 7, side * (hw + 4 + row * 1.3), y - 0.3, 0, stands);
    for (let col = 0; col < 120; col++) {
      dummy.position.set(side * (hw + 4 + row * 1.3), y, -hl + col * hl * 2 / 119);
      dummy.rotation.y = side * Math.PI / 2; dummy.updateMatrix(); seats.setMatrixAt(index, dummy.matrix);
      seats.setColorAt(index++, new THREE.Color(col < 60 ? BLUE : ORANGE).multiplyScalar(0.35 + col % 3 * 0.12));
    }
    box(hw * 2 + 25, 0.65, 1.6, 0, y - 0.3, side * (hl + gd + 4 + row * 1.3), stands);
    for (let col = 0; col < 90; col++) {
      dummy.position.set(-hw - 10 + col * (hw * 2 + 20) / 89, y, side * (hl + gd + 4 + row * 1.3));
      dummy.rotation.y = side > 0 ? Math.PI : 0; dummy.updateMatrix(); seats.setMatrixAt(index, dummy.matrix);
      seats.setColorAt(index++, new THREE.Color(side < 0 ? BLUE : ORANGE).multiplyScalar(0.4 + col % 3 * 0.1));
    }
  }
  root.add(seats);
  const lattice = [];
  for (let x = -hw; x <= hw; x += 5.12) lattice.push(x, height, -hl, x, height, hl);
  for (let z = -hl; z <= hl; z += 5.12) lattice.push(-hw, height, z, hw, height, z);
  const latticeGeo = new THREE.BufferGeometry();
  latticeGeo.setAttribute("position", new THREE.Float32BufferAttribute(lattice, 3));
  root.add(new THREE.LineSegments(latticeGeo, new THREE.LineBasicMaterial({ color: 0x93bad3, transparent: true, opacity: 0.12, depthWrite: false })));
  const roof = new THREE.MeshStandardMaterial({ color: 0x101b2c, roughness: 0.4, metalness: 0.6 });
  const flood = new THREE.MeshBasicMaterial({ color: 0xe0f4ff, toneMapped: false });
  for (const x of [-hw - 7, hw + 7]) {
    box(8, 0.65, hl * 2 + 22, x, 16, 0, roof);
    for (let z = -40; z <= 40; z += 16) box(2.2, 0.08, 5, x, 15.62, z, flood);
  }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color(0x243047) }, zenith: { value: new THREE.Color(0x060c20) } },
    vertexShader: "varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "uniform vec3 horizon;uniform vec3 zenith;varying vec3 vPos;void main(){float h=clamp(normalize(vPos).y,0.,1.);gl_FragColor=vec4(mix(horizon,zenith,pow(h,.45)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  }));
  sky.name = "stadium-dusk-sky"; root.add(sky);
  root.add(createNeonCity());
  root.add(new THREE.HemisphereLight(0xb8d8ff, 0x32424b, 1.8));
  const sun = new THREE.DirectionalLight(0xe1edff, 2.2); sun.position.set(-30, 65, -35); root.add(sun);

  const batches = new Map();
  for (const child of root.children) {
    if (!child.isMesh || child.isInstancedMesh || child.name || Array.isArray(child.material) || child.material.transparent) continue;
    const batch = batches.get(child.material) ?? [];
    batch.push(child);
    batches.set(child.material, batch);
  }
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      mesh.updateMatrix();
      const transformed = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      if (!transformed.index) return transformed;
      const part = transformed.toNonIndexed();
      transformed.dispose();
      return part;
    });
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    const batch = new THREE.Mesh(geometry, material);
    batch.name = "static-stadium-batch";
    root.add(batch);
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }
  root.traverse(obj => {
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  });

  root.userData.dispose = () => {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(obj => {
      if (obj.geometry) geometries.add(obj.geometry);
      for (const mat of obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : []) {
        materials.add(mat); if (mat.map) textures.add(mat.map);
      }
      if (obj.isInstancedMesh) obj.dispose();
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  };
  return root;
}