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
 * @typedef {{
 *   id: string,
 *   label: string,
 *   size: [number, number, number],
 *   offset: [number, number, number],
 *   restZ: number,
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
  },
  dominus: {
    id: "dominus",
    label: "Dominus",
    size: [130.427, 85.7799, 33.8],
    offset: [9.0, 0, 15.75],
    restZ: 17.05,
  },
  plank: {
    id: "plank",
    label: "Plank",
    size: [131.32, 87.1704, 31.8944],
    offset: [9.00857, 0, 12.0942],
    restZ: 18.65,
  },
  breakout: {
    id: "breakout",
    label: "Breakout",
    size: [133.992, 83.021, 32.8],
    offset: [12.5, 0, 11.75],
    restZ: 18.33,
  },
  hybrid: {
    id: "hybrid",
    label: "Hybrid",
    size: [129.519, 84.6879, 36.6591],
    offset: [13.8757, 0, 20.755],
    restZ: 17.01,
  },
  merc: {
    id: "merc",
    label: "Merc",
    size: [123.22, 79.2103, 44.1591],
    offset: [11.3757, 0, 21.505],
    restZ: 18.78,
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
  };
}
