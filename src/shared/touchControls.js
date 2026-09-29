/**
 * On-screen touch controls for mobile / coarse-pointer play.
 * Left: virtual stick (pitch / yaw). Right: air roll, boost, jump. Util: reset / skip.
 *
 * On portrait phones during play, the #stage is CSS-rotated into landscape
 * (`body.virtual-landscape`) so the user does not need to turn the device.
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
let stageEl = null;

let visible = false;
let virtualLandscape = false;

/** @type {Set<() => void>} */
const viewportListeners = new Set();

function isTouchPreferred() {
  return (
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

function wantsVirtualLandscape() {
  return (
    visible &&
    isTouchPreferred() &&
    window.matchMedia("(orientation: portrait)").matches
  );
}

/**
 * Logical playable size (landscape when virtual-landscape is on).
 * @returns {{ width: number, height: number, virtualLandscape: boolean }}
 */
export function getPlaySize() {
  if (virtualLandscape) {
    return {
      width: window.innerHeight,
      height: window.innerWidth,
      virtualLandscape: true,
    };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    virtualLandscape: false,
  };
}

export function isVirtualLandscape() {
  return virtualLandscape;
}

/**
 * @param {() => void} fn
 * @returns {() => void}
 */
export function onPlayViewportChange(fn) {
  viewportListeners.add(fn);
  return () => viewportListeners.delete(fn);
}

function notifyViewport() {
  for (const fn of viewportListeners) fn();
}

/**
 * Map client (viewport) coordinates into #stage local space.
 * When virtual-landscape is active, stage is rotated 90deg CW.
 * @param {number} clientX
 * @param {number} clientY
 */
function clientToStage(clientX, clientY) {
  if (!virtualLandscape) return { x: clientX, y: clientY };
  const { width: stageW, height: stageH } = getPlaySize();
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const sx = clientX - cx;
  const sy = clientY - cy;
  // CSS rotate(90deg): (x', y') = (-y, x). Inverse: (x, y) = (y', -x').
  return {
    x: stageW / 2 + sy,
    y: stageH / 2 - sx,
  };
}

/**
 * Stick center in stage space (layout box, pre-rotation).
 * @param {HTMLElement} el
 */
function elementCenterStage(el) {
  if (!virtualLandscape || !stageEl) {
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }
  // Layout size of stage equals getPlaySize(); stick is positioned in that box.
  const stageRect = stageEl.getBoundingClientRect();
  // After rotate, AABB is not the layout box — use offsetLeft/Top chain instead.
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  /** @type {HTMLElement | null} */
  let node = el;
  while (node && node !== stageEl) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
  }
  // If offsetParent chain broke (fixed positioning), fall back to inverse map of AABB center.
  if (node !== stageEl) {
    void stageRect;
    const rect = el.getBoundingClientRect();
    return clientToStage(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  return { x, y };
}

function syncVirtualLandscape() {
  const next = wantsVirtualLandscape();
  if (next === virtualLandscape) {
    // Still notify size changes on resize while locked in a mode.
    if (document.body.classList.contains("virtual-landscape") !== next) {
      document.body.classList.toggle("virtual-landscape", next);
    }
    notifyViewport();
    return;
  }
  virtualLandscape = next;
  document.body.classList.toggle("virtual-landscape", virtualLandscape);
  if (stick.active) resetStickVisual();
  notifyViewport();
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
  // Stage-up → pitch up; stage-right → yaw right
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
    const origin = elementCenterStage(stickBase);
    const pt = clientToStage(e.clientX, e.clientY);
    stick.active = true;
    stick.id = e.pointerId;
    stick.originX = origin.x;
    stick.originY = origin.y;
    stickBase.classList.add("active");
    updateStickAxes(pt.x - stick.originX, pt.y - stick.originY);
  });

  stickBase.addEventListener("pointermove", (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    e.preventDefault();
    const pt = clientToStage(e.clientX, e.clientY);
    updateStickAxes(pt.x - stick.originX, pt.y - stick.originY);
  });

  const end = (e) => {
    if (e.pointerId !== stick.id) return;
    e.preventDefault();
    resetStickVisual();
  };
  stickBase.addEventListener("pointerup", end);
  stickBase.addEventListener("pointercancel", end);
}

/**
 * @param {{
 *   root: HTMLElement,
 *   stickBase: HTMLElement,
 *   stickKnob: HTMLElement,
 *   stage?: HTMLElement | null,
 * }} els
 */
export function initTouchControls(els) {
  rootEl = els.root;
  stickBase = els.stickBase;
  stickKnob = els.stickKnob;
  stageEl = els.stage ?? document.getElementById("stage");

  rootEl.querySelectorAll("[data-touch-action]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const action = node.dataset.touchAction;
    if (!action) return;
    bindHoldButton(node, action);
  });
  bindStick();

  window.addEventListener("orientationchange", () => {
    // Wait a tick for browser to settle new inset sizes.
    requestAnimationFrame(syncVirtualLandscape);
  });
  window.addEventListener("resize", syncVirtualLandscape);

  rootEl.addEventListener(
    "touchmove",
    (e) => {
      if (visible) e.preventDefault();
    },
    { passive: false },
  );

  syncVirtualLandscape();
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
  syncVirtualLandscape();
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
