import * as THREE from "three";
import { initializeRocketSim, disposeRocketSimWorlds, rocketSimDiagnostics } from "./shared/rocketSimRuntime.js";
let physicsInitialization;
import { frameElapsed } from "./shared/aerial.js";
import { createStadiumEnvironment } from "./shared/stadium.js";
import { PHASES, GAME_MODES, FREE_PLAY, ARENA_1V1, GHOST_ALIGN_DIFFICULTIES, nextTrainingDrill, previousTrainingDrill } from "./modes/catalog.js";
import { recentAttempts } from "./shared/metrics.js";
import { preloadBall, BALL_TYPES, getSelectedBallId, setSelectedBallId } from "./shared/ball.js";
import { preloadCars } from "./shared/carAssets.js";
import { EngineAudio, BoostAudio, JumpAudio } from "./shared/engineAudio.js";
import {
  getActiveGamepad,
  keys,
  readControls,
  pollGamepadButtonPress,
  snapshotPressedButtons,
} from "./shared/input.js";
import { horizontalFovToVertical } from "./shared/chaseCamera.js";
import { initAppViewport } from "./shared/appViewport.js";
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
  BALL_CAM_MODE_OPTIONS,
  applyCameraPreset,
  BIND_LABELS,
  BIND_SECTIONS,
  CAMERA_SLIDERS,
  CONTROL_SLIDERS,
  PAD_AXIS_OPTIONS,
  formatControlsHelp,
  formatKeyCode,
  formatPadButton,
  getBinds,
  getCamera,
  getControlPreset,
  getControllerLayout,
  getPad,
  onBindsChange,
  resetCamera,
  resetControlBindings,
  applyControlPreset,
  resetAllControls,
  setBind,
  setCamera,
  setControllerLayout,
  setPad,
} from "./shared/settings.js";
import { CAMERA_PRESETS, CAMERA_PRESET_SOURCE, matchingCameraPreset } from "./shared/cameraPresets.js";

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
const controlsOverview = document.getElementById("controls-overview");
const bindingsEditor = document.getElementById("bindings-editor");
const controlOptions = document.getElementById("control-options");
let editingBindings = false;
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

const engineAudio = new EngineAudio();
const boostAudio = new BoostAudio({ createContext: () => engineAudio.context });
const jumpAudio = new JumpAudio({ createContext: () => engineAudio.context });
const unlockEngineAudio = () => {
  engineAudio.unlock();
  boostAudio.unlock();
  jumpAudio.unlock();
};
window.addEventListener("pointerdown", unlockEngineAudio);
window.addEventListener("keydown", unlockEngineAudio);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    engineAudio.stop();
    boostAudio.stop();
    jumpAudio.stop();
  }
});
window.addEventListener("pagehide", () => {
  engineAudio.stop();
  boostAudio.stop();
  jumpAudio.stop();
});
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener("pointerdown", unlockEngineAudio);
  window.removeEventListener("keydown", unlockEngineAudio);
  boostAudio.stop();
  boostAudio.disposed = true;
  jumpAudio.stop();
  jumpAudio.disposed = true;
  engineAudio.dispose();
});

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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const environmentTarget = createStadiumEnvironment(renderer);
scene.environment = environmentTarget.texture;
scene.environmentIntensity = 0.65;
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

const hemi = new THREE.HemisphereLight(0xd6e2ed, 0x293329, 0.65);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 0.75);
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

const modeCtx = {
  scene, camera, hud, arena, nextDrill: () => {
    const next = nextTrainingDrill(activeMode?.catalogId, activeMode?.masteryStep);
    if (next) startMode(next.def, { masteryStep: next.masteryStep, varied: activeMode.varied });
  }, previousDrill: () => {
    const previous = previousTrainingDrill(activeMode?.catalogId, activeMode?.masteryStep);
    if (previous) startMode(previous.def, { masteryStep: previous.masteryStep, varied: activeMode.varied });
  }, selectStage: stage => {
    if (pauseMenu.open || pauseSettings) return;
    const def = GAME_MODES.find(mode => mode.id === activeMode?.catalogId);
    if (def && stage !== activeMode.masteryStep) startMode(def, { masteryStep: stage, varied: activeMode.varied });
  }
};

/** @type {null | { start(): void, stop(): void, update(dt: number, now: number): void }} */
let activeMode = null;
const drillLoading = document.createElement("div");
drillLoading.className = "drill-loading";
drillLoading.hidden = true;
drillLoading.setAttribute("role", "status");
drillLoading.setAttribute("aria-live", "polite");
drillLoading.innerHTML = `<div class="drill-loading-content"><span>PREPARING DRILL</span><strong></strong><div class="drill-loading-line" aria-hidden="true"></div></div>`;
document.body.append(drillLoading);
const pauseMenu = document.createElement("dialog");
pauseMenu.className = "training-pause";
pauseMenu.setAttribute("aria-labelledby", "pause-title");
pauseMenu.innerHTML = `<h2 id="pause-title">Paused</h2>
  <button type="button" data-pause="resume" autofocus>Resume Game</button>
  <button type="button" data-pause="restart">Restart Training</button>
  <button type="button" data-pause="change">Change Mode/Match</button>
  <button type="button" data-pause="settings">Settings</button>
  <button type="button" data-pause="reset">Reset Progress</button>
  <button type="button" data-pause="exit">End Training</button>`;
let pauseSettings = false;
let resetProgressConfirmed = false;
document.body.append(pauseMenu);
pauseMenu.addEventListener("cancel", event => {
  event.preventDefault();
  escLatch = true;
  resumeMode();
});
pauseMenu.addEventListener("click", event => {
  const action = event.target.closest("[data-pause]")?.dataset.pause;
  if (action === "resume") resumeMode();
  if (action === "restart") {
    const def = GAME_MODES.find(mode => mode.id === activeMode?.catalogId);
    if (def) startMode(def, { masteryStep: activeMode.masteryStep, varied: activeMode.varied });
  }
  if (action === "change") {
    showPlay();
    globalThis.__trainerMenu?.ui?.training();
  }
  if (action === "settings") {
    pauseMenu.close();
    pauseSettings = true;
    globalThis.__trainerMenu?.parkSettings();
    settingsEl.classList.remove("hidden");
    hud.root.classList.add("hidden");
    setSettingsTab(settingsTab);
    menuGamepad.onScreenChange();
  }
  if (action === "reset") {
    if (!resetProgressConfirmed) {
      resetProgressConfirmed = true;
      event.target.textContent = "Confirm Reset Session Progress";
      return;
    }
    activeMode.elapsed = 0;
    for (const field of ["hits", "streak", "best", "round", "setupIndex"]) if (field in activeMode) activeMode[field] = 0;
    if (activeMode.setAttempts) activeMode.setAttempts = [];
    activeMode.resetState();
    activeMode.updateDrillStatus?.();
    resumeMode();
  }
  if (action === "exit") showHub();
});

function resumeMode() {
  resetProgressConfirmed = false;
  pauseMenu.querySelector('[data-pause="reset"]').textContent = "Reset Progress";
  pauseMenu.close();
  keys.clear();
  last = performance.now();
  if (practiceSessionActive) practiceStartedAt = document.hidden ? null : performance.now();
  setTouchControlsVisible(Boolean(activeMode));
  menuGamepad.onScreenChange();
}

function togglePauseMenu() {
  if (pauseMenu.open) return resumeMode();
  savePractice();
  practiceStartedAt = null;
  keys.clear();
  pauseMenu.querySelector('[data-pause="restart"]').disabled = typeof activeMode?.resetState !== "function";
  pauseMenu.querySelector('[data-pause="reset"]').disabled = typeof activeMode?.resetState !== "function";
  resetProgressConfirmed = false;
  pauseMenu.querySelector('[data-pause="reset"]').textContent = "Reset Progress";
  pauseMenu.showModal();
  setTouchControlsVisible(false);
  menuGamepad.onScreenChange();
}
let modeStartId = 0;
/** @type {import("./modes/catalog.js").GameModeDef | null} */
let pendingMode = null;
let activePhaseIndex = 0;
/** @type {"categories" | "drills" | "mechanic"} */
let playView = "categories";
let trainingFilter = "all";
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
let padCaptureTimer = null;
/** @type {Set<number>} */
let padListenIgnore = new Set();

function hideAllScreens() {
  globalThis.__trainerMenu?.ui?.hide();
  hideLockerPreview();
  hubEl.classList.add("hidden");
  menuEl.classList.add("hidden");
  lockerEl.classList.add("hidden");
  settingsEl.classList.add("hidden");
  difficultyEl.classList.add("hidden");
}

/** @returns {HTMLElement | null} */
function getActiveMenuScreen() {
  if (pauseMenu.open) return pauseMenu;
  const liveScreen = globalThis.__trainerMenu?.ui?.active();
  if (liveScreen) return liveScreen;
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
    if (pauseSettings) {
      if (editingBindings) { setBindingsView(false); return; }
      cancelListening();
      settingsEl.classList.add("hidden");
      hud.root.classList.remove("hidden");
      pauseSettings = false;
      pauseMenu.showModal();
      menuGamepad.onScreenChange();
      return;
    }
    togglePauseMenu();
    return;
  }
  if (globalThis.__trainerMenu?.ui?.active()) {
    if (editingBindings && panelControls.closest('#live-menu')) { setBindingsView(false); return; }
    globalThis.__trainerMenu.ui.back();
    return;
  }
  if (!difficultyEl.classList.contains("hidden")) {
    if (globalThis.__trainerMenu?.ui) globalThis.__trainerMenu.ui.drill();
    else showDrills(activePhaseIndex);
    return;
  }
  if (!menuEl.classList.contains("hidden")) {
    if (playView === "mechanic") {
      showDrills(activePhaseIndex);
      return;
    }
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
    if (editingBindings) {
      setBindingsView(false);
      return;
    }
    showHub();
  }
}

const menuGamepad = createMenuGamepad({
  getActiveScreen: getActiveMenuScreen,
  isMenuActive: () => pauseMenu.open || pauseSettings || !activeMode && getActiveMenuScreen() !== null,
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

let practiceStartedAt = null;
let practiceSessionActive = false;
function practiceTotals() {
  try {
    const saved = JSON.parse(localStorage.getItem('rl-training-practice-totals') || '{}');
    return {
      seconds: Number.isFinite(saved.seconds) && saved.seconds >= 0 ? saved.seconds : 0,
      sessions: Number.isInteger(saved.sessions) && saved.sessions >= 0 ? saved.sessions : 0,
    };
  } catch { return { seconds: 0, sessions: 0 }; }
}
function savePractice(endSession = false) {
  if (!practiceSessionActive) return;
  const totals = practiceTotals();
  if (practiceStartedAt !== null) totals.seconds += Math.max(0, performance.now() - practiceStartedAt) / 1000;
  if (endSession) totals.sessions++;
  try { localStorage.setItem('rl-training-practice-totals', JSON.stringify(totals)); } catch { }
  practiceStartedAt = document.hidden || endSession || pauseMenu.open || pauseSettings ? null : performance.now();
  if (endSession) practiceSessionActive = false;
}

function stopActiveMode() {
  pauseSettings = false;
  drillLoading.hidden = true;
  pauseMenu.close();
  modeStartId++;
  savePractice(true);
  if (activeMode) {
    activeMode.stop();
    activeMode = null;
  }
  disposeRocketSimWorlds();
  pendingMode = null;
  setTouchControlsVisible(false);
  if (import.meta.env.DEV) {
    globalThis.__activeMode = null;
  }
}

function showHub() {
  cancelListening();
  stopActiveMode();
  hideAllScreens();
  if (globalThis.__trainerMenu?.ui) {
    globalThis.__trainerMenu.ui.home();
    menuGamepad.onScreenChange();
    return;
  }
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

async function startMode(def, options = {}) {
  if (!def.available || !def.create) return;
  document.getElementById("mode-launch-error")?.remove();
  cancelListening();
  stopActiveMode();
  const requestId = modeStartId;
  drillLoading.querySelector("strong").textContent = def.title;
  drillLoading.hidden = false;
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (requestId !== modeStartId) return;
    physicsInitialization ??= initializeRocketSim().catch(error => { physicsInitialization = null; throw error; });
    await physicsInitialization;
    if (requestId !== modeStartId) return;
    const module = await def.load?.();
    if (requestId !== modeStartId) return;
    activeMode = def.create(modeCtx, options, module);
    activeMode.catalogId = def.id;
    pendingMode = null;
    hideAllScreens();
    menuGamepad.onScreenChange();
    activeMode.start();
    practiceSessionActive = true;
    practiceStartedAt = document.hidden ? null : performance.now();
    try { localStorage.setItem("rl-training-last-drill", def.id); } catch { }
    setTouchControlsVisible(true);
    if (import.meta.env.DEV) {
      globalThis.__activeMode = activeMode;
      globalThis.__gameCamera = camera;
      globalThis.__physicsDiagnostics = rocketSimDiagnostics;
    }
    renderer.render(scene, camera);
    if (requestId === modeStartId) drillLoading.hidden = true;
  } catch (error) {
    if (requestId !== modeStartId) return;
    console.error("Failed to start mode:", error);
    showHub();
    const message = error instanceof Error ? error.message : String(error);
    globalThis.__lastModeLaunchError = { mode: def.id, message, stack: error?.stack, url: location.href };
    try { sessionStorage.setItem("rl-last-mode-launch-error", JSON.stringify(globalThis.__lastModeLaunchError)); } catch { }
    menuHintEl.textContent = `Unable to start ${def.title}: ${message}`;
    const notice = document.createElement("p");
    notice.id = "mode-launch-error";
    notice.setAttribute("role", "alert");
    notice.textContent = menuHintEl.textContent;
    const menuContent = document.querySelector("#live-menu main");
    if (menuContent) menuContent.prepend(notice);
  }
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
  playKickerEl.textContent = "Rocket League / Training";
  playTitleEl.textContent = "Training Garage";
  playSubEl.textContent = "Car control. Better touches. Advanced mechanics.";
  phaseBlurbEl.textContent = "";
  modeListEl.replaceChildren();
  modeListEl.className = "mode-list training-categories";
  let lastDrill;
  try { lastDrill = GAME_MODES.find(mode => mode.id === localStorage.getItem("rl-training-last-drill") && mode.available); } catch { }
  const quickActions = document.createElement("div");
  quickActions.className = "training-actions";
  for (const [label, drill] of [["Continue Training", lastDrill], ["Free Play", FREE_PLAY]]) {
    if (!drill) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-secondary training-quick-action";
    const name = document.createElement("strong");
    name.textContent = label;
    const detail = document.createElement("span");
    detail.textContent = drill.title;
    button.append(name, detail);
    button.addEventListener("click", () => {
      const index = PHASES.findIndex(phase => phase.modes.some(mode => mode.id === drill.id));
      if (index >= 0) showDrills(index);
      onModeCardClick(drill);
    });
    quickActions.append(button);
  }
  modeListEl.append(quickActions);
  const toolbar = document.createElement("div");
  toolbar.className = "training-toolbar";
  const heading = document.createElement("h2");
  heading.textContent = "Mechanic library";
  const filterLabel = document.createElement("label");
  filterLabel.textContent = "Show";
  const filter = document.createElement("select");
  filter.setAttribute("aria-label", "Training availability");
  for (const [value, label] of [["all", "All categories"], ["playable", "Playable now"], ["planned", "Planned categories"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    filter.append(option);
  }
  filter.value = trainingFilter;
  filter.addEventListener("change", () => {
    trainingFilter = filter.value;
    buildPlayCategories();
    menuGamepad.onScreenChange();
    modeListEl.querySelector("select").focus();
  });
  filterLabel.append(filter);
  toolbar.append(heading, filterLabel);
  modeListEl.append(toolbar);

  PHASES.forEach((phase, index) => {
    const playable = phase.modes.filter(mode => mode.available).length;
    if (trainingFilter === "playable" && !playable) return;
    if (trainingFilter === "planned" && playable) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mode-card training-category${playable ? "" : " is-planned"}`;
    btn.dataset.category = phase.id;
    btn.setAttribute("role", "listitem");
    const number = document.createElement("span");
    number.className = "training-number";
    number.textContent = String(index + 1).padStart(2, "0");
    number.setAttribute("aria-hidden", "true");

    const title = document.createElement("div");
    title.className = "mode-card-title";
    title.textContent = phase.title;

    const badge = document.createElement("span");
    badge.className = `mode-badge ${playable ? "ready" : "soon"}`;
    badge.textContent = playable ? "Playable now" : "Coming later";

    const desc = document.createElement("p");
    desc.className = "mode-card-desc";
    desc.textContent = phase.blurb;
    const footer = document.createElement("span");
    footer.className = "training-card-footer";
    footer.textContent = `${phase.modes.length} mechanics${playable ? ` · ${playable} playable` : " · Curriculum only"}`;

    btn.append(number, title, badge, desc, footer);
    btn.addEventListener("click", () => showDrills(index));
    modeListEl.append(btn);
  });
}

function buildDrillList() {
  const phase = PHASES[activePhaseIndex];
  playKickerEl.textContent = "Training Garage";
  playTitleEl.textContent = phase.title;
  playSubEl.textContent = phase.blurb;
  phaseBlurbEl.textContent = `${phase.modes.length} mechanics · ${phase.modes.filter(mode => mode.available).length} playable drills`;
  modeListEl.replaceChildren();
  modeListEl.className = "mode-list training-drills";

  for (const [index, mode] of phase.modes.entries()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-card training-mechanic";
    btn.setAttribute("role", "listitem");

    const title = document.createElement("div");
    title.className = "mode-card-title";
    title.textContent = `${index + 1}. ${mode.title}`;

    const badge = document.createElement("span");
    badge.className = `mode-badge ${mode.available ? "ready" : "soon"}`;
    badge.textContent = mode.available ? "Playable now" : "Coming later";

    const desc = document.createElement("p");
    desc.className = "mode-card-desc";
    const attempts = recentAttempts(mode.id);
    const successes = attempts.filter(attempt => attempt.success).length;
    desc.textContent = mode.description;
    const footer = document.createElement("span");
    footer.className = "training-card-footer";
    footer.textContent = `${mode.level} · ${mode.steps.length} training goals${attempts.length ? ` · ${successes} of ${attempts.length} recent attempts successful` : ""}`;

    btn.append(title, badge, desc, footer);
    btn.addEventListener("click", () => showMechanic(mode));
    modeListEl.append(btn);
  }
}

function showMechanic(mode) {
  playView = "mechanic";
  playKickerEl.textContent = PHASES[activePhaseIndex].title;
  playTitleEl.textContent = mode.title;
  playSubEl.textContent = `${mode.level} · ${mode.steps.length} training goals`;
  phaseBlurbEl.textContent = mode.available ? "Playable practice drill" : "Curriculum preview · Dedicated drill not yet available";
  modeListEl.className = "mode-list training-detail";
  modeListEl.replaceChildren();
  const heading = document.createElement("h2");
  heading.className = "training-goals-title";
  heading.textContent = "Training goals";
  modeListEl.append(heading);
  const steps = document.createElement("ol");
  steps.className = "training-steps";
  for (const step of mode.steps) {
    const item = document.createElement("li");
    item.textContent = step;
    steps.append(item);
  }
  modeListEl.append(steps);
  const action = document.createElement("button");
  action.type = "button";
  action.className = "btn-primary";
  action.textContent = mode.available ? "Start Practice" : "Open Free Play";
  action.addEventListener("click", () => onModeCardClick(mode.available ? mode : FREE_PLAY));
  modeListEl.append(action);
  menuGamepad.onScreenChange();
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
  buildControlOptions();
}

function setBindingsView(editing) {
  editingBindings = editing;
  controlsOverview.classList.toggle("hidden", editing);
  bindingsEditor.classList.toggle("hidden", !editing);
  cancelListening();
  menuGamepad.onScreenChange();
}

function makeControllerLayoutRow() {
  return makeStringSelectRow("Controller Layout", getControllerLayout(), [
    { value: "xbox", label: "Xbox" },
    { value: "playstation", label: "PlayStation" },
  ], value => {
    setControllerLayout(value);
    buildBindList();
    controlOptions.querySelector('select').value = value;
  });
}

function buildControlOptions() {
  controlOptions.replaceChildren();
  controlOptions.append(makeControllerLayoutRow());
  for (const meta of CONTROL_SLIDERS) {
    const row = document.createElement("div");
    row.className = "bind-row";
    const label = document.createElement("label");
    label.className = "bind-label";
    label.textContent = meta.label;
    const wrap = document.createElement("div");
    wrap.className = "bind-range";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = `control-${meta.key}`;
    label.htmlFor = slider.id;
    slider.min = String(meta.min);
    slider.max = String(meta.max);
    slider.step = String(meta.step);
    slider.value = String(getPad()[meta.key]);
    const value = document.createElement("span");
    value.className = "bind-range-value";
    value.textContent = Number(slider.value).toFixed(2);
    slider.addEventListener("input", () => {
      setPad(meta.key, Number(slider.value));
      value.textContent = Number(slider.value).toFixed(2);
    });
    wrap.append(slider, value);
    row.append(label, wrap);
    controlOptions.append(row);
  }
  controlOptions.append(makeStringSelectRow("Ball Camera Mode", getCamera().ballCamMode, BALL_CAM_MODE_OPTIONS, value => {
    setCamera("ballCamMode", value);
  }));
}

function cancelListening() {
  stopPadCapture();
  listeningKeyAction = null;
  listeningPadAction = null;
  padListenIgnore = new Set();
  if (settingsVisible()) {
    if (settingsTab === "controls") {
      rebuildControls();
    } else {
      buildCameraList();
    }
  }
}

function settingsVisible() {
  return !settingsEl.classList.contains("hidden") || Boolean(globalThis.__trainerMenu?.ui?.active() && document.querySelector('#live-menu .settings-fields'));
}

function stopPadCapture() {
  if (padCaptureTimer !== null) clearInterval(padCaptureTimer);
  padCaptureTimer = null;
}

function capturePadBinding() {
  if (!listeningPadAction) return;
  const pad = getActiveGamepad();
  for (const index of [...padListenIgnore]) {
    if (!pad?.buttons[index]?.pressed) padListenIgnore.delete(index);
  }
  const pressed = pollGamepadButtonPress(padListenIgnore);
  if (pressed === null) return;
  setPad(listeningPadAction, pressed);
  listeningPadAction = null;
  padListenIgnore = new Set();
  stopPadCapture();
  rebuildControls();
  menuGamepad.onScreenChange();
}

/**
 * @param {"controls" | "camera"} tab
 */
function setSettingsTab(tab) {
  settingsTab = tab;
  editingBindings = false;
  controlsOverview.classList.remove("hidden");
  bindingsEditor.classList.add("hidden");
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

  const presetRow = makeStringSelectRow("Camera Preset", matchingCameraPreset(cam), [
    { value: "custom", label: "Custom" },
    { value: "default", label: "Default" },
    ...CAMERA_PRESETS.map(preset => ({ value: preset.id, label: preset.label })),
  ], value => {
    if (value === "custom") return;
    if (value === "default") resetCamera();
    else {
      const preset = CAMERA_PRESETS.find(preset => preset.id === value);
      if (!preset) return;
      applyCameraPreset(preset.camera);
      if (value === "xexead") {
        setPad("invertLookX", false);
        setPad("invertLookY", false);
      }
    }
    camera.fov = horizontalFovToVertical(getCamera().fov, camera.aspect);
    camera.updateProjectionMatrix();
    buildCameraList();
  });
  const presetSelect = presetRow.querySelector("select");
  presetSelect.id = "camera-preset";
  const source = document.getElementById("camera-preset-source");
  const updatePreset = () => {
    const id = matchingCameraPreset(getCamera());
    presetSelect.value = id;
    const preset = CAMERA_PRESETS.find(preset => preset.id === id);
    source.replaceChildren();
    if (preset && id !== "xexead") {
      const link = document.createElement("a");
      link.href = id === "car-soccer" ? "https://www.car-soccer.com/" : CAMERA_PRESET_SOURCE;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${id === "car-soccer" ? "Car Soccer" : "Liquipedia"} · ${preset.updated}`;
      source.append(link);
    }
  };
  cameraListEl.append(presetRow);
  cameraListEl.append(makeToggleRow("Camera Shake", cam.shake, checked => {
    setCamera("shake", checked);
    updatePreset();
  }));
  updatePreset();

  for (const slider of CAMERA_SLIDERS) {
    const row = document.createElement("div");
    row.className = "bind-row";

    const label = document.createElement("span");
    label.className = "bind-label";
    label.textContent = slider.key === "fov" ? "Field of View" : slider.label.replace("Camera ", "");

    const wrap = document.createElement("div");
    wrap.className = "bind-range";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(slider.min);
    input.max = String(slider.max);
    input.step = String(slider.step);
    input.value = String(cam[slider.key]);
    input.id = `camera-${slider.key}`;
    input.setAttribute("aria-label", label.textContent);
    const readout = document.createElement("span");
    readout.className = "bind-range-value";
    const fmt = slider.key === "fov" ? n => `${Math.round(n)}°` : n => n.toFixed(2);
    readout.textContent = fmt(Number(cam[slider.key]));
    input.addEventListener("input", () => {
      const n = Number(input.value);
      readout.textContent = fmt(n);
      setCamera(slider.key, n);
      updatePreset();
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

  cameraListEl.append(makeToggleRow("Invert Swivel", getPad().invertLookY, checked => {
    setPad("invertLookY", checked);
  }));

  cameraListEl.append(
    makeStringSelectRow(
      "Ball Camera",
      cam.ballCamMode ?? "toggle",
      BALL_CAM_MODE_OPTIONS,
      (v) => {
        setCamera("ballCamMode", v);
        updatePreset();
      },
    ),
  );
}

/**
 * @param {string | null} padSpec
 * @returns {{ kind: "button", key: string } | { kind: "stick", label: string } | { kind: "none" }}
 */
function parsePadSpec(padSpec) {
  if (!padSpec) return { kind: "none" };
  if (padSpec.startsWith("stick:")) {
    return { kind: "stick", label: padSpec.slice("stick:".length) };
  }
  return { kind: "button", key: padSpec };
}

function bindingCell(button, label, bound, clear) {
  const cell = document.createElement("div");
  cell.className = "binding-cell";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "binding-clear";
  remove.textContent = "×";
  remove.title = `Remove ${label}`;
  remove.setAttribute("aria-label", `Remove ${label}`);
  remove.disabled = !bound;
  remove.addEventListener("click", () => {
    stopPadCapture();
    listeningKeyAction = null;
    listeningPadAction = null;
    padListenIgnore = new Set();
    clear();
    rebuildControls();
  });
  cell.append(button, remove);
  return cell;
}

function renderGamepadIcons(element, index, stick = null) {
  element.replaceChildren();
  const labels = [
    ["A", "×"], ["B", "○"], ["X", "□"], ["Y", "△"],
    ["LB", "L1"], ["RB", "R1"], ["LT", "L2"], ["RT", "R2"],
    ["⧉", "SHARE"], ["☰", "OPTIONS"], ["LS", "L3"], ["RS", "R3"],
    ["↑"], ["↓"], ["←"], ["→"],
  ];
  const layout = getControllerLayout();
  const symbols = stick ? [stick.startsWith("Right") ? "R" : "L"]
    : labels[index] ? [labels[index][layout === "playstation" && labels[index].length > 1 ? 1 : 0]] : null;
  if (!symbols) {
    element.textContent = formatPadButton(index);
    return;
  }
  const group = document.createElement("span");
  group.className = "gamepad-icons";
  group.setAttribute("aria-hidden", "true");
  symbols.forEach(symbol => {
    const icon = document.createElement("span");
    icon.className = `gamepad-icon ${stick ? "stick-icon" : index < 4 ? `face-icon ${layout} face-${index}` : index >= 12 ? "dpad-icon" : "shoulder-icon"}`;
    icon.textContent = symbol;
    group.append(icon);
  });
  if (stick) {
    const direction = stick.match(/[↑↓←→]/)?.[0];
    if (direction) {
      const arrow = document.createElement("span");
      arrow.textContent = direction;
      group.append(arrow);
    }
  }
  element.append(group);
  const name = stick ?? formatPadButton(index);
  element.title = name;
  element.setAttribute("aria-label", `${element.getAttribute("aria-label") ?? "Gamepad"}: ${name}`);
}

function buildBindList() {
  const binds = getBinds();
  const pad = getPad();
  bindListEl.replaceChildren();
  bindListEl.append(makeControllerLayoutRow());
  updatePadStatusLine();
  document.getElementById("control-preset").value = getControlPreset();

  for (const section of BIND_SECTIONS) {
    for (const entry of section.actions) {
      const action = entry.id;
      const row = document.createElement("div");
      row.className = "bind-row bind-row-cols";
      row.dataset.action = action;

      const label = document.createElement("span");
      label.className = "bind-label";
      label.textContent = BIND_LABELS[action] ?? action;

      const keyBtn = document.createElement("button");
      keyBtn.type = "button";
      keyBtn.className = "bind-key";
      keyBtn.setAttribute("aria-label", `${BIND_LABELS[action]} keyboard binding`);
      keyBtn.title = "Click, then press any key or mouse button. Backspace clears.";
      if (listeningKeyAction === action) {
        keyBtn.classList.add("listening");
        keyBtn.textContent = "Press key / mouse…";
      } else {
        const code = binds[action];
        keyBtn.textContent = code ? formatKeyCode(code) : "—";
      }
      keyBtn.addEventListener("click", () => {
        stopPadCapture();
        listeningPadAction = null;
        listeningKeyAction = action;
        rebuildControls();
      });

      const padSpec = parsePadSpec(entry.pad);
      /** @type {HTMLElement} */
      let padCell;
      if (padSpec.kind === "stick") {
        padCell = document.createElement("span");
        padCell.className = "bind-key bind-key-pad bind-key-fixed";
        renderGamepadIcons(padCell, null, padSpec.label);
      } else if (padSpec.kind === "button") {
        const padKey = padSpec.key;
        const padBtn = document.createElement("button");
        padBtn.type = "button";
        padBtn.className = "bind-key bind-key-pad";
        padBtn.setAttribute("aria-label", `${BIND_LABELS[action]} gamepad binding`);
        padBtn.title = "Click, then press a controller button";
        if (listeningPadAction === padKey) {
          padBtn.classList.add("listening");
          padBtn.textContent = "Press a button…";
        } else {
          renderGamepadIcons(padBtn, pad[padKey]);
        }
        padBtn.addEventListener("click", () => {
          stopPadCapture();
          listeningKeyAction = null;
          listeningPadAction = padKey;
          padListenIgnore = snapshotPressedButtons();
          rebuildControls();
          padCaptureTimer = setInterval(capturePadBinding, 50);
        });
        padCell = bindingCell(padBtn, `${BIND_LABELS[action]} gamepad binding`, pad[padKey] != null, () => setPad(padKey, null));
      } else {
        padCell = document.createElement("span");
        padCell.className = "bind-key bind-key-pad bind-key-fixed";
        padCell.textContent = "—";
      }

      const keyCell = bindingCell(keyBtn, `${BIND_LABELS[action]} keyboard binding`, Boolean(binds[action]), () => setBind(action, ""));
      row.append(label, keyCell, padCell);
      bindListEl.append(row);
    }
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
    makeSelectRow("Look X axis", cfg.lookXAxis, PAD_AXIS_OPTIONS, (v) => {
      setPad("lookXAxis", v);
      buildPadOptionsList();
    }),
  );

  padBindListEl.append(
    makeSelectRow("Look Y axis", cfg.lookYAxis, PAD_AXIS_OPTIONS, (v) => {
      setPad("lookYAxis", v);
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

  padBindListEl.append(
    makeToggleRow("Invert look X", cfg.invertLookX, (checked) => {
      setPad("invertLookX", checked);
    }),
  );

  padBindListEl.append(
    makeToggleRow("Invert look Y", cfg.invertLookY, (checked) => {
      setPad("invertLookY", checked);
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
 * @param {string} value
 * @param {{ value: string, label: string }[]} options
 * @param {(v: string) => void} onChange
 */
function makeStringSelectRow(title, value, options, onChange) {
  const row = document.createElement("div");
  row.className = "bind-row";

  const label = document.createElement("span");
  label.className = "bind-label";
  label.textContent = title;

  const select = document.createElement("select");
  select.className = "bind-control";
  select.setAttribute("aria-label", title);
  for (const opt of options) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === value) option.selected = true;
    select.append(option);
  }
  select.addEventListener("change", () => {
    onChange(select.value);
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
  input.setAttribute("aria-label", title);
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
  input.min = "0";
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

btnMenu.addEventListener("click", handleMenuBack);
btnPlay.addEventListener("click", showPlay);
btnLocker.addEventListener("click", showLocker);
btnSettings.addEventListener("click", showSettings);
document.getElementById("btn-view-bindings").addEventListener("click", () => setBindingsView(true));
document.getElementById("control-preset").addEventListener("change", event => {
  if (event.target.value === "default") resetControlBindings();
  else applyControlPreset(event.target.value);
  rebuildControls();
});
btnPlayBack.addEventListener("click", handleMenuBack);
btnLockerBack.addEventListener("click", showHub);
btnSettingsBack.addEventListener("click", handleMenuBack);
btnDifficultyBack.addEventListener("click", () => globalThis.__trainerMenu?.ui ? globalThis.__trainerMenu.ui.drill() : showDrills(activePhaseIndex));
btnResetBinds.addEventListener("click", () => {
  if (editingBindings) resetControlBindings();
  else if (settingsTab === "camera") resetCamera();
  else resetAllControls();
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
    if (e.code === "Escape") {
      // Cancel listen only — latch Esc so the frame loop does not also leave Settings.
      cancelListening();
      escLatch = true;
      return;
    }
    // Backspace / Delete clear the bind (unbind), matching RL Controls.
    const code =
      e.code === "Backspace" || e.code === "Delete" ? "" : e.code;
    setBind(
      /** @type {import("./shared/settings.js").BindAction} */(
        listeningKeyAction
      ),
      code,
    );
    listeningKeyAction = null;
    rebuildControls();
  },
  true,
);

// Any mouse button can be bound while listening (LMB/RMB/MMB/Mouse3/4).
window.addEventListener(
  "mousedown",
  (e) => {
    if (!listeningKeyAction) return;
    e.preventDefault();
    e.stopPropagation();
    setBind(
      /** @type {import("./shared/settings.js").BindAction} */(
        listeningKeyAction
      ),
      `Mouse${e.button}`,
    );
    listeningKeyAction = null;
    rebuildControls();
  },
  true,
);

window.addEventListener(
  "contextmenu",
  (e) => {
    if (!listeningKeyAction) return;
    e.preventDefault();
  },
  true,
);

window.addEventListener("gamepadconnected", () => {
  if (settingsVisible() && settingsTab === "controls") {
    rebuildControls();
  }
});
window.addEventListener("gamepaddisconnected", () => {
  if (settingsVisible() && settingsTab === "controls") {
    rebuildControls();
  }
});

onBindsChange(refreshHelpText);

let last = performance.now();
document.addEventListener("visibilitychange", () => {
  savePractice();
  last = performance.now();
  if (document.hidden) keys.clear();
});
window.addEventListener('pagehide', () => savePractice(true));
function frame(now) {
  const dt = frameElapsed(now, last);
  last = now;

  if (keys.has("Escape") && !escLatch) {
    escLatch = true;
    handleMenuBack();
  }
  if (!keys.has("Escape")) escLatch = false;

  // Start / Options follows Escape for gameplay and menus.
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
  capturePadBinding();

  if (
    settingsVisible() &&
    settingsTab === "controls" &&
    !listeningPadAction
  ) {
    updatePadStatusLine();
  }

  if (activeMode && !pauseMenu.open && !pauseSettings) activeMode.update(dt, now);
  else if (!activeMode) updateLockerPreview(dt);

  engineAudio.update(activeMode?.physCar, activeMode?.physCar ? readControls() : {},
    Boolean(activeMode && !pauseMenu.open && !pauseSettings && !document.hidden));
  boostAudio.update(activeMode?.physCar, {},
    Boolean(activeMode && !pauseMenu.open && !pauseSettings && !document.hidden));
  jumpAudio.update(activeMode?.physCar, {},
    Boolean(activeMode && !pauseMenu.open && !pauseSettings && !document.hidden));

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

initAppViewport();
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
globalThis.__trainerMenu = {
  ui: null,
  car: getSelectedCar,
  practiceTotals,
  equipCar: id => {
    if (!CARS.some(car => car.id === id)) return;
    setSelectedCarId(id);
    buildLocker();
    refreshEquippedLabel();
  },
  freeplay: FREE_PLAY,
  arena1v1: ARENA_1V1,
  playableCount: () => GAME_MODES.filter(mode => mode.available).length,
  lastDrill: () => {
    try { return GAME_MODES.find(mode => mode.id === localStorage.getItem('rl-training-last-drill') && mode.available); } catch { return null; }
  },
  prepare: () => { cancelListening(); stopActiveMode(); hideAllScreens(); },
  launch: (def, options) => {
    const index = PHASES.findIndex(phase => phase.modes.some(mode => mode.id === def.id));
    if (index >= 0) activePhaseIndex = index;
    globalThis.__trainerMenu.ui.hide();
    if (options) startMode(def, options);
    else onModeCardClick(def);
  },
  settings: (container, tab) => {
    container.replaceChildren();
    if (tab === 'loadout') {
      buildLocker();
      container.append(lockerListEl, lockerCreditEl);
      const ballSetting = document.createElement('label');
      ballSetting.className = 'setting';
      const ballTitle = document.createElement('strong');
      ballTitle.textContent = 'Ball type';
      const ballSelect = document.createElement('select');
      ballSelect.setAttribute('aria-label', 'Ball type');
      for (const ball of BALL_TYPES) {
        ballSelect.add(new Option(ball.name, ball.id));
      }
      ballSelect.value = getSelectedBallId();
      ballSelect.addEventListener('change', () => setSelectedBallId(ballSelect.value));
      ballSetting.append(ballTitle, ballSelect);
      container.append(ballSetting);
    } else {
      setSettingsTab(tab === 'bindings' ? 'controls' : tab);
      if (tab === 'bindings') setBindingsView(true);
      container.append(tab === 'camera' ? panelCamera : panelControls);
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'secondary settings-default';
      reset.textContent = `Reset ${tab === 'bindings' ? 'bindings' : tab === 'camera' ? 'camera' : 'controls'} to defaults`;
      reset.addEventListener('click', () => btnResetBinds.click());
      container.append(reset);
    }
    menuGamepad.onScreenChange();
  },
  connect: ui => { globalThis.__trainerMenu.ui = ui; hideAllScreens(); ui.home(); menuGamepad.onScreenChange(); },
  parkSettings: () => {
    settingsEl.querySelector('.settings-panel').append(panelControls, panelCamera);
    lockerEl.querySelector('.menu-panel').append(lockerListEl, lockerCreditEl);
  },
};
import('./menus/volt.js').then(async () => {
  document.body.classList.remove("menu-loading");
  if (new URLSearchParams(location.search).get("replay") !== "rocketsim") return;
  const replayModule = await import("./modes/referenceReplay.js");
  if (!replayModule.hasReferenceRecording) {
    console.warn("RocketSim replay is unavailable: generate the reference recording before starting or building Vite.");
    return;
  }
  globalThis.__trainerMenu.ui?.hide();
  startMode({
    id: "rocketsim-replay",
    available: true,
    load: () => Promise.resolve(replayModule),
    create: (ctx, options, module) => new module.ReferenceReplayMode(ctx),
  }).then(() => setTouchControlsVisible(false));
}).catch(error => {
  console.error("Unable to load the main menu:", error);
  document.body.classList.remove("menu-loading");
  showHub();
});
requestAnimationFrame(frame);

Promise.all([preloadCars([getSelectedCarId()]), preloadBall()]).then(() => {
  refreshEquippedLabel();
  // If the locker is already open, refresh the GLB body once assets land.
  if (!lockerEl.classList.contains("hidden")) {
    setLockerPreviewCar(getSelectedCarId(), { force: true });
  }
});
