/**
 * Keep the app inside the *visible* mobile browser viewport.
 *
 * `100vh` / `position: fixed; inset: 0` often extend under the URL bar and
 * bottom browser chrome. We mirror `visualViewport` into CSS vars that layout
 * (`#stage`, `.screen`) and play sizing consume.
 */

let appWidth = typeof window !== "undefined" ? window.innerWidth : 0;
let appHeight = typeof window !== "undefined" ? window.innerHeight : 0;
let appTop = 0;
let appLeft = 0;

/** @type {Set<() => void>} */
const listeners = new Set();

function roundPx(n) {
  return Math.max(0, Math.round(n));
}

/** Sync CSS vars + cached size from the visual viewport. */
export function syncAppViewport() {
  const vv = window.visualViewport;
  const width = roundPx(vv?.width ?? window.innerWidth);
  const height = roundPx(vv?.height ?? window.innerHeight);
  const top = roundPx(vv?.offsetTop ?? 0);
  const left = roundPx(vv?.offsetLeft ?? 0);

  const changed =
    width !== appWidth ||
    height !== appHeight ||
    top !== appTop ||
    left !== appLeft;

  appWidth = width;
  appHeight = height;
  appTop = top;
  appLeft = left;

  const root = document.documentElement;
  root.style.setProperty("--app-width", `${width}px`);
  root.style.setProperty("--app-height", `${height}px`);
  root.style.setProperty("--app-top", `${top}px`);
  root.style.setProperty("--app-left", `${left}px`);

  if (changed) {
    for (const fn of listeners) fn();
  }
}

/** @returns {{ width: number, height: number, top: number, left: number }} */
export function getAppViewport() {
  return { width: appWidth, height: appHeight, top: appTop, left: appLeft };
}

/**
 * @param {() => void} fn
 * @returns {() => void}
 */
export function onAppViewportChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initAppViewport() {
  syncAppViewport();
  window.addEventListener("resize", syncAppViewport);
  window.addEventListener("orientationchange", () => {
    // iOS updates visualViewport after the orientation event.
    requestAnimationFrame(() => {
      syncAppViewport();
      setTimeout(syncAppViewport, 100);
      setTimeout(syncAppViewport, 300);
    });
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncAppViewport);
    window.visualViewport.addEventListener("scroll", syncAppViewport);
  }
}
