/**
 * Single source for Unreal-unit ↔ Three.js scale.
 * Rocket League / RocketSim: 1 uu = 1 cm. Render: 1 three-unit = 1 m = 100 uu.
 */
export const UU = 0.01;

export function formatSpeed(speed) {
  return `${(speed * UU * 3.6).toFixed(1)} km/h`;
}

/** @param {number} uu */
export function uuToThree(uu) {
  return uu * UU;
}

/** @param {number} three */
export function threeToUu(three) {
  return three / UU;
}
