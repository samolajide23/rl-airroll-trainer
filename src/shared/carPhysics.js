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
import { stepCar as referenceStepCar, stepCarBall as referenceStepCarBall } from "./carSim.js";
import { stepBall as referenceStepBall, RL as constants } from "./rl-physics.js";
import { rocketSimReady, stepRocketSim } from "./rocketSimRuntime.js";

function useRocketSim() {
  if (import.meta.env?.DEV !== undefined && !rocketSimReady()) throw new Error("RocketSim is not initialized");
  return rocketSimReady();
}

export function stepCar(car, controls, dt = constants.DT) {
  return useRocketSim() ? stepRocketSim(car, null, controls, dt) : referenceStepCar(car, controls, dt);
}

export function stepCarBall(car, ball, controls, tick = 0, dt = constants.DT) {
  return useRocketSim() ? stepRocketSim(car, ball, controls, dt) : referenceStepCarBall(car, ball, controls, tick, dt);
}

export function stepBall(ball, dt = constants.DT) {
  return useRocketSim() ? stepRocketSim(null, ball, {}, dt, true) : referenceStepBall(ball, dt);
}

export function stepWorld(world, controls) {
  world.events.length = 0;
  const hit = stepCarBall(world.car, world.ball, controls, world.tick);
  if (hit) world.events.push({ type: "touch", ...hit, time: world.time });
  world.tick++;
  world.time += constants.DT;
}

export function advance(world, getControls, elapsed, accumulator = { t: 0 }) {
  accumulator.t += Math.min(elapsed, 0.1);
  while (accumulator.t >= constants.DT) {
    stepWorld(world, getControls());
    accumulator.t -= constants.DT;
  }
  return accumulator;
}

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
  collideCarCar,
} from "./carSim.js";

export {
  RL,
  axes,
  extraImpulseScale,
  makeBall,
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
