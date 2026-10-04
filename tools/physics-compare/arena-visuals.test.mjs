import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createSoccarBoostPads, createBoostPadMeshes, stepBoostPads, resetBoostPads, BOOST_PAD_VISUAL } from "../../src/shared/boostPads.js";
import { RL } from "../../src/shared/rl-physics.js";
import { makeCar } from "../../src/shared/carSim.js";
import { createStadium, createStadiumReflectionScene } from "../../src/shared/stadium.js";
import { BoostTrail } from "../../src/shared/boostTrail.js";
import { disposeCarVisualMaterials } from "../../src/shared/car.js";
import { disposeScene } from "../../src/shared/disposeScene.js";
import viteConfig from "../../vite.config.js";
import { SOCCAR_TRI_COUNT, SOCCAR_TRIS, SOCCAR_BT_TRIS, SOCCAR_QUERY_ORDER, SOCCAR_MESH_ENDS } from "../../src/shared/soccarMeshData.js";
import { RenderPose } from "../../src/shared/renderPose.js";
import { FixedStepClock } from "../../src/shared/aerial.js";
import { prepareCarVisual } from "../../src/shared/carVisualCalibration.js";
import { SurfaceEffects, ContactEffects, updateGroundShadow } from "../../src/shared/surfaceEffects.js";

test("stadium reflections match field orientation and release bake resources", () => {
  const source = createStadiumReflectionScene();
  const floor = source.getObjectByName("reflection-turf");
  assert.equal(floor.geometry.parameters.width, RL.HALF_W * 0.02);
  assert.equal(floor.geometry.parameters.depth, RL.HALF_L * 0.02);
  assert(floor.position.y < 0);
  const ends = source.children.filter(object => object.name === "reflection-team-end");
  assert.deepEqual(ends.map(object => object.position.z), [-RL.HALF_L * 0.01, RL.HALF_L * 0.01]);
  assert(ends[0].material.color.b > ends[0].material.color.r);
  assert(ends[1].material.color.r > ends[1].material.color.b);
  const lights = source.children.filter(object => object.name === "reflection-floodlight");
  assert.equal(lights.length, 12);
  assert(lights.every(object => object.material.color.r > 1 && object.position.y > 10));
  let disposed = 0;
  source.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.addEventListener("dispose", () => disposed++);
    object.material.addEventListener("dispose", () => disposed++);
  });
  source.userData.dispose();
  assert.equal(disposed, source.children.length * 2);
});

test("contact shadows use surface clearance and fade as objects lift", () => {
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  const position = new THREE.Vector3(4, 0.9125, 8);
  updateGroundShadow(shadow, position, 2, 2, 0.9125);
  assert.deepEqual(shadow.position.toArray(), [4, 0.025, 8]);
  assert.deepEqual(shadow.scale.toArray(), [2, 2, 1]);
  assert.equal(shadow.material.opacity, 0.78);
  position.y += 10;
  updateGroundShadow(shadow, position, 2, 2, 0.9125);
  assert(shadow.material.opacity < 0.25);
  assert.deepEqual(shadow.scale.toArray(), [2.5, 2.5, 1]);
  shadow.geometry.dispose(); shadow.material.dispose();
});

test("shared live effects gate ground trails, reset teleports and clean up", context => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) }) };
  context.after(() => { globalThis.document = previous; });
  const root = new THREE.Group();
  const car = new THREE.Group();
  car.position.y = 0.17;
  const surface = new SurfaceEffects(root);
  const contact = new ContactEffects(root);
  surface.update(car, false, 500, 1 / 60);
  assert.equal(surface.marks.count, 0);
  for (let tick = 0; tick < 120; tick++) surface.update(car, true, 500, 1 / 60);
  assert(surface.marks.count > 0 && surface.marks.count <= 64);
  assert(surface.history.length <= 64);
  assert([...surface.marks.instanceMatrix.array].every(Number.isFinite));
  for (let tick = 0; tick < 60; tick++) surface.update(car, false, 500, 1 / 60);
  assert.equal(surface.marks.count, 0);
  contact.hit(new THREE.Vector3(1, 2, 3));
  contact.update(0.05);
  assert(contact.mesh.visible);
  assert.equal(contact.mesh.material.wireframe, false);
  contact.update(0.4);
  assert.equal(contact.mesh.visible, false);
  surface.update(car, true, 500, 1 / 60);
  car.position.x = 20;
  surface.update(car, false, 500, 1 / 60);
  assert.equal(surface.history.length, 0);
  surface.reset();
  contact.reset();
  surface.dispose();
  contact.dispose();
  assert.equal(root.children.length, 0);
});

test("wheel detailing shares geometry and preserves calibrated centers and radii", () => {
  const build = () => {
    const visual = new THREE.Group();
    for (const corner of ["FR", "FL", "BR", "BL"]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 32), new THREE.MeshStandardMaterial());
      wheel.geometry.rotateZ(Math.PI / 2);
      wheel.name = `${corner}_Wheel`;
      wheel.position.set(corner.endsWith("R") ? -0.6 : 0.6, 0.3, corner.startsWith("F") ? 0.5 : -0.4);
      visual.add(wheel);
    }
    const before = new THREE.Box3().setFromObject(visual);
    prepareCarVisual(visual, "fennec");
    return { visual, before };
  };
  const first = build(), second = build();
  const after = new THREE.Box3().setFromObject(first.visual);
  assert(after.min.distanceTo(first.before.min) < 0.002);
  assert(after.max.distanceTo(first.before.max) < 0.002);
  assert.equal(first.visual.userData.calibratedWheels.length, 4);
  for (const wheel of first.visual.userData.calibratedWheels) {
    assert(Math.abs(wheel.radius - 0.3) < 1e-6);
    assert.deepEqual(wheel.pivot.position.toArray(), wheel.center.toArray());
    assert.equal(wheel.pivot.children.filter(child => child.name.startsWith("wheel-detail-")).length, 2);
  }
  const detail = first.visual.getObjectByName("wheel-detail-rim");
  assert.equal(detail.geometry, second.visual.getObjectByName("wheel-detail-rim").geometry);
  assert.notEqual(detail.material, second.visual.getObjectByName("wheel-detail-rim").material);
  for (const { visual } of [first, second]) {
    disposeCarVisualMaterials({ userData: { visual } });
    visual.traverse(object => { if (object.isMesh && !object.name.startsWith("wheel-detail-")) object.geometry.dispose(); });
  }
});

test("render motion stays continuous at irregular display intervals", () => {
  const clock = new FixedStepClock();
  const pose = new RenderPose();
  const state = { pos: new THREE.Vector3(), vel: new THREE.Vector3(120, 0, 0), q: new THREE.Quaternion() };
  let elapsed = 0;
  for (const duration of [1 / 144, 1 / 144, 1 / 90, 1 / 240, 1 / 60, 1 / 144]) {
    elapsed += duration;
    clock.advance(duration, tickDuration => {
      pose.capture(state);
      state.pos.addScaledVector(state.vel, tickDuration);
    });
    const sample = pose.sample(state, clock.acc / RL.DT);
    assert.ok(Math.abs(sample.position.x - Math.max(0, elapsed - RL.DT) * 120) < 1e-10);
  }
});

test("render poses interpolate without mutating physics and snap on resets or teleports", () => {
  const pose = new RenderPose();
  const state = { pos: new THREE.Vector3(), vel: new THREE.Vector3(120, 0, 0), q: new THREE.Quaternion() };
  pose.capture(state);
  state.pos.x = 1;
  state.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  pose.sample(state, 0.5);
  assert.equal(pose.position.x, 0.5);
  assert.ok(Math.abs(pose.rotation.angleTo(new THREE.Quaternion()) - Math.PI / 4) < 1e-10);
  assert.equal(state.pos.x, 1);
  state.pos.x = 1000;
  assert.equal(pose.sample(state, 0.5).position.x, 1000);
  pose.reset();
  state.pos.x = 5;
  assert.equal(pose.sample(state, 0).position.x, 5);
});

test("compact production arena data preserves every Float32 coordinate exactly", async () => {
  const plugin = viteConfig.plugins.find(plugin => plugin.name === "compact-arena-data");
  const transformed = plugin.transform("", "/src/shared/soccarMeshData.js");
  const compact = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString("base64")}`);
  assert.equal(compact.SOCCAR_TRI_COUNT, SOCCAR_TRI_COUNT);
  assert.deepEqual(compact.SOCCAR_TRIS, SOCCAR_TRIS);
  assert.deepEqual(compact.SOCCAR_BT_TRIS, SOCCAR_BT_TRIS);
  assert.deepEqual(compact.SOCCAR_QUERY_ORDER, SOCCAR_QUERY_ORDER);
  assert.deepEqual(compact.SOCCAR_MESH_ENDS, SOCCAR_MESH_ENDS);
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
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop() { } }), fillRect() { },
      })
    })
  };
  try {
    const parent = new THREE.Group(), car = new THREE.Group();
    parent.add(car);
    const trail = new BoostTrail(parent, { max: 8 });
    trail.attachFlames(car);
    assert.equal(trail.flames.children.length, 2);
    assert(trail.flames.children.every(flame => flame.children.length === 14));
    assert(trail.flames.children.every(flame => flame.children.every(puff => puff.isSprite && puff.position.z <= 0)));
    const identities = new Set(trail._pool);
    trail.update(car, true, 0, 0);
    const idleLength = trail.flames.children[0].scale.z;
    trail.update(car, true, 0, 23);
    assert(trail.flames.children[0].scale.z > idleLength * 1.5);
    assert(trail.flames.children[0].children[0].material.opacity > trail.flames.children[0].children[8].material.opacity);
    for (let tick = 0; tick < 240; tick++) trail.update(car, true, 1 / 120);
    assert.equal(trail.particles.length + trail._pool.length, 8);
    assert([...trail.particles, ...trail._pool].every(particle => identities.has(particle)));
    assert([...trail.geo.attributes.position.array].every(Number.isFinite));
    for (let tick = 0; tick < 120; tick++) trail.update(car, false, 1 / 120);
    assert.equal(trail.particles.length, 0);
    assert.equal(trail.points.visible, false);
    assert(trail.flames.children.every(flame => !flame.visible));
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
  assert.equal(root.children[0].children.filter(child => child.isInstancedMesh).length, 7);
  for (const pad of pads) {
    assert.equal(pad.mesh.position.x, pad.x * 0.01);
    assert.equal(pad.mesh.position.z, pad.y * 0.01);
    const radius = (pad.big ? BOOST_PAD_VISUAL.BIG_RADIUS : BOOST_PAD_VISUAL.SMALL_RADIUS) * 0.01;
    assert.equal(pad.mesh.geometry.parameters.radiusBottom, radius);
    assert.equal(pad.mesh.geometry.parameters.radiusTop, radius * 0.94);
    assert.equal(pad.mesh.material.metalness, 0.72);
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
  const matrix = new THREE.Matrix4();
  for (const child of pad.mesh.children) {
    const instance = child.userData.padInstance;
    instance.instances.getMatrixAt(instance.index, matrix);
    assert.equal(matrix.determinant(), 0);
  }
  assert.equal(pad.mesh.material.emissiveIntensity, 0);
  resetBoostPads(pads);
  assert(pad.mesh.children.every(child => child.visible));
  for (const child of pad.mesh.children) {
    const instance = child.userData.padInstance;
    instance.instances.getMatrixAt(instance.index, matrix);
    assert(Math.abs(matrix.determinant() - 1) < 1e-6);
  }
  assert.equal(pad.mesh.material.emissiveIntensity, 0.65);
});

test("neon-city scenery stays outside play and the floor retains soccar dimensions", () => {
  // Geometry checks don't require an actual browser canvas or WebGL context.
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() { }, strokeRect() { }, fillText() { } }) }) };
  try {
    const stadium = createStadium();
    const surfaces = stadium.children.filter(object => object.name === "collision-matched-arena-surface");
    assert(surfaces.every(surface => surface.material.side === THREE.BackSide));
    const ramp = surfaces.find(surface => surface.material.name === "arena-ramp-finish");
    const positions = ramp.geometry.attributes.position;
    const first = new THREE.Vector3().fromBufferAttribute(positions, 0);
    const second = new THREE.Vector3().fromBufferAttribute(positions, 1);
    const third = new THREE.Vector3().fromBufferAttribute(positions, 2);
    const rampCenter = first.clone().add(second).add(third).divideScalar(3);
    const rampNormal = second.clone().sub(first).cross(third.clone().sub(first)).normalize();
    ramp.updateMatrixWorld(true);
    const insideRay = new THREE.Raycaster(rampCenter.clone().addScaledVector(rampNormal, -0.01), rampNormal, 0, 0.02);
    const outsideRay = new THREE.Raycaster(rampCenter.clone().addScaledVector(rampNormal, 0.01), rampNormal.clone().negate(), 0, 0.02);
    assert(insideRay.intersectObject(ramp).length > 0);
    assert.equal(outsideRay.intersectObject(ramp).length, 0);
    let meshes = 0;
    stadium.traverse(object => {
      assert.equal(object.matrixAutoUpdate, false);
      if (object.isMesh) meshes++;
    });
    assert(meshes < 70);
    const nets = stadium.children.filter(object => object.name === "goal-net-panel");
    assert.equal(nets.length, 0);
    const mouthFrames = stadium.children.filter(object => object.name === "goal-mouth-frame");
    assert.equal(mouthFrames.length, 2);
    const rearFrames = stadium.children.filter(object => object.name === "goal-rear-frame");
    assert.equal(rearFrames.length, 0);
    const reveals = stadium.children.filter(object => object.name === "goal-mouth-reveal");
    assert.equal(reveals.length, 2);
    for (const reveal of reveals) {
      reveal.geometry.computeBoundingBox();
      const bounds = reveal.geometry.boundingBox;
      const depths = [Math.abs(bounds.min.z), Math.abs(bounds.max.z)].sort((start, end) => start - end);
      assert(depths[0] < RL.HALF_L * 0.01 - 0.16);
      assert(depths[1] > RL.HALF_L * 0.01 + 0.07);
      assert([...reveal.geometry.attributes.normal.array].every(Number.isFinite));
    }
    for (const frame of mouthFrames) {
      const path = frame.geometry.parameters.path;
      const crown = path.getPoint(0.5);
      assert(Math.abs(crown.y - 6.64) < 1e-5);
      assert(Math.abs(crown.x) < 1e-5);
      assert(Math.abs(Math.abs(path.getPoint(0).x) - 9.2) < 1e-5);
      assert.equal(frame.geometry.parameters.radius, 0.16);
      assert.equal(frame.geometry.parameters.radialSegments, 24);
      const positions = frame.geometry.attributes.position;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        assert(Math.abs(positions.getZ(vertex)) < RL.HALF_L * 0.01 - 0.01);
      }
      const tangent = path.getTangent(0.5);
      assert(Math.abs(tangent.y) < 1e-5 && Math.abs(tangent.z) < 1e-5);
    }
    const spectators = stadium.getObjectByName("stadium-spectators");
    assert.equal(spectators.count, 2940);
    assert([...spectators.instanceMatrix.array].every(Number.isFinite));
    const enclosure = stadium.getObjectByName("stadium-hex-enclosure");
    const edges = enclosure.geometry.attributes.position;
    const edgeKeys = new Set();
    let diagonalEdges = 0;
    for (let vertex = 0; vertex < edges.count; vertex += 2) {
      const endpoints = [vertex, vertex + 1].map(index => [edges.getX(index), edges.getY(index), edges.getZ(index)]);
      for (const [across, up, along] of endpoints) {
        assert(Math.abs(across) <= RL.HALF_W * 0.01 + 1e-5);
        assert(Math.abs(along) <= RL.HALF_L * 0.01 + 1e-5);
        assert(up >= 3.2 - 1e-5 && up <= RL.CEILING * 0.01 + 1e-5);
      }
      const key = endpoints.map(point => point.map(value => value.toFixed(4)).join(",")).sort().join(":");
      assert(!edgeKeys.has(key)); edgeKeys.add(key);
      if (Math.abs(endpoints[0][0] - endpoints[1][0]) > 0.1 && Math.abs(endpoints[0][2] - endpoints[1][2]) > 0.1) diagonalEdges++;
    }
    assert(diagonalEdges > 100);
    assert(edges.count < 30000);
    assert(enclosure.material.opacity < 0.1);
    assert.equal(stadium.getObjectByName("neon-city-backdrop").children.filter(object => object.name === "city-light-accents").length, 3);
    const floor = stadium.getObjectByName("standard-soccar-floor");
    assert.equal(floor.material.map.name, "soccar-detailed-pitch");
    assert.equal(floor.material.map.image.width, 2048);
    assert.equal(floor.material.bumpMap.name, "turf-blade-relief");
    const grass = stadium.getObjectByName("short-cut-pitch-grass");
    assert.equal(grass.count, 180000);
    assert([...grass.instanceMatrix.array].every(Number.isFinite));
    grass.geometry.computeBoundingBox();
    assert(grass.geometry.boundingBox.max.y < 0.018);
    assert.equal(floor.geometry.parameters.width, RL.HALF_W * 0.02);
    assert.equal(floor.geometry.parameters.height, RL.HALF_L * 0.02);
    assert.equal(floor.receiveShadow, true);
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
      assert.equal(goal.receiveShadow, true);
      const positions = goal.geometry.attributes.position, uv = goal.geometry.attributes.uv;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        assert(Math.abs(uv.getX(vertex) - (positions.getX(vertex) / floor.geometry.parameters.width + 0.5)) < 1e-6);
        assert(Math.abs(uv.getY(vertex) - (0.5 - (goal.position.z - positions.getY(vertex)) / floor.geometry.parameters.height)) < 1e-6);
      }
    }
    assert.equal(stadium.children.filter(o => o.name === "collision-matched-arena-surface").length, 4);
    const shellSurfaces = stadium.children.filter(object => object.name === "collision-matched-arena-surface");
    const teamRails = stadium.children.filter(object => object.name === "surface-mounted-team-rail");
    assert.equal(teamRails.length, 4);
    const decoration = [teamRails[0], stadium.getObjectByName("continuous-stadium-fascia"), stadium.getObjectByName("static-stadium-batch")];
    stadium.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera();
    for (const object of decoration) {
      const shader = { uniforms: {}, vertexShader: "#include <project_vertex>", fragmentShader: "#include <clipping_planes_fragment>" };
      object.material.onBeforeCompile(shader);
      assert(shader.fragmentShader.includes("discard;"));
      assert(shader.vertexShader.includes("instanceMatrix * stadiumPosition"));
      for (const [position, outside] of [[[0, 2, 0], false], [[0, 2, 55], false], [[44, 2, 0], true], [[44, 3.14, 0], true], [[40, 2, 50], true], [[0, 2, 62], true], [[0, 23, 0], true]]) {
        camera.position.set(...position);
        camera.updateMatrixWorld(true);
        object.onBeforeRender(null, null, camera);
        const plane = shader.uniforms.stadiumCutaway.value;
        const near = camera.position.clone();
        assert.equal(plane.x * near.x + plane.y * near.y + plane.z * near.z + plane.w > 0, outside);
        const far = new THREE.Vector3(-position[0], 1, -position[2]);
        assert(plane.x * far.x + plane.y * far.y + plane.z * far.z + plane.w <= 0);
      }
    }
    const railOrigin = new THREE.Vector3(0, 3.14, 0);
    const railRay = new THREE.Raycaster();
    stadium.updateMatrixWorld(true);
    for (const rail of teamRails) {
      for (const segment of rail.geometry.parameters.path.curves) {
        const point = segment.v1;
        railRay.set(railOrigin, point.clone().sub(railOrigin).normalize());
        const hit = railRay.intersectObjects(shellSurfaces, false)[0];
        assert(hit);
        assert(Math.abs(hit.distance - point.distanceTo(railOrigin) - 0.12) < 1e-4);
      }
      for (let sample = 0; sample <= 300; sample++) {
        const point = rail.geometry.parameters.path.getPoint(sample / 300);
        railRay.set(railOrigin, point.clone().sub(railOrigin).normalize());
        const hit = railRay.intersectObjects(shellSurfaces, false)[0];
        assert(hit && hit.distance - point.distanceTo(railOrigin) > 0.06);
      }
    }
    const wallPosts = stadium.children.filter(object => object.name === "surface-mounted-wall-post");
    assert(wallPosts.length > 0);
    for (const post of wallPosts) {
      for (const segment of post.geometry.parameters.path.curves) {
        const point = segment.v1;
        const origin = new THREE.Vector3(0, point.y, point.z);
        railRay.set(origin, new THREE.Vector3(Math.sign(point.x), 0, 0));
        const hit = railRay.intersectObjects(shellSurfaces, false)[0];
        assert(hit && hit.distance - Math.abs(point.x) > 0.1);
      }
    }
    for (const surface of shellSurfaces.filter(object => object.material.transparent)) {
      const positions = surface.geometry.attributes.position;
      for (let vertex = 0; vertex < positions.count; vertex++) assert(positions.getY(vertex) >= 3.2 - 1e-5);
    }
    const backing = shellSurfaces.find(object => object.material.name === "goal-interior-finish");
    assert.equal(backing.material.depthWrite, true);
    assert(backing.geometry.index);
    assert.equal(backing.material.customProgramCacheKey(), "arena-panel-joints-v3");
    assert.equal(backing.material.color.getHex(), shellSurfaces[0].material.color.getHex());
    const shader = { vertexShader: "#include <begin_vertex>", fragmentShader: "#include <color_fragment>" };
    backing.material.onBeforeCompile(shader);
    assert(shader.fragmentShader.includes("diffuseColor.rgb *= 1.0 - joint * 0.12;"));
    assert(!shader.fragmentShader.includes("curvedFinish"));
    assert(backing.material.color.getHex() !== 0x182329);
    assert(stadium.getObjectByName("continuous-stadium-fascia"));
    assert(stadium.getObjectByName("continuous-stadium-light"));
    for (const name of ["continuous-stadium-fascia", "continuous-stadium-light"]) {
      const trim = stadium.getObjectByName(name);
      const positions = trim.geometry.attributes.position;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        if (Math.abs(positions.getX(vertex)) < 9.3 && Math.abs(positions.getZ(vertex)) > RL.HALF_L * 0.01) {
          assert(positions.getY(vertex) + trim.position.y > 6.8);
        }
      }
    }
    assert([...backing.geometry.attributes.position.array].some((value, index) => index % 3 === 1 && value > RL.GOAL_HEIGHT * 0.01 - 0.2));
    assert.equal(city.children.filter(object => object.name === "city-architectural-details").length, 2);
    const turf = stadium.getObjectByName("standard-soccar-floor").material;
    assert.notEqual(turf.map, turf.bumpMap);
    assert.equal(turf.bumpMap.colorSpace, THREE.NoColorSpace);
    assert.deepEqual(turf.map.repeat.toArray(), [1, 1]);
    assert.deepEqual(turf.bumpMap.repeat.toArray(), [RL.HALF_W * 0.01, RL.HALF_L * 0.01]);
    const fieldPaint = stadium.children.find(object => object.material?.name === "field-paint").material;
    assert.equal(fieldPaint.isMeshStandardMaterial, true);
    assert.equal(fieldPaint.transparent, false);
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