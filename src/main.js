import * as THREE from "three";
import { PHASES, GHOST_ALIGN_DIFFICULTIES } from "./modes/catalog.js";
import { preloadBall } from "./shared/ball.js";
import { preloadCars } from "./shared/carAssets.js";
import {
  getActiveGamepad,
  keys,
  pollGamepadButtonPress,
  snapshotPressedButtons,
} from "./shared/input.js";
import { horizontalFovToVertical } from "./shared/chaseCamera.js";
import {
  getPlaySize,
  initTouchControls,
  onPlayViewportChange,
  setTouchControlsVisible,
} from "./shared/touchControls.js";
import { createMenuGamepad } from "./shared/menuGamepad.js";
import {
  hideLockerPreview,
  setLockerPreviewCar,
  showLockerPreview,
  updateLockerPreview,
} from "./shared/lockerPreview.js";
import {
  CARS,
  getSelectedCar,
  getSelectedCarId,
  setSelectedCarId,
} from "./shared/loadout.js";
import {
  BIND_LABELS,
  CAMERA_SLIDERS,
  DEFAULT_BINDS,
  PAD_AXIS_OPTIONS,
  PAD_BUTTON_ACTIONS,
  formatControlsHelp,
  formatKeyCode,
  formatPadButton,
  getBinds,
  getCamera,
  getPad,
  onBindsChange,
  resetAllControls,
  setBind,
  setCamera,
  setPad,
} from "./shared/settings.js";

const canvas = document.getElementById("game");
const hubEl = document.getElementById("hub");
const menuEl = document.getElementById("menu");
const lockerEl = document.getElementById("locker");
const settingsEl = document.getElementById("settings");
const difficultyEl = document.getElementById("difficulty");
const modeListEl = document.getElementById("mode-list");
const lockerListEl = document.getElementById("locker-list");
const lockerCreditEl = document.getElementById("locker-credit");
const hubEquippedEl = document.getElementById("hub-equipped");
const phaseBlurbEl = document.getElementById("phase-blurb");
const playKickerEl = document.getElementById("play-kicker");
const playTitleEl = document.getElementById("play-title");
const playSubEl = document.getElementById("play-sub");
const difficultyListEl = document.getElementById("difficulty-list");
const difficultyModeLabel = document.getElementById("difficulty-mode-label");
const bindListEl = document.getElementById("bind-list");
const padBindListEl = document.getElementById("pad-bind-list");
const panelControls = document.getElementById("panel-controls");
const panelCamera = document.getElementById("panel-camera");
const cameraListEl = document.getElementById("camera-list");
const padStatusLine = document.getElementById("pad-status-line");
const menuHintEl = document.getElementById("menu-hint");
const btnMenu = document.getElementById("btn-menu");
const btnPlay = document.getElementById("btn-play");
const btnLocker = document.getElementById("btn-locker");
const btnSettings = document.getElementById("btn-settings");
const btnPlayBack = document.getElementById("btn-play-back");
const btnLockerBack = document.getElementById("btn-locker-back");
const btnSettingsBack = document.getElementById("btn-settings-back");
const btnDifficultyBack = document.getElementById("btn-difficulty-back");
const btnResetBinds = document.getElementById("btn-reset-binds");
const tabControls = document.getElementById("tab-controls");
const tabCamera = document.getElementById("tab-camera");

const hud = {
  root: document.getElementById("hud"),
  modeTitle: document.getElementById("mode-title"),
  hits: document.getElementById("hits"),
  streak: document.getElementById("streak"),
  best: document.getElementById("best"),
  avg: document.getElementById("avg"),
  status: document.getElementById("status"),
  padStatus: document.getElementById("pad-status"),
  arl: document.getElementById("arl"),
  arr: document.getElementById("arr"),
  alignFill: document.getElementById("align-fill"),
  alignMeter: document.getElementById("align-meter"),
  boostMeter: document.getElementById("boost-meter"),
  boostFill: document.getElementById("boost-fill"),
  boostValue: document.getElementById("boost-value"),
  help: document.getElementById("help"),
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 40, 120);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.fov = horizontalFovToVertical(getCamera().fov, camera.aspect);
camera.position.set(0, 4, -10);
camera.lookAt(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x1a2030, 1.1);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
keyLight.position.set(8, 18, 10);
scene.add(keyLight);

const arena = new THREE.Group();
scene.add(arena);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(35, 64),
  new THREE.MeshStandardMaterial({
    color: 0x152038,
    roughness: 0.9,
    metalness: 0.05,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -8;
arena.add(floor);

const grid = new THREE.GridHelper(70, 28, 0x3a4d72, 0x243352);
grid.position.y = -7.98;
arena.add(grid);

const ringGeo = new THREE.TorusGeometry(12, 0.08, 8, 64);
const ringMat = new THREE.MeshBasicMaterial({
  color: 0x3dd6c6,
  transparent: true,
  opacity: 0.35,
});
for (const [rx, ry] of [
  [Math.PI / 2, 0],
  [0, 0],
  [0, Math.PI / 2],
]) {
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.set(rx, ry, 0);
  arena.add(ring);
}

const modeCtx = { scene, camera, hud, arena };

/** @type {null | { start(): void, stop(): void, update(dt: number, now: number): void }} */
let activeMode = null;
/** @type {import("./modes/catalog.js").GameModeDef | null} */
let pendingMode = null;
let activePhaseIndex = 0;
/** @type {"categories" | "drills"} */
let playView = "categories";
let escLatch = false;
/** Standard Gamepad Start / Options (not Select/Share = 8). */
const PAD_BTN_START = 9;
let startLatch = false;
/** @type {"controls" | "camera"} */
let settingsTab = "controls";
/** @type {string | null} */
let listeningKeyAction = null;
/** @type {string | null} */
let listeningPadAction = null;
/** @type {Set<number>} */
let padListenIgnore = new Set();

function hideAllScreens() {
  hideLockerPreview();
  hubEl.classList.add("hidden");
  menuEl.classList.add("hidden");
  lockerEl.classList.add("hidden");
  settingsEl.classList.add("hidden");
  difficultyEl.classList.add("hidden");
}

/** @returns {HTMLElement | null} */
function getActiveMenuScreen() {
  if (!hubEl.classList.contains("hidden")) return hubEl;
  if (!menuEl.classList.contains("hidden")) return menuEl;
  if (!lockerEl.classList.contains("hidden")) return lockerEl;
  if (!settingsEl.classList.contains("hidden")) return settingsEl;
  if (!difficultyEl.classList.contains("hidden")) return difficultyEl;
  return null;
}

/** Mirror Escape / Back button behavior for menus. */
function handleMenuBack() {
  if (listeningKeyAction || listeningPadAction) {
    cancelListening();
    return;
  }
  if (activeMode) {
    showHub();
    return;
  }
  if (!difficultyEl.classList.contains("hidden")) {
    showDrills(activePhaseIndex);
    return;
  }
  if (!menuEl.classList.contains("hidden")) {
    if (playView === "drills") {
      showPlay();
      return;
    }
    showHub();
    return;
  }
  if (!lockerEl.classList.contains("hidden")) {
    showHub();
    return;
  }
  if (!settingsEl.classList.contains("hidden")) {
    showHub();
  }
}

const menuGamepad = createMenuGamepad({
  getActiveScreen: getActiveMenuScreen,
  isMenuActive: () => !activeMode && getActiveMenuScreen() !== null,
  isListeningPad: () => listeningPadAction !== null,
  isListeningKey: () => listeningKeyAction !== null,
  cancelListening: () => cancelListening(),
  onBack: handleMenuBack,
});

function refreshHelpText() {
  const help = formatControlsHelp();
  menuHintEl.textContent = help;
  hud.help.textContent = help;
}

function refreshEquippedLabel() {
  const car = getSelectedCar();
  hubEquippedEl.textContent = `Equipped: ${car.name}`;
}

function stopActiveMode() {
  if (activeMode) {
    activeMode.stop();
    activeMode = null;
  }
  pendingMode = null;
  setTouchControlsVisible(false);
}

function showHub() {
  cancelListening();
  stopActiveMode();
  hideAllScreens();
  refreshEquippedLabel();
  hubEl.classList.remove("hidden");
  camera.position.set(0, 4, -10);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  menuGamepad.onScreenChange();
}

function showPlay() {
  cancelListening();
  stopActiveMode();
  playView = "categories";
  hideAllScreens();
  buildPlayCategories();
  menuEl.classList.remove("hidden");
  menuGamepad.onScreenChange();
}

/**
 * @param {number} phaseIndex
 */
function showDrills(phaseIndex) {
  cancelListening();
  stopActiveMode();
  playView = "drills";
  activePhaseIndex = phaseIndex;
  hideAllScreens();
  buildDrillList();
  menuEl.classList.remove("hidden");
  menuGamepad.onScreenChange();
}

function showLocker() {
  cancelListening();
  stopActiveMode();
  hideAllScreens();
  buildLocker();
  lockerEl.classList.remove("hidden");
  showLockerPreview(scene, camera, getSelectedCarId());
  menuGamepad.onScreenChange();
}

function showSettings() {
  cancelListening();
  stopActiveMode();
  hideAllScreens();
  settingsEl.classList.remove("hidden");
  setSettingsTab(settingsTab);
  menuGamepad.onScreenChange();
}

function showDifficultySelect(def) {
  cancelListening();
  stopActiveMode();
  pendingMode = def;
  hideAllScreens();
  difficultyModeLabel.textContent = def.title;
  buildDifficultyList();
  difficultyEl.classList.remove("hidden");
  menuGamepad.onScreenChange();
}

function startMode(def, options = {}) {
  if (!def.available || !def.create) return;
  cancelListening();
  if (activeMode) activeMode.stop();
  activeMode = def.create(modeCtx, options);
  pendingMode = null;
  hideAllScreens();
  menuGamepad.onScreenChange();
  activeMode.start();
  setTouchControlsVisible(true);
}

function onModeCardClick(def) {
  if (!def.available || !def.create) return;
  if (def.needsDifficulty) {
    showDifficultySelect(def);
    return;
  }
  startMode(def);
}

function buildPlayCategories() {
  playKickerEl.textContent = "Play";
  playTitleEl.textContent = "Select a mode";
  playSubEl.textContent = "Free Play, Air Roll, ball contact, or air dribble.";
  phaseBlurbEl.textContent = "";
  modeListEl.replaceChildren();

  PHASES.forEach((phase, index) => {
    const ready = phase.modes.some((m) => m.available);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-card";
    btn.disabled = !ready;
    btn.setAttribute("role", "listitem");

    const title = document.createElement("div");
    title.className = "mode-card-title";
    title.textContent = phase.title;

    const badge = document.createElement("span");
    badge.className = `mode-badge ${ready ? "ready" : "soon"}`;
    badge.textContent = ready ? "Open" : "Soon";

    const desc = document.createElement("p");
    desc.className = "mode-card-desc";
    desc.textContent = phase.blurb;

    btn.append(title, badge, desc);
    if (ready) {
      btn.addEventListener("click", () => {
        const playable = phase.modes.filter((m) => m.available);
        // Single drill categories (e.g. Free Play) jump straight in.
        if (
          playable.length === 1 &&
          !playable[0].needsDifficulty &&
          playable[0].create
        ) {
          onModeCardClick(playable[0]);
        } else {
          showDrills(index);
        }
      });
    }
    modeListEl.append(btn);
  });
}

function buildDrillList() {
  const phase = PHASES[activePhaseIndex];
  playKickerEl.textContent = "Play";
  playTitleEl.textContent = phase.title;
  playSubEl.textContent = "Choose a drill.";
  phaseBlurbEl.textContent = phase.blurb;
  modeListEl.replaceChildren();

  for (const mode of phase.modes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-card";
    btn.disabled = !mode.available;
    btn.setAttribute("role", "listitem");

    const title = document.createElement("div");
    title.className = "mode-card-title";
    title.textContent = mode.title;

    const badge = document.createElement("span");
    badge.className = `mode-badge ${mode.available ? "ready" : "soon"}`;
    badge.textContent = mode.available ? "Play" : "Soon";

    const desc = document.createElement("p");
    desc.className = "mode-card-desc";
    desc.textContent = mode.description;

    btn.append(title, badge, desc);
    if (mode.available) {
      btn.addEventListener("click", () => onModeCardClick(mode));
    }
    modeListEl.append(btn);
  }
}

function buildLocker() {
  const selected = getSelectedCarId();
  lockerListEl.replaceChildren();
  lockerCreditEl.textContent = "";

  for (const car of CARS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mode-card${car.id === selected ? " equipped" : ""}`;
    btn.setAttribute("role", "listitem");
    btn.dataset.carId = car.id;

    const title = document.createElement("div");
    title.className = "mode-card-title";
    title.textContent = car.name;

    const badge = document.createElement("span");
    badge.className = `mode-badge ${car.id === selected ? "equipped" : "ready"}`;
    badge.textContent = car.id === selected ? "Equipped" : "Equip";

    const desc = document.createElement("p");
    desc.className = "mode-card-desc";
    desc.textContent = car.blurb;

    btn.append(title, badge, desc);
    const previewThis = () => setLockerPreviewCar(car.id);
    btn.addEventListener("mouseenter", previewThis);
    btn.addEventListener("focus", previewThis);
    btn.addEventListener("click", () => {
      setSelectedCarId(car.id);
      setLockerPreviewCar(car.id);
      buildLocker();
      refreshEquippedLabel();
      menuGamepad.onScreenChange();
    });
    lockerListEl.append(btn);
  }

  const equipped = getSelectedCar();
  if (equipped.credit) lockerCreditEl.textContent = equipped.credit;
}

function buildDifficultyList() {
  difficultyListEl.replaceChildren();
  for (const diff of GHOST_ALIGN_DIFFICULTIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-card";
    btn.setAttribute("role", "listitem");

    const title = document.createElement("div");
    title.className = "mode-card-title";
    title.textContent = diff.label;

    const badge = document.createElement("span");
    badge.className = "mode-badge ready";
    badge.textContent = "Play";

    const desc = document.createElement("p");
    desc.className = "mode-card-desc";
    desc.textContent = diff.description;

    btn.append(title, badge, desc);
    btn.addEventListener("click", () => {
      if (!pendingMode) return;
      startMode(pendingMode, { difficulty: diff });
    });
    difficultyListEl.append(btn);
  }
}

function rebuildControls() {
  buildBindList();
  buildPadOptionsList();
}

function cancelListening() {
  listeningKeyAction = null;
  listeningPadAction = null;
  padListenIgnore = new Set();
  if (!settingsEl.classList.contains("hidden")) {
    if (settingsTab === "controls") {
      rebuildControls();
    } else {
      buildCameraList();
    }
  }
}

/**
 * @param {"controls" | "camera"} tab
 */
function setSettingsTab(tab) {
  settingsTab = tab;
  cancelListening();
  tabControls.classList.toggle("active", tab === "controls");
  tabCamera.classList.toggle("active", tab === "camera");
  panelControls.classList.toggle("hidden", tab !== "controls");
  panelCamera.classList.toggle("hidden", tab !== "camera");
  if (tab === "controls") {
    rebuildControls();
  } else {
    buildCameraList();
  }
  menuGamepad.onScreenChange();
}

function buildCameraList() {
  const cam = getCamera();
  cameraListEl.replaceChildren();

  cameraListEl.append(
    makeToggleRow("Camera shake", cam.shake, (checked) => {
      setCamera("shake", checked);
    }),
  );

  for (const slider of CAMERA_SLIDERS) {
    const row = document.createElement("div");
    row.className = "bind-row";

    const label = document.createElement("span");
    label.className = "bind-label";
    label.textContent = slider.label;

    const wrap = document.createElement("div");
    wrap.className = "bind-range";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(slider.min);
    input.max = String(slider.max);
    input.step = String(slider.step);
    input.value = String(cam[slider.key]);
    const readout = document.createElement("span");
    readout.className = "bind-range-value";
    const fmt =
      slider.step < 1 ? (n) => n.toFixed(2) : (n) => String(Math.round(n));
    readout.textContent = fmt(Number(cam[slider.key]));
    input.addEventListener("input", () => {
      const n = Number(input.value);
      readout.textContent = fmt(n);
      setCamera(slider.key, n);
      // Live FOV on the shared camera while browsing settings (RL horizontal → Three vertical)
      if (slider.key === "fov") {
        camera.fov = horizontalFovToVertical(n, camera.aspect);
        camera.updateProjectionMatrix();
      }
    });
    wrap.append(input, readout);
    row.append(label, wrap);
    cameraListEl.append(row);
  }
}

function buildBindList() {
  const binds = getBinds();
  const pad = getPad();
  const padActions = new Set(PAD_BUTTON_ACTIONS);
  bindListEl.replaceChildren();
  updatePadStatusLine();

  for (const action of Object.keys(DEFAULT_BINDS)) {
    const row = document.createElement("div");
    row.className = "bind-row";

    const label = document.createElement("span");
    label.className = "bind-label";
    label.textContent = BIND_LABELS[action] ?? action;

    const keysWrap = document.createElement("div");
    keysWrap.className = "bind-keys";

    const keyBtn = document.createElement("button");
    keyBtn.type = "button";
    keyBtn.className = "bind-key";
    keyBtn.title = "Keyboard";
    if (listeningKeyAction === action) {
      keyBtn.classList.add("listening");
      keyBtn.textContent = "Press a key…";
    } else {
      const code = binds[action];
      keyBtn.textContent = code ? formatKeyCode(code) : "—";
    }
    keyBtn.addEventListener("click", () => {
      listeningPadAction = null;
      listeningKeyAction = action;
      rebuildControls();
    });
    keysWrap.append(keyBtn);

    if (padActions.has(action)) {
      const padBtn = document.createElement("button");
      padBtn.type = "button";
      padBtn.className = "bind-key bind-key-pad";
      padBtn.title = "Controller";
      if (listeningPadAction === action) {
        padBtn.classList.add("listening");
        padBtn.textContent = "Press a button…";
      } else {
        padBtn.textContent = formatPadButton(
          /** @type {number} */ (pad[/** @type {keyof typeof pad} */ (action)]),
        );
      }
      padBtn.addEventListener("click", () => {
        listeningKeyAction = null;
        listeningPadAction = action;
        padListenIgnore = snapshotPressedButtons();
        rebuildControls();
      });
      keysWrap.append(padBtn);
    }

    row.append(label, keysWrap);
    bindListEl.append(row);
  }
}

function updatePadStatusLine() {
  const pad = getActiveGamepad();
  if (pad) {
    padStatusLine.textContent = `Controller connected: ${pad.id}`;
    padStatusLine.classList.add("on");
  } else {
    padStatusLine.textContent =
      "No controller detected — plug one in to rebind buttons.";
    padStatusLine.classList.remove("on");
  }
}

function buildPadOptionsList() {
  const cfg = getPad();
  padBindListEl.replaceChildren();

  padBindListEl.append(
    makeSelectRow("Pitch axis", cfg.pitchAxis, PAD_AXIS_OPTIONS, (v) => {
      setPad("pitchAxis", v);
      buildPadOptionsList();
    }),
  );

  padBindListEl.append(
    makeSelectRow("Yaw axis", cfg.yawAxis, PAD_AXIS_OPTIONS, (v) => {
      setPad("yawAxis", v);
      buildPadOptionsList();
    }),
  );

  padBindListEl.append(
    makeToggleRow("Invert pitch", cfg.invertPitch, (checked) => {
      setPad("invertPitch", checked);
    }),
  );

  padBindListEl.append(
    makeToggleRow("Invert yaw", cfg.invertYaw, (checked) => {
      setPad("invertYaw", checked);
    }),
  );

  padBindListEl.append(makeDeadzoneRow(cfg.deadzone));
}

/**
 * @param {string} title
 * @param {number} value
 * @param {{ value: number, label: string }[]} options
 * @param {(v: number) => void} onChange
 */
function makeSelectRow(title, value, options, onChange) {
  const row = document.createElement("div");
  row.className = "bind-row";

  const label = document.createElement("span");
  label.className = "bind-label";
  label.textContent = title;

  const select = document.createElement("select");
  select.className = "bind-control";
  for (const opt of options) {
    const option = document.createElement("option");
    option.value = String(opt.value);
    option.textContent = opt.label;
    if (opt.value === value) option.selected = true;
    select.append(option);
  }
  select.addEventListener("change", () => {
    onChange(Number(select.value));
  });

  row.append(label, select);
  return row;
}

/**
 * @param {string} title
 * @param {boolean} checked
 * @param {(v: boolean) => void} onChange
 */
function makeToggleRow(title, checked, onChange) {
  const row = document.createElement("div");
  row.className = "bind-row";

  const label = document.createElement("span");
  label.className = "bind-label";
  label.textContent = title;

  const wrap = document.createElement("label");
  wrap.className = "bind-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const text = document.createElement("span");
  text.textContent = checked ? "On" : "Off";
  input.addEventListener("change", () => {
    text.textContent = input.checked ? "On" : "Off";
  });
  wrap.append(input, text);

  row.append(label, wrap);
  return row;
}

/**
 * @param {number} value
 */
function makeDeadzoneRow(value) {
  const row = document.createElement("div");
  row.className = "bind-row";

  const label = document.createElement("span");
  label.className = "bind-label";
  label.textContent = "Stick deadzone";

  const wrap = document.createElement("div");
  wrap.className = "bind-range";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0.05";
  input.max = "0.45";
  input.step = "0.01";
  input.value = String(value);
  const readout = document.createElement("span");
  readout.className = "bind-range-value";
  readout.textContent = value.toFixed(2);
  input.addEventListener("input", () => {
    const n = Number(input.value);
    readout.textContent = n.toFixed(2);
    setPad("deadzone", n);
  });
  wrap.append(input, readout);

  row.append(label, wrap);
  return row;
}

btnMenu.addEventListener("click", showHub);
btnPlay.addEventListener("click", showPlay);
btnLocker.addEventListener("click", showLocker);
btnSettings.addEventListener("click", showSettings);
btnPlayBack.addEventListener("click", handleMenuBack);
btnLockerBack.addEventListener("click", showHub);
btnSettingsBack.addEventListener("click", showHub);
btnDifficultyBack.addEventListener("click", () => showDrills(activePhaseIndex));
btnResetBinds.addEventListener("click", () => {
  resetAllControls();
  cancelListening();
  if (settingsTab === "controls") {
    rebuildControls();
  } else {
    buildCameraList();
  }
  const cam = getCamera();
  camera.fov = horizontalFovToVertical(cam.fov, camera.aspect);
  camera.updateProjectionMatrix();
});
tabControls.addEventListener("click", () => setSettingsTab("controls"));
tabCamera.addEventListener("click", () => setSettingsTab("camera"));

window.addEventListener(
  "keydown",
  (e) => {
    if (!listeningKeyAction) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") return;
    setBind(
      /** @type {import("./shared/settings.js").BindAction} */ (
        listeningKeyAction
      ),
      e.code,
    );
    listeningKeyAction = null;
    rebuildControls();
  },
  true,
);

window.addEventListener("gamepadconnected", () => {
  if (!settingsEl.classList.contains("hidden") && settingsTab === "controls") {
    rebuildControls();
  }
});
window.addEventListener("gamepaddisconnected", () => {
  if (!settingsEl.classList.contains("hidden") && settingsTab === "controls") {
    rebuildControls();
  }
});

onBindsChange(refreshHelpText);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (keys.has("Escape") && !escLatch) {
    escLatch = true;
    handleMenuBack();
  }
  if (!keys.has("Escape")) escLatch = false;

  // Start / Options → same as Escape (hub from drill, back through menus).
  // Ignore while remapping a pad bind so Start can still be captured.
  {
    const pad = getActiveGamepad();
    const startDown = Boolean(pad?.buttons[PAD_BTN_START]?.pressed);
    if (startDown && !startLatch) {
      startLatch = true;
      if (!listeningPadAction) handleMenuBack();
    }
    if (!startDown) startLatch = false;
  }

  // Menu gamepad nav (also cancels pad/key listening on B before remap capture)
  menuGamepad.update(now);

  // Capture controller button while remapping
  if (listeningPadAction) {
    // Drop ignore mask once those buttons are released
    for (const idx of [...padListenIgnore]) {
      const pad = getActiveGamepad();
      if (!pad || !pad.buttons[idx]?.pressed) padListenIgnore.delete(idx);
    }
    const pressed = pollGamepadButtonPress(padListenIgnore);
    if (pressed !== null) {
      setPad(
        /** @type {import("./shared/settings.js").PadSetting} */ (
          listeningPadAction
        ),
        pressed,
      );
      listeningPadAction = null;
      padListenIgnore = new Set();
      rebuildControls();
    }
  }

  if (
    !settingsEl.classList.contains("hidden") &&
    settingsTab === "controls" &&
    !listeningPadAction
  ) {
    updatePadStatusLine();
  }

  if (activeMode) activeMode.update(dt, now);
  else updateLockerPreview(dt);

  if (!activeMode) {
    arena.rotation.y += dt * 0.05;
  } else {
    arena.rotation.y = 0;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function syncRendererSize() {
  const { width, height } = getPlaySize();
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  const canvas = renderer.domElement;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}

window.addEventListener("resize", syncRendererSize);
onPlayViewportChange(syncRendererSize);

const touchRoot = document.getElementById("touch-controls");
const touchStick = document.getElementById("touch-stick");
const touchStickKnob = document.getElementById("touch-stick-knob");
const stageEl = document.getElementById("stage");
if (touchRoot && touchStick && touchStickKnob) {
  initTouchControls({
    root: touchRoot,
    stickBase: touchStick,
    stickKnob: touchStickKnob,
    stage: stageEl,
  });
}
syncRendererSize();

refreshHelpText();
showHub();
requestAnimationFrame(frame);

Promise.all([preloadCars(), preloadBall()]).then(() => {
  refreshEquippedLabel();
  // If the locker is already open, refresh the GLB body once assets land.
  if (!lockerEl.classList.contains("hidden")) {
    setLockerPreviewCar(getSelectedCarId(), { force: true });
  }
});
