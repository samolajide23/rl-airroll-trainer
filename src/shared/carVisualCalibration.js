import * as THREE from "three";

/** Dimensional facts only; no exported artwork is bundled. PSK root-space uu.
 * Fennec Body_Grain_SK: FL/BL_WheelTranslation_jnt.
 * Dominus Body_MuscleCar_SK: FL/BL_WheelTranslation_jnt.
 * Octane lacks a supplied export: use the verified simulation wheelbase.
 */
export const BODY_WHEEL_REFERENCE = Object.freeze({
  fennec: { front: 48.81388473510742, rear: -36.51449966430664, source: "exported-skeleton" },
  dominus: { front: 50.33267593383789, rear: -35.16732406616211, source: "exported-skeleton" },
  octane: { front: 51.25, rear: -33.75, source: "RocketSim-wheelbase" },
});

/** Root-relative exhaust approximation from supplied chassis socket metadata. */
export const BODY_EXHAUST_REFERENCE = Object.freeze({
  fennec: { forward: -57, lateral: 20.4278, up: 10.25 },
  dominus: { forward: -57.1688, lateral: 5.48976, up: 9.5 },
  octane: { forward: -60, lateral: 18, up: 10 },
});

export function syncCarExhaust(carMesh, trail) {
  const reference = BODY_EXHAUST_REFERENCE[carMesh.userData.carId] ?? BODY_EXHAUST_REFERENCE.octane;
  const scale = carMesh.scale.x;
  trail.exhaustLocal.set(0, reference.up * 0.01 / scale, reference.forward * 0.01 / scale);
  for (let i = 0; i < trail.flames.children.length; i++) {
    const flame = trail.flames.children[i];
    flame.position.set((i ? 1 : -1) * reference.lateral * 0.01 / scale,
      reference.up * 0.01 / scale, reference.forward * 0.01 / scale);
  }
}

/** Inspect actual wheel meshes; build independent pivots without changing geometry. */
export function prepareCarVisual(visual, carId) {
  const reference = BODY_WHEEL_REFERENCE[carId];
  if (!reference) return;
  visual.updateWorldMatrix(true, true);
  const groups = new Map();
  visual.traverse(obj => {
    if (!obj.isMesh) return;
    const match = obj.name.match(/(?:^|[_ -])(FR|FL|BR|BL)(?:[_ -]|$)/i);
    if (!match) return;
    const key = match[1].toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(obj);
  });
  if (groups.size !== 4) return;
  const wheels = [];
  for (const [corner, meshes] of groups) {
    const box = new THREE.Box3();
    for (const mesh of meshes) box.union(new THREE.Box3().setFromObject(mesh));
    const diameter = box.getSize(new THREE.Vector3());
    const center = visual.worldToLocal(box.getCenter(new THREE.Vector3()));
    const pivot = new THREE.Group();
    pivot.name = `calibrated-wheel-${corner}`;
    pivot.position.copy(center);
    visual.add(pivot);
    for (const mesh of meshes) pivot.attach(mesh);
    wheels.push({ corner, pivot, center: center.clone(), radius: Math.max(diameter.y, diameter.z) / 2, meshes });
  }
  const average = (front) => wheels.filter(w => w.corner.startsWith(front ? "F" : "B")).reduce((sum, w) => sum + w.center.z, 0) / 2;
  const span = average(true) - average(false);
  if (span <= 0.1) return;
  visual.userData.calibration = {
    metersPerUnit: (reference.front - reference.rear) * 0.01 / span,
    rearCenter: average(false), rearUU: reference.rear, source: reference.source,
  };
  visual.userData.calibratedWheels = wheels;
}

/** Apply suspension, steering and rolling to the existing separate wheel meshes. */
export function syncCarWheels(carMesh, car, dt = 0) {
  const visual = carMesh.userData.visual;
  if (visual?.userData.wheels && !visual.userData.calibratedWheels) {
    visual.userData.calibratedWheels = visual.userData.wheels.map(pivot => ({
      corner: `${pivot.position.z > 0 ? "F" : "B"}${pivot.position.x < 0 ? "R" : "L"}`,
      pivot,
      center: pivot.position.clone(),
      radius: pivot.userData.radius * Math.abs(visual.scale.y),
    }));
  }
  const wheels = visual?.userData.calibratedWheels;
  const forwardSpeed = car.vel.clone().applyQuaternion(car.q.clone().invert()).x;
  if (!wheels) {
    visual?.userData.spinWheels?.(forwardSpeed * dt * 0.01 / (carMesh.scale.x * Math.abs(visual.scale.z)));
    return;
  }
  carMesh.updateWorldMatrix(true, true);
  const scale = carMesh.scale.x;
  for (const wheel of wheels) {
    const front = wheel.corner.startsWith("F");
    // Use geometric side rather than export labels (assets disagree on handedness).
    const physicsRight = wheel.center.x * visual.scale.x < 0;
    const state = car.wheels.find(w => w.front === front && w.left === !physicsRight);
    if (!state) continue;
    wheel.pivot.scale.setScalar(state.radius * 0.01 / (scale * wheel.radius));
    const targetLength = state.inContact ? state.suspensionLength : state.restLength;
    wheel.visualSuspensionLength ??= targetLength;
    if (state.inContact) wheel.visualSuspensionLength = targetLength;
    else if (dt > 0) {
      wheel.visualSuspensionLength += (targetLength - wheel.visualSuspensionLength) * (1 - Math.exp(-20 * dt));
    }
    const local = new THREE.Vector3(-state.connection.y * 0.01 / scale,
      (state.connection.z - wheel.visualSuspensionLength) * 0.01 / scale,
      state.connection.x * 0.01 / scale);
    wheel.pivot.position.copy(visual.worldToLocal(carMesh.localToWorld(local)));
    wheel.roll = (wheel.roll ?? 0) + forwardSpeed * dt / state.radius;
    wheel.pivot.rotation.set(wheel.roll, -state.steerAngle, 0, "YXZ");
  }
}