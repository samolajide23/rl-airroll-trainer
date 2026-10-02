/**
 * Canonical car physics API for every mode.
 *
 * Modes should import from this file (not from `carSim.js` / `rl-physics.js` /
 * `aerial.js` directly) so drive, air control, hitbox, and boost stay one
 * shared native profile; direct simulator imports retain RocketSim references.
 *
 * Frame: Z-up physics (uu/cm), fixed 120 Hz. Visual cars are Y-up Three.js.
 */

import { makeCar, makeSoccarKickoffCar as makeReferenceKickoffCar } from "./carSim.js";

export function makePhysCar(pos, yaw, hitboxOrCarId) {
  const car = makeCar(pos, yaw, hitboxOrCarId);
  car.physicsProfile = "native";
  return car;
}

export function makeSoccarKickoffCar(hitboxOrCarId) {
  const car = makeReferenceKickoffCar(hitboxOrCarId);
  car.physicsProfile = "native";
  return car;
}

export {
  RS,
  RS_CURVES,
  makeWorld,
  carRestZ,
  canFlipOrJump,
  stepCar,
  stepCarBall,
  stepWorld,
  advance,
  collideCarCar,
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

export { ARENA_SHAPE, arenaDistance as arenaDistanceSdf, raycastArena as raycastArenaSdf } from "./arenaShape.js";
export { arenaDistance, arenaNormal, raycastArena, ARENA_TRI_COUNT } from "./arenaMesh.js";

export { AerialBody, FixedStepClock } from "./aerial.js";

export { withFreeAirRoll, aerialControlAxes } from "./airRoll.js";

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
