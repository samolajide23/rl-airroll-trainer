import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RL } from "./rl-physics.js";
import { UU } from "./rl-units.js";
import { SOCCAR_TRIS } from "./soccarMeshData.js";
import { createNeonCity } from "./neonCity.js";

const BLUE = 0x399fd6, ORANGE = 0xed9250;

class GoalMouthCurve extends THREE.Curve {
  constructor(depth, radius) {
    super();
    this.depth = depth;
    this.radius = radius;
  }

  getPoint(amount, target = new THREE.Vector3()) {
    const cornerX = 8, cornerY = 5.44;
    const arcLength = Math.PI * this.radius / 2;
    let distance = amount * (cornerY * 2 + arcLength * 2 + cornerX * 2);
    if (distance <= cornerY) return target.set(-cornerX - this.radius, distance, this.depth);
    distance -= cornerY;
    if (distance <= arcLength) {
      const angle = Math.PI - distance / this.radius;
      return target.set(-cornerX + Math.cos(angle) * this.radius, cornerY + Math.sin(angle) * this.radius, this.depth);
    }
    distance -= arcLength;
    if (distance <= cornerX * 2) return target.set(-cornerX + distance, cornerY + this.radius, this.depth);
    distance -= cornerX * 2;
    if (distance <= arcLength) {
      const angle = Math.PI / 2 - distance / this.radius;
      return target.set(cornerX + Math.cos(angle) * this.radius, cornerY + Math.sin(angle) * this.radius, this.depth);
    }
    return target.set(cornerX + this.radius, cornerY - (distance - arcLength), this.depth);
  }
}

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
    add("reflection-stands", [5, 10, halfLength * 2], [side * (halfWidth + 4), 7, 0], 0x343e40);
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
  canvas.width = canvas.height = detail ? 1024 : 2048;
  const ctx = canvas.getContext("2d");
  for (let row = 0; row < 16; row++) {
    for (let column = 0; column < 12; column++) {
      ctx.fillStyle = detail ? "#808080" : (row + column) % 2 ? "#466744" : "#3b5b3c";
      ctx.fillRect(column * canvas.width / 12, row * canvas.height / 16, canvas.width / 12 + 1, canvas.height / 16 + 1);
    }
  }
  if (!detail) {
    const halfWidth = RL.HALF_W * UU, halfLength = RL.HALF_L * UU;
    for (let row = 0; row < 1024; row++) {
      const along = (row / 1024 - 0.5) * halfLength * 2;
      for (let column = 0; column < 1024; column++) {
        const across = (column / 1024 - 0.5) * halfWidth * 2;
        const endDistance = halfLength - Math.abs(along);
        const radius = Math.hypot(across, along);
        const teamColor = along < 0 ? "rgba(57,159,214,.48)" : "rgba(237,146,80,.48)";
        let color;
        if (Math.abs(across) < 15 && endDistance > 1.5 && endDistance < 17) {
          const chevron = ((endDistance + Math.abs(across) * 0.75) % 3.2 + 3.2) % 3.2;
          color = chevron < 1.2 ? teamColor : "rgba(20,37,31,.2)";
          if (Math.abs(across) > 14.7 || endDistance < 1.7 || endDistance > 16.8) color = teamColor;
        } else if (radius > 1.2 && radius < 8.9) {
          const spoke = ((Math.atan2(along, across) * 12 / Math.PI) % 1 + 1) % 1;
          if (radius > 8.6 || radius < 1.45 || (spoke < 0.24 && radius > 2.3)) color = teamColor;
        } else if (Math.abs(across) > 31 && Math.abs(across) < 31.12 && endDistance > 13) {
          color = "rgba(175,205,188,.2)";
        }
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(column * 2, row * 2, 2, 2);
        }
      }
    }
  }
  let seed = 8217;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < (detail ? 70000 : 180000); i++) {
    ctx.fillStyle = detail
      ? (random() > 0.5 ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.2)")
      : (random() > 0.5 ? "rgba(173,194,128,.15)" : "rgba(14,35,12,.19)");
    const across = random() * canvas.width, along = random() * canvas.height;
    ctx.fillRect(across, along, detail ? 0.8 : 0.6 + random(), detail ? 1 + random() * 2.5 : 1 + random() * 3);
    if (!detail && i % 120 === 0) {
      ctx.fillStyle = "rgba(149,139,90,.055)";
      ctx.fillRect(across, along, 2 + random() * 4, 8 + random() * 16);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = detail ? "turf-blade-relief" : "soccar-detailed-pitch";
  texture.colorSpace = detail ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(detail ? RL.HALF_W * UU : 1, detail ? RL.HALF_L * UU : 1);
  texture.anisotropy = 16;
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
  const paint = new THREE.MeshStandardMaterial({ color: 0xe5ebe4, roughness: 0.88, metalness: 0, depthWrite: false });
  paint.name = "field-paint";
  const dark = new THREE.MeshStandardMaterial({ color: 0x929d99, roughness: 0.78, metalness: 0.12, side: THREE.BackSide });
  dark.name = "arena-ramp-finish";
  const blue = new THREE.MeshStandardMaterial({ color: 0xb1d0db, roughness: 0.65, metalness: 0, side: THREE.BackSide, transparent: true, opacity: 0.08, depthWrite: false });
  const orange = blue.clone();
  const goalLining = dark.clone();
  goalLining.name = "goal-interior-finish";
  for (const material of [dark, goalLining]) {
    material.onBeforeCompile = shader => {
      shader.vertexShader = "varying vec3 vPanelPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvPanelPosition = (modelMatrix * vec4(position, 1.0)).xyz;");
      shader.fragmentShader = "varying vec3 vPanelPosition;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        vec3 panelGrid = abs(fract(vPanelPosition / vec3(4.0, 0.8, 4.0) + 0.5) - 0.5);
        vec3 panelWidth = max(fwidth(vPanelPosition / vec3(4.0, 0.8, 4.0)), vec3(0.002));
        vec3 panelJoint = 1.0 - smoothstep(panelWidth, panelWidth * 2.0, panelGrid);
        vec3 surfaceNormal = abs(normalize(cross(dFdx(vPanelPosition), dFdy(vPanelPosition))));
        float joint = max(panelJoint.y * (1.0 - surfaceNormal.y), max(panelJoint.x * surfaceNormal.z, panelJoint.z * surfaceNormal.x));
        diffuseColor.rgb *= 1.0 - joint * 0.12;
      `);
    };
    material.customProgramCacheKey = () => "arena-panel-joints-v3";
  }
  const shell = new THREE.BufferGeometry();
  const shellPoints = [];
  for (let i = 0; i < SOCCAR_TRIS.length; i += 9) {
    for (let j = 0; j < 9; j += 3) shellPoints.push(SOCCAR_TRIS[i + j] * UU, SOCCAR_TRIS[i + j + 2] * UU, SOCCAR_TRIS[i + j + 1] * UU);
  }
  shell.setAttribute("position", new THREE.Float32BufferAttribute(shellPoints, 3));
  const smooth = mergeVertices(shell);
  smooth.computeVertexNormals();
  const buckets = [[], [], [], []], normalBuckets = [[], [], [], []];
  const rampHeight = 3.2;
  const clip = (polygon, below) => {
    const result = [];
    for (let vertex = 0; vertex < polygon.length; vertex++) {
      const start = polygon[vertex], end = polygon[(vertex + 1) % polygon.length];
      const startInside = below ? start.position.y <= rampHeight : start.position.y >= rampHeight;
      const endInside = below ? end.position.y <= rampHeight : end.position.y >= rampHeight;
      if (startInside) result.push(start);
      if (startInside !== endInside) {
        const amount = (rampHeight - start.position.y) / (end.position.y - start.position.y);
        result.push({ position: start.position.clone().lerp(end.position, amount), normal: start.normal.clone().lerp(end.normal, amount).normalize() });
      }
    }
    return result;
  };
  const append = (polygon, bucket) => {
    for (let vertex = 1; vertex < polygon.length - 1; vertex++) {
      for (const point of [polygon[0], polygon[vertex], polygon[vertex + 1]]) {
        buckets[bucket].push(...point.position.toArray());
        normalBuckets[bucket].push(...point.normal.toArray());
      }
    }
  };
  const refineRamp = (polygon, depth = 2) => {
    if (!depth) {
      append(clip(polygon, true), 0);
      append(clip(polygon, false), polygon[0].position.z < 0 ? 1 : 2);
      return;
    }
    const midpoints = polygon.map((start, index) => {
      const end = polygon[(index + 1) % 3];
      const position = start.position.clone().lerp(end.position, 0.5);
      return { position, normal: start.normal.clone().add(end.normal).normalize() };
    });
    refineRamp([polygon[0], midpoints[0], midpoints[2]], depth - 1);
    refineRamp([midpoints[0], polygon[1], midpoints[1]], depth - 1);
    refineRamp([midpoints[2], midpoints[1], polygon[2]], depth - 1);
    refineRamp(midpoints, depth - 1);
  };
  for (let triangle = 0; triangle < smooth.index.count; triangle += 3) {
    const polygon = [0, 1, 2].map(offset => {
      const vertex = smooth.index.getX(triangle + offset);
      return { position: new THREE.Vector3().fromBufferAttribute(smooth.attributes.position, vertex), normal: new THREE.Vector3().fromBufferAttribute(smooth.attributes.normal, vertex) };
    });
    const center = polygon.reduce((sum, point) => sum.add(point.position), new THREE.Vector3()).divideScalar(3);
    if (Math.abs(center.z) > hl + 0.05 && Math.abs(center.x) <= gw + 1 && center.y <= gh + 0.5) {
      append(polygon, 3);
    } else if (polygon.some(point => point.position.y < rampHeight) && polygon.some(point => point.normal.y > 0.05 && point.normal.y < 0.99)) {
      refineRamp(polygon);
    } else {
      append(clip(polygon, true), 0);
      append(clip(polygon, false), center.z < 0 ? 1 : 2);
    }
  }
  shell.dispose();
  smooth.dispose();
  buckets.forEach((points, index) => {
    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normalBuckets[index], 3));
    if (index === 3) {
      const lining = mergeVertices(geometry);
      geometry.dispose();
      geometry = lining;
    }
    const mesh = new THREE.Mesh(geometry, [dark, blue, orange, goalLining][index]);
    mesh.name = "collision-matched-arena-surface";
    mesh.receiveShadow = true;
    root.add(mesh);
  });
  const box = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const perimeterPoints = [];
  const cornerRadius = 1152 * UU;
  for (const [across, along, start] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]]) {
    for (let step = 0; step <= 24; step++) {
      const angle = start + step / 24 * Math.PI / 2;
      perimeterPoints.push(new THREE.Vector3(across * (hw - cornerRadius) + Math.cos(angle) * (cornerRadius + 1.2), 5.8, along * (hl - cornerRadius) + Math.sin(angle) * (cornerRadius + 1.2)));
    }
  }
  const architecture = new THREE.MeshStandardMaterial({ color: 0x465351, roughness: 0.68, metalness: 0.25 });
  const perimeterCurve = new THREE.CurvePath();
  for (let point = 0; point < perimeterPoints.length; point++) {
    const start = perimeterPoints[point], end = perimeterPoints[(point + 1) % perimeterPoints.length];
    const crossesGoal = start.z * end.z > 0 && start.x * end.x < 0;
    const route = crossesGoal ? [start,
      new THREE.Vector3(Math.sign(start.x) * 11, 5.8, start.z),
      new THREE.Vector3(Math.sign(start.x) * 10, 7.4, start.z),
      new THREE.Vector3(Math.sign(end.x) * 10, 7.4, end.z),
      new THREE.Vector3(Math.sign(end.x) * 11, 5.8, end.z), end] : [start, end];
    for (let segment = 1; segment < route.length; segment++) perimeterCurve.add(new THREE.LineCurve3(route[segment - 1], route[segment]));
  }
  const fascia = new THREE.Mesh(new THREE.TubeGeometry(perimeterCurve, 320, 0.32, 12, true), architecture);
  fascia.name = "continuous-stadium-fascia";
  root.add(fascia);
  const trim = new THREE.Mesh(new THREE.TubeGeometry(perimeterCurve, 320, 0.045, 8, true), new THREE.MeshBasicMaterial({ color: 0xd8e7e2, toneMapped: false }));
  trim.position.y = -0.35;
  trim.name = "continuous-stadium-light";
  root.add(trim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hl * 2), turf);
  floor.name = "standard-soccar-floor";
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  const bladeGeometry = new THREE.BufferGeometry();
  bladeGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.018, 0, 0, 0.018, 0, 0, 0.006, 0.016, 0,
    0, 0, -0.018, 0, 0, 0.018, 0, 0.014, 0.006,
  ], 3));
  bladeGeometry.computeVertexNormals();
  const bladeMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide });
  bladeMaterial.onBeforeCompile = shader => {
    shader.uniforms.pitchMap = { value: turf.map };
    shader.vertexShader = "varying vec2 vPitchUv; varying float vGrassDistance;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
      vec4 grassWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vPitchUv = vec2(grassWorld.x / ${(hw * 2).toFixed(4)} + 0.5, 0.5 - grassWorld.z / ${(hl * 2).toFixed(4)});
      vGrassDistance = length(mvPosition.xyz);
    `);
    shader.fragmentShader = "uniform sampler2D pitchMap; varying vec2 vPitchUv; varying float vGrassDistance;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float grassFade = 1.0 - smoothstep(14.0, 30.0, vGrassDistance);
      float grassDither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      if (grassDither > grassFade) discard;
      diffuseColor.rgb *= texture2D(pitchMap, vPitchUv).rgb * 1.12;
    `);
  };
  bladeMaterial.customProgramCacheKey = () => "pitch-grass-v1";
  const grass = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, 180000);
  grass.name = "short-cut-pitch-grass";
  const blade = new THREE.Object3D();
  let grassSeed = 941;
  const grassRandom = () => { grassSeed = (Math.imul(grassSeed, 1664525) + 1013904223) >>> 0; return grassSeed / 4294967296; };
  for (let index = 0; index < grass.count; index++) {
    blade.position.set((grassRandom() - 0.5) * (hw * 2 - 12), 0.001, (grassRandom() - 0.5) * (hl * 2 - 12));
    blade.rotation.y = grassRandom() * Math.PI;
    blade.scale.setScalar(0.65 + grassRandom() * 0.35);
    blade.updateMatrix();
    grass.setMatrixAt(index, blade.matrix);
  }
  grass.computeBoundingSphere();
  root.add(grass);
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
    const frame = new THREE.MeshStandardMaterial({ color: sign < 0 ? 0x9acbdb : 0xe0b293, roughness: 0.32, metalness: 0.45, emissive: sign < 0 ? BLUE : ORANGE, emissiveIntensity: 0.08 });
    const postRadius = 0.16;
    const frameDepth = sign * (hl - postRadius - 0.015);
    const frameRadius = 104 * UU + postRadius;
    const mouthCurve = new GoalMouthCurve(frameDepth, frameRadius);
    const mouthFrame = new THREE.Mesh(new THREE.TubeGeometry(mouthCurve, 384, postRadius, 24, false), frame);
    mouthFrame.name = "goal-mouth-frame";
    root.add(mouthFrame);
    const revealPath = new GoalMouthCurve(frameDepth, 104 * UU - 0.005);
    const revealPositions = [];
    for (let segment = 0; segment < 384; segment++) {
      const start = revealPath.getPoint(segment / 384);
      const end = revealPath.getPoint((segment + 1) / 384);
      const backStart = start.clone();
      const backEnd = end.clone();
      backStart.z = backEnd.z = sign * (hl + 0.08);
      for (const point of [start, end, backStart, end, backEnd, backStart]) revealPositions.push(...point.toArray());
    }
    const revealGeometry = new THREE.BufferGeometry();
    revealGeometry.setAttribute("position", new THREE.Float32BufferAttribute(revealPositions, 3));
    const weldedReveal = mergeVertices(revealGeometry);
    revealGeometry.dispose();
    weldedReveal.computeVertexNormals();
    const revealMaterial = frame.clone();
    revealMaterial.side = THREE.DoubleSide;
    const reveal = new THREE.Mesh(weldedReveal, revealMaterial);
    reveal.name = "goal-mouth-reveal";
    root.add(reveal);
    for (const side of [-1, 1]) {
      const radius = 1152 * UU;
      const points = [new THREE.Vector3(side * (gw + 1), 3.14, sign * hl)];
      for (let step = 0; step <= 32; step++) {
        const angle = Math.PI / 2 - step / 32 * Math.PI / 2;
        points.push(new THREE.Vector3(side * (hw - radius + Math.cos(angle) * radius), 3.14, sign * (hl - radius + Math.sin(angle) * radius)));
      }
      points.push(new THREE.Vector3(side * hw, 3.14, 0));
      const samples = [];
      for (let segment = 1; segment < points.length; segment++) {
        const start = points[segment - 1], end = points[segment];
        const steps = Math.ceil(start.distanceTo(end) / 0.4);
        for (let step = 0; step < steps; step++) samples.push(start.clone().lerp(end, step / steps));
      }
      samples.push(points[points.length - 1]);
      const surfaces = root.children.filter(object => object.name === "collision-matched-arena-surface");
      const origin = new THREE.Vector3(0, 3.14, 0);
      const raycaster = new THREE.Raycaster();
      for (const point of samples) {
        const direction = point.clone().sub(origin).normalize();
        raycaster.set(origin, direction);
        const hit = raycaster.intersectObjects(surfaces, false)[0];
        if (hit) point.copy(hit.point).addScaledVector(direction, -0.12);
      }
      const railPath = new THREE.CurvePath();
      for (let point = 1; point < samples.length; point++) railPath.add(new THREE.LineCurve3(samples[point - 1], samples[point]));
      const rail = new THREE.Mesh(new THREE.TubeGeometry(railPath, samples.length * 2, 0.055, 8, false), glow);
      rail.name = "surface-mounted-team-rail";
      root.add(rail);
    }
  }
  for (const x of [-hw, hw]) {
    for (let z = -hl + 12; z <= hl - 12; z += 12.8) {
      const path = new THREE.CurvePath();
      const surfaces = root.children.filter(object => object.name === "collision-matched-arena-surface");
      const raycaster = new THREE.Raycaster();
      let previous;
      for (let step = 0; step <= 64; step++) {
        const up = 3.21 + (height - 3.23) * step / 64;
        const origin = new THREE.Vector3(0, up, z);
        const direction = new THREE.Vector3(Math.sign(x), 0, 0);
        raycaster.set(origin, direction);
        const hit = raycaster.intersectObjects(surfaces, false)[0];
        if (!hit) continue;
        const point = hit.point.clone().addScaledVector(direction, -0.12);
        if (previous) path.add(new THREE.LineCurve3(previous, point));
        previous = point;
      }
      const post = new THREE.Mesh(new THREE.TubeGeometry(path, 128, 0.06, 8, false), dark);
      post.name = "surface-mounted-wall-post";
      root.add(post);
    }
    for (let z = -hl + 16; z <= hl - 16; z += 16) box(0.35, 5.6, 0.45, x + Math.sign(x) * 1.25, 2.8, z, architecture);
  }

  // Instanced seating avoids thousands of individual draw calls.
  const stands = new THREE.MeshStandardMaterial({ color: 0x586460, roughness: 0.85 });
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
  const roof = new THREE.MeshStandardMaterial({ color: 0x252e30, roughness: 0.4, metalness: 0.6 });
  const flood = new THREE.MeshBasicMaterial({ color: 0xe5eee7, toneMapped: false });
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
  root.add(new THREE.HemisphereLight(0xe6eee9, 0x65735f, 1.15));
  const sun = new THREE.DirectionalLight(0xf3f1e8, 1.65); sun.position.set(-30, 65, -35); root.add(sun);

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

  const cutaway = { value: new THREE.Vector4() };
  const cameraPosition = new THREE.Vector3();
  const localCamera = new THREE.Vector3();
  const interior = new THREE.Vector3(0, height / 2, 0);
  const rayInterior = new THREE.Vector3();
  const worldInterior = new THREE.Vector3();
  const inverseRoot = new THREE.Matrix4();
  const direction = new THREE.Vector3();
  const shellRay = new THREE.Raycaster();
  const cutawayShell = root.children.filter(object => object.name === "collision-matched-arena-surface");
  const cachedPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  const cachedRoot = new THREE.Matrix4();
  const updateCutaway = (renderer, scene, camera) => {
    camera.getWorldPosition(cameraPosition);
    if (cachedPosition.equals(cameraPosition) && cachedRoot.equals(root.matrixWorld)) return;
    cachedPosition.copy(cameraPosition);
    cachedRoot.copy(root.matrixWorld);
    inverseRoot.copy(root.matrixWorld).invert();
    localCamera.copy(cameraPosition).applyMatrix4(inverseRoot);
    rayInterior.copy(interior);
    if (Math.abs(localCamera.x) < RL.GOAL_HALF_W * UU && Math.abs(localCamera.z) > hl && localCamera.y < RL.GOAL_HEIGHT * UU) {
      rayInterior.set(0, RL.GOAL_HEIGHT * UU / 2, Math.sign(localCamera.z) * (hl + gd / 2));
    }
    direction.copy(localCamera).sub(rayInterior);
    const distance = direction.length();
    shellRay.set(rayInterior.applyMatrix4(root.matrixWorld), direction.clone().transformDirection(root.matrixWorld));
    const hit = shellRay.intersectObjects(cutawayShell, false)[0];
    const inGoalWidth = Math.abs(localCamera.x) < RL.GOAL_HALF_W * UU && localCamera.y < RL.GOAL_HEIGHT * UU;
    const outside = Math.abs(localCamera.x) > hw || Math.abs(localCamera.z) > hl + (inGoalWidth ? gd : 0) || localCamera.y < 0 || localCamera.y > height || (hit && hit.distance < cameraPosition.distanceTo(shellRay.ray.origin) - 0.001);
    worldInterior.copy(interior).applyMatrix4(root.matrixWorld);
    direction.copy(cameraPosition).sub(worldInterior).normalize();
    cutaway.value.set(direction.x, direction.y, direction.z, outside && distance > 0 ? -direction.dot(worldInterior) : -1e6);
  };
  const decorationMaterials = new Map();
  const shellMaterials = new Set(cutawayShell.map(object => object.material));
  for (const object of root.children) {
    if (!object.isMesh || ["collision-matched-arena-surface", "standard-soccar-floor", "standard-goal-floor", "short-cut-pitch-grass", "stadium-dusk-sky"].includes(object.name)) continue;
    object.onBeforeRender = updateCutaway;
    const prepareMaterial = source => {
      if (decorationMaterials.has(source)) return decorationMaterials.get(source);
      const material = shellMaterials.has(source) ? source.clone() : source;
      decorationMaterials.set(source, material);
      const compile = source.onBeforeCompile;
      const programKey = source.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        shader.uniforms.stadiumCutaway = cutaway;
        shader.vertexShader = "varying vec3 vStadiumPosition;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
          vec4 stadiumPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            stadiumPosition = instanceMatrix * stadiumPosition;
          #endif
          vStadiumPosition = (modelMatrix * stadiumPosition).xyz;`);
        shader.fragmentShader = "uniform vec4 stadiumCutaway; varying vec3 vStadiumPosition;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
          if (dot(stadiumCutaway.xyz, vStadiumPosition) + stadiumCutaway.w > 0.0) discard;`);
      };
      material.customProgramCacheKey = () => `${programKey}-exterior-cutaway-v1`;
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(prepareMaterial) : prepareMaterial(object.material);
  }

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