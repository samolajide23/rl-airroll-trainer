import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RL } from "./rl-physics.js";
import { UU } from "./rl-units.js";
import { SOCCAR_TRIS } from "./soccarMeshData.js";
import { createNeonCity } from "./neonCity.js";

const BLUE = 0x329cff, ORANGE = 0xff9b43;

export function createStadiumReflectionScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x68788b);
  const halfWidth = RL.HALF_W * UU, halfLength = RL.HALF_L * UU;
  const add = (name, size, position, color, intensity = 1) => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name; mesh.position.set(...position); scene.add(mesh);
  };
  add("reflection-turf", [halfWidth * 2, 0.1, halfLength * 2], [0, -1.5, 0], 0x42653b);
  for (const side of [-1, 1]) {
    add("reflection-stands", [5, 10, halfLength * 2], [side * (halfWidth + 4), 7, 0], 0x253443);
    add("reflection-team-end", [halfWidth * 2, 6, 1], [0, 1.5, side * halfLength], side < 0 ? BLUE : ORANGE, 0.45);
    for (let along = -40; along <= 40; along += 16) {
      add("reflection-floodlight", [2.2, 0.08, 5], [side * (halfWidth + 7), 14.12, along], 0xe0f4ff, 6);
    }
  }
  scene.userData.dispose = () => scene.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.dispose(); object.material.dispose();
  });
  return scene;
}

export function createStadiumEnvironment(renderer) {
  const source = createStadiumReflectionScene();
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(source, 0.04, 0.1, 300);
  } finally {
    source.userData.dispose(); generator.dispose();
  }
}

/** Procedural textures keep the stadium offline-capable and lightweight. */
function turfTexture(detail = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  for (let band = 0; band < 16; band++) {
    ctx.fillStyle = detail ? "#808080" : band % 2 ? "#42653b" : "#355630";
    ctx.fillRect(0, band * 64, 1024, 64);
  }
  let seed = 8217;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 70000; i++) {
    ctx.fillStyle = detail
      ? (random() > 0.5 ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.2)")
      : (random() > 0.5 ? "rgba(180,204,128,.08)" : "rgba(14,35,12,.1)");
    ctx.fillRect(random() * 1024, random() * 1024, detail ? 0.8 : 0.4, detail ? 1 + random() * 2.5 : 0.3 + random() * 0.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = detail ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(detail ? RL.HALF_W * UU : 1, detail ? RL.HALF_L * UU : 1);
  texture.anisotropy = 16;
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

function hexEdges(width, depth, project, output) {
  const radius = 1.3, rowHeight = Math.sqrt(3) * radius;
  const seen = new Set();
  for (let column = -1; column <= Math.ceil(width / (radius * 1.5)); column++) {
    for (let row = -1; row <= Math.ceil(depth / rowHeight); row++) {
      const centerX = column * radius * 1.5;
      const centerY = (row + (column % 2 ? 0.5 : 0)) * rowHeight;
      for (let edge = 0; edge < 6; edge++) {
        const angle = edge * Math.PI / 3, next = (edge + 1) * Math.PI / 3;
        const start = [centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)];
        const end = [centerX + radius * Math.cos(next), centerY + radius * Math.sin(next)];
        let lower = 0, upper = 1;
        for (const [axis, limit] of [[0, width], [1, depth]]) {
          const delta = end[axis] - start[axis];
          if (Math.abs(delta) < 1e-9) {
            if (start[axis] < 0 || start[axis] > limit) upper = -1;
          } else {
            const near = -start[axis] / delta, far = (limit - start[axis]) / delta;
            lower = Math.max(lower, Math.min(near, far));
            upper = Math.min(upper, Math.max(near, far));
          }
        }
        if (upper - lower < 1e-6) continue;
        const points = [lower, upper].map(amount => start.map((value, axis) => value + (end[axis] - value) * amount));
        const key = points.map(point => point.map(value => Math.round(value * 100000)).join(",")).sort().join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        for (const point of points) output.push(...project(...point));
      }
    }
  }
}

/** Visual-only stadium; playable curves come directly from the collision pack. */
export function createStadium() {
  const root = new THREE.Group();
  root.name = "soccar-arena";
  const hw = RL.HALF_W * UU, hl = RL.HALF_L * UU, height = RL.CEILING * UU;
  const gw = RL.GOAL_HALF_W * UU, gh = RL.GOAL_HEIGHT * UU, gd = RL.GOAL_DEPTH * UU;
  const turf = new THREE.MeshStandardMaterial({ map: turfTexture(), roughness: 0.92, metalness: 0 });
  turf.bumpMap = turfTexture(true);
  turf.bumpScale = 0.012;
  const paint = new THREE.MeshStandardMaterial({ color: 0xf0f3df, roughness: 0.88, metalness: 0, depthWrite: false });
  paint.name = "field-paint";
  const dark = new THREE.MeshStandardMaterial({ color: 0x182c39, roughness: 0.55, metalness: 0.32, side: THREE.DoubleSide });
  const blue = new THREE.MeshStandardMaterial({ color: 0x214966, roughness: 0.48, metalness: 0.28, side: THREE.DoubleSide, transparent: true, opacity: 0.16, depthWrite: false });
  const orange = new THREE.MeshStandardMaterial({ color: 0x654836, roughness: 0.48, metalness: 0.28, side: THREE.DoubleSide, transparent: true, opacity: 0.16, depthWrite: false });
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
  floor.receiveShadow = true;
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
    goalFloor.receiveShadow = true;
    const positions = goalFloor.geometry.attributes.position;
    const uv = goalFloor.geometry.attributes.uv;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      uv.setXY(vertex, positions.getX(vertex) / (hw * 2) + 0.5,
        0.5 - (goalFloor.position.z - positions.getY(vertex)) / (hl * 2));
    }
    root.add(goalFloor);
    const glow = new THREE.MeshBasicMaterial({ color: sign < 0 ? BLUE : ORANGE, toneMapped: false });
    const tint = new THREE.MeshStandardMaterial({ color: sign < 0 ? BLUE : ORANGE, roughness: 0.88, metalness: 0, transparent: true, opacity: 0.65, depthWrite: false });
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
    const addNet = (width, depth, position, rotation) => {
      const texture = netTexture();
      texture.repeat.set(width / 0.45, depth / 0.45);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({ map: texture, color: 0xd5e0e5, roughness: 0.95, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }));
      net.name = "goal-net-panel";
      net.position.set(...position);
      net.rotation.set(...rotation);
      root.add(net);
    };
    addNet(gw * 2, gh, [0, gh / 2, sign * (hl + gd - 0.1)], [0, 0, 0]);
    addNet(gw * 2, gd, [0, gh + 0.02, sign * (hl + gd / 2)], [Math.PI / 2, 0, 0]);
    for (const side of [-1, 1]) {
      addNet(gd, gh, [side * (gw + 0.02), gh / 2, sign * (hl + gd / 2)], [0, Math.PI / 2, 0]);
      box(0.14, 0.14, gd, side * (gw + 0.12), gh + 0.12, sign * (hl + gd / 2), frame);
      box(0.14, gh, 0.14, side * (gw + 0.12), gh / 2, sign * (hl + gd), frame);
    }
    box(gw * 2 + 0.24, 0.14, 0.14, 0, gh + 0.12, sign * (hl + gd), frame);
    for (const side of [-1, 1]) {
      const radius = 1152 * UU;
      const points = [];
      for (let step = 0; step <= 32; step++) {
        const angle = step / 32 * Math.PI / 2;
        points.push(new THREE.Vector3(side * (hw - radius + Math.cos(angle) * (radius + 0.12)), 3.14, sign * (hl - radius + Math.sin(angle) * (radius + 0.12))));
      }
      const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.055, 6, false), glow);
      root.add(rail);
    }
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
  const spectators = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.95 }), index);
  spectators.name = "stadium-spectators";
  const seatMatrix = new THREE.Matrix4();
  for (let spectator = 0; spectator < index; spectator++) {
    seats.getMatrixAt(spectator, seatMatrix);
    dummy.position.setFromMatrixPosition(seatMatrix);
    dummy.position.y += 0.38;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.8, 1.1 + spectator % 3 * 0.12, 0.8);
    dummy.updateMatrix();
    spectators.setMatrixAt(spectator, dummy.matrix);
    spectators.setColorAt(spectator, new THREE.Color([0x8196a1, 0xccd3d2, 0x3c646d, 0xb27c62, 0x596c86][spectator % 5]));
  }
  root.add(spectators);
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 512; signCanvas.height = 128;
  const signContext = signCanvas.getContext("2d");
  signContext.fillStyle = "#17252c"; signContext.fillRect(0, 0, 512, 128);
  signContext.fillStyle = "#dae8e9"; signContext.font = "bold 62px sans-serif";
  signContext.textAlign = "center"; signContext.fillText("AIRLAB", 256, 87);
  const signMap = new THREE.CanvasTexture(signCanvas);
  signMap.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshStandardMaterial({ map: signMap, emissiveMap: signMap, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.7 });
  for (const side of [-1, 1]) {
    for (const along of [-32, 0, 32]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), signMaterial);
      sign.position.set(side * (hw + 2.5), 5.4, along);
      sign.rotation.y = -side * Math.PI / 2;
      root.add(sign);
    }
  }
  const lattice = [];
  hexEdges(hw * 2, hl * 2, (across, along) => [across - hw, height, along - hl], lattice);
  for (const side of [-1, 1]) {
    hexEdges(hl * 2, height - 3.2, (along, up) => [side * hw, up + 3.2, along - hl], lattice);
  }
  const latticeGeo = new THREE.BufferGeometry();
  latticeGeo.setAttribute("position", new THREE.Float32BufferAttribute(lattice, 3));
  const enclosure = new THREE.LineSegments(latticeGeo, new THREE.LineBasicMaterial({ color: 0xa6bdc5, transparent: true, opacity: 0.065, depthWrite: false }));
  enclosure.name = "stadium-hex-enclosure";
  root.add(enclosure);
  const roof = new THREE.MeshStandardMaterial({ color: 0x101b2c, roughness: 0.4, metalness: 0.6 });
  const flood = new THREE.MeshBasicMaterial({ color: 0xe0f4ff, toneMapped: false });
  for (const x of [-hw - 7, hw + 7]) {
    box(8, 0.65, hl * 2 + 22, x, 16, 0, roof);
    for (let z = -48; z <= 48; z += 16) {
      box(0.45, 16, 0.45, x + Math.sign(x) * 3.5, 8, z, roof);
      box(7.8, 0.28, 0.28, x, 15.25, z, roof);
      const brace = box(0.2, 4.5, 0.2, x + Math.sign(x) * 2.2, 13.4, z, roof);
      brace.rotation.z = Math.sign(x) * Math.PI / 4;
    }
    for (let z = -40; z <= 40; z += 16) {
      box(2.5, 0.25, 5.3, x, 15.75, z, roof);
      for (let lamp = 0; lamp < 4; lamp++) box(2.2, 0.08, 0.95, x, 15.58, z - 1.8 + lamp * 1.2, flood);
    }
  }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color(0x243047) }, zenith: { value: new THREE.Color(0x060c20) } },
    vertexShader: "varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "uniform vec3 horizon;uniform vec3 zenith;varying vec3 vPos;void main(){float h=clamp(normalize(vPos).y,0.,1.);gl_FragColor=vec4(mix(horizon,zenith,pow(h,.45)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  }));
  sky.name = "stadium-dusk-sky"; root.add(sky);
  root.add(createNeonCity());
  root.add(new THREE.HemisphereLight(0xd6e2ed, 0x33362c, 0.45));
  const sun = new THREE.DirectionalLight(0xf0f4ff, 1.35); sun.position.set(-30, 65, -35); root.add(sun);

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
        materials.add(mat);
        for (const texture of [mat.map, mat.bumpMap, mat.emissiveMap]) if (texture) textures.add(texture);
      }
      if (obj.isInstancedMesh) obj.dispose();
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  };
  return root;
}