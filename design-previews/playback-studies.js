import { createIcons, RotateCcw, SkipBack, SkipForward, Play, Pause, Check } from "lucide";
import "./playback-studies.css";

const designs = ["Precision Line", "Center Stage", "Timeline Deck", "Timekeeper", "Split Rail"];
const duration = 416;
const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const button = (action, icon, label) => `<button type="button" data-action="${action}" title="${label}" aria-label="${label}"><i data-lucide="${icon}"></i></button>`;
const controls = () => `<div class="buttons">${button("restart", "rotate-ccw", "Restart")}${button("back", "skip-back", "Previous frame")}${button("play", "play", "Play")}${button("next", "skip-forward", "Next frame")}</div>`;
const clock = () => `<div class="clock"><output>00:20</output><span>/ 06:56</span></div>`;
const speed = () => `<select aria-label="Playback speed"><option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option></select>`;
const timeline = () => `<div class="timeline"><input type="range" aria-label="Replay time" min="0" max="416" step="any" value="20"><div class="ruler"><span>00:00</span><span>03:28</span><span>06:56</span></div></div>`;
const layouts = [
  () => `${controls()}${clock()}${timeline()}${speed()}`,
  () => `${timeline()}<div class="bottom">${clock()}${controls()}${speed()}</div>`,
  () => `<div class="top">${controls()}${clock()}${speed()}</div>${timeline()}`,
  () => `${clock()}<div class="middle">${timeline()}${controls()}</div>${speed()}`,
  () => `${controls()}<div class="rail">${clock()}${timeline()}</div>${speed()}`,
];
document.querySelector("#studies").innerHTML = designs.map((name, index) => `<section class="study"><div class="caption"><h2><span>0${index + 1}</span>${name}</h2><button class="choose" type="button" aria-pressed="false" data-choice="${index}">Choose ${index + 1}</button></div><div class="transport design-${index + 1}" data-design="${index}">${layouts[index]()}</div></section>`).join("");
const icons = () => createIcons({ icons: { RotateCcw, SkipBack, SkipForward, Play, Pause, Check } });
const states = Array.from(document.querySelectorAll(".transport"), element => ({ element, time: 20, playing: false, speed: 1 }));
function update(state) {
  state.element.querySelector("output").textContent = formatTime(state.time);
  const input = state.element.querySelector("input");
  input.value = state.time;
  input.style.setProperty("--progress", `${state.time / duration * 100}%`);
}
function setPlaying(state, playing) {
  state.playing = playing;
  const control = state.element.querySelector('[data-action="play"]');
  control.innerHTML = `<i data-lucide="${playing ? "pause" : "play"}"></i>`;
  control.title = control.ariaLabel = playing ? "Pause" : "Play";
  control.setAttribute("aria-pressed", String(playing));
  icons();
}
for (const state of states) {
  update(state);
  state.element.querySelector("input").addEventListener("input", event => { state.time = Number(event.target.value); update(state); });
  state.element.querySelector("select").addEventListener("change", event => { state.speed = Number(event.target.value); });
  state.element.addEventListener("click", event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "play") { if (state.time >= duration) state.time = 0; setPlaying(state, !state.playing); }
    if (action === "restart") { state.time = 0; setPlaying(state, false); }
    if (action === "back" || action === "next") { state.time = Math.max(0, Math.min(duration, state.time + (action === "back" ? -1 : 1) / 30)); setPlaying(state, false); }
    update(state);
  });
}
document.querySelectorAll("[data-choice]").forEach(control => control.addEventListener("click", () => {
  document.querySelectorAll("[data-choice]").forEach(other => { other.setAttribute("aria-pressed", String(other === control)); other.textContent = `${other === control ? "Selected" : "Choose"} ${Number(other.dataset.choice) + 1}`; });
  document.querySelector("#choice").textContent = `${Number(control.dataset.choice) + 1} / ${designs[Number(control.dataset.choice)]}`;
  localStorage.setItem("airlab-playback-design", control.dataset.choice);
}));
let previousTime;
function animate(timestamp) {
  const elapsed = previousTime === undefined ? 0 : Math.min((timestamp - previousTime) / 1000, 0.1);
  previousTime = timestamp;
  for (const state of states) if (state.playing) {
    state.time = Math.min(duration, state.time + elapsed * state.speed);
    if (state.time >= duration) setPlaying(state, false);
    update(state);
  }
  requestAnimationFrame(animate);
}
icons();
requestAnimationFrame(animate);