/**
 * Garage / locker: which car body is equipped.
 * Persist selection in localStorage.
 */

const STORAGE_KEY = "rl-airroll-car";

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   blurb: string,
 *   kind: "procedural" | "glb",
 *   hitbox: "octane" | "dominus" | "plank" | "breakout" | "hybrid" | "merc",
 *   url?: string,
 *   credit?: string,
 *   targetLength?: number,
 * }} CarDef
 */

/** @type {CarDef[]} */
export const CARS = [
  {
    id: "classic",
    name: "Classic",
    blurb: "Built-in lofted trainer body — Octane hitbox.",
    kind: "procedural",
    hitbox: "octane",
    targetLength: 3.2,
  },
  {
    id: "octane",
    name: "Octane",
    blurb: "Fan model of the Rocket League Octane (glTF).",
    kind: "glb",
    hitbox: "octane",
    url: "/cars/octane.glb",
    credit: "Model by Jako on Sketchfab — CC Attribution",
    targetLength: 3.2,
  },
  {
    id: "fennec",
    name: "Fennec",
    blurb: "Fan model — uses the official Octane hitbox.",
    kind: "glb",
    hitbox: "octane",
    url: "/cars/fennec.glb",
    credit: "Sketchfab fan model — CC / community asset",
    targetLength: 3.2,
  },
  {
    id: "dominus",
    name: "Dominus",
    blurb: "Fan model — uses the official Dominus hitbox.",
    kind: "glb",
    hitbox: "dominus",
    url: "/cars/dominus.glb",
    credit: "Sketchfab fan model — CC / community asset",
    targetLength: 3.2,
  },
];

/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * @returns {string}
 */
export function getSelectedCarId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && CARS.some((c) => c.id === id)) return id;
  } catch {
    /* ignore */
  }
  return "octane";
}

/**
 * @param {string} id
 */
export function setSelectedCarId(id) {
  if (!CARS.some((c) => c.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn();
}

/**
 * @returns {CarDef}
 */
export function getSelectedCar() {
  const id = getSelectedCarId();
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

/**
 * @param {() => void} fn
 * @returns {() => void}
 */
export function onLoadoutChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
