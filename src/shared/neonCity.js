import * as THREE from "three";
import { RL } from "./rl-physics.js";
import { UU } from "./rl-units.js";

/** Original neon-city scenery, not imported Rocket League art. No collisions. */
export function createNeonCity() {
  const root = new THREE.Group();
  root.name = "neon-city-backdrop";
  root.userData.visualOnly = true;
  const hw = RL.HALF_W * UU, end = (RL.HALF_L + RL.GOAL_DEPTH) * UU;
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#080e1b"; ctx.fillRect(0, 0, 128, 256);
  let seed = 4921;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 4; y < 256; y += 12) for (let x = 4; x < 128; x += 12) {
    ctx.fillStyle = random() > 0.55 ? (random() > 0.65 ? "#b68c62" : "#486d82") : "#111c29";
    ctx.fillRect(x, y, 5, 7);
  }
  const windowTexture = new THREE.CanvasTexture(canvas);
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x536475, map: windowTexture, emissiveMap: windowTexture,
      emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.78, metalness: 0.15 }), 72);
  const dummy = new THREE.Object3D(); let count = 0;
  const accents = [0x47d7ef, 0xdf5cbd, 0xffa765];
  const lineMaterial = accents.map(color => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const structureMaterial = new THREE.MeshStandardMaterial({ color: 0x25303a, roughness: 0.62, metalness: 0.4 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x45515b, roughness: 0.48, metalness: 0.55 });
  const addBox = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const detailTower = (x, z, w, h, d, index) => {
    const top = h - 3;
    const crownHeight = 2 + (index % 4) * 1.2;
    addBox(w * 0.8, crownHeight, d * 0.8, x, top + crownHeight / 2, z, crownMaterial);
    addBox(w * 0.45, 1.8, d * 0.4, x, top + crownHeight + 0.9, z, structureMaterial);
    if (index % 3 === 0) addBox(0.16, 5, 0.16, x, top + crownHeight + 4, z, crownMaterial);
    for (const side of [-1, 1]) {
      addBox(0.22, h, 0.22, x + side * w * 0.48, h / 2 - 3, z - d * 0.51, structureMaterial);
      addBox(0.22, h, 0.22, x + side * w * 0.48, h / 2 - 3, z + d * 0.51, structureMaterial);
    }
    for (let level = 10; level < h - 4; level += 12) {
      addBox(w * 1.025, 0.35, d * 1.025, x, level - 3, z, structureMaterial);
    }
  };
  for (const side of [-1, 1]) for (let i = 0; i < 18; i++) {
    const w = 5 + random() * 5, h = 20 + random() * 55, d = 5 + random() * 7;
    const x = side * (hw + 22 + random() * 19), z = -90 + i * 10;
    dummy.position.set(x, h / 2 - 3, z); dummy.scale.set(w, h, d); dummy.updateMatrix();
    buildings.setMatrixAt(count++, dummy.matrix);
    buildings.setColorAt(count - 1, new THREE.Color().setHSL(0.56 + random() * 0.04, 0.12, 0.45 + random() * 0.3));
    detailTower(x, z, w, h, d, count);
    const light = lineMaterial[i % 3];
    addBox(0.12, h * 0.72, 0.12, x - side * w * 0.51, h * 0.4, z - d * 0.3, light);
    if (i % 4 === 0) addBox(w * 0.8, 0.14, 0.15, x, h - 4, z - d * 0.51, light);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 18; i++) {
    const w = 5 + random() * 7, h = 25 + random() * 55, d = 6 + random() * 5;
    const x = -90 + i * 10, z = side * (end + 22 + random() * 18);
    dummy.position.set(x, h / 2 - 3, z); dummy.scale.set(w, h, d); dummy.updateMatrix();
    buildings.setMatrixAt(count++, dummy.matrix);
    buildings.setColorAt(count - 1, new THREE.Color().setHSL(0.56 + random() * 0.04, 0.12, 0.45 + random() * 0.3));
    detailTower(x, z, w, h, d, count);
    addBox(0.12, h * 0.8, 0.12, x - w * 0.4, h * 0.45, z - side * d * 0.51, lineMaterial[i % 3]);
  }
  buildings.name = "city-towers";
  buildings.computeBoundingSphere(); root.add(buildings);

  const signTexture = (title, subtitle) => {
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
    const c = canvas.getContext("2d");
    c.fillStyle = "#0c1525"; c.fillRect(0, 0, 512, 128);
    c.strokeStyle = "#57dcdf"; c.lineWidth = 4; c.strokeRect(5, 5, 502, 118);
    c.textAlign = "center"; c.fillStyle = "#bce9ed"; c.font = "bold 45px sans-serif"; c.fillText(title, 256, 64);
    c.fillStyle = "#e693be"; c.font = "18px sans-serif"; c.fillText(subtitle, 256, 99);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  };
  for (const side of [-1, 1]) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(19, 4.75), new THREE.MeshBasicMaterial({
      map: signTexture("NIGHT CIRCUIT", "AERIAL PRACTICE / DISTRICT 07"), toneMapped: false, side: THREE.DoubleSide,
    }));
    screen.position.set(0, 18, side * (end + 15)); root.add(screen);
  }
  for (const material of [...lineMaterial, structureMaterial, crownMaterial]) {
    const accents = root.children.filter(child => child.isMesh && child.material === material);
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, accents.length);
    instances.name = lineMaterial.includes(material) ? "city-light-accents" : "city-architectural-details";
    accents.forEach((mesh, index) => {
      const { width, height, depth } = mesh.geometry.parameters;
      dummy.position.copy(mesh.position);
      dummy.rotation.copy(mesh.rotation);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);
      mesh.removeFromParent();
      mesh.geometry.dispose();
    });
    instances.computeBoundingSphere();
    root.add(instances);
  }
  return root;
}