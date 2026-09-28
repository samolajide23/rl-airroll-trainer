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
    blurb: "Built-in lofted trainer body — light and reliable.",
    kind: "procedural",
  },
  {
    id: "octane",
    name: "Octane",
    blurb: "Fan model of the Rocket League Octane (glTF).",
    kind: "glb",
    url: "/cars/octane.glb",
    credit: "Model by Jako on Sketchfab — CC Attribution",
    targetLength: 3.2,
  },
  {
    id: "fennec",
    name: "Fennec",
    blurb: "Fan model of the Rocket League Fennec (glTF).",
    kind: "glb",
    url: "/cars/fennec.glb",
    credit: "Sketchfab fan model — CC / community asset",
    targetLength: 3.2,
  },
  {
    id: "dominus",
    name: "Dominus",
    blurb: "Fan model of the Rocket League Dominus (glTF).",
    kind: "glb",
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
