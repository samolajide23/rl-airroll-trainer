const STORAGE_KEY = "rl-airroll-trainer-settings-v5";
const LEGACY_V4 = "rl-airroll-trainer-settings-v4";
const LEGACY_V3 = "rl-airroll-trainer-settings-v3";
const LEGACY_KEY = "rl-airroll-trainer-binds-v1";
const PREV_KEY = "rl-airroll-trainer-settings-v2";

/** @typedef {keyof typeof DEFAULT_BINDS} BindAction */
/** @typedef {keyof typeof DEFAULT_PAD} PadSetting */
/** @typedef {keyof typeof DEFAULT_CAMERA} CameraSetting */

export const DEFAULT_BINDS = {
  airRollLeft: "KeyQ",
  airRollRight: "KeyE",
  pitchUp: "KeyW",
  pitchDown: "KeyS",
  yawLeft: "KeyA",
  yawRight: "KeyD",
  boost: "ShiftLeft",
  jump: "Space",
  throttle: "",
  reverse: "",
  resetCar: "KeyR",
  newTarget: "KeyN",
};

export const BIND_LABELS = {
  airRollLeft: "Air roll left",
  airRollRight: "Air roll right",
  pitchUp: "Pitch up",
  pitchDown: "Pitch down",
  yawLeft: "Yaw left",
  yawRight: "Yaw right",
  boost: "Boost",
  jump: "Jump",
  throttle: "Throttle (optional)",
  reverse: "Reverse (optional)",
  resetCar: "Reset car",
  newTarget: "New target / skip",
};

/** Standard Gamepad API button indices (Xbox-style). */
export const DEFAULT_PAD = {
  airRollLeft: 4, // LB
  airRollRight: 5, // RB
  boost: 7, // RT
  jump: 0, // A
  resetCar: 1, // B / Circle
  newTarget: 3, // Y / Triangle
  pitchAxis: 1, // Left stick Y
  yawAxis: 0, // Left stick X
  invertPitch: false,
  invertYaw: false,
  deadzone: 0.18,
};

export const PAD_BUTTON_ACTIONS = [
  "airRollLeft",
  "airRollRight",
  "boost",
  "jump",
  "resetCar",
  "newTarget",
];

export const PAD_AXIS_OPTIONS = [
  { value: 0, label: "Left stick X" },
  { value: 1, label: "Left stick Y" },
  { value: 2, label: "Right stick X" },
  { value: 3, label: "Right stick Y" },
];

/**
 * Rocket League–style camera (values mirror in-game sliders).
 * Distance/height are Unreal units (uu); we convert at use sites.
 */
export const DEFAULT_CAMERA = {
  // FOV is horizontal degrees (Rocket League / in-game slider).
  fov: 110,
  distance: 270,
  height: 100,
  angle: -3,
  stiffness: 0.5,
  transitionSpeed: 1.0,
  shake: false,
};

/** @type {{ key: CameraSetting, label: string, min: number, max: number, step: number }[]} */
export const CAMERA_SLIDERS = [
  { key: "fov", label: "FOV (horizontal)", min: 60, max: 110, step: 1 },
  { key: "distance", label: "Distance", min: 100, max: 400, step: 5 },
  { key: "height", label: "Height", min: 40, max: 200, step: 5 },
  { key: "angle", label: "Angle", min: -15, max: 0, step: 0.5 },
  { key: "stiffness", label: "Stiffness", min: 0, max: 1, step: 0.05 },
  {
    key: "transitionSpeed",
    label: "Transition speed",
    min: 0.5,
    max: 2,
    step: 0.1,
  },
];

/** Xbox-ish button names for Gamepad API indices */
const PAD_BUTTON_NAMES = {
  0: "A / Cross",
  1: "B / Circle",
  2: "X / Square",
  3: "Y / Triangle",
  4: "LB / L1",
  5: "RB / R1",
  6: "LT / L2",
  7: "RT / R2",
  8: "Back / Share",
  9: "Start / Options",
  10: "L3",
  11: "R3",
  12: "D-Pad Up",
  13: "D-Pad Down",
  14: "D-Pad Left",
  15: "D-Pad Right",
};

/** @type {Record<string, string>} */
let binds = { ...DEFAULT_BINDS };
/** @type {typeof DEFAULT_PAD} */
let pad = { ...DEFAULT_PAD };
/** @type {typeof DEFAULT_CAMERA} */
let camera = { ...DEFAULT_CAMERA };

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn();
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ binds, pad, camera }),
  );
  notify();
}

/**
 * @param {Record<string, unknown>} src
 */
function mergeCamera(src) {
  for (const key of Object.keys(DEFAULT_CAMERA)) {
    const val = src[key];
    if (key === "shake") {
      if (typeof val === "boolean") camera.shake = val;
      continue;
    }
    if (typeof val !== "number" || !Number.isFinite(val)) continue;
    const meta = CAMERA_SLIDERS.find((s) => s.key === key);
    if (meta) {
      camera[key] = Math.min(meta.max, Math.max(meta.min, val));
    } else {
      camera[key] = val;
    }
  }
}

function load() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    /** When upgrading from v4, keep binds/pad but refresh camera to RL defaults. */
    let resetCameraFromV4 = false;
    if (!raw) {
      raw = localStorage.getItem(LEGACY_V4);
      if (raw) resetCameraFromV4 = true;
    }
    if (!raw) {
      raw = localStorage.getItem(LEGACY_V3);
    }
    if (!raw) {
      // Migrate v2 → v3 (boost/jump binds added; Space is jump)
      raw = localStorage.getItem(PREV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.binds && typeof parsed.binds === "object") {
          for (const key of Object.keys(DEFAULT_BINDS)) {
            if (typeof parsed.binds[key] === "string") {
              binds[key] = parsed.binds[key];
            }
          }
          // Free Space for jump if it was "new target"
          if (binds.newTarget === "Space" && !parsed.binds.jump) {
            binds.newTarget = "KeyN";
            binds.jump = "Space";
          }
        }
        if (parsed?.pad && typeof parsed.pad === "object") {
          mergePad(parsed.pad);
        }
        if (parsed?.camera && typeof parsed.camera === "object") {
          mergeCamera(parsed.camera);
        }
        persist();
        return;
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.binds && typeof parsed.binds === "object") {
        for (const key of Object.keys(DEFAULT_BINDS)) {
          if (typeof parsed.binds[key] === "string") {
            binds[key] = parsed.binds[key];
          }
        }
      }
      if (parsed?.pad && typeof parsed.pad === "object") {
        mergePad(parsed.pad);
      }
      if (resetCameraFromV4) {
        camera = { ...DEFAULT_CAMERA };
        persist();
        return;
      }
      if (parsed?.camera && typeof parsed.camera === "object") {
        mergeCamera(parsed.camera);
      }
      return;
    }

    // Migrate keyboard-only v1 storage
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    const parsed = JSON.parse(legacy);
    if (!parsed || typeof parsed !== "object") return;
    for (const key of Object.keys(DEFAULT_BINDS)) {
      if (typeof parsed[key] === "string") binds[key] = parsed[key];
    }
    if (binds.newTarget === "Space") {
      binds.newTarget = "KeyN";
      binds.jump = "Space";
    }
    persist();
  } catch {
    // ignore corrupt storage
  }
}

/**
 * @param {Record<string, unknown>} src
 */
function mergePad(src) {
  for (const key of Object.keys(DEFAULT_PAD)) {
    const val = src[key];
    if (key === "invertPitch" || key === "invertYaw") {
      if (typeof val === "boolean") pad[key] = val;
    } else if (key === "deadzone") {
      if (typeof val === "number" && Number.isFinite(val)) {
        pad.deadzone = Math.min(0.5, Math.max(0.05, val));
      }
    } else if (typeof val === "number" && Number.isInteger(val) && val >= 0) {
      pad[key] = val;
    } else if (val === null) {
      pad[key] = null;
    }
  }
}

load();

/**
 * @param {() => void} fn
 * @returns {() => void}
 */
export function onBindsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** @returns {Readonly<Record<string, string>>} */
export function getBinds() {
  return binds;
}

/**
 * @param {BindAction} action
 * @returns {string}
 */
export function getBind(action) {
  return binds[action] ?? DEFAULT_BINDS[action];
}

/**
 * @param {BindAction} action
 * @param {string} code
 */
export function setBind(action, code) {
  if (!(action in DEFAULT_BINDS)) return;
  if (code === "Escape") return;

  for (const key of Object.keys(binds)) {
    if (key !== action && binds[key] === code) {
      binds[key] = "";
    }
  }
  binds[action] = code;
  persist();
}

export function resetBinds() {
  binds = { ...DEFAULT_BINDS };
  persist();
}

/** @returns {Readonly<typeof DEFAULT_PAD>} */
export function getPad() {
  return pad;
}

/**
 * @param {PadSetting} key
 * @param {number | boolean | null} value
 */
export function setPad(key, value) {
  if (!(key in DEFAULT_PAD)) return;

  if (key === "invertPitch" || key === "invertYaw") {
    pad[key] = Boolean(value);
  } else if (key === "deadzone") {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    pad.deadzone = Math.min(0.5, Math.max(0.05, n));
  } else if (key === "pitchAxis" || key === "yawAxis") {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 3) return;
    pad[key] = n;
  } else {
    // button binds
    if (value === null) {
      pad[key] = null;
    } else {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) return;
      for (const action of PAD_BUTTON_ACTIONS) {
        if (action !== key && pad[action] === n) {
          pad[action] = null;
        }
      }
      pad[key] = n;
    }
  }
  persist();
}

export function resetPad() {
  pad = { ...DEFAULT_PAD };
  persist();
}

export function resetAllControls() {
  binds = { ...DEFAULT_BINDS };
  pad = { ...DEFAULT_PAD };
  camera = { ...DEFAULT_CAMERA };
  persist();
}

/** @returns {Readonly<typeof DEFAULT_CAMERA>} */
export function getCamera() {
  return camera;
}

/**
 * @param {CameraSetting} key
 * @param {number | boolean} value
 */
export function setCamera(key, value) {
  if (!(key in DEFAULT_CAMERA)) return;
  if (key === "shake") {
    camera.shake = Boolean(value);
    persist();
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  const meta = CAMERA_SLIDERS.find((s) => s.key === key);
  if (meta) {
    camera[key] = Math.min(meta.max, Math.max(meta.min, n));
  } else {
    camera[key] = n;
  }
  persist();
}

export function resetCamera() {
  camera = { ...DEFAULT_CAMERA };
  persist();
}

/**
 * @param {string} code
 * @returns {string}
 */
export function formatKeyCode(code) {
  if (!code) return "—";
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  const special = {
    ShiftLeft: "L Shift",
    ShiftRight: "R Shift",
    ControlLeft: "L Ctrl",
    ControlRight: "R Ctrl",
    AltLeft: "L Alt",
    AltRight: "R Alt",
    MetaLeft: "L Meta",
    MetaRight: "R Meta",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
  };
  return special[code] ?? code;
}

/**
 * @param {number | null | undefined} index
 * @returns {string}
 */
export function formatPadButton(index) {
  if (index === null || index === undefined) return "—";
  return PAD_BUTTON_NAMES[index] ?? `Button ${index}`;
}

/**
 * @param {number} axis
 * @returns {string}
 */
export function formatPadAxis(axis) {
  return PAD_AXIS_OPTIONS.find((o) => o.value === axis)?.label ?? `Axis ${axis}`;
}

/**
 * @returns {string}
 */
export function formatControlsHelp() {
  const b = binds;
  const p = pad;
  return (
    `${formatKeyCode(b.airRollLeft)}/${formatKeyCode(b.airRollRight)} or ` +
    `${formatPadButton(p.airRollLeft)}/${formatPadButton(p.airRollRight)} air roll · ` +
    `${formatKeyCode(b.pitchUp)}${formatKeyCode(b.yawLeft)}${formatKeyCode(b.pitchDown)}${formatKeyCode(b.yawRight)} or stick · ` +
    `${formatKeyCode(b.boost)}/${formatPadButton(p.boost)} boost · ` +
    `${formatKeyCode(b.jump)}/${formatPadButton(p.jump)} jump · ` +
    `${formatKeyCode(b.resetCar)}/${formatPadButton(p.resetCar)} reset · ` +
    `${formatKeyCode(b.newTarget)}/${formatPadButton(p.newTarget)} new · Esc menu`
  );
}
