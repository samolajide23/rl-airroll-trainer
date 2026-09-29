import * as THREE from "three";
import { RL } from "./rl-physics.js";
import { UU } from "./rl-units.js";

/** uu → Three.js metres (alias of {@link UU}). */
export const ARENA_UU = UU;

/** Soccar centre-circle paint radius (uu). */
const CENTER_CIRCLE_R = 915;
/** Paint stroke width (uu). */
const LINE_W = 20;
/** Decorative side-wall thickness (uu). */
const WALL_T = 35;
/** Corner pillar footprint (uu). */
const PILLAR = 120;

/**
 * Visual Rocket League–style soccar box (flat floor, walls, goal mouths).
 * Physics field extents come from {@link RL}; every length is UU × {@link ARENA_UU}.
 * @returns {THREE.Group}
 */
export function createSoccarArena() {
  const root = new THREE.Group();
  root.name = "soccar-arena";

  const hw = RL.HALF_W * ARENA_UU;
  const hl = RL.HALF_L * ARENA_UU;
  const h = RL.CEILING * ARENA_UU;
  const goalHalfW = RL.GOAL_HALF_W * ARENA_UU;
  const goalH = RL.GOAL_HEIGHT * ARENA_UU;
  const goalDepth = RL.GOAL_DEPTH * ARENA_UU;
  const wallT = WALL_T * ARENA_UU;
  const circleR = CENTER_CIRCLE_R * ARENA_UU;
  const lineW = LINE_W * ARENA_UU;
  const pillar = PILLAR * ARENA_UU;

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
  const lineY = 2 * ARENA_UU;
  const midLine = new THREE.Mesh(
    new THREE.PlaneGeometry(lineW, hl * 2 - 200 * ARENA_UU),
    paintMat,
  );
  midLine.rotation.x = -Math.PI / 2;
  midLine.position.y = lineY;
  root.add(midLine);

  const circle = new THREE.Mesh(
    new THREE.RingGeometry(circleR, circleR + lineW, 64),
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

    // Goal backplate tint — depth matches RocketSim GOAL_DEPTH
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(goalHalfW * 2, goalH),
      sign > 0 ? orangeMat : blueMat,
    );
    net.position.set(0, goalH / 2, z + sign * goalDepth);
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
  const pillarGeo = new THREE.BoxGeometry(pillar, h, pillar);
  for (const x of [-hw, hw]) {
    for (const z of [-hl, hl]) {
      const p = new THREE.Mesh(pillarGeo, wallMat);
      p.position.set(x, h / 2, z);
      root.add(p);
    }
  }

  // Boost pads are added by Free Play via boostPads.js (full soccar layout + pickup).

  return root;
}
