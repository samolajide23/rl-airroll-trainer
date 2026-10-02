import { createIcons, icons } from "lucide";
import arenaImage from "./stage-arena.png?url";
import "./replay-studies.css";

const studies = [
  ["Control Room", "Three-column console / compact monitor", "camera stage transport export"],
  ["Trackside", "Vertical playback rail / paired inspectors", "transport stage camera export"],
  ["Cinema Dock", "Centered screening desk / horizontal settings", "stage transport camera export"],
  ["Dual POV", "Small paired monitors / player switchboard", "roster stage second transport camera export"],
  ["Edit Bench", "Clip list beside edit tracks / monitor below", "events transport stage camera export"],
  ["Player Rail", "Roster-led workspace / thumbnail monitor", "roster camera stage transport export"],
  ["Broadcast", "Score-led dashboard / central camera console", "score stage camera export transport"],
  ["Clip Library", "Moment browser / compact review column", "events export stage transport camera"],
  ["Director", "Vertical tool strip / monitor and control shelf", "tools camera export stage transport"],
  ["Camera Lab", "Large profile readouts / side observation desk", "camera roster stage transport export"],
  ["Render Desk", "Wide delivery form / small confidence monitor", "export stage transport camera"],
  ["Match Sheet", "Match ledger / roster and inline monitor", "score roster stage transport camera export"],
  ["Timeline First", "Full-width edit tracks / three-part lower shelf", "transport events stage camera export"],
  ["Focus Drawer", "Small centered monitor / collapsible inspector", "stage transport camera export"],
  ["Three Steps", "Three-column workflow / preview inside framing", "steps roster stage camera transport export"],
];
const players = [
  { name: "OpTic AYYJAYY", team: "BLUE", fov: 109, distance: 270, height: 90, angle: -4, swivel: 10, transition: 1.2 },
  { name: "Wahvey", team: "ORANGE", fov: 110, distance: 260, height: 90, angle: -3, swivel: 5.1, transition: 1.1 },
];
const app = document.querySelector("#app");
const select = document.querySelector("#layout");
const query = new URLSearchParams(location.search);
let layout = Math.max(0, Math.min(14, (Number(query.get("layout")) || 1) - 1));
let chosen = -1;
try { chosen = Number(localStorage.getItem("airlab-replay-layout-study") ?? -1); } catch {}
let player = 0;
let time = 20;
let playing = false;
let view = "player";
let drawerOpen = false;
let step = 1;
let speed = 1;
let timer;

const icon = name => `<i data-lucide="${name}"></i>`;
const iconButton = (name, action, title) => `<button class="icon" data-action="${action}" title="${title}" aria-label="${title}">${icon(name)}</button>`;
const clock = value => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
const blockTitle = (number, title, detail = "") => `<header class="block-title"><span>${number}</span><h2>${title}</h2><small>${detail}</small></header>`;

function stageMarkup(second = false) {
  const current = players[second ? 1 - player : player];
  return `<section class="${second ? "second" : "stage"} viewer" aria-label="${second ? "Alternate player preview" : "Replay preview"}">
    <img src="${arenaImage}" alt="Octane in the AIRLAB training arena" class="arena-image ${second ? "alternate" : ""}">
    <div class="match-overlay"><span class="team-blue">OPTIC AYYJAYY</span><b>1 <span>:</span> 1</b><span class="team-orange">WAHVEY</span></div>
    <div class="camera-overlay">${icon("video")}<span>${second ? current.name : view === "player" ? current.name : view === "ball" ? "Ball follow" : "Overview"}</span><small>${second ? "PLAYER POV" : view.toUpperCase()}</small></div>
    <div class="view-footer"><span>SAMPLE MATCH</span><b data-clock>${clock(time)}</b><span>06:56</span></div>
  </section>`;
}

function cameraMarkup() {
  return `<section class="camera control-section">${blockTitle("01", "Follow")}
    <div class="camera-fields"><label>View<select data-field="view"><option value="player" ${view === "player" ? "selected" : ""}>Player POV</option><option value="ball" ${view === "ball" ? "selected" : ""}>Ball follow</option><option value="overview" ${view === "overview" ? "selected" : ""}>Overview</option></select></label>
    <label>Follow player<select data-field="player">${players.map((entry, index) => `<option value="${index}" ${index === player ? "selected" : ""}>${entry.name}</option>`).join("")}</select></label></div>
  </section>`;
}

function exportMarkup() {
  return `<section class="export control-section">${blockTitle("02", "Export", "H.264 / SILENT")}
    <div class="export-fields"><label>Resolution<select><option>1920 x 1080</option><option>1280 x 720</option></select></label><label>Frame rate<select><option>60 fps</option><option>30 fps</option></select></label></div>
    <div class="delivery-line"><span>MP4</span><span>LOCAL RENDER</span>${icon("hard-drive")}</div>
    <a class="primary render-link" href="/replay.html" title="Open working Replay Studio to render">${icon("film")}Render MP4${icon("arrow-up-right")}</a>
  </section>`;
}

function transportMarkup() {
  return `<nav class="transport" aria-label="Playback">
    <div class="play-controls">${iconButton("rotate-ccw", "restart", "Restart")}${iconButton("skip-back", "back", "Back five seconds")}${iconButton(playing ? "pause" : "play", "play", playing ? "Pause" : "Play")}${iconButton("skip-forward", "forward", "Forward five seconds")}</div>
    <div class="timeline"><div class="ruler"><span>00:00</span><span>01:00</span><span>02:00</span><span>03:00</span><span>04:00</span><span>05:00</span><span>06:56</span></div><div class="track"><input data-field="seek" type="range" min="0" max="416" step="0.1" value="${time}" aria-label="Replay time"></div></div>
    <output class="timecode"><b data-clock>${clock(time)}</b><span> / 06:56</span></output>
    <select data-field="speed" aria-label="Playback speed">${[0.25, 0.5, 1, 2].map(value => `<option ${value === speed ? "selected" : ""}>${value}x</option>`).join("")}</select>
  </nav>`;
}

function rosterMarkup() {
  return `<section class="roster">${blockTitle("", "Players", "02")}${players.map((entry, index) => `<button data-player="${index}" aria-pressed="${index === player}" class="player-row"><span class="player-number ${index ? "orange" : "blue"}">0${index + 1}</span><span><strong>${entry.name}</strong><small>${entry.team} / OCTANE</small></span>${icon(index === player ? "check" : "video")}</button>`).join("")}</section>`;
}

function eventsMarkup() {
  return `<section class="events">${blockTitle("", layout === 12 ? "Edit Tracks" : "Moments", "SAMPLE MARKERS")}<div class="event-list">${[[20, "Opening pressure", "flag"], [76, "Blue attack", "crosshair"], [148, "Aerial challenge", "wind"], [245, "Orange possession", "circle-dot"], [360, "Closing play", "flag"]].map(([position, label, symbol], index) => `<button data-moment="${position}" class="event">${icon(symbol)}<span>${label}</span><time>${clock(position)}</time><b>${String(index + 1).padStart(2, "0")}</b></button>`).join("")}</div></section>`;
}

function extraMarkup(kind) {
  if (kind === "score") return `<section class="score"><div><span>COMPETITIVE / 1V1</span><h2>Match Replay</h2><small>OpTic AYYJAYY vs Wahvey</small></div><strong><span class="team-blue">01</span><i>/</i><span class="team-orange">01</span></strong><div><span>DURATION</span><b>06:56</b><small>2 player profiles</small></div></section>`;
  if (kind === "tools") return `<nav class="tools" aria-label="Workspace tools">${iconButton("video", "camera-focus", "Camera settings")}${iconButton("users", "switch-player", "Switch player")}${iconButton("film", "export-focus", "Export settings")}</nav>`;
  if (kind === "steps") return `<nav class="steps" aria-label="Replay workflow">${["Import", "Frame", "Export"].map((name, index) => `<button data-step="${index}" aria-current="${step === index ? "step" : "false"}"><span>0${index + 1}</span><strong>${name}</strong>${icon(index === 0 ? "folder-open" : index === 1 ? "video" : "film")}</button>`).join("")}</nav>`;
  return "";
}

function render() {
  const [name, , order] = studies[layout];
  select.value = layout;
  document.querySelector("#study-name").textContent = `${String(layout + 1).padStart(2, "0")} / ${name}`;
  document.querySelector("#choose").innerHTML = `${icon(chosen === layout ? "check" : "bookmark")}<span>${chosen === layout ? "Chosen" : "Choose layout"}</span>`;
  document.querySelector("#choose").setAttribute("aria-pressed", chosen === layout);
  document.querySelectorAll("[data-layout]").forEach(button => button.setAttribute("aria-pressed", Number(button.dataset.layout) === layout));
  app.innerHTML = `<div class="shell layout-${layout + 1} ${drawerOpen ? "drawer-open" : ""}" data-step="${step}">
    <header class="site-header"><a href="/" class="brand">AIR<span>LAB</span><small>ROCKET LEAGUE TRAINING</small></a><nav aria-label="Main menu"><a href="/">Home</a><a href="/">Arena</a><a href="/">Training</a><a href="/">Settings</a><a href="/">Locker</a><a href="/replay.html" aria-current="page">Replay Studio</a></nav><span class="loadout">RL<span>YOUR LOADOUT<small>Octane / Standard</small></span></span></header>
    <header class="page-heading"><div><span class="eyebrow">REPLAY WORKSPACE</span><h1>Replay Studio<span class="file-chip">${icon("file-video")}0000a984.replay</span></h1></div><div class="heading-actions">${layout === 13 ? `<button data-action="drawer">${icon("sliders-horizontal")}Settings</button>` : ""}<a href="/replay.html">${icon("folder-open")}Import replay</a></div></header>
    <main class="workspace">${order.split(" ").map(kind => kind === "stage" ? stageMarkup() : kind === "second" ? stageMarkup(true) : kind === "camera" ? cameraMarkup() : kind === "export" ? exportMarkup() : kind === "transport" ? transportMarkup() : kind === "roster" ? rosterMarkup() : kind === "events" ? eventsMarkup() : extraMarkup(kind)).join("")}</main>
    <footer class="site-footer"><span>TRAIN WITH INTENT.</span><span>REPLAY / LOCAL WORKSPACE</span><a href="/replay.html">Open live studio ${icon("arrow-up-right")}</a></footer>
  </div>`;
  createIcons({ icons });
  history.replaceState(null, "", `?layout=${layout + 1}`);
}

studies.forEach(([name], index) => select.add(new Option(`${String(index + 1).padStart(2, "0")} / ${name}`, index)));
document.querySelector("#previous").innerHTML = icon("chevron-left");
document.querySelector("#next").innerHTML = icon("chevron-right");
document.querySelector("#compare").innerHTML = `${icon("layout-grid")}<span>Compare 15</span>`;
const comparison = document.querySelector("#comparison");
comparison.innerHTML = studies.map(([name, description], index) => `<button data-layout="${index}" aria-pressed="false"><div class="diagram diagram-${index + 1}" aria-hidden="true"><b></b><i></i><span></span><em></em><s></s></div><strong><span>${String(index + 1).padStart(2, "0")}</span>${name}</strong><small>${description}</small></button>`).join("");
select.addEventListener("change", () => { layout = Number(select.value); drawerOpen = false; render(); });
document.querySelector("#previous").addEventListener("click", () => { layout = (layout + 14) % 15; render(); });
document.querySelector("#next").addEventListener("click", () => { layout = (layout + 1) % 15; render(); });
document.querySelector("#compare").addEventListener("click", event => { comparison.hidden = !comparison.hidden; event.currentTarget.setAttribute("aria-expanded", !comparison.hidden); });
comparison.addEventListener("click", event => { const button = event.target.closest("[data-layout]"); if (button) { layout = Number(button.dataset.layout); drawerOpen = false; render(); } });
document.querySelector("#choose").addEventListener("click", () => { chosen = layout; try { localStorage.setItem("airlab-replay-layout-study", chosen); } catch {} render(); });

function updateTime() {
  app.querySelectorAll("[data-clock]").forEach(output => { output.textContent = clock(time); });
  app.querySelector('[data-field="seek"]').value = time;
}

app.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.player !== undefined) { player = Number(button.dataset.player); view = "player"; }
  if (button.dataset.moment !== undefined) time = Number(button.dataset.moment);
  if (button.dataset.step !== undefined) step = Number(button.dataset.step);
  const action = button.dataset.action;
  if (action === "play") {
    playing = !playing;
    clearInterval(timer);
    if (playing) timer = setInterval(() => { time = Math.min(416, time + 0.1 * speed); updateTime(); if (time === 416) { playing = false; clearInterval(timer); render(); } }, 100);
  }
  if (action === "restart") time = 0;
  if (action === "back") time = Math.max(0, time - 5);
  if (action === "forward") time = Math.min(416, time + 5);
  if (action === "switch-player") player = 1 - player;
  if (action === "drawer") drawerOpen = !drawerOpen;
  if (action === "camera-focus" || action === "export-focus") {
    app.querySelector(`.${action === "camera-focus" ? "camera" : "export"} select`).focus();
    return;
  }
  render();
});
app.addEventListener("input", event => { if (event.target.dataset.field === "seek") { time = Number(event.target.value); updateTime(); } });
app.addEventListener("change", event => {
  const field = event.target.dataset.field;
  if (field === "player") { player = Number(event.target.value); view = "player"; }
  if (field === "view") view = event.target.value;
  if (field === "speed") speed = parseFloat(event.target.value);
  if (field && field !== "seek") render();
});
render();