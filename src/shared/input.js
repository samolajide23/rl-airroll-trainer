import { getBind, getBinds, getPad } from "./settings.js";

/** @type {Set<string>} */
export const keys = new Set();

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  const binds = getBinds();
  const boundCodes = new Set(Object.values(binds).filter(Boolean));
  if (e.code === "Escape" || boundCodes.has(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

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
 * Signs: +pitch nose up, +yaw nose right, +roll roll right (via airLeft/airRight).
 *
 * @returns {{
 *   throttle: number,
 *   steer: number,
 *   pitch: number,
 *   yaw: number,
 *   roll: number,
 *   boost: boolean,
 *   jump: boolean,
 *   airLeft: boolean,
 *   airRight: boolean,
 *   usingPad: boolean,
 * }}
 */
export function readControls() {
  const cfg = getPad();
  let pitch = 0;
  let yaw = 0;
  let throttle = 0;
  let steer = 0;
  let airLeft = keyHeld("airRollLeft");
  let airRight = keyHeld("airRollRight");
  let boost = keyHeld("boost");
  let jump = keyHeld("jump");
  let usingPad = false;

  if (keyHeld("pitchUp")) pitch += 1;
  if (keyHeld("pitchDown")) pitch -= 1;
  // Spec: +yaw = nose right
  if (keyHeld("yawRight")) yaw += 1;
  if (keyHeld("yawLeft")) yaw -= 1;
  if (keyHeld("throttle")) throttle += 1;
  if (keyHeld("reverse")) throttle -= 1;

  const pad = getActiveGamepad();
  if (pad) {
    usingPad = true;
    const pitchRaw = applyDeadzone(pad.axes[cfg.pitchAxis] ?? 0, cfg.deadzone);
    const yawRaw = applyDeadzone(pad.axes[cfg.yawAxis] ?? 0, cfg.deadzone);

    // Stick back (positive Y) = nose up; stick right should yaw nose right after sign fix.
    // Horizontal was inverted vs RL feel — negate X. Toggle Invert yaw in Settings to flip.
    let pitchStick = pitchRaw;
    let yawStick = -yawRaw;
    if (cfg.invertPitch) pitchStick = -pitchStick;
    if (cfg.invertYaw) yawStick = -yawStick;

    if (pitchStick) pitch = pitchStick;
    if (yawStick) yaw = yawStick;

    // Same stick used as steer/throttle on ground when we need them
    steer = yawStick;
    throttle = pitchStick;

    airLeft = airLeft || buttonPressed(pad, cfg.airRollLeft);
    airRight = airRight || buttonPressed(pad, cfg.airRollRight);
    boost = boost || buttonPressed(pad, cfg.boost);
    jump = jump || buttonPressed(pad, cfg.jump);

    // Analog triggers if bound as boost
    if (!boost && buttonValue(pad, cfg.boost) > 0.3) boost = true;
  }

  // Spec: +roll = roll right
  let roll = 0;
  if (airRight) roll += 1;
  if (airLeft) roll -= 1;

  pitch = Math.max(-1, Math.min(1, pitch));
  yaw = Math.max(-1, Math.min(1, yaw));
  roll = Math.max(-1, Math.min(1, roll));
  throttle = Math.max(-1, Math.min(1, throttle));
  steer = Math.max(-1, Math.min(1, steer));

  return {
    throttle,
    steer,
    pitch,
    yaw,
    roll,
    boost,
    jump,
    airLeft,
    airRight,
    usingPad,
  };
}

/**
 * @param {import("./settings.js").BindAction} action
 * @returns {boolean}
 */
export function isActionDown(action) {
  if (keyHeld(action)) return true;

  const cfg = getPad();
  const pad = getActiveGamepad();
  if (!pad) return false;

  if (action === "airRollLeft") return buttonPressed(pad, cfg.airRollLeft);
  if (action === "airRollRight") return buttonPressed(pad, cfg.airRollRight);
  if (action === "resetCar") return buttonPressed(pad, cfg.resetCar);
  if (action === "newTarget") return buttonPressed(pad, cfg.newTarget);
  if (action === "boost") return buttonPressed(pad, cfg.boost);
  if (action === "jump") return buttonPressed(pad, cfg.jump);
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
