import { getBind, getBinds, getPad } from "./settings.js";
import { isTouchActionDown, readTouchControls } from "./touchControls.js";

/** @type {Set<string>} */
export const keys = new Set();

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  const binds = getBinds();
  const boundCodes = new Set(Object.values(binds).filter(Boolean));
  if (e.code === "Escape" || boundCodes.has(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

// Mouse buttons as bindable codes: Mouse0 (LMB), Mouse1 (RMB), Mouse2 (MMB), …
window.addEventListener("mousedown", (e) => {
  keys.add(`Mouse${e.button}`);
  const binds = getBinds();
  const code = `Mouse${e.button}`;
  if (Object.values(binds).includes(code)) e.preventDefault();
});
window.addEventListener("mouseup", (e) => {
  keys.delete(`Mouse${e.button}`);
});
window.addEventListener("blur", () => {
  keys.clear();
});

/**
 * @param {number} v
 * @param {number} deadzone
 */
function applyDeadzone(v, deadzone) {
  if (Math.abs(v) < deadzone) return 0;
  const sign = Math.sign(v);
  return sign * ((Math.abs(v) - deadzone) / (1 - deadzone));
}

function keyHeld(action) {
  const code = getBind(action);
  return Boolean(code) && keys.has(code);
}

/**
 * First connected gamepad, if any.
 * @returns {Gamepad | null}
 */
export function getActiveGamepad() {
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (pad) return pad;
  }
  return null;
}

/**
 * @param {Gamepad} pad
 * @param {number | null | undefined} buttonIndex
 */
function buttonPressed(pad, buttonIndex) {
  if (buttonIndex === null || buttonIndex === undefined) return false;
  return Boolean(pad.buttons[buttonIndex]?.pressed);
}

/**
 * @param {Gamepad} pad
 * @param {number | null | undefined} buttonIndex
 */
function buttonValue(pad, buttonIndex) {
  if (buttonIndex === null || buttonIndex === undefined) return 0;
  return pad.buttons[buttonIndex]?.value ?? 0;
}

/**
 * Aerial sticks only (legacy helper). Prefer {@link readControls}.
 * @returns {{ pitch: number, yaw: number, airLeft: boolean, airRight: boolean, usingPad: boolean }}
 */
export function readAerialInput() {
  const c = readControls();
  return {
    pitch: c.pitch,
    yaw: c.yaw,
    airLeft: c.airLeft,
    airRight: c.airRight,
    usingPad: c.usingPad,
  };
}

/**
 * Full RL control snapshot for physics.
 *
 * Rocket League mapping:
 * - Throttle / brake are separate from pitch (triggers on pad, W/S on KB)
 * - Steer (ground) and yaw (air) are separate keyboard binds; pad left stick drives both
 * - Left stick Y = pitch only (stick back = nose up)
 * - Air Roll hold remaps yaw → roll while airborne (see {@link ../airRoll.js})
 * - +pitch nose up, +yaw nose right, +roll roll right, +steer turn right
 *
 * @returns {{
 *   throttle: number,
 *   steer: number,
 *   pitch: number,
 *   yaw: number,
 *   roll: number,
 *   lookRight: number,
 *   lookUp: number,
 *   boost: boolean,
 *   jump: boolean,
 *   powerslide: boolean,
 *   airRoll: boolean,
 *   lookBehind: boolean,
 *   airLeft: boolean,
 *   airRight: boolean,
 *   usingPad: boolean,
 *   usingTouch: boolean,
 * }}
 */
export function readControls() {
  const cfg = getPad();
  let pitch = 0;
  let yaw = 0;
  let throttle = 0;
  let steer = 0;
  let lookRight = 0;
  let lookUp = 0;
  let airLeft = keyHeld("airRollLeft");
  let airRight = keyHeld("airRollRight");
  let boost = keyHeld("boost");
  let jump = keyHeld("jump");
  let powerslide = keyHeld("powerslide");
  let airRoll = keyHeld("airRoll");
  let lookBehind = keyHeld("lookBehind");
  let usingPad = false;
  let usingTouch = false;

  // Keyboard — RL dual-binds: W = throttle + pitch-down, S = reverse + pitch-up.
  // Steer and yaw are separate actions (may share A/D by default).
  if (keyHeld("throttle")) throttle += 1;
  if (keyHeld("reverse")) throttle -= 1;
  if (keyHeld("pitchUp")) pitch += 1;
  if (keyHeld("pitchDown")) pitch -= 1;
  if (keyHeld("steerRight")) steer += 1;
  if (keyHeld("steerLeft")) steer -= 1;
  if (keyHeld("yawRight")) yaw += 1;
  if (keyHeld("yawLeft")) yaw -= 1;

  const touch = readTouchControls();
  if (touch.usingTouch) {
    usingTouch = true;
    // Virtual stick = left stick: X yaw/steer, Y pitch. Throttle from stick Y
    // as a mobile convenience (no analog triggers).
    yaw = touch.yaw;
    steer = touch.yaw;
    pitch = touch.pitch;
    throttle = touch.pitch;
    airLeft = airLeft || touch.airLeft;
    airRight = airRight || touch.airRight;
    boost = boost || touch.boost;
    jump = jump || touch.jump;
  }

  const pad = getActiveGamepad();
  if (pad) {
    const pitchRaw = applyDeadzone(pad.axes[cfg.pitchAxis] ?? 0, cfg.deadzone);
    const yawRaw = applyDeadzone(pad.axes[cfg.yawAxis] ?? 0, cfg.deadzone);

    // Gamepad API: +Y is stick toward player → nose up (+pitch) like RL.
    let pitchStick = pitchRaw;
    // +X is stick right → yaw/steer right. (No extra negate.)
    let yawStick = yawRaw;
    if (cfg.invertPitch) pitchStick = -pitchStick;
    if (cfg.invertYaw) yawStick = -yawStick;

    // Triggers: RT accelerate, LT brake/reverse (analog).
    const accel = buttonValue(pad, cfg.throttle);
    const brake = buttonValue(pad, cfg.brake);
    const padThrottle = accel - brake;
    const padDriveActive =
      Math.abs(pitchStick) > 0 ||
      Math.abs(yawStick) > 0 ||
      Math.abs(padThrottle) > 0.02;
    // A resting pad must not kill keyboard/touch drive (common with pads left plugged in).
    const kbOrTouchDrive =
      Math.abs(pitch) > 0 ||
      Math.abs(yaw) > 0 ||
      Math.abs(steer) > 0 ||
      Math.abs(throttle) > 0;
    if (padDriveActive || !kbOrTouchDrive) {
      usingPad = true;
      pitch = pitchStick;
      yaw = yawStick;
      steer = yawStick;
      throttle = padThrottle;
    }

    airLeft = airLeft || buttonPressed(pad, cfg.airRollLeft);
    airRight = airRight || buttonPressed(pad, cfg.airRollRight);
    boost = boost || buttonPressed(pad, cfg.boost);
    jump = jump || buttonPressed(pad, cfg.jump);
    powerslide = powerslide || buttonPressed(pad, cfg.powerslide);
    airRoll = airRoll || buttonPressed(pad, cfg.airRoll);
    lookBehind = lookBehind || buttonPressed(pad, cfg.lookBehind);

    if (!boost && buttonValue(pad, cfg.boost) > 0.3) boost = true;

    // Right stick = camera swivel (LookRight / LookUp → GetDesiredSwivel).
    const lookXRaw = applyDeadzone(pad.axes[cfg.lookXAxis] ?? 0, cfg.deadzone);
    const lookYRaw = applyDeadzone(pad.axes[cfg.lookYAxis] ?? 0, cfg.deadzone);
    lookRight = cfg.invertLookX ? -lookXRaw : lookXRaw;
    // Gamepad API +Y is stick toward player; RL look-up is stick away → negate.
    lookUp = cfg.invertLookY ? lookYRaw : -lookYRaw;
    if (Math.abs(lookRight) > 0 || Math.abs(lookUp) > 0) usingPad = true;
  }

  // Spec: +roll = roll right. Free air-roll (Air Roll hold) is applied in stepCar.
  let roll = 0;
  if (airRight) roll += 1;
  if (airLeft) roll -= 1;

  pitch = Math.max(-1, Math.min(1, pitch));
  yaw = Math.max(-1, Math.min(1, yaw));
  roll = Math.max(-1, Math.min(1, roll));
  throttle = Math.max(-1, Math.min(1, throttle));
  steer = Math.max(-1, Math.min(1, steer));
  lookRight = Math.max(-1, Math.min(1, lookRight));
  lookUp = Math.max(-1, Math.min(1, lookUp));

  return {
    throttle,
    steer,
    pitch,
    yaw,
    roll,
    lookRight,
    lookUp,
    boost,
    jump,
    powerslide,
    airRoll,
    lookBehind,
    airLeft,
    airRight,
    usingPad,
    usingTouch,
  };
}

/**
 * Edge-detect for a bind action (keyboard / pad / touch).
 * Call once per frame with a stable latch object; returns true on press edge.
 * @param {import("./settings.js").BindAction} action
 * @param {{ wasDown?: boolean }} latch
 * @returns {boolean}
 */
export function pollActionEdge(action, latch) {
  const down = isActionDown(action);
  const edged = down && !latch.wasDown;
  latch.wasDown = down;
  return edged;
}

/**
 * Edge-detect RL "Toggle Ball Cam" bind.
 * @param {{ wasDown?: boolean }} latch
 * @returns {boolean}
 */
export function pollBallCamToggle(latch) {
  return pollActionEdge("toggleBallCam", latch);
}

/**
 * @param {{ usingPad?: boolean, usingTouch?: boolean }} controls
 */
export function inputSourceLabel(controls) {
  if (controls.usingPad) return "Gamepad";
  if (controls.usingTouch) return "Touch";
  return "Keyboard";
}

/**
 * @param {import("./settings.js").BindAction} action
 * @returns {boolean}
 */
export function isActionDown(action) {
  if (keyHeld(action)) return true;
  if (isTouchActionDown(action)) return true;

  const cfg = getPad();
  const pad = getActiveGamepad();
  if (!pad) return false;

  if (action === "airRollLeft") return buttonPressed(pad, cfg.airRollLeft);
  if (action === "airRollRight") return buttonPressed(pad, cfg.airRollRight);
  if (action === "resetCar") return buttonPressed(pad, cfg.resetCar);
  if (action === "newTarget") return buttonPressed(pad, cfg.newTarget);
  if (action === "toggleBallCam") return buttonPressed(pad, cfg.toggleBallCam);
  if (action === "lookBehind") return buttonPressed(pad, cfg.lookBehind);
  if (action === "boost") return buttonPressed(pad, cfg.boost);
  if (action === "jump") return buttonPressed(pad, cfg.jump);
  if (action === "powerslide") return buttonPressed(pad, cfg.powerslide);
  if (action === "airRoll") return buttonPressed(pad, cfg.airRoll);
  if (action === "throttle") return buttonValue(pad, cfg.throttle) > 0.3;
  if (action === "reverse" || action === "brake") {
    return buttonValue(pad, cfg.brake) > 0.3;
  }
  return false;
}

/**
 * Returns the first pressed button index, or null.
 * Ignores buttons that were already down when listening started (via mask).
 * @param {Set<number> | null} [ignore]
 * @returns {number | null}
 */
export function pollGamepadButtonPress(ignore = null) {
  const pad = getActiveGamepad();
  if (!pad) return null;
  for (let i = 0; i < pad.buttons.length; i++) {
    if (!pad.buttons[i]?.pressed) continue;
    if (ignore?.has(i)) continue;
    return i;
  }
  return null;
}

/**
 * @returns {Set<number>}
 */
export function snapshotPressedButtons() {
  const out = new Set();
  const pad = getActiveGamepad();
  if (!pad) return out;
  for (let i = 0; i < pad.buttons.length; i++) {
    if (pad.buttons[i]?.pressed) out.add(i);
  }
  return out;
}
