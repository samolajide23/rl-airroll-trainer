/**
 * Canonical car physics API for every mode.
 *
 * Modes should import from this file (not from `carSim.js` / `rl-physics.js` /
 * `aerial.js` directly) so drive, air control, hitbox, and boost stay one
 * shared model.
 *
 * Frame: Z-up physics (uu/cm), fixed 120 Hz. Visual cars are Y-up Three.js.
 */

export {
  RS,
  RS_CURVES,
  makeCar as makePhysCar,
  makeWorld,
  carRestZ,
  canFlipOrJump,
  stepCar,
  stepWorld,
  advance,
} from "./carSim.js";

export {
  RL,
  axes,
  extraImpulseScale,
  makeBall,
  stepBall,
  collideCarBall,
  carHitbox,
  carHitboxYUp,
  carHitboxYUpFromWheels,
  rootFromWheelsYUp,
  hitboxExtentOnAxis,
  resolveHitboxPlaneY,
  physToThree,
  applyToCarModel,
  alignCarVisualToHitbox,
  createHitboxHelper,
  syncHitboxHelper,
  syncHitboxHelperYUp,
} from "./rl-physics.js";

export { ARENA_SHAPE, arenaDistance, raycastArena } from "./arenaShape.js";

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
