import { getActiveGamepad, snapshotPressedButtons } from "./input.js";
import { getPad } from "./settings.js";

/** Standard Gamepad API indices (Xbox / Southpaw layout). */
const BTN_CONFIRM = 0; // A / Cross
const BTN_BACK = 1; // B / Circle
const BTN_UP = 12;
const BTN_DOWN = 13;
const BTN_LEFT = 14;
const BTN_RIGHT = 15;

const STICK_THRESHOLD = 0.55;
const NAV_INITIAL_DELAY_MS = 320;
const NAV_REPEAT_MS = 120;
const FOCUS_CLASS = "menu-focus";

/**
 * @typedef {{
 *   getActiveScreen: () => HTMLElement | null,
 *   isMenuActive: () => boolean,
 *   isListeningPad: () => boolean,
 *   isListeningKey: () => boolean,
 *   cancelListening: () => void,
 *   onBack: () => void,
 * }} MenuGamepadHooks
 */

/**
 * Controller navigation for overlay menus (hub, play, locker, settings, etc.).
 * @param {MenuGamepadHooks} hooks
 */
export function createMenuGamepad(hooks) {
  /** @type {HTMLElement | null} */
  let focused = null;
  /** @type {Set<number>} */
  let ignoreButtons = new Set();
  let stickLatched = false;
  let lastNavAt = 0;
  let nextNavAt = 0;
  let confirmLatched = false;
  let backLatched = false;
  /** Track screen identity so rebuilds / switches clear latch state. */
  let lastScreen = /** @type {HTMLElement | null} */ (null);

  function clearFocusClass() {
    if (focused) focused.classList.remove(FOCUS_CLASS);
  }

  /**
   * @param {HTMLElement | null} el
   */
  function setFocused(el) {
    if (focused === el) return;
    clearFocusClass();
    focused = el;
    if (focused) {
      focused.classList.add(FOCUS_CLASS);
      try {
        focused.focus({ preventScroll: true });
      } catch {
        // Some inputs may reject programmatic focus; class outline still applies.
      }
      focused.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function latchHeldInputs() {
    ignoreButtons = snapshotPressedButtons();
    stickLatched = true;
    confirmLatched = true;
    backLatched = true;
    lastNavAt = 0;
    nextNavAt = 0;
  }

  /**
   * Call after any menu screen change or DOM rebuild of focusables.
   */
  function onScreenChange() {
    clearFocusClass();
    focused = null;
    lastScreen = hooks.getActiveScreen();
    latchHeldInputs();
  }

  /**
   * @param {HTMLElement} screen
   * @returns {HTMLElement[]}
   */
  function collectFocusables(screen) {
    const nodes = screen.querySelectorAll(
      'button:not([disabled]), select:not([disabled]), input[type="checkbox"]:not([disabled]), input[type="range"]:not([disabled])',
    );
    /** @type {HTMLElement[]} */
    const out = [];
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.closest(".hidden, [hidden]")) continue;
      out.push(node);
    }
    return out;
  }

  /**
   * Split into horizontal tab row + vertical main list.
   * @param {HTMLElement[]} items
   * @returns {{ tabs: HTMLElement[], main: HTMLElement[] }}
   */
  function partition(items) {
    /** @type {HTMLElement[]} */
    const tabs = [];
    /** @type {HTMLElement[]} */
    const main = [];
    for (const el of items) {
      if (el.classList.contains("settings-tab")) tabs.push(el);
      else main.push(el);
    }
    return { tabs, main };
  }

  /**
   * @param {HTMLElement} screen
   */
  function ensureFocus(screen) {
    const items = collectFocusables(screen);
    if (!items.length) {
      setFocused(null);
      return items;
    }
    if (!focused || !focused.isConnected || !items.includes(focused)) {
      const { tabs, main } = partition(items);
      setFocused(main[0] ?? tabs[0] ?? items[0]);
    }
    return items;
  }

  /**
   * @param {Gamepad} pad
   * @param {number} index
   */
  function rawPressed(pad, index) {
    return Boolean(pad.buttons[index]?.pressed);
  }

  /**
   * Edge-triggered press that respects the ignore mask from screen changes.
   * @param {Gamepad} pad
   * @param {number} index
   * @param {boolean} wasLatched
   * @returns {{ pressed: boolean, latched: boolean }}
   */
  function edgeButton(pad, index, wasLatched) {
    const down = rawPressed(pad, index);
    if (!down) {
      ignoreButtons.delete(index);
      return { pressed: false, latched: false };
    }
    if (ignoreButtons.has(index)) {
      return { pressed: false, latched: true };
    }
    if (wasLatched) return { pressed: false, latched: true };
    return { pressed: true, latched: true };
  }

  /**
   * @param {Gamepad} pad
   * @returns {{ x: number, y: number }}
   */
  function readStick(pad) {
    const cfg = getPad();
    const x = pad.axes[cfg.yawAxis] ?? 0;
    const y = pad.axes[cfg.pitchAxis] ?? 0;
    return { x, y };
  }

  /**
   * @param {HTMLElement[]} items
   * @param {HTMLElement} current
   * @param {-1 | 1} delta
   */
  function moveInList(items, current, delta) {
    if (!items.length) return;
    const idx = items.indexOf(current);
    if (idx < 0) {
      setFocused(items[0]);
      return;
    }
    const next = (idx + delta + items.length) % items.length;
    setFocused(items[next]);
  }

  /**
   * @param {HTMLElement} el
   * @param {-1 | 1} dir
   * @returns {boolean} true if the control consumed the input
   */
  function adjustControl(el, dir) {
    if (el instanceof HTMLSelectElement) {
      const max = el.options.length;
      if (max < 2) return true;
      const next = (el.selectedIndex + dir + max) % max;
      el.selectedIndex = next;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (el instanceof HTMLInputElement && el.type === "range") {
      const step = Number(el.step) || 0.01;
      const min = Number(el.min);
      const max = Number(el.max);
      let next = Number(el.value) + dir * step;
      if (Number.isFinite(min)) next = Math.max(min, next);
      if (Number.isFinite(max)) next = Math.min(max, next);
      el.value = String(next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  /**
   * @param {HTMLElement[]} items
   * @param {"up" | "down" | "left" | "right"} dir
   */
  function navigate(items, dir) {
    if (!focused || !items.includes(focused)) {
      const screen = items[0]?.closest(".screen");
      if (screen instanceof HTMLElement) ensureFocus(screen);
      return;
    }

    const { tabs, main } = partition(items);
    const onTab = tabs.includes(focused);
    const onMain = main.includes(focused);

    if (dir === "left" || dir === "right") {
      const delta = dir === "left" ? -1 : 1;
      if (onTab) {
        moveInList(tabs, focused, delta);
        return;
      }
      if (adjustControl(focused, delta)) return;
      if (focused instanceof HTMLInputElement && focused.type === "checkbox") {
        focused.checked = !focused.checked;
        focused.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (main.length && onMain) moveInList(main, focused, delta);
      return;
    }

    const delta = dir === "up" ? -1 : 1;
    const bindingRow = focused.closest(".bind-row-cols");
    if (bindingRow && !onTab) {
      const rows = [...bindingRow.parentElement.querySelectorAll(".bind-row-cols")];
      const nextRow = rows[rows.indexOf(bindingRow) + delta];
      if (nextRow) {
        const column = [...bindingRow.children].indexOf(focused.closest(".binding-cell") ?? focused);
        const nextCell = nextRow.children[column];
        const candidates = items.filter(item => nextCell?.contains(item));
        const target = focused.classList.contains("binding-clear")
          ? candidates.find(item => item.classList.contains("binding-clear")) ?? candidates[0]
          : candidates[0];
        if (target) setFocused(target);
        else {
          const fallback = items.find(item => nextRow.contains(item));
          if (fallback) setFocused(fallback);
        }
        return;
      }
    }
    if (onTab) {
      if (dir === "down" && main.length) setFocused(main[0]);
      else if (dir === "up" && main.length) setFocused(main[main.length - 1]);
      else moveInList(tabs, focused, delta);
      return;
    }

    if (onMain) {
      const idx = main.indexOf(focused);
      if (dir === "up" && idx === 0 && tabs.length) {
        setFocused(tabs[tabs.length - 1]);
        return;
      }
      if (dir === "down" && idx === main.length - 1 && tabs.length) {
        setFocused(tabs[0]);
        return;
      }
      moveInList(main, focused, delta);
    }
  }

  function activateFocused() {
    if (!focused) return;
    if (focused instanceof HTMLInputElement && focused.type === "checkbox") {
      focused.checked = !focused.checked;
      focused.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (focused instanceof HTMLSelectElement) {
      adjustControl(focused, 1);
      return;
    }
    if (focused instanceof HTMLInputElement && focused.type === "range") {
      return;
    }
    focused.click();
  }

  /**
   * Resolve a single navigation direction from d-pad + stick with edge + repeat.
   * @param {Gamepad} pad
   * @param {number} now
   * @returns {"up" | "down" | "left" | "right" | null}
   */
  function pollNavDirection(pad, now) {
    const dpadUp = rawPressed(pad, BTN_UP) && !ignoreButtons.has(BTN_UP);
    const dpadDown = rawPressed(pad, BTN_DOWN) && !ignoreButtons.has(BTN_DOWN);
    const dpadLeft = rawPressed(pad, BTN_LEFT) && !ignoreButtons.has(BTN_LEFT);
    const dpadRight = rawPressed(pad, BTN_RIGHT) && !ignoreButtons.has(BTN_RIGHT);

    const { x, y } = readStick(pad);
    const stickUp = y < -STICK_THRESHOLD;
    const stickDown = y > STICK_THRESHOLD;
    const stickLeft = x < -STICK_THRESHOLD;
    const stickRight = x > STICK_THRESHOLD;
    const stickActive = stickUp || stickDown || stickLeft || stickRight;
    const anyHeld = dpadUp || dpadDown || dpadLeft || dpadRight || stickActive;

    if (!stickActive) stickLatched = false;
    if (!anyHeld) {
      lastNavAt = 0;
      nextNavAt = 0;
      return null;
    }

    /** @type {"up" | "down" | "left" | "right" | null} */
    let held = null;
    if (dpadUp || stickUp) held = "up";
    else if (dpadDown || stickDown) held = "down";
    else if (dpadLeft || stickLeft) held = "left";
    else if (dpadRight || stickRight) held = "right";
    if (!held) return null;

    const dpadHeld = dpadUp || dpadDown || dpadLeft || dpadRight;
    const stickEdge = stickActive && !stickLatched;
    // "first" only for a fresh d-pad press or stick leaving neutral — not a stick
    // still held after onScreenChange latched it.
    const first = lastNavAt === 0 && (dpadHeld || stickEdge);
    const repeat = lastNavAt > 0 && now >= nextNavAt;

    if (!(stickEdge || first || repeat)) return null;
    if (stickActive) stickLatched = true;
    nextNavAt = now + (stickEdge || first ? NAV_INITIAL_DELAY_MS : NAV_REPEAT_MS);
    lastNavAt = now;
    return held;
  }

  /**
   * @param {number} now
   */
  function update(now) {
    if (!hooks.isMenuActive()) {
      if (focused) {
        clearFocusClass();
        focused = null;
      }
      lastScreen = null;
      return;
    }

    // Controller remapping must allow every button, including B / Circle.
    if (hooks.isListeningPad()) {
      if (focused) {
        clearFocusClass();
        focused = null;
      }
      return;
    }
    if (hooks.isListeningPad() || hooks.isListeningKey()) {
      const pad = getActiveGamepad();
      if (pad) {
        const back = edgeButton(pad, BTN_BACK, backLatched);
        backLatched = back.latched;
        if (back.pressed) hooks.cancelListening();
      }
      if (hooks.isListeningPad() && focused) {
        clearFocusClass();
        focused = null;
      }
      return;
    }

    const screen = hooks.getActiveScreen();
    if (!screen) {
      clearFocusClass();
      focused = null;
      lastScreen = null;
      return;
    }

    if (screen !== lastScreen) {
      lastScreen = screen;
      onScreenChange();
    }

    const pad = getActiveGamepad();
    if (!pad) return;

    const items = ensureFocus(screen);
    if (!items.length) return;

    for (const idx of [...ignoreButtons]) {
      if (!rawPressed(pad, idx)) ignoreButtons.delete(idx);
    }

    const confirm = edgeButton(pad, BTN_CONFIRM, confirmLatched);
    confirmLatched = confirm.latched;
    if (confirm.pressed) {
      activateFocused();
      latchHeldInputs();
      ensureFocus(screen);
      return;
    }

    const back = edgeButton(pad, BTN_BACK, backLatched);
    backLatched = back.latched;
    if (back.pressed) {
      hooks.onBack();
      latchHeldInputs();
      return;
    }

    const dir = pollNavDirection(pad, now);
    if (dir) navigate(items, dir);
  }

  return { update, onScreenChange };
}
