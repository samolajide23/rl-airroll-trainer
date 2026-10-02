import { getActiveGamepad, snapshotPressedButtons } from "./input.js";
import { getPad } from "./settings.js";

/** Standard Gamepad API indices (Xbox / Southpaw layout). */
const BTN_CONFIRM = 0; // A / Cross
const BTN_BACK = 1; // B / Circle
const BTN_PREVIOUS_PAGE = 4;
const BTN_NEXT_PAGE = 5;
const BTN_FILTERS = 3;
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
  let previousPageLatched = false;
  let nextPageLatched = false;
  let filtersLatched = false;
  let filterReturnFocus = null;
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
    previousPageLatched = true;
    nextPageLatched = true;
    filtersLatched = true;
    lastNavAt = 0;
    nextNavAt = 0;
  }

  /**
   * Call after any menu screen change or DOM rebuild of focusables.
   */
  function onScreenChange() {
    clearFocusClass();
    focused = null;
    filterReturnFocus = null;
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
      if (node.closest(".site-header")) continue;
      const bounds = node.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
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
      const navigationItems = items.filter(item => !item.closest('.training-filters'));
      const { tabs, main } = partition(navigationItems);
      const restored = navigationItems.find(item => item === document.activeElement);
      const replacement = focused && navigationItems.find(item => item.tagName === focused.tagName
        && (focused.id ? item.id === focused.id
          : focused.getAttribute('aria-label') && item.getAttribute('aria-label') === focused.getAttribute('aria-label')));
      const branch = selectedItem(items.filter(item => item.matches('[data-branch]')));
      setFocused(restored ?? replacement ?? branch ?? main[0] ?? tabs[0] ?? navigationItems[0]);
    }
    return items;
  }

  function submenuLevels(items) {
    const definitions = [
      ['[data-arena-section]', '[data-arena-mode]'],
      ['[data-branch]', '[data-mechanic]'],
      ['[data-settings-tab]', '[data-settings-group]'],
      ['[data-settings-group]', '.settings-fields button, .settings-fields select, .settings-fields input'],
    ];
    return definitions.map(([parent, child]) => ({
      parent,
      child,
      parents: items.filter(item => item.matches(parent)),
      children: items.filter(item => item.matches(child)),
    })).filter(level => level.parents.length);
  }

  function selectedItem(items) {
    return items.find(item => item.getAttribute('aria-pressed') === 'true') ?? items[0];
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

    if (focused.closest('#live-menu')) {
      if (focused.closest('.training-filters') && (dir === 'up' || dir === 'down')) {
        const target = items.includes(filterReturnFocus) ? filterReturnFocus
          : selectedItem(items.filter(item => item.matches('[data-branch]')));
        if (target) {
          setFocused(target);
          filterReturnFocus = null;
        }
        return;
      }
      const levels = submenuLevels(items);
      const parentLevel = levels.find(level => level.parents.includes(focused));
      if (parentLevel && (dir === 'up' || dir === 'down')) {
        moveInList(parentLevel.parents, focused, dir === 'up' ? -1 : 1);
        return;
      }
      if (parentLevel && dir === 'right') {
        const child = selectedItem(parentLevel.children);
        if (child) setFocused(child);
        return;
      }
      const horizontal = dir === 'left' || dir === 'right';
      const sign = dir === 'left' || dir === 'up' ? -1 : 1;
      if (horizontal && adjustControl(focused, sign)) return;
      if (horizontal && focused instanceof HTMLInputElement && focused.type === 'checkbox') {
        focused.checked = !focused.checked;
        focused.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      const origin = focused.getBoundingClientRect();
      const originPrimary = horizontal ? origin.left + origin.width / 2 : origin.top + origin.height / 2;
      const originCross = horizontal ? origin.top + origin.height / 2 : origin.left + origin.width / 2;
      let target = null;
      let bestScore = Infinity;
      for (const candidate of items) {
        if (candidate === focused) continue;
        if (!focused.closest('.training-filters') && candidate.closest('.training-filters')) continue;
        if (focused.closest('.training-filters') && !candidate.closest('.training-filters')) continue;
        if (levels.some(level => level.parents.includes(candidate) !== level.parents.includes(focused))) continue;
        const bounds = candidate.getBoundingClientRect();
        const primary = horizontal ? bounds.left + bounds.width / 2 : bounds.top + bounds.height / 2;
        const cross = horizontal ? bounds.top + bounds.height / 2 : bounds.left + bounds.width / 2;
        const distance = (primary - originPrimary) * sign;
        if (distance <= 1) continue;
        const crossDistance = Math.abs(cross - originCross);
        const originStart = horizontal ? origin.top : origin.left;
        const originEnd = horizontal ? origin.bottom : origin.right;
        const candidateStart = horizontal ? bounds.top : bounds.left;
        const candidateEnd = horizontal ? bounds.bottom : bounds.right;
        const aligned = Math.min(originEnd, candidateEnd) > Math.max(originStart, candidateStart);
        const score = distance + crossDistance * 2 + (aligned ? 0 : 10000);
        if (score < bestScore) {
          bestScore = score;
          target = candidate;
        }
      }
      if (target) setFocused(target);
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

    const previousPage = edgeButton(pad, BTN_PREVIOUS_PAGE, previousPageLatched);
    const nextPage = edgeButton(pad, BTN_NEXT_PAGE, nextPageLatched);
    previousPageLatched = previousPage.latched;
    nextPageLatched = nextPage.latched;
    const pages = [...screen.querySelectorAll('.site-header nav button[data-view]:not([disabled])')]
      .filter(button => !button.closest('[hidden], .hidden'));
    if (pages.length && previousPage.pressed !== nextPage.pressed) {
      const current = pages.findIndex(button => button.getAttribute('aria-current') === 'page');
      const delta = previousPage.pressed ? -1 : 1;
      pages[(Math.max(0, current) + delta + pages.length) % pages.length].click();
      onScreenChange();
      const nextScreen = hooks.getActiveScreen();
      if (nextScreen) ensureFocus(nextScreen);
      return;
    }

    const items = ensureFocus(screen);
    if (!items.length) return;

    for (const idx of [...ignoreButtons]) {
      if (!rawPressed(pad, idx)) ignoreButtons.delete(idx);
    }

    const filterShortcut = edgeButton(pad, BTN_FILTERS, filtersLatched);
    filtersLatched = filterShortcut.latched;
    const filters = items.filter(item => item.closest('.training-filters'));
    if (filters.length && filterShortcut.pressed) {
      if (filters.includes(focused)) {
        const target = items.includes(filterReturnFocus) ? filterReturnFocus
          : selectedItem(items.filter(item => item.matches('[data-branch]')));
        if (target) setFocused(target);
        filterReturnFocus = null;
      } else {
        filterReturnFocus = focused;
        setFocused(selectedItem(filters));
      }
      latchHeldInputs();
      return;
    }

    const confirm = edgeButton(pad, BTN_CONFIRM, confirmLatched);
    confirmLatched = confirm.latched;
    if (confirm.pressed) {
      const enteringLevel = submenuLevels(items).find(level => level.parents.includes(focused));
      activateFocused();
      latchHeldInputs();
      const nextItems = ensureFocus(screen);
      if (enteringLevel) {
        const child = selectedItem(nextItems.filter(item => item.matches(enteringLevel.child)));
        if (child) setFocused(child);
      }
      return;
    }

    const back = edgeButton(pad, BTN_BACK, backLatched);
    backLatched = back.latched;
    if (back.pressed) {
      if (focused?.closest('.training-filters')) {
        const target = items.includes(filterReturnFocus) ? filterReturnFocus
          : selectedItem(items.filter(item => item.matches('[data-branch]')));
        if (target) {
          setFocused(target);
          filterReturnFocus = null;
          latchHeldInputs();
          return;
        }
      }
      const levels = submenuLevels(items);
      const parentLevel = [...levels].reverse().find(level => !level.parents.includes(focused)
        && !levels.some(other => other !== level && other.parents.includes(focused) && other.children.some(item => level.parents.includes(item))));
      if (parentLevel) {
        setFocused(selectedItem(parentLevel.parents));
        latchHeldInputs();
        return;
      }
      hooks.onBack();
      latchHeldInputs();
      return;
    }

    const dir = pollNavDirection(pad, now);
    if (dir) navigate(items, dir);
  }

  return { update, onScreenChange };
}
