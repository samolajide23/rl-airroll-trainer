/**
 * On-screen touch controls for mobile / coarse-pointer play.
 * Left: virtual stick (pitch / yaw). Right: air roll, boost, jump. Util: reset / skip.
 */

/** @type {Set<string>} */
const held = new Set();

/** @type {{ active: boolean, id: number | null, originX: number, originY: number, pitch: number, yaw: number }} */
const stick = {
  active: false,
  id: null,
  originX: 0,
  originY: 0,
  pitch: 0,
  yaw: 0,
};

const STICK_RADIUS = 54;
const STICK_DEADZONE = 0.12;

/** @type {HTMLElement | null} */
let rootEl = null;
/** @type {HTMLElement | null} */
let stickBase = null;
/** @type {HTMLElement | null} */
let stickKnob = null;
/** @type {HTMLElement | null} */
let rotateEl = null;

let visible = false;

function isTouchPreferred() {
  return (
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * @param {string} action
 * @param {boolean} down
 */
function setHeld(action, down) {
  if (down) held.add(action);
  else held.delete(action);
}

/**
 * @param {HTMLElement} el
 * @param {string} action
 */
function bindHoldButton(el, action) {
  const down = (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    setHeld(action, true);
    el.classList.add("active");
  };
  const up = (e) => {
    e.preventDefault();
    setHeld(action, false);
    el.classList.remove("active");
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", (e) => {
    if (el.hasPointerCapture?.(e.pointerId)) up(e);
  });
}

/**
 * @param {number} dx
 * @param {number} dy
 */
function updateStickAxes(dx, dy) {
  const len = Math.hypot(dx, dy);
  const max = STICK_RADIUS;
  const clamped = len > max && len > 1e-6 ? max / len : 1;
  const cx = dx * clamped;
  const cy = dy * clamped;
  if (stickKnob) {
    stickKnob.style.transform = `translate(${cx}px, ${cy}px)`;
  }
  let nx = cx / max;
  let ny = cy / max;
  const mag = Math.hypot(nx, ny);
  if (mag < STICK_DEADZONE) {
    stick.pitch = 0;
    stick.yaw = 0;
    return;
  }
  const scale = (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  nx = (nx / mag) * scale;
  ny = (ny / mag) * scale;
  // Screen up → pitch up (nose up); screen right → yaw right
  stick.yaw = Math.max(-1, Math.min(1, nx));
  stick.pitch = Math.max(-1, Math.min(1, -ny));
}

function resetStickVisual() {
  stick.pitch = 0;
  stick.yaw = 0;
  stick.active = false;
  stick.id = null;
  if (stickKnob) stickKnob.style.transform = "translate(0px, 0px)";
  stickBase?.classList.remove("active");
}

function bindStick() {
  if (!stickBase) return;

  stickBase.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    stickBase.setPointerCapture?.(e.pointerId);
    const rect = stickBase.getBoundingClientRect();
    stick.active = true;
    stick.id = e.pointerId;
    stick.originX = rect.left + rect.width / 2;
    stick.originY = rect.top + rect.height / 2;
    stickBase.classList.add("active");
    updateStickAxes(e.clientX - stick.originX, e.clientY - stick.originY);
  });

  stickBase.addEventListener("pointermove", (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    e.preventDefault();
    updateStickAxes(e.clientX - stick.originX, e.clientY - stick.originY);
  });

  const end = (e) => {
    if (e.pointerId !== stick.id) return;
    e.preventDefault();
    resetStickVisual();
  };
  stickBase.addEventListener("pointerup", end);
  stickBase.addEventListener("pointercancel", end);
}

function updateRotatePrompt() {
  if (!rotateEl) return;
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const show = visible && isTouchPreferred() && portrait;
  rotateEl.classList.toggle("hidden", !show);
}

/**
 * @param {{
 *   root: HTMLElement,
 *   stickBase: HTMLElement,
 *   stickKnob: HTMLElement,
 *   rotatePrompt: HTMLElement,
 * }} els
 */
export function initTouchControls(els) {
  rootEl = els.root;
  stickBase = els.stickBase;
  stickKnob = els.stickKnob;
  rotateEl = els.rotatePrompt;

  rootEl.querySelectorAll("[data-touch-action]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const action = node.dataset.touchAction;
    if (!action) return;
    bindHoldButton(node, action);
  });
  bindStick();

  window.addEventListener("orientationchange", updateRotatePrompt);
  window.addEventListener("resize", updateRotatePrompt);

  // Block browser gestures over the overlay
  rootEl.addEventListener(
    "touchmove",
    (e) => {
      if (visible) e.preventDefault();
    },
    { passive: false },
  );
}

/** @param {boolean} on */
export function setTouchControlsVisible(on) {
  visible = on && isTouchPreferred();
  if (rootEl) {
    rootEl.classList.toggle("hidden", !visible);
    rootEl.setAttribute("aria-hidden", visible ? "false" : "true");
  }
  if (!visible) {
    held.clear();
    resetStickVisual();
  }
  updateRotatePrompt();
  maybeLockLandscape();
}

async function maybeLockLandscape() {
  if (!visible) return;
  try {
    const orient = screen.orientation;
    if (orient && typeof orient.lock === "function") {
      await orient.lock("landscape");
    }
  } catch {
    // Requires fullscreen / unsupported — rotate prompt covers this.
  }
}

export function isTouchControlsActive() {
  return visible;
}

/**
 * @returns {{
 *   pitch: number,
 *   yaw: number,
 *   airLeft: boolean,
 *   airRight: boolean,
 *   boost: boolean,
 *   jump: boolean,
 *   resetCar: boolean,
 *   newTarget: boolean,
 *   usingTouch: boolean,
 * }}
 */
export function readTouchControls() {
  if (!visible) {
    return {
      pitch: 0,
      yaw: 0,
      airLeft: false,
      airRight: false,
      boost: false,
      jump: false,
      resetCar: false,
      newTarget: false,
      usingTouch: false,
    };
  }
  return {
    pitch: stick.pitch,
    yaw: stick.yaw,
    airLeft: held.has("airRollLeft"),
    airRight: held.has("airRollRight"),
    boost: held.has("boost"),
    jump: held.has("jump"),
    resetCar: held.has("resetCar"),
    newTarget: held.has("newTarget"),
    usingTouch: true,
  };
}

/**
 * @param {import("./settings.js").BindAction} action
 */
export function isTouchActionDown(action) {
  if (!visible) return false;
  if (action === "airRollLeft") return held.has("airRollLeft");
  if (action === "airRollRight") return held.has("airRollRight");
  if (action === "boost") return held.has("boost");
  if (action === "jump") return held.has("jump");
  if (action === "resetCar") return held.has("resetCar");
  if (action === "newTarget") return held.has("newTarget");
  return false;
}
