/**
 * Rocket League hitbox presets (RocketSim CarConfig — verified vs real RL inertia).
 *
 * Size / offset are in unreal units (uu). Axes: length=X (forward), width=Y (right), height=Z (up).
 * Offset is root-joint → hitbox centre. Rest Z is root height when settled on flat ground.
 *
 * Source: ZealanL/RocketSim src/Sim/Car/CarConfig/CarConfig.cpp
 * Official body→preset map: Epic Games “Rocket League Car Hitboxes” help article.
 */

/**
 * One axle of RocketSim `WheelPairConfig`. `offset` is the right-side
 * suspension hard point (left wheels mirror Y); `suspensionRest` includes the
 * 12 uu max travel that btVehicleRL subtracts.
 * @typedef {{
 *   radius: number,
 *   suspensionRest: number,
 *   offset: [number, number, number],
 * }} WheelPairConfig
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   size: [number, number, number],
 *   offset: [number, number, number],
 *   restZ: number,
 *   wheels: { front: WheelPairConfig, back: WheelPairConfig },
 * }} HitboxPreset
 */

/** @type {Record<string, HitboxPreset>} */
export const HITBOX_PRESETS = {
  octane: {
    id: "octane",
    label: "Octane",
    size: [120.507, 86.6994, 38.6591],
    offset: [13.8757, 0, 20.755],
    restZ: 17.0,
    wheels: {
      front: { radius: 12.5, suspensionRest: 38.755, offset: [51.25, 25.9, 20.755] },
      back: { radius: 15.0, suspensionRest: 37.055, offset: [-33.75, 29.5, 20.755] },
    },
  },
  dominus: {
    id: "dominus",
    label: "Dominus",
    size: [130.427, 85.7799, 33.8],
    offset: [9.0, 0, 15.75],
    restZ: 17.05,
    wheels: {
      front: { radius: 12.0, suspensionRest: 33.95, offset: [50.3, 31.1, 15.75] },
      back: { radius: 13.5, suspensionRest: 33.85, offset: [-34.75, 33.0, 15.75] },
    },
  },
  plank: {
    id: "plank",
    label: "Plank",
    size: [131.32, 87.1704, 31.8944],
    offset: [9.00857, 0, 12.0942],
    restZ: 18.65,
    wheels: {
      front: { radius: 12.5, suspensionRest: 31.9242, offset: [49.97, 27.8, 12.0942] },
      back: { radius: 17.0, suspensionRest: 27.9242, offset: [-35.43, 20.28, 12.0942] },
    },
  },
  breakout: {
    id: "breakout",
    label: "Breakout",
    size: [133.992, 83.021, 32.8],
    offset: [12.5, 0, 11.75],
    restZ: 18.33,
    wheels: {
      front: { radius: 13.5, suspensionRest: 29.7, offset: [51.5, 26.67, 11.75] },
      back: { radius: 15.0, suspensionRest: 29.666, offset: [-35.75, 35.0, 11.75] },
    },
  },
  hybrid: {
    id: "hybrid",
    label: "Hybrid",
    size: [129.519, 84.6879, 36.6591],
    offset: [13.8757, 0, 20.755],
    restZ: 17.01,
    wheels: {
      front: { radius: 12.5, suspensionRest: 38.755, offset: [51.25, 25.9, 20.755] },
      back: { radius: 15.0, suspensionRest: 37.055, offset: [-34.0, 29.5, 20.755] },
    },
  },
  merc: {
    id: "merc",
    label: "Merc",
    size: [123.22, 79.2103, 44.1591],
    offset: [11.3757, 0, 21.505],
    restZ: 18.78,
    wheels: {
      front: { radius: 15.0, suspensionRest: 39.505, offset: [51.25, 25.9, 21.505] },
      back: { radius: 15.0, suspensionRest: 39.105, offset: [-33.75, 29.5, 21.505] },
    },
  },
};

/**
 * Trainer car id → hitbox preset id (Epic body-type map).
 * @type {Record<string, keyof typeof HITBOX_PRESETS>}
 */
export const CAR_HITBOX = {
  classic: "octane",
  octane: "octane",
  fennec: "octane", // Fennec uses Octane hitbox
  dominus: "dominus",
};

/**
 * @param {string} [presetId]
 * @returns {HitboxPreset}
 */
export function getHitboxPreset(presetId = "octane") {
  return HITBOX_PRESETS[presetId] ?? HITBOX_PRESETS.octane;
}

/**
 * @param {string} carId garage / loadout id
 * @returns {HitboxPreset}
 */
export function getHitboxForCarId(carId) {
  return getHitboxPreset(CAR_HITBOX[carId] ?? "octane");
}

/**
 * Clone a preset so physics cars can own a mutable copy if needed.
 * @param {HitboxPreset} preset
 * @returns {HitboxPreset}
 */
export function cloneHitbox(preset) {
  return {
    id: preset.id,
    label: preset.label,
    size: [preset.size[0], preset.size[1], preset.size[2]],
    offset: [preset.offset[0], preset.offset[1], preset.offset[2]],
    restZ: preset.restZ,
    wheels: {
      front: cloneWheelPair(preset.wheels.front),
      back: cloneWheelPair(preset.wheels.back),
    },
  };
}

/**
 * @param {WheelPairConfig} pair
 * @returns {WheelPairConfig}
 */
function cloneWheelPair(pair) {
  return {
    radius: pair.radius,
    suspensionRest: pair.suspensionRest,
    offset: [pair.offset[0], pair.offset[1], pair.offset[2]],
  };
}
