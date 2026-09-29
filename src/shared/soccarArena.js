import * as THREE from "three";
import { RL } from "./rl-physics.js";

/** uu → Three.js metres */
export const ARENA_UU = 0.01;

/**
 * Visual Rocket League–style soccar box (flat floor, walls, goal mouths).
 * Physics field extents come from {@link RL}.
 * @returns {THREE.Group}
 */
export function createSoccarArena() {
  const root = new THREE.Group();
  root.name = "soccar-arena";

  const hw = RL.HALF_W * ARENA_UU;
  const hl = RL.HALF_L * ARENA_UU;
  const h = RL.CEILING * ARENA_UU;
  const goalHalfW = 8.92; // ~892 uu
  const goalH = 6.42; // ~642 uu
  const wallT = 0.35;

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a3d2e,
    roughness: 0.92,
    metalness: 0.04,
  });
  const paintMat = new THREE.MeshStandardMaterial({
    color: 0xe8eefc,
    roughness: 0.55,
    metalness: 0.05,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x243044,
    roughness: 0.85,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x152033,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const orangeMat = new THREE.MeshStandardMaterial({
    color: 0xc45a1a,
    roughness: 0.7,
    metalness: 0.1,
  });
  const blueMat = new THREE.MeshStandardMaterial({
    color: 0x2a6fad,
    roughness: 0.7,
    metalness: 0.1,
  });

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, hl * 2),
    floorMat,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // Centre line + circle
  const lineY = 0.02;
  const midLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, hl * 2 - 2),
    paintMat,
  );
  midLine.rotation.x = -Math.PI / 2;
  midLine.position.y = lineY;
  root.add(midLine);

  const circle = new THREE.Mesh(
    new THREE.RingGeometry(9.1, 9.35, 64),
    paintMat,
  );
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = lineY;
  root.add(circle);

  // Side walls (full length)
  for (const x of [-hw, hw]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, h, hl * 2),
      wallMat,
    );
    wall.position.set(x, h / 2, 0);
    root.add(wall);
  }

  // End walls with goal openings (two panels + crossbar)
  for (const sign of [-1, 1]) {
    const z = sign * hl;
    const sideW = hw - goalHalfW;
    for (const xSign of [-1, 1]) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(sideW, h, wallT),
        wallMat,
      );
      panel.position.set(
        xSign * (goalHalfW + sideW / 2),
        h / 2,
        z,
      );
      root.add(panel);
    }
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(goalHalfW * 2, h - goalH, wallT),
      wallMat,
    );
    lintel.position.set(0, goalH + (h - goalH) / 2, z);
    root.add(lintel);

    // Goal backplate tint
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(goalHalfW * 2, goalH),
      sign > 0 ? orangeMat : blueMat,
    );
    net.position.set(0, goalH / 2, z + sign * 4);
    if (sign > 0) net.rotation.y = Math.PI;
    net.material = net.material.clone();
    net.material.transparent = true;
    net.material.opacity = 0.35;
    root.add(net);
  }

  // Ceiling (subtle)
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, hl * 2),
    ceilingMat,
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  root.add(ceiling);

  // Corner pillars
  const pillarGeo = new THREE.BoxGeometry(1.2, h, 1.2);
  for (const x of [-hw, hw]) {
    for (const z of [-hl, hl]) {
      const p = new THREE.Mesh(pillarGeo, wallMat);
      p.position.set(x, h / 2, z);
      root.add(p);
    }
  }

  // Boost pads (visual only)
  const padGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.12, 24);
  const smallPadMat = new THREE.MeshStandardMaterial({
    color: 0xd4a017,
    emissive: 0x5a3a00,
    emissiveIntensity: 0.35,
    roughness: 0.5,
  });
  const bigPadMat = smallPadMat.clone();
  bigPadMat.color = new THREE.Color(0xffc94a);
  bigPadMat.emissiveIntensity = 0.55;

  const smallLocs = [
    [0, -28],
    [0, 28],
    [-18, 0],
    [18, 0],
    [-25, -20],
    [25, -20],
    [-25, 20],
    [25, 20],
  ];
  for (const [x, z] of smallLocs) {
    const pad = new THREE.Mesh(padGeo, smallPadMat);
    pad.position.set(x, 0.06, z);
    root.add(pad);
  }
  for (const [x, z] of [
    [-30, 0],
    [30, 0],
    [-25, -35],
    [25, -35],
    [-25, 35],
    [25, 35],
  ]) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 0.14, 28),
      bigPadMat,
    );
    pad.position.set(x, 0.07, z);
    root.add(pad);
  }

  return root;
}
