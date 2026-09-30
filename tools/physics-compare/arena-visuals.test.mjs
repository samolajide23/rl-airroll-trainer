import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createSoccarBoostPads, createBoostPadMeshes, stepBoostPads, resetBoostPads, BOOST_PAD_VISUAL } from "../../src/shared/boostPads.js";
import { RL } from "../../src/shared/rl-physics.js";
import { makeCar } from "../../src/shared/carSim.js";
import { createStadium } from "../../src/shared/stadium.js";
import { BoostTrail } from "../../src/shared/boostTrail.js";
import { disposeCarVisualMaterials } from "../../src/shared/car.js";
import { disposeScene } from "../../src/shared/disposeScene.js";
import viteConfig from "../../vite.config.js";
import { SOCCAR_TRI_COUNT, SOCCAR_TRIS } from "../../src/shared/soccarMeshData.js";

test("compact production arena data preserves every Float32 coordinate exactly", async () => {
  const plugin = viteConfig.plugins.find(plugin => plugin.name === "compact-arena-data");
  const transformed = plugin.transform("", "/src/shared/soccarMeshData.js");
  const compact = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString("base64")}`);
  assert.equal(compact.SOCCAR_TRI_COUNT, SOCCAR_TRI_COUNT);
  assert.deepEqual(compact.SOCCAR_TRIS, SOCCAR_TRIS);
});

test("scene cleanup releases owned resources once and preserves shared assets", () => {
  const root = new THREE.Group();
  const shared = new THREE.Group();
  shared.userData.sharedAssets = true;
  root.add(shared);
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const cachedGeometry = new THREE.BoxGeometry();
  const cachedTexture = new THREE.Texture();
  const clonedMaterial = new THREE.MeshBasicMaterial({ map: cachedTexture });
  shared.add(new THREE.Mesh(cachedGeometry, clonedMaterial));
  const counts = new Map();
  for (const resource of [geometry, texture, material, cachedGeometry, cachedTexture, clonedMaterial]) {
    counts.set(resource, 0);
    resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1));
  }
  disposeScene(root);
  for (const resource of [geometry, texture, material, clonedMaterial]) assert.equal(counts.get(resource), 1);
  assert.equal(counts.get(cachedGeometry), 0);
  assert.equal(counts.get(cachedTexture), 0);
  cachedGeometry.dispose();
  cachedTexture.dispose();
});

test("car cleanup disposes instance materials once without releasing cached assets or flames", () => {
  const car = new THREE.Group();
  const visual = new THREE.Group();
  car.add(visual);
  car.userData.visual = visual;
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const otherMaterial = new THREE.MeshBasicMaterial();
  visual.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, [material, otherMaterial]));
  const flameMaterial = new THREE.MeshBasicMaterial();
  car.add(new THREE.Mesh(geometry, flameMaterial));
  let materialDisposals = 0;
  let otherDisposals = 0;
  let sharedDisposals = 0;
  material.addEventListener("dispose", () => materialDisposals++);
  otherMaterial.addEventListener("dispose", () => otherDisposals++);
  for (const resource of [geometry, texture, flameMaterial]) {
    resource.addEventListener("dispose", () => sharedDisposals++);
  }
  disposeCarVisualMaterials(car);
  assert.equal(materialDisposals, 1);
  assert.equal(otherDisposals, 1);
  assert.equal(sharedDisposals, 0);
  geometry.dispose();
  texture.dispose();
  flameMaterial.dispose();
});

test("boost trail reuses bounded particles and stops work when empty", () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) }) };
  try {
    const parent = new THREE.Group(), car = new THREE.Group();
    parent.add(car);
    const trail = new BoostTrail(parent, { max: 8 });
    trail.attachFlames(car);
    const identities = new Set(trail._pool);
    for (let tick = 0; tick < 240; tick++) trail.update(car, true, 1 / 120);
    assert.equal(trail.particles.length + trail._pool.length, 8);
    assert([...trail.particles, ...trail._pool].every(particle => identities.has(particle)));
    assert([...trail.geo.attributes.position.array].every(Number.isFinite));
    for (let tick = 0; tick < 120; tick++) trail.update(car, false, 1 / 120);
    assert.equal(trail.particles.length, 0);
    assert.equal(trail.points.visible, false);
    const version = trail.geo.attributes.position.version;
    trail.update(car, false, 1 / 120);
    assert.equal(trail.geo.attributes.position.version, version);
    trail.dispose();
  } finally { globalThis.document = previous; }
});

test("all 34 visible pads use standard coordinates, not pickup-volume sizing", () => {
  const pads = createSoccarBoostPads();
  const root = new THREE.Group();
  createBoostPadMeshes(root, pads);
  assert.equal(pads.length, 34);
  assert.equal(pads.filter(p => p.big).length, 6);
  for (const pad of pads) {
    assert.equal(pad.mesh.position.x, pad.x * 0.01);
    assert.equal(pad.mesh.position.z, pad.y * 0.01);
    const radius = (pad.big ? BOOST_PAD_VISUAL.BIG_RADIUS : BOOST_PAD_VISUAL.SMALL_RADIUS) * 0.01;
    assert.equal(pad.mesh.geometry.parameters.radiusTop, radius);
    assert(radius < pad.radius * 0.01);
  }
});

test("collected pad keeps its base and extinguishes all pickup graphics", () => {
  const pads = createSoccarBoostPads();
  createBoostPadMeshes(new THREE.Group(), pads);
  const pad = pads.find(p => p.big);
  const car = { pos: new THREE.Vector3(pad.x, pad.y, 17), boost: 0, id: 1 };
  stepBoostPads(pads, car, RL.DT);
  assert.equal(car.boost, 100);
  assert.equal(pad.active, false);
  assert.equal(pad.timer, 10);
  assert.equal(pad.mesh.visible, true);
  assert(pad.mesh.children.every(child => !child.visible));
  assert.equal(pad.mesh.material.emissiveIntensity, 0);
  resetBoostPads(pads);
  assert(pad.mesh.children.every(child => child.visible));
  assert.equal(pad.mesh.material.emissiveIntensity, 0.65);
});

test("neon-city scenery stays outside play and the floor retains soccar dimensions", () => {
  // Geometry checks don't require an actual browser canvas or WebGL context.
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) };
  try {
    const stadium = createStadium();
    let meshes = 0;
    stadium.traverse(object => {
      assert.equal(object.matrixAutoUpdate, false);
      if (object.isMesh) meshes++;
    });
    assert(meshes < 70);
    assert.equal(stadium.getObjectByName("neon-city-backdrop").children.filter(object => object.name === "city-light-accents").length, 3);
    const floor = stadium.getObjectByName("standard-soccar-floor");
    assert.equal(floor.geometry.parameters.width, RL.HALF_W * 0.02);
    assert.equal(floor.geometry.parameters.height, RL.HALF_L * 0.02);
    const city = stadium.getObjectByName("neon-city-backdrop");
    const towers = city.getObjectByName("city-towers");
    const matrix = new THREE.Matrix4(), center = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
    for (let i = 0; i < towers.count; i++) {
      towers.getMatrixAt(i, matrix); matrix.decompose(center, rotation, scale);
      assert(Math.abs(center.x) - scale.x / 2 > RL.HALF_W * 0.01 || Math.abs(center.z) - scale.z / 2 > (RL.HALF_L + RL.GOAL_DEPTH) * 0.01);
    }
    assert.equal(stadium.children.filter(o => o.name === "standard-goal-floor").length, 2);
    for (const goal of stadium.children.filter(o => o.name === "standard-goal-floor")) {
      assert.equal(goal.geometry.parameters.width, RL.GOAL_HALF_W * 0.02);
      assert.equal(goal.geometry.parameters.height, RL.GOAL_DEPTH * 0.01);
      assert.equal(Math.abs(goal.position.z), (RL.HALF_L + RL.GOAL_DEPTH / 2) * 0.01);
    }
    assert.equal(stadium.children.filter(o => o.name === "collision-matched-arena-surface").length, 3);
    stadium.userData.dispose();
  } finally { globalThis.document = previous; }
});

test("small-pad recollection matches RocketSim tick 481, without an extra idle tick", () => {
  const pads = createSoccarBoostPads();
  const pad = pads.find(p => !p.big && p.x === 0 && p.y === -4240);
  const car = { pos: new THREE.Vector3(pad.x, pad.y, 17), boost: 0, id: 1 };
  stepBoostPads(pads, car, RL.DT);
  assert.equal(car.boost, 12);
  stepBoostPads(pads, car, RL.DT);
  assert.equal(pad._lockedCarId, null); // grounded root no longer overlaps locked pad box
  for (let tick = 3; tick <= 480; tick++) stepBoostPads(pads, car, RL.DT);
  assert.equal(car.boost, 12);
  assert(pad.timer > 0);
  stepBoostPads(pads, car, RL.DT);
  assert.equal(car.boost, 24);
  assert.equal(pad.timer, 4);
});

test("pickup radius boundary is strict, not inclusive", () => {
  const pads = createSoccarBoostPads();
  const pad = pads[0];
  const car = { pos: new THREE.Vector3(pad.x + pad.radius, pad.y, pad.z), boost: 0, id: 1 };
  stepBoostPads([pad], car, RL.DT);
  assert.equal(car.boost, 0);
  car.pos.x -= 0.001;
  stepBoostPads([pad], car, RL.DT);
  assert.equal(car.boost, 12);
});

test("locked-pad contact intersects the car hitbox, not only its root", () => {
  const pad = createSoccarBoostPads()[0];
  const car = makeCar(new THREE.Vector3(pad.x, pad.y, 60), 0);
  car.id = 1; car.boost = 0;
  pad._lockedCarId = 1;
  // Car root is below pad.z, but the roof/hitbox overlaps its locked AABB.
  stepBoostPads([pad], car, RL.DT);
  assert.equal(car.boost, 12);
});

test("standard pad grid leaves pads available for full-boost and demoed cars", () => {
  for (const state of [{ boost: 100 }, { boost: 0, isDemoed: true }]) {
    const pad = createSoccarBoostPads()[0];
    const car = { pos: new THREE.Vector3(pad.x, pad.y, 17), id: 1, ...state };
    stepBoostPads([pad], car, RL.DT);
    assert.equal(pad.active, true);
    assert.equal(pad.timer, 0);
    assert.equal(pad._lockedCarId, null);
  }
});

test("standard dimensions use centimetres consistently across render and physics", () => {
  assert.equal(RL.HALF_W * 2, 8192);
  assert.equal(RL.HALF_L * 2, 10240);
  assert.equal(RL.CEILING, 2048);
  assert.equal(RL.GOAL_HALF_W * 2, 1785.51);
  assert.equal(RL.GOAL_HEIGHT, 642.775);
  assert.equal(RL.GOAL_DEPTH, 880);
  assert.equal(RL.BALL_RADIUS * 2, 182.5);
});