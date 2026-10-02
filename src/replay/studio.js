import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createIcons, icons } from "lucide";
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, canEncodeVideo, canEncodeAudio } from "mediabunny";
import { createStadium } from "../shared/stadium.js";
import { makeCar, disposeCarVisual } from "../shared/car.js";
import { alignCarVisualToHitbox } from "../shared/rl-physics.js";
import { preloadCars } from "../shared/carAssets.js";
import { preloadBall, cloneBallMesh } from "../shared/ball.js";
import { frameAt, samplePose, exportSettings, prepareReplayMotion } from "./timeline.js";
import { createPlayerCameraTrack } from "./playerCamera.js";
import { analyzeReplayBall } from "./ballComparison.js";
import { ReplayBoost, ReplayHud, ReplayWheels } from "./renderEffects.js";
import { ReplayMatchEffects, ReplayAudio, synthesizeReplayAudio } from "./matchEffects.js";
import "./studio.css";

const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map(element => [element.id, element]));
createIcons({ icons });
const renderer = new THREE.WebGLRenderer({ canvas: elements.preview, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202b25);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room).texture;
room.dispose();
pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xdcebdc, 0x45503b, 2));
const sunlight = new THREE.DirectionalLight(0xffeed6, 3);
sunlight.position.set(20, 65, -20);
scene.add(sunlight, createStadium());
const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 1500);
camera.position.set(65, 58, 82);
const orbit = new OrbitControls(camera, elements.preview);
orbit.target.set(0, 0, 0);
orbit.maxDistance = 180;
orbit.minDistance = 3;
orbit.maxPolarAngle = Math.PI / 2 - 0.02;
orbit.update();
const ball = new THREE.Group();
ball.visible = false;
scene.add(ball);
const comparisonPaths = new THREE.Group();
const comparisonBall = new THREE.Mesh(new THREE.SphereGeometry(0.94, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xff507f, wireframe: true, depthTest: false }));
comparisonBall.visible = false;
scene.add(comparisonPaths, comparisonBall);
let ballAnalysis, reportUrl;
let replay, worker, cars = [], time = 0, playing = false, loading = false, exporting = false, canceled = false, downloadUrl;
const playerCameras = new Map();
let preparedExport, preparation, preparationTimer, preparing = false;
let preparationVersion = 0;
let boostEffects = [];
let wheelEffects = [];
let matchEffects;
const replayAudio = new ReplayAudio();
const replayHud = new ReplayHud();
const assets = Promise.all([preloadCars(["octane"]), preloadBall()]).then(() => {
  const model = cloneBallMesh();
  if (model) { model.scale.setScalar(0.9275); ball.add(model); }
  else ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.9275, 32, 24), new THREE.MeshStandardMaterial({ color: 0xe4e8e1 })));
});
const carBasis = new THREE.Matrix4();
const front = new THREE.Vector3();
const up = new THREE.Vector3();
const left = new THREE.Vector3();

function status(message, error = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", error);
}

function setPlaying(value) {
  playing = value;
  replayAudio.stop();
  if (value && replay) replayAudio.play(replay, time, Number(elements.speed.value)).catch(error => status(`Audio unavailable: ${error.message}`, true));
  elements.play.innerHTML = `<i data-lucide="${value ? "pause" : "play"}"></i>`;
  elements.play.title = value ? "Pause" : "Play";
  elements.play.setAttribute("aria-label", elements.play.title);
  elements.play.setAttribute("aria-pressed", String(value));
  createIcons({ icons, root: elements.play });
}

function lockControls() {
  for (const name of ["play", "restart", "previous-frame", "next-frame", "seek", "export"]) {
    elements[name].disabled = !replay || loading || exporting;
  }
  for (const name of ["import", "sample", "camera", "resolution", "fps", "speed"]) {
    elements[name].disabled = loading || exporting;
  }
  orbit.enabled = !exporting && ["overview", "closeup"].includes(elements.camera.value);
  for (const name of ["clip-start", "clip-end"]) elements[name].disabled = !replay || loading || exporting;
  elements["follow-player"].disabled = !replay || loading || exporting;
  elements["ball-comparison"].disabled = !replay || loading || exporting;
}

function selectBallComparison() {
  for (const line of [...comparisonPaths.children]) {
    line.geometry.dispose();
    line.material.dispose();
    line.removeFromParent();
  }
  comparisonBall.visible = false;
  const selected = ballAnalysis?.windows[Number(elements["ball-comparison"].value)];
  if (elements["ball-comparison"].value === "" || !selected) {
    elements["ball-errors"].textContent = "";
    return;
  }
  for (const [key, color] of [["recorded", 0x55e5ed], ["simulated", 0xff507f]]) {
    const points = selected.rows.map(row => new THREE.Vector3(row[key][0], row[key][2], row[key][1]).multiplyScalar(0.01));
    comparisonPaths.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, depthTest: false })));
  }
  elements["ball-errors"].textContent = `Diagnostic only / cyan: recorded / pink: simulated. Max position ${selected.maxPositionErrorUU.toFixed(2)} uu; velocity ${selected.maxVelocityErrorUUs.toFixed(2)} uu/s; timing residual ${(selected.maxTimingResidualSeconds * 1000).toFixed(2)} ms. Initial spin: zero (unverified).`;
  time = selected.start;
  setPlaying(false);
  elements.camera.value = "ball";
  elements["camera-label"].textContent = "BALL COMPARISON";
  orbit.enabled = false;
  updateTransport();
  renderAt(time);
}
elements["ball-comparison"].onchange = selectBallComparison;

function resize() {
  if (exporting) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(elements.stage.clientWidth, elements.stage.clientHeight, false);
  camera.aspect = elements.stage.clientWidth / elements.stage.clientHeight;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(elements.stage);

function renderAt(playhead) {
  if (replay) {
    const cursor = frameAt(replay.times, playhead);
    const ballPose = samplePose(replay.ball, cursor);
    ball.visible = Boolean(ballPose);
    if (ballPose) { ball.position.copy(ballPose.position); ball.quaternion.copy(ballPose.quaternion); }
    const comparison = elements["ball-comparison"].value === "" ? null : ballAnalysis?.windows[Number(elements["ball-comparison"].value)];
    comparisonBall.visible = Boolean(comparison && playhead >= comparison.start && playhead <= comparison.end);
    if (comparisonBall.visible) {
      const rows = comparison.rows;
      const sample = frameAt(rows.map(row => row.time - comparison.start), playhead - comparison.start);
      const first = rows[sample.index].simulated;
      const next = rows[sample.next].simulated;
      comparisonBall.position.set(first[0], first[2], first[1]).lerp(new THREE.Vector3(next[0], next[2], next[1]), sample.blend).multiplyScalar(0.01);
    }
    cars.forEach((car, index) => {
      const pose = samplePose(replay.players[index].frames, cursor);
      car.visible = Boolean(pose);
      if (!pose) {
        boostEffects[index]?.render(replay, index, playhead, car, false);
        wheelEffects[index]?.render(replay, index, playhead);
        return;
      }
      car.position.copy(pose.position);
      front.set(1, 0, 0).applyQuaternion(pose.quaternion);
      up.set(0, 1, 0).applyQuaternion(pose.quaternion);
      left.copy(up).cross(front);
      car.quaternion.setFromRotationMatrix(carBasis.makeBasis(left, up, front));
      car.userData.setBoost?.(pose.boost);
      boostEffects[index]?.render(replay, index, playhead, car, pose.boost);
      wheelEffects[index]?.render(replay, index, playhead);
    });
    const view = elements.camera.value;
    if (view === "ball") {
      const target = ball.visible ? ball.position : new THREE.Vector3();
      camera.position.copy(target).add(new THREE.Vector3(14, 12, 20));
      camera.lookAt(target);
    } else if (view === "player") {
      const index = Number(elements["follow-player"].value);
      const key = `${index}:recorded`;
      if (!playerCameras.has(key)) playerCameras.set(key, createPlayerCameraTrack(replay, index));
      playerCameras.get(key)(camera, cursor);
    }
    if (view !== "player" && camera.fov !== 65) { camera.fov = 65; camera.updateProjectionMatrix(); }
  }
  if (replay) matchEffects?.render(replay, playhead);
  renderer.render(scene, camera);
  if (replay) {
    const index = Number(elements["follow-player"].value);
    const cursor = frameAt(replay.times, playhead);
    const player = replay.players[index];
    const showPlayer = elements.camera.value === "player";
    replayHud.render(renderer, showPlayer ? player : null, showPlayer ? samplePose(player.frames, cursor) : null,
      player.ballCam?.[cursor.index] ?? null, replay.match[cursor.index]);
  }
}

const formatTime = seconds => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
function updateTransport() {
  elements.seek.value = String(time);
  elements.seek.style.setProperty("--progress", `${replay?.duration ? time / replay.duration * 100 : 0}%`);
  elements.elapsed.textContent = formatTime(time);
  elements.total.textContent = `/ ${formatTime(replay?.duration ?? 0)}`;
  elements.duration.textContent = formatTime(replay?.duration ?? 0);
  elements["frame-label"].textContent = formatTime(time);
}

async function loadReplay(bytes, name) {
  scheduleExportPreparation();
  if (exporting) return;
  worker?.terminate();
  loading = true;
  setPlaying(false);
  lockControls();
  status("Decoding replay...");
  worker = new Worker(new URL("./decodeWorker.js", import.meta.url), { type: "module" });
  const currentWorker = worker;
  const fail = message => { currentWorker.terminate(); loading = false; lockControls(); status(message, true); };
  currentWorker.onerror = event => fail(event.message || "Replay decoder failed.");
  currentWorker.onmessage = async event => {
    if (event.data.type === "progress") return;
    if (event.data.type === "error") { fail(event.data.message); return; }
    try {
      await assets;
      if (worker !== currentWorker) return;
      replay = event.data.replay;
      prepareReplayMotion(replay);
      await preloadCars([...new Set(replay.players.map(player => player.carId))]);
      if (worker !== currentWorker) return;
      ballAnalysis = analyzeReplayBall(replay);
      elements["ball-comparison"].replaceChildren(new Option("Off", ""), ...ballAnalysis.windows.map((window, index) =>
        new Option(`${window.kind === "flight" ? "Free flight" : "Floor bounce"} / ${window.start.toFixed(2)}-${window.end.toFixed(2)} s`, String(index))));
      selectBallComparison();
      if (reportUrl) URL.revokeObjectURL(reportUrl);
      reportUrl = URL.createObjectURL(new Blob([JSON.stringify({ replay: name, ...ballAnalysis }, null, 2)], { type: "application/json" }));
      elements["ball-report"].href = reportUrl;
      elements["ball-report"].hidden = false;
      for (const effect of boostEffects) effect.dispose();
      for (const effect of wheelEffects) effect.dispose();
      matchEffects?.dispose();
      matchEffects = new ReplayMatchEffects(scene);
      for (const car of cars) { car.removeFromParent(); disposeCarVisual(car); }
      cars = replay.players.map(player => {
        const car = makeCar(player.blue ? 0x48aaff : 0xffa047, 1, { carId: player.carId, markers: false });
        car.userData.visual.traverse(object => {
          if (!object.isMesh) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material?.color && /(^paint$|body)/i.test(material.name)) material.color.setHex(player.blue ? 0x48aaff : 0xffa047);
          }
        });
        alignCarVisualToHitbox(car, car.userData.hitboxPreset);
        car.userData.visual.scale.x = -Math.abs(car.userData.visual.scale.x);
        scene.add(car);
        return car;
      });
      boostEffects = cars.map(car => new ReplayBoost(scene, car));
      wheelEffects = cars.map((car, index) => new ReplayWheels(scene, replay, index, car));
      playerCameras.clear();
      elements.camera.value = "player";
      elements["follow-player"].replaceChildren(...replay.players.map((player, index) => new Option(player.name, String(index))));
      elements["camera-label"].textContent = (replay.players[0]?.name ?? "Player POV").toUpperCase();
      camera.position.set(65, 58, 82);
      orbit.target.set(0, 0, 0);
      orbit.update();
      elements.filename.textContent = name;
      elements.match.hidden = true;
      elements.match.textContent = replay.players.map(player => player.name).join(" / ");
      elements.seek.max = String(replay.duration);
      elements["clip-start"].value = "0";
      elements["clip-end"].value = String(replay.duration);
      for (const name of ["clip-start", "clip-end"]) elements[name].max = String(replay.duration);
      delete elements.status.dataset.exportReport;
      elements.download.hidden = true;
      if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = undefined; }
      time = 0;
      loading = false;
      lockControls();
      updateTransport();
      status(`${replay.players.length} players / ${formatTime(replay.duration)} / Ready`);
      currentWorker.terminate();
      renderAt(time);
      scheduleExportPreparation();
    } catch (error) { fail(error.message); }
  };
  currentWorker.postMessage(bytes, [bytes]);
}

elements.import.onclick = () => elements.file.click();
elements.file.onchange = async () => {
  const file = elements.file.files[0];
  elements.file.value = "";
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".replay")) { status("Select a .replay file.", true); return; }
  if (file.size > 100 * 1024 * 1024) { status("Replay exceeds the 100 MB import limit.", true); return; }
  loading = true;
  setPlaying(false);
  lockControls();
  status("Reading replay...");
  try { await loadReplay(await file.arrayBuffer(), file.name); }
  catch (error) { loading = false; lockControls(); status(error.message, true); }
};
elements.sample.onclick = async () => {
  loading = true;
  setPlaying(false);
  lockControls();
  status("Reading added replay...");
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}replays/0000a984-75af-4b24-b5a6-cb3663fc4efa.replay`);
    if (!response.ok) throw new Error("Added replay could not be loaded.");
    await loadReplay(await response.arrayBuffer(), "0000a984-75af-4b24-b5a6-cb3663fc4efa.replay");
  } catch (error) { loading = false; lockControls(); status(error.message, true); }
};
elements.play.onclick = () => { if (time >= replay.duration) time = 0; setPlaying(!playing); };
elements.restart.onclick = () => { time = 0; setPlaying(false); updateTransport(); renderAt(time); };
elements.seek.oninput = () => { time = Number(elements.seek.value); setPlaying(false); updateTransport(); renderAt(time); };
function stepFrame(direction) {
  if (!replay || loading || exporting) return;
  const index = direction > 0
    ? replay.times.findIndex(timestamp => timestamp > time + 0.000001)
    : replay.times.findLastIndex(timestamp => timestamp < time - 0.000001);
  time = index < 0 ? (direction > 0 ? replay.duration : 0) : replay.times[index];
  setPlaying(false);
  updateTransport();
  renderAt(time);
}
elements["previous-frame"].onclick = () => stepFrame(-1);
elements["next-frame"].onclick = () => stepFrame(1);
elements.speed.onchange = () => { if (playing) setPlaying(true); };
elements.camera.onchange = () => {
  if (elements.camera.value === "overview") { camera.position.set(65, 58, 82); orbit.target.set(0, 0, 0); orbit.update(); }
  if (elements.camera.value === "closeup" && replay) {
    const target = samplePose(replay.ball, frameAt(replay.times, time))?.position ?? new THREE.Vector3();
    orbit.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(target.x > 0 ? -8 : 8, 5, target.z > 0 ? -10 : 10));
    orbit.update();
  }
  elements["camera-label"].textContent = (elements.camera.value === "player" ? replay?.players[Number(elements["follow-player"].value)]?.name ?? "Player POV" : elements.camera.selectedOptions[0].textContent).toUpperCase();
  lockControls();
  renderAt(time);
};
elements["follow-player"].onchange = () => { elements.camera.value = "player"; elements.camera.onchange(); };
function selectedExportSettings() {
  const [width, height] = elements.resolution.value.split(",").map(Number);
  return exportSettings({ start: Number(elements["clip-start"].value),
    end: elements["clip-end"].value === "" ? replay.duration : Number(elements["clip-end"].value),
    fps: Number(elements.fps.value), width, height }, replay.duration);
}

function exportKey(settings) {
  return JSON.stringify([settings, elements.camera.value, elements["follow-player"].value,
    elements["ball-comparison"].value, ["overview", "closeup"].includes(elements.camera.value)
      ? [camera.position.toArray(), camera.quaternion.toArray()] : null]);
}

async function prepareExport(settings) {
  const started = performance.now();
  const videoConfig = { codec: "avc", width: settings.width, height: settings.height,
    bitrate: settings.width === 1920 ? 12_000_000 : 8_000_000,
    latencyMode: "quality", hardwareAcceleration: "prefer-hardware" };
  if (!await canEncodeVideo("avc", videoConfig)) videoConfig.hardwareAcceleration = "no-preference";
  if (!await canEncodeVideo("avc", videoConfig)) {
    throw new Error("H.264 encoding is unavailable. Open this page in current Chrome or Edge on localhost or HTTPS.");
  }
  if (!await canEncodeAudio("aac", { sampleRate: 48000, numberOfChannels: 1, bitrate: 96000, fullCodecString: "mp4a.40.2" })) {
    throw new Error("AAC encoding is unavailable in this browser. Use current Chrome or Edge.");
  }
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const source = new CanvasSource(renderer.domElement, videoConfig);
  const audio = new AudioBufferSource({ codec: "aac", bitrate: 96000, fullCodecString: "mp4a.40.2" });
  output.addVideoTrack(source, { frameRate: settings.fps });
  output.addAudioTrack(audio);
  const previousPosition = camera.position.clone();
  const previousRotation = camera.quaternion.clone();
  preparing = true;
  try {
    await output.start();
    renderer.setPixelRatio(1);
    renderer.setSize(settings.width, settings.height, false);
    camera.aspect = settings.width / settings.height;
    camera.updateProjectionMatrix();
    renderAt(settings.start);
    await source.add(0, Math.min(1 / settings.fps, settings.end - settings.start));
    return { output, target, source, audio, videoConfig, warmStartMs: performance.now() - started };
  } catch (error) {
    await output.cancel();
    throw error;
  } finally {
    camera.position.copy(previousPosition);
    camera.quaternion.copy(previousRotation);
    preparing = false;
    resize();
    renderAt(time);
  }
}

function scheduleExportPreparation() {
  clearTimeout(preparationTimer);
  const version = ++preparationVersion;
  if (preparedExport) {
    void preparedExport.output.cancel();
    preparedExport = undefined;
  }
  if (!replay || loading || exporting) return;
  preparationTimer = setTimeout(() => {
    const previousPreparation = preparation;
    preparation = (async () => {
      try {
        await previousPreparation;
        if (version !== preparationVersion || loading || exporting) return;
        const settings = selectedExportSettings();
        const key = exportKey(settings);
        const preparedReplay = replay;
        const bundle = await prepareExport(settings);
        if (version !== preparationVersion || replay !== preparedReplay) {
          await bundle.output.cancel();
          return;
        }
        preparedExport = { ...bundle, key, replay: preparedReplay };
      } catch {
        if (version === preparationVersion) preparedExport = undefined;
      }
    })();
  }, 400);
}

for (const name of ["resolution", "fps", "clip-start", "clip-end", "camera", "follow-player", "ball-comparison"]) {
  elements[name].addEventListener("change", scheduleExportPreparation);
}
orbit.addEventListener("end", scheduleExportPreparation);
elements.cancel.onclick = () => { canceled = true; status("Canceling..."); };
elements.export.onclick = async () => {
  if (!replay || exporting) return;
  let output;
  const previousTime = time;
  const previousPosition = camera.position.clone();
  const previousRotation = camera.quaternion.clone();
  try {
    const settings = selectedExportSettings();
    const { width, height } = settings;
    const key = exportKey(settings);
    const started = performance.now();
    delete elements.status.dataset.exportReport;
    const timings = { renderSubmissionMs: 0, encoderWaitMs: 0, audioMs: 0, finalizeMs: 0 };
    exporting = true;
    canceled = false;
    setPlaying(false);
    lockControls();
    elements.cancel.hidden = false;
    elements.progress.hidden = false;
    elements.progress.value = 0;
    elements.download.hidden = true;
    clearTimeout(preparationTimer);
    status("Preparing encoder...");
    await preparation;
    const reusedWarmStart = preparedExport?.key === key && preparedExport.replay === replay;
    if (preparedExport && !reusedWarmStart) await preparedExport.output.cancel();
    const bundle = reusedWarmStart ? preparedExport : await prepareExport(settings);
    preparedExport = undefined;
    const { target, source, audio, videoConfig, warmStartMs } = bundle;
    output = bundle.output;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const audioContext = new OfflineAudioContext(1, 48000, 48000);
    status("Preparing reconstructed audio...");
    const audioStarted = performance.now();
    for (let start = settings.start; start < settings.end; start += 10) {
      if (canceled) throw new Error("Render canceled.");
      const samples = synthesizeReplayAudio(replay, start, Math.min(10, settings.end - start), 48000);
      const buffer = audioContext.createBuffer(1, samples.length, 48000);
      buffer.copyToChannel(samples, 0);
      await audio.add(buffer);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    audio.close();
    timings.audioMs = performance.now() - audioStarted;
    for (let index = 1; index < settings.frames; index++) {
      if (canceled) throw new Error("Render canceled.");
      const timestamp = index / settings.fps;
      const renderStarted = performance.now();
      renderAt(settings.start + timestamp);
      timings.renderSubmissionMs += performance.now() - renderStarted;
      const encodeStarted = performance.now();
      await source.add(timestamp, Math.min(1 / settings.fps, settings.end - settings.start - timestamp));
      timings.encoderWaitMs += performance.now() - encodeStarted;
      if (index % 15 === 0 || index === settings.frames - 1) {
        elements.progress.value = (index + 1) / settings.frames;
        status(`Rendering ${Math.round(elements.progress.value * 100)}% / ${index + 1} of ${settings.frames} frames`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    if (canceled) throw new Error("Render canceled.");
    status("Finalizing MP4...");
    const finalizeStarted = performance.now();
    source.close();
    await output.finalize();
    timings.finalizeMs = performance.now() - finalizeStarted;
    const totalMs = performance.now() - started;
    const report = { ...settings, ...timings, totalMs,
      reusedWarmStart, warmStartMs,
      exportFramesPerSecond: settings.frames / (totalMs / 1000),
      hardwarePreference: videoConfig.hardwareAcceleration };
    elements.status.dataset.exportReport = JSON.stringify(report);
    console.info("Replay export timing (GPU work may be included in encoder wait)", report);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([target.buffer], { type: "video/mp4" }));
    elements.download.href = downloadUrl;
    elements.download.download = `${elements.filename.textContent.replace(/\.replay$/i, "")}-${settings.start.toFixed(2)}-${settings.end.toFixed(2)}.mp4`;
    elements.download.hidden = false;
    status(`MP4 ready / ${(target.buffer.byteLength / 1024 / 1024).toFixed(1)} MB / ${(totalMs / 1000).toFixed(1)}s / ${report.exportFramesPerSecond.toFixed(1)} frames/s. Scene ${(timings.renderSubmissionMs / 1000).toFixed(1)}s; encoder wait ${(timings.encoderWaitMs / 1000).toFixed(1)}s; audio ${(timings.audioMs / 1000).toFixed(1)}s; finalize ${(timings.finalizeMs / 1000).toFixed(1)}s.`);
  } catch (error) {
    if (output && output.state !== "finalized" && output.state !== "canceled") await output.cancel();
    status(error.message, !canceled);
  } finally {
    exporting = false;
    elements.cancel.hidden = true;
    elements.progress.hidden = true;
    time = previousTime;
    camera.position.copy(previousPosition);
    camera.quaternion.copy(previousRotation);
    resize();
    lockControls();
    renderAt(time);
    scheduleExportPreparation();
  }
};

let lastFrame;
renderer.setAnimationLoop(timestamp => {
  const elapsed = lastFrame === undefined ? 0 : Math.min((timestamp - lastFrame) / 1000, 0.1);
  lastFrame = timestamp;
  if (exporting || preparing) return;
  if (playing && replay) {
    time = Math.min(replay.duration, time + elapsed * Number(elements.speed.value));
    if (time >= replay.duration) setPlaying(false);
    updateTransport();
  }
  if (orbit.enabled) orbit.update();
  renderAt(time);
});
document.addEventListener("visibilitychange", () => { lastFrame = undefined; });
window.addEventListener("pagehide", () => {
  clearTimeout(preparationTimer);
  preparationVersion++;
  if (preparedExport) void preparedExport.output.cancel();
  replayAudio.stop(); replayAudio.context?.close(); worker?.terminate();
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  if (reportUrl) URL.revokeObjectURL(reportUrl);
});
resize();