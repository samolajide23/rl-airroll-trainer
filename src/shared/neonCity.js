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
    ctx.fillStyle = random() > 0.28 ? (random() > 0.65 ? "#e9ad74" : "#6196b8") : "#172439";
    ctx.fillRect(x, y, 5, 7);
  }
  const windowTexture = new THREE.CanvasTexture(canvas);
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ map: windowTexture, emissiveMap: windowTexture, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.68 }), 72);
  const dummy = new THREE.Object3D(); let count = 0;
  const accents = [0x47d7ef, 0xdf5cbd, 0xffa765];
  const lineMaterial = accents.map(color => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const addBox = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  for (const side of [-1, 1]) for (let i = 0; i < 18; i++) {
    const w = 5 + random() * 5, h = 20 + random() * 55, d = 5 + random() * 7;
    const x = side * (hw + 22 + random() * 19), z = -90 + i * 10;
    dummy.position.set(x, h / 2 - 3, z); dummy.scale.set(w, h, d); dummy.updateMatrix();
    buildings.setMatrixAt(count++, dummy.matrix);
    const light = lineMaterial[i % 3];
    addBox(0.12, h * 0.72, 0.12, x - side * w * 0.51, h * 0.4, z - d * 0.3, light);
    if (i % 4 === 0) addBox(w * 0.8, 0.14, 0.15, x, h - 4, z - d * 0.51, light);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 18; i++) {
    const w = 5 + random() * 7, h = 25 + random() * 55, d = 6 + random() * 5;
    const x = -90 + i * 10, z = side * (end + 22 + random() * 18);
    dummy.position.set(x, h / 2 - 3, z); dummy.scale.set(w, h, d); dummy.updateMatrix();
    buildings.setMatrixAt(count++, dummy.matrix);
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
  return root;
}