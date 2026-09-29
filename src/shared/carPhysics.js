/**
 * Canonical car physics API for every mode.
 *
 * Modes should import from this file (not from `rl-physics.js` / `aerial.js`
 * directly) so drive, air control, hitbox, and boost stay one shared model.
 *
 * Frame: Z-up physics (uu/cm), fixed 120 Hz. Visual cars are Y-up Three.js.
 */

export {
  RL,
  axes,
  curvature,
  throttleAccel,
  extraImpulseScale,
  makeCar as makePhysCar,
  makeBall,
  makeWorld,
  carRestZ,
  canFlipOrJump,
  isUndersideContact,
  grantWheelContact,
  stepCar,
  stepBall,
  stepWorld,
  advance,
  collideCarBall,
  carHitbox,
  carHitboxYUp,
  carHitboxYUpFromWheels,
  rootFromWheelsYUp,
  hitboxExtentOnAxis,
  resolveCarArena,
  resolveHitboxPlaneY,
  physToThree,
  applyToCarModel,
  alignCarVisualToHitbox,
  createHitboxHelper,
  syncHitboxHelper,
  syncHitboxHelperYUp,
} from "./rl-physics.js";

export { AerialBody, FixedStepClock } from "./aerial.js";

export {
  HITBOX_PRESETS,
  cloneHitbox,
  getHitboxPreset,
  getHitboxForCarId,
} from "./hitboxPresets.js";

export {
  createSoccarBoostPads,
  createBoostPadMeshes,
  stepBoostPads,
  resetBoostPads,
  BOOST_PAD,
} from "./boostPads.js";
