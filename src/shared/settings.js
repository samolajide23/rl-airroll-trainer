const STORAGE_KEY = "rl-airroll-trainer-settings-v8";
const LEGACY_V7 = "rl-airroll-trainer-settings-v7";
const LEGACY_V6 = "rl-airroll-trainer-settings-v6";
const LEGACY_V5 = "rl-airroll-trainer-settings-v5";
const LEGACY_V4 = "rl-airroll-trainer-settings-v4";
const LEGACY_V3 = "rl-airroll-trainer-settings-v3";
const LEGACY_KEY = "rl-airroll-trainer-binds-v1";
const PREV_KEY = "rl-airroll-trainer-settings-v2";

/** @typedef {keyof typeof DEFAULT_BINDS} BindAction */
/** @typedef {keyof typeof DEFAULT_PAD} PadSetting */
/** @typedef {keyof typeof DEFAULT_CAMERA} CameraSetting */

/**
 * Keyboard defaults mirror Rocket League PC:
 * W/S accelerate + reverse (also pitch forward/back in air),
 * A/D steer / yaw, Shift boost, Space jump, Ctrl powerslide/air-roll hold.
 */
export const DEFAULT_BINDS = {
  throttle: "KeyW",
  reverse: "KeyS",
  // Pitch forward = nose down (same key as throttle, like RL dual-bind).
  pitchDown: "KeyW",
  // Pitch back = nose up (same key as reverse).
  pitchUp: "KeyS",
  yawLeft: "KeyA",
  yawRight: "KeyD",
  boost: "ShiftLeft",
  jump: "Space",
  powerslide: "ControlLeft",
  airRollLeft: "KeyQ",
  airRollRight: "KeyE",
  resetCar: "KeyR",
  newTarget: "KeyN",
  /** RL Ball Camera bind — Toggle or Hold per `ballCamMode`; pad uses R3. */
  toggleBallCam: "KeyC",
};

/** Pairs that may share one physical key (RL dual-binds). */
const SHAREABLE_BINDS = [
  new Set(["throttle", "pitchDown"]),
  new Set(["reverse", "pitchUp"]),
];

export const BIND_LABELS = {
  throttle: "Accelerate",
  reverse: "Brake / Reverse",
  pitchUp: "Pitch up (nose up)",
  pitchDown: "Pitch down (nose down)",
  yawLeft: "Steer / yaw left",
  yawRight: "Steer / yaw right",
  boost: "Boost",
  jump: "Jump",
  powerslide: "Powerslide",
  airRollLeft: "Air roll left",
  airRollRight: "Air roll right",
  resetCar: "Reset car",
  newTarget: "New target / skip",
  toggleBallCam: "Ball cam",
};

/**
 * Xbox-style Gamepad API indices — Rocket League defaults:
 * RT accelerate, LT brake, A jump, B boost, X powerslide, LB/RB air roll.
 */
export const DEFAULT_PAD = {
  throttle: 7, // RT / R2
  brake: 6, // LT / L2
  boost: 1, // B / Circle
  jump: 0, // A / Cross
  powerslide: 2, // X / Square
  airRollLeft: 4, // LB
  airRollRight: 5, // RB
  resetCar: 8, // Back / Share
  newTarget: 3, // Y / Triangle
  /** RL Toggle Ball Cam — Right stick click (R3). */
  toggleBallCam: 11,
  pitchAxis: 1, // Left stick Y
  yawAxis: 0, // Left stick X
  lookXAxis: 2, // Right stick X (camera swivel)
  lookYAxis: 3, // Right stick Y (camera swivel)
  invertPitch: false,
  invertYaw: false,
  invertLookX: false,
  invertLookY: false,
  deadzone: 0.1,
};

export const PAD_BUTTON_ACTIONS = [
  "throttle",
  "brake",
  "boost",
  "jump",
  "powerslide",
  "airRollLeft",
  "airRollRight",
  "resetCar",
  "newTarget",
  "toggleBallCam",
];

export const PAD_AXIS_OPTIONS = [
  { value: 0, label: "Left stick X" },
  { value: 1, label: "Left stick Y" },
  { value: 2, label: "Right stick X" },
  { value: 3, label: "Right stick Y" },
];

/**
 * Rocket League `ProfileCameraSettings` defaults (Psyonix).
 * Distance/height are Unreal units (uu); convert at use sites via {@link UU}.
 * Slider ranges match in-game Camera Settings (FOV 60–110, Dist 100–400, …).
 */
export const DEFAULT_CAMERA = {
  // FOV is horizontal degrees (Rocket League / in-game slider).
  fov: 110,
  distance: 270,
  height: 100,
  angle: -3, // BakkesMod Pitch
  stiffness: 0.5,
  swivelSpeed: 2.5,
  transitionSpeed: 1.0,
  shake: false,
  /** Live ball-cam state (toggle mode); hold mode ignores this while driving. */
  ballCam: false,
  /**
   * RL "Ball Camera" button behavior — Toggle (default) or Hold.
   * @type {"toggle" | "hold"}
   */
  ballCamMode: "toggle",
};

/** @type {{ key: CameraSetting, label: string, min: number, max: number, step: number }[]} */
export const CAMERA_SLIDERS = [
  { key: "fov", label: "Camera FOV", min: 60, max: 110, step: 1 },
  { key: "distance", label: "Camera Distance", min: 100, max: 400, step: 5 },
  { key: "height", label: "Camera Height", min: 40, max: 200, step: 5 },
  { key: "angle", label: "Camera Angle", min: -15, max: 0, step: 0.5 },
  { key: "stiffness", label: "Camera Stiffness", min: 0, max: 1, step: 0.05 },
  { key: "swivelSpeed", label: "Camera Swivel Speed", min: 1, max: 10, step: 0.1 },
  {
    key: "transitionSpeed",
    label: "Transition Speed",
    min: 1,
    max: 2,
    step: 0.1,
  },
];

/** RL Camera Settings → Ball Camera: Toggle or Hold. */
export const BALL_CAM_MODE_OPTIONS = [
  { value: "toggle", label: "Toggle" },
  { value: "hold", label: "Hold" },
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
    if (key === "shake" || key === "ballCam") {
      if (typeof val === "boolean") camera[key] = val;
      continue;
    }
    if (key === "ballCamMode") {
      if (val === "toggle" || val === "hold") camera.ballCamMode = val;
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
    /** v5 had wrong pad/keyboard drive binds — refresh controls to RL defaults. */
    let resetControlsFromV5 = false;
    /** v6 lacked swivelSpeed / ballCam — fill from ProfileCameraSettings defaults. */
    let upgradeCameraFromV6 = false;
    /** v7 lacked ballCamMode (Toggle/Hold). */
    let upgradeCameraFromV7 = false;
    if (!raw) {
      raw = localStorage.getItem(LEGACY_V7);
      if (raw) upgradeCameraFromV7 = true;
    }
    if (!raw) {
      raw = localStorage.getItem(LEGACY_V6);
      if (raw) upgradeCameraFromV6 = true;
    }
    if (!raw) {
      raw = localStorage.getItem(LEGACY_V5);
      if (raw) resetControlsFromV5 = true;
    }
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
      if (resetControlsFromV5) {
        binds = { ...DEFAULT_BINDS };
        pad = { ...DEFAULT_PAD };
        if (parsed?.camera && typeof parsed.camera === "object") {
          mergeCamera(parsed.camera);
        }
        persist();
        return;
      }
      if (resetCameraFromV4) {
        camera = { ...DEFAULT_CAMERA };
        persist();
        return;
      }
      if (parsed?.camera && typeof parsed.camera === "object") {
        mergeCamera(parsed.camera);
      }
      // v6 → v7: fill ProfileCameraSettings fields that didn't exist yet.
      if (upgradeCameraFromV6) {
        if (typeof camera.swivelSpeed !== "number") {
          camera.swivelSpeed = DEFAULT_CAMERA.swivelSpeed;
        }
        if (typeof camera.ballCam !== "boolean") {
          camera.ballCam = DEFAULT_CAMERA.ballCam;
        }
        if (camera.ballCamMode !== "toggle" && camera.ballCamMode !== "hold") {
          camera.ballCamMode = DEFAULT_CAMERA.ballCamMode;
        }
        persist();
      }
      // v7 → v8: Ball Camera Toggle/Hold (RL Camera Settings).
      if (upgradeCameraFromV7) {
        if (camera.ballCamMode !== "toggle" && camera.ballCamMode !== "hold") {
          camera.ballCamMode = DEFAULT_CAMERA.ballCamMode;
        }
        persist();
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
    if (
      key === "invertPitch" ||
      key === "invertYaw" ||
      key === "invertLookX" ||
      key === "invertLookY"
    ) {
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
/**
 * @param {string} a
 * @param {string} b
 */
function bindsMayShare(a, b) {
  return SHAREABLE_BINDS.some((g) => g.has(a) && g.has(b));
}

export function setBind(action, code) {
  if (!(action in DEFAULT_BINDS)) return;
  if (code === "Escape") return;

  for (const key of Object.keys(binds)) {
    if (key !== action && binds[key] === code && !bindsMayShare(action, key)) {
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

  if (
    key === "invertPitch" ||
    key === "invertYaw" ||
    key === "invertLookX" ||
    key === "invertLookY"
  ) {
    pad[key] = Boolean(value);
  } else if (key === "deadzone") {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    pad.deadzone = Math.min(0.5, Math.max(0.05, n));
  } else if (
    key === "pitchAxis" ||
    key === "yawAxis" ||
    key === "lookXAxis" ||
    key === "lookYAxis"
  ) {
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
  if (key === "shake" || key === "ballCam") {
    camera[key] = Boolean(value);
    persist();
    return;
  }
  if (key === "ballCamMode") {
    if (value === "toggle" || value === "hold") {
      camera.ballCamMode = value;
      persist();
    }
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
    `${formatKeyCode(b.throttle)}${formatKeyCode(b.yawLeft)}${formatKeyCode(b.reverse)}${formatKeyCode(b.yawRight)} drive · ` +
    `stick pitch/steer · ` +
    `${formatPadButton(p.throttle)}/${formatPadButton(p.brake)} throttle/brake · ` +
    `${formatKeyCode(b.boost)}/${formatPadButton(p.boost)} boost · ` +
    `${formatKeyCode(b.jump)}/${formatPadButton(p.jump)} jump · ` +
    `${formatKeyCode(b.airRollLeft)}/${formatKeyCode(b.airRollRight)} air roll · ` +
    `${formatKeyCode(b.resetCar)}/${formatPadButton(p.resetCar)} reset · ` +
    `${formatKeyCode(b.newTarget)}/${formatPadButton(p.newTarget)} new · ` +
    `${formatKeyCode(b.toggleBallCam)}/${formatPadButton(p.toggleBallCam)} ball cam · Esc menu`
  );
}
