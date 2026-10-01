import * as THREE from 'three';
import { createIcons, icons } from 'lucide';
import { cloneGlbCar, preloadCars } from '../src/shared/carAssets.js';

const designs = [
  ['Pit Wall', 'A compact briefing beside the setup, with a persistent launch strip.'],
  ['Field Manual', 'A short objective beside the scene; supporting notes below.'],
  ['Coach Desk', 'One coaching cue beside a large setup view.'],
  ['Mission Control', 'A central scene with slim objective and control columns.'],
  ['Training Passport', 'A small progress snapshot beside the next setup.'],
  ['Difficulty Lab', 'Compare all three difficulty contracts before committing.'],
  ['Matchday', 'An arena-led composition with a broadcast-style setup strip.'],
  ['Guided Briefing', 'Three deliberate steps: understand, configure, then start.'],
  ['Compact Garage', 'Dense two-column planning with minimal scrolling.'],
  ['Technique Notebook', 'A brief touch recipe alongside an uninterrupted setup view.'],
  ['Session Builder', 'Choose your practice length beside the scene, then launch.'],
  ['Readiness Check', 'A fixed visual with compact, expandable briefing rows.'],
  ['Progress Track', 'A light practice timeline beside the setup.'],
  ['Focus Room', 'Tabbed detail keeps attention on one decision at a time.'],
  ['Performance Console', 'A restrained instrument layout with progress and scoring adjacent.'],
];
const levels = {
  Easy: { setup: 'Low toss · Straight approach', objective: 'Make a controlled aerial contact with the ball.', success: 'Any car contact before the ball lands.', tolerance: 'Contact only', height: 2.8, cue: 'Line up on the ground before jumping.' },
  Medium: { setup: 'Higher toss · Offset approach', objective: 'Meet the ball with the front of your car and send it toward the target.', success: 'Front contact with the outgoing ball inside a 30° target cone.', tolerance: '30° direction window', height: 4.2, cue: 'Make small corrections; release rotation before contact.' },
  Hard: { setup: 'High toss · Varied approach', objective: 'Adjust your approach, make a front contact and recover wheels-down.', success: 'Front contact inside a 15° target cone, followed by a stable landing.', tolerance: '15° + recovery', height: 5.5, cue: 'Plan your landing before making the touch.' },
};
let selected = Math.min(15, Math.max(1, Number(new URLSearchParams(location.search).get('design')) || 1));
let difficulty = 'Medium';
let session = 'Set';
let tab = 'Objective';
let step = 0;
let phase = 'briefing';
let attempts = 0;
let successes = 0;
let demo = true;
let autoNext = true;
let countdown = true;
let flowTimer;
let resumePhase = 'attempt';
let favourites;
try { favourites = JSON.parse(localStorage.getItem('airlab-drill-designs') || '[]'); } catch { favourites = []; }
if (!Array.isArray(favourites)) favourites = [];
const preview = document.querySelector('#preview');
const icon = name => `<i data-lucide="${name}"></i>`;
const difficultyControls = () => `<div class="segments" role="group" aria-label="Difficulty">${Object.keys(levels).map(level => `<button data-level="${level}" aria-pressed="${difficulty === level}">${level}</button>`).join('')}</div>`;
const sessionControls = () => `<div class="segments" role="group" aria-label="Session type">${['Set', 'Continuous'].map(value => `<button data-session="${value}" aria-pressed="${session === value}">${value === 'Set' ? '10 attempts' : value}</button>`).join('')}</div>`;

const progressRates = [50, 40, 60, 50, 70, 70];

function progressGraph() {
  const rates = progressRates;
  const points = rates.map((rate, index) => `${index * 60},${100 - rate}`).join(' ');
  return `<div class="progress-chart"><div class="chart-scale" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div><div class="chart-plot"><svg viewBox="-5 -5 310 110" preserveAspectRatio="none" role="img" aria-label="Sample success rate over six sets: 50%, 40%, 60%, 50%, 70%, 70%"><path class="chart-grid" d="M0 0H300 M0 50H300 M0 100H300"/><polyline class="chart-trend" points="${points}"/>${rates.map((rate, index) => `<circle class="chart-point" cx="${index * 60}" cy="${100 - rate}" r="3"><title>Set ${index + 1}: ${rate}% success</title></circle>`).join('')}</svg><div class="chart-labels"><span>Set 1</span><span>Last 6 sets</span><span>Latest</span></div></div></div>`;
}

function progressSummary() {
  const average = values => Math.round(values.reduce((total, value) => total + value, 0) / values.length);
  const previous = average(progressRates.slice(0, 3));
  const recent = average(progressRates.slice(-3));
  const results = {
    Easy: [['Successful contact', 7], ['Missed ball', 3]],
    Medium: [['On-target front touch', 7], ['Off-target touch', 2], ['Missed ball', 1]],
    Hard: [['On-target + stable landing', 7], ['Unstable recovery', 2], ['Missed ball', 1]],
  };
  return `<div class="progress-line"><strong>${progressRates.at(-1)}%</strong><span>Latest set · 7/10</span></div><dl class="progress-metrics"><div><dt>Recent 3 sets</dt><dd>${recent}% <small>+${recent - previous} pts vs previous 3</small></dd></div><div><dt>Best set</dt><dd>${Math.max(...progressRates)}% <small>6 sets · 60 attempts</small></dd></div></dl>${progressGraph()}<details class="extra progress-breakdown"><summary>Latest set breakdown</summary><dl>${results[difficulty].map(([label, count]) => `<div><dt>${label}</dt><dd>${count}/10</dd></div>`).join('')}</dl></details><div class="progress-focus"><span>Next set</span><p>${levels[difficulty].cue}</p></div>`;
}

function blocks() {
  const level = levels[difficulty];
  return {
    scene: `<section class="setup" data-area="scene"><div class="setup-top"><span>SETUP / ${difficulty.toUpperCase()}</span><button class="icon" data-demo title="${demo ? 'Pause' : 'Play'} setup demonstration" aria-label="${demo ? 'Pause' : 'Play'} setup demonstration">${icon(demo ? 'pause' : 'play')}</button></div><div class="scene-host" role="img" aria-label="Illustrative aerial approach: Octane car, tossed ball and directional target"></div><div class="setup-caption"><span>${level.setup}</span><span>Illustrative setup</span></div></section>`,
    objective: `<section class="section objective" data-area="objective"><h2>${icon('target')}Goal</h2><p class="lead">${level.objective}</p><div class="contract"><b>Success</b><p>${level.success}</p></div><details class="extra"><summary>Match relevance</summary><p>Turn aerial interceptions into deliberate passes or shots, rather than just reaching the ball.</p></details></section>`,
    config: `<section class="section configuration" data-area="config"><h2>${icon('sliders-horizontal')}Difficulty</h2>${selected === 6 ? `<div class="level-matrix">${Object.entries(levels).map(([name, value]) => `<button data-level="${name}" aria-pressed="${name === difficulty}"><b>${name}</b><small>${value.tolerance}</small></button>`).join('')}</div>` : difficultyControls()}<div class="config-meta"><span>${level.tolerance}</span><span title="Car, ball, camera and settings use the shared Free Play profile">${icon('link')}Shared physics</span></div></section>`,
    coach: `<section class="section coaching" data-area="coach"><h2>${icon('lightbulb')}Focus</h2><p class="cue">${level.cue}</p><details class="extra"><summary>Touch checklist</summary><ol><li>Use only the boost needed to intercept.</li><li>Watch the ball's exit direction.</li></ol><div class="mistake"><b>Avoid</b><p>Rotating through contact and hitting with the roof or side.</p></div></details></section>`,
    progress: `<section class="section progress" data-area="progress"><h2>${icon('chart-no-axes-combined')}Progress <small>${difficulty} · Sample</small></h2>${progressSummary()}</section>`,
    session: `<section class="section session" data-area="session"><h2>${icon('repeat-2')}Practice</h2>${sessionControls()}<details class="extra"><summary>Session options</summary><label class="toggle"><input id="auto-next" type="checkbox" ${autoNext ? 'checked' : ''}>Auto-advance</label><label class="toggle"><input id="countdown" type="checkbox" ${countdown ? 'checked' : ''}>Attempt countdown</label><p>${session === 'Set' ? '10 scored attempts, then a summary.' : 'Practice until you finish.'} Pause and retry anytime.</p></details></section>`,
  };
}

function render() {
  clearTimeout(flowTimer);
  const [name, direction] = designs[selected - 1];
  document.title = `${selected}. ${name} | AIRLAB Drill Studies`;
  document.querySelector('#design-select').innerHTML = designs.map(([title], index) => `<option value="${index + 1}" ${index + 1 === selected ? 'selected' : ''}>${String(index + 1).padStart(2, '0')} · ${title}</option>`).join('');
  document.querySelector('#direction').textContent = direction;
  const favourite = document.querySelector('#favourite');
  favourite.setAttribute('aria-pressed', favourites.includes(selected));
  favourite.querySelector('span').textContent = favourites.includes(selected) ? 'Shortlisted' : 'Shortlist';
  preview.className = `design design-${selected}`;
  const content = blocks();
  const orders = { 2: ['objective','scene','coach','config','progress','session'], 3: ['coach','scene','objective','config','progress','session'], 5: ['progress','objective','scene','config','coach','session'], 10: ['objective','coach','scene','config','session','progress'], 11: ['session','scene','config','objective','coach','progress'], 13: ['progress','objective','config','scene','coach','session'] };
  const order = orders[selected] || ['scene','objective','config','coach','progress','session'];
  let workspace = order.map(key => content[key]).join('');
  if (selected === 8) {
    const groups = [['objective','coach','scene'],['config','session','scene'],['progress','objective','scene']];
    workspace = `<nav class="steps" aria-label="Briefing steps">${['Understand','Configure','Ready'].map((label,index)=>`<button data-step="${index}" aria-current="${step === index ? 'step' : 'false'}"><b>0${index + 1}</b>${label}</button>`).join('')}</nav>${groups[step].map(key=>content[key]).join('')}`;
  }
  if (selected === 12) workspace = content.scene + content.config + ['objective','coach','progress','session'].map((key,index)=>`<details ${index === 0 ? 'open' : ''}><summary>${['Goal & success','Focus','Progress','Practice'][index]}</summary>${content[key]}</details>`).join('');
  if (selected === 14) workspace = content.scene + content.config + `<div class="focus-details"><nav class="tabs" aria-label="Drill details">${['Objective','Coaching','Progress','Session'].map(label=>`<button data-tab="${label}" aria-pressed="${tab === label}">${label}</button>`).join('')}</nav>${content[{Objective:'objective',Coaching:'coach',Progress:'progress',Session:'session'}[tab]]}</div>`;
  preview.innerHTML = `<header class="app-header"><a href="/" class="brand">AIR<span>LAB</span></a><nav aria-label="Trainer navigation"><a href="/">Training</a><span aria-current="page">Drill</span></nav><button data-settings title="Shared settings">${icon('settings-2')}<span>Shared settings</span></button></header><div class="page-heading"><div><span class="eyebrow">BALL CONTROL / AERIAL FOUNDATIONS</span><h1>Aerial Ball Contact</h1><p>Meet the ball. Choose the touch.</p></div><div class="study-number"><span>${String(selected).padStart(2,'0')}</span><small>${name}</small></div></div>${phase === 'briefing' ? `<div class="workspace">${workspace}</div><footer class="launch"><div><strong>${difficulty} · ${session === 'Set' ? '10 attempts' : 'Continuous practice'}</strong><span>Octane / Your shared profile</span></div>${selected === 8 && step < 2 ? `<button class="primary" data-step="${step + 1}">Continue ${icon('arrow-right')}</button>` : `<button class="primary" data-start>${icon('play')}Start Training</button>`}</footer>` : trainingMarkup()}<footer class="page-footer"><span>TRAIN WITH INTENT.</span><span>Concept ${String(selected).padStart(2,'0')} / ${name}</span></footer>`;
  createIcons({ icons });
  mountScene();
  renderComparison();
  if (phase === 'countdown') flowTimer = setTimeout(() => { phase = 'attempt'; render(); }, 1500);
  if (phase === 'feedback' && autoNext) flowTimer = setTimeout(() => { nextAttempt(); render(); }, 3000);
}

function nextAttempt() {
  phase = session === 'Set' && attempts >= 10 ? 'summary' : countdown ? 'countdown' : 'attempt';
}

function trainingMarkup() {
  if (phase === 'summary') return `<section class="summary"><span class="eyebrow">SAMPLE SESSION COMPLETE</span><h2>Every touch tells you something.</h2><div class="stats"><div><strong>${attempts}</strong><span>Attempts</span></div><div><strong>${successes}</strong><span>Successes</span></div><div><strong>${attempts ? Math.round(successes / attempts * 100) : 0}%</strong><span>Success rate</span></div></div><p>Example feedback: aim to release rotation earlier on your next set.</p><div class="actions"><button class="primary" data-start>${icon('repeat-2')}Repeat session</button><button data-return>${icon('sliders-horizontal')}Change difficulty</button></div></section>`;
  return `<section class="sample-session"><header><span class="eyebrow">SAMPLE TRAINING FLOW / NOT A PLAYABLE DRILL</span><button data-pause>${icon(phase === 'paused' ? 'play' : 'pause')}${phase === 'paused' ? 'Resume' : 'Pause'}</button></header><h2>${phase === 'paused' ? 'Session paused' : phase === 'feedback' ? 'Touch reviewed' : phase === 'countdown' ? 'Get ready' : `Attempt ${attempts + 1}${session === 'Set' ? ' / 10' : ''}`}</h2><p>${levels[difficulty].objective}</p>${blocks().scene}<div class="feedback" role="status">${phase === 'feedback' ? window.lastSampleSuccess ? 'Front contact · Ball inside target cone. Keep that controlled approach.' : 'Side contact · Release rotation earlier and square the nose to the ball.' : phase === 'paused' ? 'Your attempt is held. Resume when ready.' : phase === 'countdown' ? 'Preparing the next setup...' : 'Record an example result to inspect the feedback flow.'}</div><div class="actions">${phase === 'attempt' ? `<button data-result="success">${icon('check')}Sample success</button><button data-result="miss">${icon('x')}Sample miss</button>` : phase === 'feedback' ? `<button class="primary" data-next>${icon('arrow-right')}Next attempt</button><button data-retry>${icon('rotate-ccw')}Retry setup</button>` : ''}<button data-end>${icon('square')}Finish session</button><button data-return>Back to briefing</button></div></section>`;
}

function renderComparison() {
  document.querySelector('#comparison').innerHTML = designs.map(([name,description],index)=>`<button data-design="${index + 1}" aria-pressed="${selected === index + 1}"><span class="mini-layout mini-${index + 1}"><b></b><b></b><b></b></span><strong>${String(index + 1).padStart(2,'0')} / ${name}${favourites.includes(index + 1) ? ' · Shortlisted' : ''}</strong><span>${description}</span></button>`).join('');
}

function choose(value) {
  selected = (value + 14) % 15 + 1;
  step = 0;
  phase = 'briefing';
  history.replaceState(null, '', `?design=${selected}`);
  render();
}

document.querySelector('#design-select').addEventListener('change', event => choose(Number(event.target.value)));
document.querySelector('#previous').addEventListener('click', () => choose(selected - 1));
document.querySelector('#next').addEventListener('click', () => choose(selected + 1));
document.querySelector('#compare').addEventListener('click', () => { const panel = document.querySelector('#comparison'); panel.hidden = !panel.hidden; });
document.querySelector('#favourite').addEventListener('click', () => { favourites = favourites.includes(selected) ? favourites.filter(value => value !== selected) : [...favourites, selected]; try { localStorage.setItem('airlab-drill-designs', JSON.stringify(favourites)); } catch {} render(); });
document.addEventListener('change', event => {
  if (event.target.id === 'auto-next') autoNext = event.target.checked;
  if (event.target.id === 'countdown') countdown = event.target.checked;
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.design) { choose(Number(button.dataset.design)); return; }
  if (button.dataset.level) difficulty = button.dataset.level;
  else if (button.dataset.session) session = button.dataset.session;
  else if (button.dataset.tab) tab = button.dataset.tab;
  else if (button.dataset.step !== undefined) step = Number(button.dataset.step);
  else if (button.hasAttribute('data-settings')) { document.querySelector('#settings').showModal(); return; }
  else if (button.hasAttribute('data-demo')) demo = !demo;
  else if (button.hasAttribute('data-start')) { phase = countdown ? 'countdown' : 'attempt'; attempts = 0; successes = 0; }
  else if (button.dataset.result) { window.lastSampleSuccess = button.dataset.result === 'success'; attempts++; successes += Number(window.lastSampleSuccess); phase = 'feedback'; }
  else if (button.hasAttribute('data-next')) nextAttempt();
  else if (button.hasAttribute('data-retry')) phase = countdown ? 'countdown' : 'attempt';
  else if (button.hasAttribute('data-pause')) { if (phase === 'paused') phase = resumePhase; else { resumePhase = phase; phase = 'paused'; } }
  else if (button.hasAttribute('data-end')) phase = 'summary';
  else if (button.hasAttribute('data-return')) phase = 'briefing';
  else return;
  render();
});

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x596479, 3));
const light = new THREE.DirectionalLight(0xffffff, 5);
light.position.set(3, 8, 4);
scene.add(light);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 24), new THREE.MeshStandardMaterial({ color: 0x24646a, roughness: .8 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.8;
scene.add(floor);
const grid = new THREE.GridHelper(30, 20, 0xb4d3c1, 0x44858a);
grid.position.y = -.79;
scene.add(grid);
const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(.65, 2), new THREE.MeshStandardMaterial({ color: 0xf4f6e8, roughness: .5, flatShading: true }));
ball.position.set(0,4.2,-2);
scene.add(ball);
const seams = new THREE.LineSegments(new THREE.EdgesGeometry(ball.geometry), new THREE.LineBasicMaterial({ color: 0x43586a }));
ball.add(seams);
const target = new THREE.Mesh(new THREE.TorusGeometry(1.8,.06,8,64), new THREE.MeshStandardMaterial({color:0xf7d954,emissive:0xf7d954,emissiveIntensity:.4}));
target.position.set(0,4.2,-7);
scene.add(target);
const arrow = new THREE.ArrowHelper(new THREE.Vector3(0,0,-1), new THREE.Vector3(0,4.2,-3), 3, 0xf7d954,.5,.3);
scene.add(arrow);
const camera = new THREE.PerspectiveCamera(42,1,.1,100);
let car;
let rotation = .5;
let dragging = false;
let lastPointer = 0;
renderer.domElement.addEventListener('pointerdown', event => { dragging = true; lastPointer = event.clientX; renderer.domElement.setPointerCapture(event.pointerId); });
renderer.domElement.addEventListener('pointermove', event => { if (dragging) { rotation += (event.clientX - lastPointer) * .008; lastPointer = event.clientX; } });
renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointercancel', () => { dragging = false; });
async function mountScene() {
  const host = document.querySelector('.scene-host');
  if (!host) return;
  host.append(renderer.domElement);
  if (!car) {
    await preloadCars(['octane']);
    if (!car) { car = cloneGlbCar('octane'); if (car) { car.rotation.y = Math.PI; car.position.set(0,.15,3); scene.add(car); } }
  }
}
function renderFrame(time) {
  const host = renderer.domElement.parentElement;
  if (!host?.isConnected) return;
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width,height,false);
  camera.aspect = width / height;
  camera.position.set(Math.sin(rotation)*15,9,Math.cos(rotation)*15);
  camera.lookAt(0,2,-1);
  camera.updateProjectionMatrix();
  const heightValue = levels[difficulty].height;
  ball.position.x = difficulty === 'Easy' ? 0 : difficulty === 'Medium' ? 1.6 : -2.4;
  ball.position.y = heightValue + (demo && phase !== 'paused' ? Math.sin(time * .0015) * .25 : 0);
  if (demo && phase !== 'paused') ball.rotation.y = time * .00025;
  target.position.y = heightValue;
  target.position.x = ball.position.x;
  arrow.position.y = heightValue;
  arrow.position.x = ball.position.x;
  renderer.render(scene,camera);
}
renderer.setAnimationLoop(renderFrame);
window.__drillDesignPreview = { renderer, scene, camera, designs, choose, renderFrame, get state() { return {selected,difficulty,session,phase,attempts,successes,carLoaded:!!car}; } };
render();