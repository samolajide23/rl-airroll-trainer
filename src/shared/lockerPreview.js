/**
 * Locker garage preview: spins the focused car body in the shared scene.
 * Isolated from menu/controller code so main.js only wires show/hide/update.
 */
import * as THREE from "three";
import { makeCar } from "./car.js";
import { disposeScene } from "./disposeScene.js";
import { isCarReady, preloadCars } from "./carAssets.js";

/** @type {THREE.Scene | null} */
let scene = null;
/** @type {THREE.PerspectiveCamera | null} */
let camera = null;
/** @type {THREE.Group | null} */
let previewCar = null;
/** @type {string | null} */
let shownCarId = null;
let active = false;

/** World position — sits in the clear right half of the locker overlay. */
const CAR_POS = new THREE.Vector3(2.6, 0.15, 0);
const CAM_POS = new THREE.Vector3(5.2, 2.35, -6.4);
const LOOK_AT = new THREE.Vector3(2.6, 0.35, 0);

/**
 * @param {THREE.Scene} nextScene
 * @param {THREE.PerspectiveCamera} nextCamera
 * @param {string} carId
 */
export function showLockerPreview(nextScene, nextCamera, carId) {
  scene = nextScene;
  camera = nextCamera;
  active = true;
  applyCamera();
  setLockerPreviewCar(carId);
}

/**
 * Swap the preview mesh to another body (hover or equip).
 * @param {string} carId
 * @param {{ force?: boolean }} [opts]
 */
export function setLockerPreviewCar(carId, opts = {}) {
  if (!active || !scene) return;
  if (!opts.force && shownCarId === carId && previewCar) return;

  disposePreviewCar();
  previewCar = makeCar(0xffffff, 1, { carId, markers: false });
  previewCar.name = "locker-preview-car";
  previewCar.position.copy(CAR_POS);
  previewCar.rotation.set(0.08, Math.PI * 0.18, 0);
  scene.add(previewCar);
  shownCarId = carId;
  if (!isCarReady(carId)) {
    preloadCars([carId]).then(() => {
      if (active && shownCarId === carId && isCarReady(carId)) {
        setLockerPreviewCar(carId, { force: true });
      }
    });
  }
}

/**
 * Gentle idle spin while the locker is open.
 * @param {number} dt
 */
export function updateLockerPreview(dt) {
  if (!active || !previewCar) return;
  previewCar.rotation.y += dt * 0.2;
}

/**
 * Remove preview objects and release references (call when leaving locker).
 */
export function hideLockerPreview() {
  disposePreviewCar();
  scene = null;
  camera = null;
  shownCarId = null;
  active = false;
}

/**
 * @returns {boolean}
 */
export function isLockerPreviewActive() {
  return active;
}

function applyCamera() {
  if (!camera) return;
  camera.position.copy(CAM_POS);
  camera.up.set(0, 1, 0);
  camera.lookAt(LOOK_AT);
}

function disposePreviewCar() {
  if (!previewCar) return;
  if (scene) scene.remove(previewCar);
  disposeScene(previewCar);
  previewCar = null;
  shownCarId = null;
}
