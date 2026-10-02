const STORAGE_KEY = "rl-airroll-trainer-settings-v9";
const LEGACY_V8 = "rl-airroll-trainer-settings-v8";
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
 * Keyboard defaults mirror Rocket League PC controls.
 * Dual-binds (Accelerate+Pitch Down, etc.) are allowed via SHAREABLE_BINDS.
 */
export const DEFAULT_BINDS = {
  throttle: "KeyW",
  reverse: "KeyS",
  steerLeft: "KeyA",
  steerRight: "KeyD",
  // Pitch forward = nose down (same key as throttle, like RL dual-bind).
  pitchDown: "KeyW",
  // Pitch back = nose up (same key as reverse).
  pitchUp: "KeyS",
  yawLeft: "KeyA",
  yawRight: "KeyD",
  boost: "ShiftLeft",
  jump: "Space",
  jumpAlternative: "",
  powerslide: "ControlLeft",
  /** Free air-roll hold (RL "Air Roll") — defaults to same key as Powerslide. */
  airRoll: "ControlLeft",
  airRollLeft: "KeyQ",
  airRollRight: "KeyE",
  toggleBallCam: "KeyC",
  lookBehind: "AltLeft",
  lookUp: "",
  lookDown: "",
  lookLeft: "",
  lookRight: "",
  resetCar: "KeyR",
  newTarget: "KeyN",
  takePossession: "Digit1",
  startDribble: "Digit2",
  passBall: "Digit3",
  launchBall: "Digit4",
  defendShot: "Digit5",
  resetBall: "",
};

export const FREEPLAY_BALL_ACTIONS = ["takePossession", "startDribble", "passBall", "launchBall", "defendShot", "resetBall"];

/** Pairs that may share one physical key (RL dual-binds). */
const SHAREABLE_BINDS = [
  new Set(["throttle", "pitchDown"]),
  new Set(["reverse", "pitchUp"]),
  new Set(["steerLeft", "yawLeft"]),
  new Set(["steerRight", "yawRight"]),
  new Set(["powerslide", "airRoll"]),
];

export const BIND_LABELS = {
  throttle: "Drive Forward",
  reverse: "Drive Backwards",
  steerLeft: "Steer Left",
  steerRight: "Steer Right",
  pitchUp: "Pitch Up",
  pitchDown: "Pitch Down",
  yawLeft: "Air Steer Left",
  yawRight: "Air Steer Right",
  boost: "Boost",
  jump: "Jump",
  jumpAlternative: "Jump (Alternative)",
  powerslide: "Powerslide",
  airRoll: "Air Roll",
  airRollLeft: "Air Roll Left",
  airRollRight: "Air Roll Right",
  toggleBallCam: "Focus on Ball",
  lookBehind: "Rear View",
  lookUp: "Look Up",
  lookDown: "Look Down",
  lookLeft: "Look Left",
  lookRight: "Look Right",
  resetCar: "Reset Shot",
  newTarget: "Skip / Next",
  takePossession: "Take Possession",
  startDribble: "Start Dribble",
  passBall: "Pass Ball",
  launchBall: "Launch Ball",
  defendShot: "Defend Shot",
  resetBall: "Ball Reset",
};

/**
 * Settings rows matching Rocket League's Controls screen.
 * `pad` = pad button setting key, or a fixed stick hint string, or null.
 *
 * @type {{ id: string, title: string, actions: { id: BindAction, pad: string | null }[] }[]}
 */
export const BIND_SECTIONS = [
  {
    id: "driving",
    title: "Driving",
    actions: [
      { id: "throttle", pad: "throttle" },
      { id: "reverse", pad: "brake" },
      { id: "steerRight", pad: "stick:Left Stick" },
      { id: "steerLeft", pad: "stick:Left Stick" },
      { id: "jump", pad: "jump" },
      { id: "jumpAlternative", pad: "jumpAlternative" },
      { id: "boost", pad: "boost" },
      { id: "powerslide", pad: "powerslide" },
      { id: "airRoll", pad: "airRoll" },
      { id: "toggleBallCam", pad: "toggleBallCam" },
      { id: "lookBehind", pad: "lookBehind" },
    ],
  },
  {
    id: "air",
    title: "Air Control",
    actions: [
      { id: "yawRight", pad: "stick:Left Stick" },
      { id: "yawLeft", pad: "stick:Left Stick" },
      { id: "pitchUp", pad: "stick:Left Stick" },
      { id: "pitchDown", pad: "stick:Left Stick" },
      { id: "airRollLeft", pad: "airRollLeft" },
      { id: "airRollRight", pad: "airRollRight" },
    ],
  },
  {
    id: "camera",
    title: "Camera",
    actions: [
      { id: "lookUp", pad: "stick:Right Stick ↑" },
      { id: "lookDown", pad: "stick:Right Stick ↓" },
      { id: "lookLeft", pad: "stick:Right Stick ←" },
      { id: "lookRight", pad: "stick:Right Stick →" },
    ],
  },
  {
    id: "freeplay-ball",
    title: "Free Play Ball Control",
    actions: FREEPLAY_BALL_ACTIONS.map(id => ({ id, pad: id })),
  },
  {
    id: "training",
    title: "Training",
    actions: [
      { id: "resetCar", pad: "resetCar" },
      { id: "newTarget", pad: "newTarget" },
    ],
  },
];

/**
 * Xbox-style Gamepad API indices — Rocket League defaults:
 * RT accelerate, LT brake, A jump, B boost, X powerslide/air-roll, LB/RB air roll L/R.
 */
export const DEFAULT_PAD = {
  throttle: 7, // RT / R2
  brake: 6, // LT / L2
  boost: 1, // B / Circle
  jump: 0, // A / Cross
  jumpAlternative: null,
  powerslide: 2, // X / Square
  airRoll: 2, // X / Square (same as powerslide by default)
  airRollLeft: 4, // LB
  airRollRight: 5, // RB
  resetCar: 8, // Back / Share
  newTarget: 3, // Y / Triangle
  /** RL Toggle Ball Cam — Right stick click (R3). */
  toggleBallCam: 11,
  lookBehind: 10, // L3
  takePossession: 13,
  startDribble: 12,
  passBall: 14,
  launchBall: 15,
  defendShot: 4,
  resetBall: null,
  pitchAxis: 1, // Left stick Y
  yawAxis: 0, // Left stick X
  lookXAxis: 2, // Right stick X (camera swivel)
  lookYAxis: 3, // Right stick Y (camera swivel)
  invertPitch: false,
  invertYaw: false,
  invertLookX: false,
  invertLookY: false,
  deadzone: 0.1,
  freeLookDeadzone: 0.1,
  steeringSensitivity: 1,
  aerialSensitivity: 1,
  dodgeDeadzone: 0.5,
};

export const CONTROL_SLIDERS = [
  { key: "steeringSensitivity", label: "Steering Sensitivity", min: 1, max: 10, step: 0.01 },
  { key: "aerialSensitivity", label: "Aerial Sensitivity", min: 1, max: 10, step: 0.01 },
  { key: "deadzone", label: "Controller Deadzone", min: 0, max: 0.5, step: 0.01 },
  { key: "freeLookDeadzone", label: "Camera Swivel Deadzone", min: 0.05, max: 0.5, step: 0.01 },
  { key: "dodgeDeadzone", label: "Dodge Deadzone", min: 0.1, max: 1, step: 0.01 },
];

export const PAD_BUTTON_ACTIONS = [
  "throttle",
  "brake",
  "boost",
  "jump",
  "jumpAlternative",
  "powerslide",
  "airRoll",
  "airRollLeft",
  "airRollRight",
  "resetCar",
  "newTarget",
  "toggleBallCam",
  "lookBehind",
  ...FREEPLAY_BALL_ACTIONS,
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
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "View",
  9: "Menu",
  10: "LS",
  11: "RS",
  12: "D-Pad Up",
  13: "D-Pad Down",
  14: "D-Pad Left",
  15: "D-Pad Right",
};

const PLAYSTATION_BUTTON_NAMES = {
  ...PAD_BUTTON_NAMES,
  0: "Cross", 1: "Circle", 2: "Square", 3: "Triangle",
  4: "L1", 5: "R1", 6: "L2", 7: "R2",
  8: "Share", 9: "Options", 10: "L3", 11: "R3",
};
let controllerLayout = "xbox";

export function getControllerLayout() {
  return controllerLayout;
}

export function setControllerLayout(value) {
  if (value !== "xbox" && value !== "playstation") return;
  controllerLayout = value;
  persist();
}

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
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ binds, pad, camera, controllerLayout }),
    );
  } catch { }
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

/**
 * Fill new v9 bind/pad fields from older saved data.
 * @param {Record<string, unknown>} [savedBinds]
 * @param {Record<string, unknown>} [savedPad]
 */
function applyV9Defaults(savedBinds, savedPad) {
  if (savedBinds?.steerLeft === undefined) {
    binds.steerLeft =
      typeof savedBinds?.yawLeft === "string"
        ? savedBinds.yawLeft
        : DEFAULT_BINDS.steerLeft;
  }
  if (savedBinds?.steerRight === undefined) {
    binds.steerRight =
      typeof savedBinds?.yawRight === "string"
        ? savedBinds.yawRight
        : DEFAULT_BINDS.steerRight;
  }
  if (savedBinds?.airRoll === undefined) {
    binds.airRoll =
      typeof savedBinds?.powerslide === "string"
        ? savedBinds.powerslide
        : DEFAULT_BINDS.airRoll;
  }
  if (typeof binds.lookBehind !== "string") {
    binds.lookBehind = DEFAULT_BINDS.lookBehind;
  }
  if (savedPad?.airRoll === undefined) {
    pad.airRoll =
      typeof savedPad?.powerslide === "number" && Number.isInteger(savedPad.powerslide) && savedPad.powerslide >= 0
        ? savedPad.powerslide
        : DEFAULT_PAD.airRoll;
  }
  if (pad.lookBehind === undefined) {
    pad.lookBehind = DEFAULT_PAD.lookBehind;
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
    /** v8 lacked steer/airRoll/lookBehind as separate binds. */
    let upgradeBindsFromV8 = false;
    if (!raw) {
      raw = localStorage.getItem(LEGACY_V8);
      if (raw) upgradeBindsFromV8 = true;
    }
    if (!raw) {
      raw = localStorage.getItem(LEGACY_V7);
      if (raw) {
        upgradeCameraFromV7 = true;
        upgradeBindsFromV8 = true;
      }
    }
    if (!raw) {
      raw = localStorage.getItem(LEGACY_V6);
      if (raw) {
        upgradeCameraFromV6 = true;
        upgradeBindsFromV8 = true;
      }
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
      if (raw) upgradeBindsFromV8 = true;
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
          applyV9Defaults(parsed.binds, parsed.pad);
        }
        if (parsed?.pad && typeof parsed.pad === "object") {
          mergePad(parsed.pad);
          applyV9Defaults(parsed.binds, parsed.pad);
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
      if (parsed?.controllerLayout === "playstation") controllerLayout = "playstation";
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
      }
      // v7 → v8: Ball Camera Toggle/Hold (RL Camera Settings).
      if (upgradeCameraFromV7) {
        if (camera.ballCamMode !== "toggle" && camera.ballCamMode !== "hold") {
          camera.ballCamMode = DEFAULT_CAMERA.ballCamMode;
        }
      }
      if (upgradeBindsFromV8) {
        applyV9Defaults(parsed?.binds, parsed?.pad);
      }
      // Always ensure new keys exist even on fresh v9 loads from partial data.
      applyV9Defaults(parsed?.binds, parsed?.pad);
      persist();
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
    applyV9Defaults(parsed, null);
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
    const slider = CONTROL_SLIDERS.find(slider => slider.key === key);
    if (slider) {
      if (typeof val === "number" && Number.isFinite(val)) pad[key] = Math.min(slider.max, Math.max(slider.min, val));
      continue;
    }
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
    } else if (key === "pitchAxis" || key === "yawAxis" || key === "lookXAxis" || key === "lookYAxis") {
      if (typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 3) pad[key] = val;
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
 * @param {string} a
 * @param {string} b
 */
function bindsMayShare(a, b) {
  return FREEPLAY_BALL_ACTIONS.includes(a) !== FREEPLAY_BALL_ACTIONS.includes(b) ||
    SHAREABLE_BINDS.some((g) => g.has(a) && g.has(b));
}

/**
 * @param {BindAction} action
 * @param {string} code  Keyboard `e.code`, `Mouse0`…, or `""` to clear
 */
export function setBind(action, code) {
  if (!(action in DEFAULT_BINDS)) return;
  // Escape is reserved for cancelling listen mode in the UI.
  if (code === "Escape") return;

  for (const key of Object.keys(binds)) {
    if (key !== action && binds[key] === code && code && !bindsMayShare(action, key)) {
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

export function getControlPreset() {
  if (Object.entries(XEXEAD_CONTROLS.binds).every(([key, value]) => binds[key] === value) &&
    Object.entries(XEXEAD_CONTROLS.pad).every(([key, value]) => pad[key] === value)) return "xexead";
  return Object.entries(DEFAULT_BINDS).every(([key, value]) => binds[key] === value) &&
    PAD_BUTTON_ACTIONS.every(key => pad[key] === DEFAULT_PAD[key]) ? "default" : "custom";
}

export const XEXEAD_CONTROLS = {
  binds: {
    throttle: "KeyW", reverse: "KeyS", steerRight: "KeyD", steerLeft: "KeyA",
    yawRight: "KeyD", yawLeft: "KeyA", pitchUp: "KeyS", pitchDown: "KeyW",
    jump: "KeyJ", jumpAlternative: "", boost: "KeyK", powerslide: "KeyL", airRoll: "",
    airRollRight: "KeyE", airRollLeft: "KeyQ", toggleBallCam: "KeyU", lookBehind: "KeyI",
    lookUp: "", lookDown: "", lookRight: "", lookLeft: "",
  },
  pad: {
    throttle: 7, brake: 6, jump: 0, jumpAlternative: null, boost: 15, powerslide: 2, airRoll: null,
    resetCar: 1,
    airRollRight: 5, airRollLeft: 4, toggleBallCam: 3, lookBehind: 11,
    pitchAxis: 1, yawAxis: 0, lookXAxis: 2, lookYAxis: 3,
    invertPitch: false, invertYaw: false, invertLookX: false, invertLookY: false,
    steeringSensitivity: 1, aerialSensitivity: 1, deadzone: 0, freeLookDeadzone: 0.1, dodgeDeadzone: 0.8,
  },
};

export function applyControlPreset(id) {
  if (id !== "xexead") return;
  Object.assign(binds, XEXEAD_CONTROLS.binds);
  Object.assign(pad, XEXEAD_CONTROLS.pad);
  for (const action of FREEPLAY_BALL_ACTIONS.concat("newTarget")) {
    if (pad[action] === pad.boost || pad[action] === pad.toggleBallCam) pad[action] = null;
  }
  setControllerLayout("playstation");
  persist();
}

export function resetControlBindings() {
  binds = { ...DEFAULT_BINDS };
  for (const key of PAD_BUTTON_ACTIONS) pad[key] = DEFAULT_PAD[key];
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
  const slider = CONTROL_SLIDERS.find(slider => slider.key === key);
  if (slider) {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    pad[key] = Math.min(slider.max, Math.max(slider.min, value));
    persist();
    return;
  }

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
        if (action !== key && pad[action] === n && !padButtonsMayShare(action, key)) {
          pad[action] = null;
        }
      }
      pad[key] = n;
    }
  }
  persist();
}

/**
 * @param {string} a
 * @param {string} b
 */
function padButtonsMayShare(a, b) {
  return (
    FREEPLAY_BALL_ACTIONS.includes(a) !== FREEPLAY_BALL_ACTIONS.includes(b) ||
    (a === "powerslide" && b === "airRoll") ||
    (a === "airRoll" && b === "powerslide")
  );
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

export function applyCameraPreset(values) {
  mergeCamera(values);
  persist();
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
  if (code.startsWith("Mouse")) {
    const btn = code.slice(5);
    // DOM MouseEvent.button: 0=left, 1=middle, 2=right
    return { "0": "LMB", "1": "MMB", "2": "RMB", "3": "Mouse 3", "4": "Mouse 4" }[
      btn
    ] ?? code;
  }
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
    Tab: "Tab",
    CapsLock: "Caps",
    Enter: "Enter",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PgUp",
    PageDown: "PgDn",
  };
  return special[code] ?? code;
}

/**
 * @param {number | null | undefined} index
 * @returns {string}
 */
export function formatPadButton(index) {
  if (index === null || index === undefined) return "—";
  const names = controllerLayout === "playstation" ? PLAYSTATION_BUTTON_NAMES : PAD_BUTTON_NAMES;
  return names[index] ?? `Button ${index}`;
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
    `${formatKeyCode(b.throttle)}${formatKeyCode(b.steerLeft)}${formatKeyCode(b.reverse)}${formatKeyCode(b.steerRight)} drive · ` +
    `stick pitch/steer · ` +
    `${formatPadButton(p.throttle)}/${formatPadButton(p.brake)} throttle/brake · ` +
    `${formatKeyCode(b.boost)}/${formatPadButton(p.boost)} boost · ` +
    `${formatKeyCode(b.jump)}/${formatPadButton(p.jump)} jump · ` +
    `${formatKeyCode(b.airRoll)}/${formatKeyCode(b.airRollLeft)}/${formatKeyCode(b.airRollRight)} air roll · ` +
    `${formatKeyCode(b.resetCar)}/${formatPadButton(p.resetCar)} reset · ` +
    `${formatKeyCode(b.newTarget)}/${formatPadButton(p.newTarget)} new · ` +
    `${formatKeyCode(b.toggleBallCam)}/${formatPadButton(p.toggleBallCam)} ball cam · ` +
    `${formatKeyCode(b.lookBehind)} rear · Esc menu`
  );
}
