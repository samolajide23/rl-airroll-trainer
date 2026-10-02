import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { preloadCars, cloneGlbCar } from '../shared/carAssets.js';
import { createCar } from '../shared/car.js';
import './preview.css';
import './themes.css';
import { homeLayout, arrangeCatalogue } from './layouts.js';
import './layouts.css';
import { PHASES, STATIC_BALL_MASTERY, STATIC_BALL_PLAN, SOFT_TOUCH_MASTERY } from '../modes/catalog.js';
import { ROLL_TOUCH_MASTERY, rollTouchSummary } from '../shared/rollTouchTraining.js';
import { RECOVERY_MASTERY, recoverySummary } from '../shared/recoveryTraining.js';
import { MOVEMENT_TRAINING } from '../shared/movementTraining.js';
import './selected.css';
import { styleOptions } from './style-options.js';
import './style-options.css';
import './live.css';
import { GHOST_ALIGN_DIFFICULTIES } from '../modes/ghostDifficulties.js';
import { createIcons, icons } from 'lucide';
import { staticBallSummary } from '../shared/staticBallTraining.js';
import { softBallSummary } from '../shared/softBallTraining.js';
import { objectiveBriefings } from '../shared/drillBriefings.js';
import { formatPadButton, onBindsChange } from '../shared/settings.js';

export const themes = [
  ['Garage', 'Floodlit garage / cyan & orange', 'garage', '#28d9ff', '#ff9b36', '#081013'],
  ['Career Map', 'Connected checkpoints / pitch green', 'map', '#b9f252', '#ffffff', '#14211a'],
  ['Trading Cards', 'Collectible mechanics / scarlet & ivory', 'cards', '#f24553', '#ffcc64', '#f2f1ed'],
  ['Esports', 'Competition console / lime & charcoal', 'esports', '#d0ff35', '#ffffff', '#171917'],
  ['Concourse', 'Stadium signage / cobalt & yellow', 'concourse', '#ffd735', '#73b9ff', '#102dad'],
  ['Orbit', 'Floating arena / ice & vermilion', 'orbit', '#79e4e0', '#ff6758', '#14191d'],
  ['Race Weekend', 'Event selection / red & white', 'race', '#ed3226', '#212121', '#f1f0ec'],
  ['Skill Tree', 'Branching progression / forest & gold', 'tree', '#f9d66e', '#98e3a8', '#18251f'],
  ['Arcade', 'Coin-op energy / teal & hot pink', 'arcade', '#fff06b', '#ff65a6', '#064c53'],
  ['Playbook', 'Tactical sports / paper & grass', 'playbook', '#14774a', '#e96d39', '#f3f5ed'],
  ['Workshop', 'Technical tooling / steel & safety orange', 'workshop', '#ffb52b', '#a1c5cd', '#282b2a'],
  ['Championship', 'Division climb / ivory & crimson', 'championship', '#d53748', '#b89138', '#f4f2ec'],
  ['Motion Gallery', 'Visual mechanic library / clean black', 'gallery', '#48e1ac', '#fd826b', '#111312'],
  ['Mission Select', 'Field operations / rust & ice', 'mission', '#ff784c', '#a7e5ef', '#202422'],
  ['Freestyle', 'Festival posters / lemon & coral', 'festival', '#ff554f', '#188872', '#f8ef6e'],
];

const categories = [
  ['Car Control', 'Steering, boost & dodges', 'Beginner', '02'],
  ['Recoveries', 'Half flips & clean landings', 'Intermediate', '04'],
  ['Ball Control', 'First touches & possession', 'Beginner', '04'],
  ['Aerials', 'Orientation & precision', 'Intermediate', '04'],
  ['Pinches', 'Compression & timing', 'Advanced', '03'],
  ['Flip Resets', 'Earn it. Control it. Use it.', 'Expert', '02'],
];
const trainer = globalThis.__trainerMenu;
const live = Boolean(trainer);
if (live) document.body.dataset.selected = 'true';
const concept = Number(document.body.dataset.concept || 1);
const [name, description, layout, accent, secondary, background] = themes[concept - 1];
document.title = `${String(concept).padStart(2, '0')} ${name} | Design Preview`;
document.body.dataset.layout = layout;
document.documentElement.style.setProperty('--accent', accent);
document.documentElement.style.setProperty('--secondary', secondary);
document.documentElement.style.setProperty('--bg', background);
document.body.classList.toggle('light', ['cards', 'race', 'playbook', 'championship', 'festival'].includes(layout));
const menuRoot = live ? document.createElement('div') : document.body;
if (live) { menuRoot.id = 'live-menu'; document.body.append(menuRoot); }
menuRoot.innerHTML = `
  <div class="preview-bar"><a href="./index.html">All 15 designs</a><span>${String(concept).padStart(2, '0')} / ${name}</span><div><a href="./${String(concept === 1 ? 15 : concept - 1).padStart(2, '0')}.html" aria-label="Previous design">&larr;</a><a href="./${String(concept === 15 ? 1 : concept + 1).padStart(2, '0')}.html" aria-label="Next design">&rarr;</a></div></div>
  <div id="scene"><span class="asset-status">Loading Octane...</span></div>
  <div class="shell">
    <header class="site-header"><button class="brand" data-view="home">AIR<span>LAB</span><small>ROCKET LEAGUE TRAINING</small></button><nav aria-label="Preview screens"><button data-view="home">Home</button><button data-view="training">Training</button><button data-view="drill">Drill</button><button data-view="settings">Settings</button></nav><div class="profile"><span class="avatar">RL</span><span>PLAYER ONE<small>Octane / Standard</small></span></div></header>
    <main id="content"></main>
    <footer class="site-footer"><span>TRAIN WITH INTENT.</span><span>${description}</span><span>DESIGN STUDY ${String(concept).padStart(2, '0')}</span></footer>
  </div>`;

const content = document.querySelector('#content');
const selectedDesign = live || document.body.dataset.selected === 'true';
const optionNumber = live ? 3 : Number(new URLSearchParams(location.search).get('style'));
const styleOption = selectedDesign ? styleOptions[optionNumber - 1] : null;
if (styleOption) {
  document.body.dataset.style = String(optionNumber);
  Object.entries(styleOption.tokens).forEach(([token, value]) => {
    document.documentElement.style.setProperty(`--${token}`, value);
    document.body.style.setProperty(`--${token}`, value);
  });
}
let selectedBranch = PHASES.findIndex(phase => phase.id === 'air-roll');
let selectedMechanic = PHASES[selectedBranch].modes.find(mode => mode.id === 'dar-sequences');
if (live) {
  try {
    const selectedId = localStorage.getItem('rl-training-selected-drill');
    const catalogueModes = PHASES.flatMap(phase => phase.modes);
    selectedMechanic = catalogueModes.find(mode => mode.id === selectedId) || catalogueModes.find(mode => mode.id === trainer.lastDrill()?.id) || selectedMechanic;
  } catch { }
  selectedBranch = PHASES.findIndex(phase => phase.modes.some(mode => mode.id === selectedMechanic.id));
}
if (live) {
  menuRoot.querySelector('.preview-bar').remove();
  menuRoot.querySelector('nav').setAttribute('aria-label', 'Main menu');
  const arenaTab = document.createElement('button');
  arenaTab.type = 'button';
  arenaTab.dataset.view = 'arena';
  arenaTab.textContent = 'Arena';
  menuRoot.querySelector('[data-view="training"]').before(arenaTab);
  const lockerTab = document.createElement('button');
  lockerTab.type = 'button';
  lockerTab.dataset.view = 'locker';
  lockerTab.textContent = 'Locker';
  menuRoot.querySelector('.site-header nav').append(lockerTab);
  const previousPageHint = document.createElement('span');
  previousPageHint.className = 'header-page-control';
  previousPageHint.textContent = formatPadButton(4);
  previousPageHint.setAttribute('aria-hidden', 'true');
  const nextPageHint = previousPageHint.cloneNode(true);
  nextPageHint.textContent = formatPadButton(5);
  onBindsChange(() => {
    previousPageHint.textContent = formatPadButton(4);
    nextPageHint.textContent = formatPadButton(5);
  });
  menuRoot.querySelector('.site-header nav').prepend(previousPageHint);
  menuRoot.querySelector('.site-header nav').append(nextPageHint);
  menuRoot.querySelector('.profile>span:last-child').firstChild.textContent = 'YOUR LOADOUT';
  const status = document.createElement('p');
  status.className = 'header-controller-status';
  status.setAttribute('role', 'status');
  menuRoot.querySelector('.profile').after(status);
  updateControllerStatus();
}
if (selectedDesign) {
  document.title = live ? 'AIRLAB | Rocket League Training' : 'Selected Menu Design | AIRLAB';
  if (!live) document.querySelector('.preview-bar>span').textContent = 'SELECTED DESIGN / MIXED STYLES';
  if (!live) document.querySelector('.preview-bar>div').hidden = true;
  document.querySelector('.site-footer span:last-child').textContent = 'SELECTED COMBINATION';
  if (styleOption && !live) {
    document.title = `${styleOption.name} | AIRLAB`;
    document.querySelector('.preview-bar>a').href = './style-options.html';
    document.querySelector('.preview-bar>a').textContent = 'All 10 style options';
    document.querySelector('.preview-bar>span').textContent = `${String(optionNumber).padStart(2, '0')} / ${styleOption.name}`;
    const navigation = document.querySelector('.preview-bar>div');
    navigation.hidden = false;
    navigation.innerHTML = `<a href="./selected.html?style=${optionNumber === 1 ? 10 : optionNumber - 1}" aria-label="Previous style">&larr;</a><a href="./selected.html?style=${optionNumber === 10 ? 1 : optionNumber + 1}" aria-label="Next style">&rarr;</a>`;
    document.querySelector('.site-footer span:nth-child(2)').textContent = styleOption.name;
  }
}
let activeView = 'home';
let lockerCarId = live ? trainer.car().id : 'octane';
let selectedCategory = 0;
let settingsObserver;
let settingsGroup = 0;
const settingsGroups = {
  controls: ['Sensitivity', 'Deadzones', 'Camera Behaviour', 'Controller'],
  bindings: ['Key Bindings', 'Controller Axes'],
  camera: ['Camera Settings'],
  loadout: ['Car Body'],
};

function showSettingsSection(tab) {
  settingsObserver?.disconnect();
  trainer.parkSettings();
  const fields = content.querySelector('.settings-fields');
  trainer.settings(fields, tab);
  settingsGroup = 0;
  const groupNav = content.querySelector('.settings-group-nav');
  groupNav.hidden = settingsGroups[tab].length === 1;
  groupNav.innerHTML = settingsGroups[tab].map((label, index) => `<button type="button" data-settings-group="${index}">${label}<span>&rarr;</span></button>`).join('');
  content.querySelector('.settings-section-heading').textContent = tab[0].toUpperCase() + tab.slice(1);
  const applyGroup = () => {
    content.querySelector('.settings-group-heading').textContent = settingsGroups[tab][settingsGroup];
    groupNav.querySelectorAll('button').forEach((button, index) => button.setAttribute('aria-pressed', String(index === settingsGroup)));
    fields.querySelectorAll('#control-options > .bind-row,#camera-list > .bind-row').forEach(row => {
      const id = row.querySelector('input')?.id || '';
      const label = row.querySelector('.bind-label')?.textContent.toLowerCase() || '';
      let group;
      if (tab === 'controls') group = label.includes('controller layout') ? 3 : label.includes('sensitivity') ? 0 : label.includes('deadzone') ? 1 : 2;
      else group = 0;
      row.hidden = group !== settingsGroup;
    });
    const entry = fields.querySelector('.bindings-entry');
    if (entry) entry.hidden = true;
    const axes = fields.querySelector('.binding-axis-options');
    if (axes) { axes.hidden = tab !== 'bindings' || settingsGroup !== 1; axes.open = true; }
    fields.querySelectorAll('#bindings-editor > :not(.binding-axis-options)').forEach(node => { node.hidden = settingsGroup === 1; });
    const source = fields.querySelector('#camera-preset-source');
    if (source) source.hidden = settingsGroup !== 0;
  };
  groupNav.onclick = event => {
    const button = event.target.closest('[data-settings-group]');
    if (!button) return;
    settingsGroup = Number(button.dataset.settingsGroup);
    applyGroup();
  };
  settingsObserver = new MutationObserver(applyGroup);
  fields.querySelectorAll('#control-options,#camera-list,#bind-list,#pad-bind-list').forEach(list => settingsObserver.observe(list, { childList: true }));
  applyGroup();
  content.querySelectorAll('[data-settings-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.settingsTab === tab);
    button.setAttribute('aria-pressed', String(button.dataset.settingsTab === tab));
  });
}
const card = (entry, index) => `<button class="category" data-category="${index}"><span class="category-no">${String(index + 1).padStart(2, '0')}</span><span class="category-art" aria-hidden="true"><i></i><b>${['CTRL', '180', 'TOUCH', 'AIR', 'PINCH', 'RESET'][index]}</b></span><span class="category-copy"><small>${entry[2]}</small><strong>${entry[0]}</strong><span>${entry[1]}</span></span><span class="category-end">${entry[3]} mechanics <span aria-hidden="true">&rarr;</span></span></button>`;

function drillGroups(phase) {
  return [true, false].map(available => {
    const modes = phase.modes.map((mode, index) => ({ mode, index })).filter(entry => entry.mode.available === available);
    if (!modes.length) return '';
    const sections = [...new Set(modes.map(({ mode }) => mode.section ?? 'Core mechanics'))];
    const groups = sections.map(section => {
      const entries = modes.filter(({ mode }) => (mode.section ?? 'Core mechanics') === section);
      const cards = `<div class="drill-card-grid">${entries.map(({ mode, index }) => `<button class="category drill-card" data-mechanic="${index}" data-ready="${available}" data-tags="${mode.tags.join('|')}" ${available ? '' : 'disabled'}><span class="category-no">${String(index + 1).padStart(2, '0')}</span><span class="category-art" aria-hidden="true"><i></i><b>${mode.title.split(' ').map(word => word[0]).join('')}</b></span><span class="category-copy"><strong>${mode.title}</strong><small>${mode.level}</small><span>${mode.description}</span></span><span class="category-end">${available ? 'Playable now' : 'Curriculum preview'} ${available ? '<span>&rarr;</span>' : ''}</span></button>`).join('')}</div>`;
      return section === 'Core mechanics' ? cards : `<details class="drill-specialist"><summary>${section} <span>${entries.length}</span></summary>${cards}</details>`;
    }).join('');
    return `<section class="drill-availability-group" data-ready="${available}"><h3>${available ? 'Playable drills' : 'Planned mechanics'} <span>${modes.length}</span></h3>${groups}</section>`;
  }).join('');
}

let drillTab = 'Objective';
let drillDifficulty = GHOST_ALIGN_DIFFICULTIES[1];
let staticMasteryStep = 0;
let softMasteryStep = 0;
let staticVaried = true;
let softVaried = true;
let rollMasteryStep = 0;
let rollVaried = true;
let recoveryMasteryStep = 0;
let recoveryVaried = true;
const movementChoices = Object.fromEntries(Object.keys(MOVEMENT_TRAINING).map(id => {
  let masteryStep = 0;
  let varied = true;
  try {
    masteryStep = Math.max(0, Math.min(4, Number(localStorage.getItem(`rl-${id}-step`)) || 0));
    varied = localStorage.getItem(`rl-${id}-varied`) !== 'false';
  } catch { }
  return [id, { masteryStep, varied }];
}));
try {
  staticMasteryStep = Math.max(0, Math.min(4, Number(localStorage.getItem('rl-static-step')) || 0));
  staticVaried = localStorage.getItem('rl-static-varied') !== 'false';
  softMasteryStep = Math.max(0, Math.min(4, Number(localStorage.getItem('rl-soft-step')) || 0));
  softVaried = localStorage.getItem('rl-soft-varied') !== 'false';
  rollMasteryStep = Math.max(0, Math.min(4, Number(localStorage.getItem('rl-roll-step')) || 0));
  rollVaried = localStorage.getItem('rl-roll-varied') !== 'false';
  recoveryMasteryStep = Math.max(0, Math.min(4, Number(localStorage.getItem('rl-recovery-step')) || 0));
  recoveryVaried = localStorage.getItem('rl-recovery-varied') !== 'false';
} catch { }

function renderObjective(step, index, success = step.success) {
  const briefing = objectiveBriefings[selectedMechanic.id]?.[index];
  const goal = briefing?.[0] || step.goal;
  const requirements = briefing?.[1] || step.requirements;
  return `<h2>${step.title}</h2><p>${goal}</p><h2>To pass</h2>${requirements ? `<ul>${requirements.map(requirement => `<li>${requirement}</li>`).join('')}</ul>` : `<p>${success}</p>`}<details><summary>Full rules</summary><p>${success}</p></details>`;
}

function renderFocusRoom() {
  const car = trainer.car();
  const panels = {
    Objective: `<h2>Goal</h2><p>${selectedMechanic.description}</p><ol>${selectedMechanic.steps.map(step => `<li>${step}</li>`).join('')}</ol>`,
    Coaching: `<h2>Focus</h2><p>${selectedMechanic.steps[0] || selectedMechanic.description}</p><details><summary>Movement checklist</summary><ol>${selectedMechanic.steps.slice(1).map(step => `<li>${step}</li>`).join('')}</ol></details>`,
    Progress: `<h2>Progress</h2><div class="focus-empty"><i data-lucide="chart-no-axes-combined"></i><strong>No scored history yet</strong><p>Success trends and result breakdowns are not recorded for this drill yet.</p></div>`,
    Session: `<h2>Practice</h2><dl><div><dt>Car</dt><dd>${car.name}</dd></div><div><dt>Arena</dt><dd>Standard soccar</dd></div><div><dt>Setup</dt><dd>${selectedMechanic.needsDifficulty ? drillDifficulty.label : 'Standard'}</dd></div></dl><p>${selectedMechanic.available ? 'Practice at your own pace. Pause or return to the briefing anytime.' : 'This mechanic is planned. Free Play is available for open practice.'}</p><button class="secondary" data-view="settings"><i data-lucide="settings-2"></i>Shared settings</button>`,
  };
  content.innerHTML = `<section class="focus-room"><header class="focus-heading"><div><button class="back-link" data-view="training">&larr; Training library</button><p class="eyebrow">${PHASES[selectedBranch].title.toUpperCase()} / ${selectedMechanic.level.toUpperCase()}</p><h1>${selectedMechanic.title}</h1></div><button class="secondary" data-view="settings" title="Shared settings"><i data-lucide="settings-2"></i><span>Shared settings</span></button></header><div class="focus-workspace"><section class="focus-visual"><div class="focus-visual-label"><span>${car.name}</span><span>Car preview</span></div><div class="scene-slot" aria-label="${car.name} car preview"></div><p>${selectedMechanic.available ? 'Playable drill' : 'Curriculum preview'} / Shared car physics</p></section><aside class="focus-side"><section class="focus-difficulty"><h2><i data-lucide="sliders-horizontal"></i>Difficulty</h2>${selectedMechanic.needsDifficulty ? `<div class="focus-levels" role="group" aria-label="Difficulty">${GHOST_ALIGN_DIFFICULTIES.map(level => `<button data-drill-level="${level.id}" aria-pressed="${level.id === drillDifficulty.id}">${level.label}</button>`).join('')}</div><p>${drillDifficulty.description}</p>` : '<strong>Standard setup</strong><p>This drill currently has one fixed setup.</p>'}</section><nav class="focus-tabs" aria-label="Drill details">${Object.keys(panels).map(label => `<button data-drill-tab="${label}" aria-pressed="${label === drillTab}" aria-controls="focus-panel">${label}</button>`).join('')}</nav><section id="focus-panel" class="focus-panel" aria-label="${drillTab}">${panels[drillTab]}</section></aside></div><footer class="focus-launch"><div><strong>${selectedMechanic.needsDifficulty ? drillDifficulty.label : 'Standard'} / ${selectedMechanic.available ? 'Open practice' : 'Planned mechanic'}</strong><span>${car.name} / Shared settings</span></div><button class="primary" data-action="practice"><i data-lucide="play"></i>${selectedMechanic.available ? 'Start Training' : 'Open Free Play'}</button></footer></section>`;
  if (MOVEMENT_TRAINING[selectedMechanic.id]) {
    const id = selectedMechanic.id;
    const entry = MOVEMENT_TRAINING[id];
    const choice = movementChoices[id];
    const step = entry.steps[choice.masteryStep];
    const summary = entry.history.summary(choice.masteryStep, choice.varied);
    content.querySelector('.focus-visual-label span:last-child').textContent = step.title;
    content.querySelector('.scene-slot').setAttribute('aria-label', `${step.title}: animated car-only setup preview`);
    content.querySelector('.focus-visual>p').textContent = 'Illustrative setup / Car only';
    content.querySelector('.focus-difficulty').innerHTML = `<h2><i data-lucide="route"></i>Mastery steps</h2><div class="focus-mastery" role="group" aria-label="Mastery steps">${entry.steps.map((item, index) => `<button data-movement-step="${index}" aria-pressed="${index === choice.masteryStep}"><span>${index + 1}. ${item.title}</span><small>Playable</small></button>`).join('')}</div>`;
    const panel = content.querySelector('#focus-panel');
    if (drillTab === 'Objective') panel.innerHTML = renderObjective(step, choice.masteryStep);
    if (drillTab === 'Coaching') panel.innerHTML = `<h2>Focus</h2><p>${step.cue}</p>`;
    if (drillTab === 'Progress') panel.innerHTML = `<h2>${choice.varied ? 'Varied' : 'Fixed'} setup progress</h2><p>${summary.latest === null ? 'No recorded sets yet.' : `Latest set: ${summary.latest}/${summary.sets.at(-1).attempts.length} successes.`}</p><strong>${summary.mastered ? 'Mastery milestone reached' : 'Milestone: 8/10 in two consecutive sets'}</strong><p>${summary.commonMiss ? `Most common miss: ${summary.commonMiss}.` : 'All five stages remain accessible.'}</p><details><summary>Recent sets</summary>${summary.sets.slice(-6).map(set => `<p>${set.attempts.filter(attempt => attempt.success).length}/${set.attempts.length} successes${set.attempts.length < 10 ? ' · Partial' : ''}${set.attempts.some(attempt => attempt.skipped) ? ' · Includes skip' : ''}</p>`).join('') || '<p>No history yet.</p>'}</details><p>Each stage and variation has separate history. Same-setup retries are unscored.</p>`;
    if (drillTab === 'Session') panel.innerHTML = `<h2>Setup variation</h2><label class="focus-variation"><span>Vary Setup</span><input data-movement-varied type="checkbox" role="switch" ${choice.varied ? 'checked' : ''} aria-label="Vary Setup"></label><p>${entry.setup}</p><p>Ten scored attempts per set. Each attempt has a 15-second cap. Retry Same Setup repeats the last miss as unscored practice. Reset or Skip records a skip. Partial sets and sets containing skips cannot qualify for mastery.</p><p>Shared physics and finite boost, without movement assistance. Initial scoring bounds, pending playtesting.</p><button class="secondary" data-view="settings"><i data-lucide="settings-2"></i>Shared settings</button>`;
    content.querySelector('.focus-launch strong').textContent = `${step.title} / ${choice.varied ? 'Varied' : 'Fixed'} setup`;
    content.querySelector('.focus-launch [data-action="practice"]').innerHTML = `<i data-lucide="play"></i>Start ${step.title}`;
  }
  if (selectedMechanic.id === 'ball-static') {
    const step = STATIC_BALL_MASTERY[staticMasteryStep];
    const plan = STATIC_BALL_PLAN[staticMasteryStep];
    const summary = staticBallSummary(staticMasteryStep, staticVaried);
    content.querySelector('.focus-visual-label span:last-child').textContent = step.title;
    content.querySelector('.scene-slot').setAttribute('aria-label', `${step.title}: animated stationary-ball setup preview`);
    content.querySelector('.focus-visual>p').textContent = 'Illustrative setup / Shared car physics';
    content.querySelector('.focus-difficulty').innerHTML = `<h2><i data-lucide="route"></i>Mastery steps</h2><div class="focus-mastery" role="group" aria-label="Mastery steps">${STATIC_BALL_MASTERY.map((entry, index) => `<button data-mastery-step="${index}" aria-pressed="${index === staticMasteryStep}"><span>${index + 1}. ${entry.title}</span><small>Playable</small></button>`).join('')}</div>`;
    const panel = content.querySelector('#focus-panel');
    if (drillTab === 'Objective') panel.innerHTML = renderObjective(step, staticMasteryStep);
    if (drillTab === 'Coaching') panel.innerHTML = `<h2>Focus</h2><p>${step.cue}</p><p>Ground touches first. Jumping and dodging are not prerequisites.</p>`;
    if (drillTab === 'Progress') panel.innerHTML = `<h2>${staticVaried ? 'Varied' : 'Fixed'} setup progress</h2><p>${summary.latest === null ? 'No recorded sets yet.' : `Latest set: ${summary.latest}/${summary.sets.at(-1).attempts.length} successes.`}</p><strong>${summary.mastered ? 'Mastery milestone reached' : 'Milestone: 8/10 in two consecutive sets'}</strong><p>${summary.commonMiss ? `Most common miss: ${summary.commonMiss}.` : 'Steps remain accessible at any time.'}</p><details><summary>Recent sets</summary>${summary.sets.slice(-6).map(set => `<p>${set.attempts.filter(attempt => attempt.success).length}/${set.attempts.length} successes${set.attempts.length < 10 ? ' · Partial' : ''}${set.attempts.some(attempt => attempt.skipped) ? ' · Includes skip' : ''}</p>`).join('') || '<p>No history yet.</p>'}</details><p>Same-setup retries are unscored practice. Fixed and varied histories are separate.</p>`;
    if (drillTab === 'Session') panel.innerHTML = `<h2>Setup variation</h2><label class="focus-variation"><span>Vary Setup</span><input data-static-varied type="checkbox" role="switch" ${staticVaried ? 'checked' : ''} aria-label="Vary Setup"></label><p>Bounded distance, lateral position and approach-angle changes each scored attempt. Target directions alternate straight, left and right in later steps. The ball starts stationary.</p><details><summary>Repetition and retries</summary><p>Off repeats the fixed setup. Retry Same Setup repeats the last miss as unscored practice; the original miss remains recorded. Reset or Skip abandons the current attempt. Returning here starts a fresh set.</p></details><button class="secondary" data-view="settings"><i data-lucide="settings-2"></i>Shared settings</button>`;
    if (drillTab === 'Session') panel.insertAdjacentHTML('beforeend', `<details><summary>Selected step bounds</summary><p>${plan.setup}</p><p>Initial tuning values, pending playtesting. With variation off: 900 uu starting distance for Find Contact, 1,000 uu for other steps, no lateral or heading offset, and a straight target where applicable.</p></details>`);
    content.querySelector('.focus-launch strong').textContent = `${step.title} / ${staticVaried ? 'Varied' : 'Fixed'} setup`;
    const launch = content.querySelector('.focus-launch [data-action="practice"]');
    launch.disabled = false;
    launch.innerHTML = `<i data-lucide="play"></i>Start ${step.title}`;
  }
  if (selectedMechanic.id === 'ball-soft') {
    const step = SOFT_TOUCH_MASTERY[softMasteryStep];
    const summary = softBallSummary(softMasteryStep, softVaried);
    const success = ['Reduce horizontal incoming speed by at least 40%, measured 0.1 seconds after contact.', 'Cushion the arrival, then stay within 450 uu for 0.5 seconds.', 'Cushion and stay close, then receive into the requested exit: 150–450 uu sideways and within 450 uu along the arrival line, inside 3 seconds.', 'Keep the same cushioned, close reception across bounded incoming speeds and angles.', 'Complete the cushioned 0.5-second close reception, then make a separate ground-ball contact within 3 seconds of the first touch.'][softMasteryStep];
    content.querySelector('.focus-visual-label span:last-child').textContent = step.title;
    content.querySelector('.scene-slot').setAttribute('aria-label', `${step.title}: animated incoming-ball setup preview`);
    content.querySelector('.focus-visual>p').textContent = 'Illustrative setup / Incoming ground ball';
    content.querySelector('.focus-difficulty').innerHTML = `<h2><i data-lucide="route"></i>Mastery steps</h2><div class="focus-mastery" role="group" aria-label="Mastery steps">${SOFT_TOUCH_MASTERY.map((entry, index) => `<button data-soft-step="${index}" aria-pressed="${index === softMasteryStep}"><span>${index + 1}. ${entry.title}</span><small>Playable</small></button>`).join('')}</div>`;
    const panel = content.querySelector('#focus-panel');
    if (drillTab === 'Objective') panel.innerHTML = renderObjective(step, softMasteryStep, success);
    if (drillTab === 'Coaching') panel.innerHTML = `<h2>Focus</h2><p>${step.cue}</p><p>Ground receptions first; bounces and aerial catches belong to later drills.</p>`;
    if (drillTab === 'Progress') panel.innerHTML = `<h2>${softVaried ? 'Varied' : 'Fixed'} reception progress</h2><p>${summary.latest === null ? 'No recorded sets yet.' : `Latest set: ${summary.latest}/${summary.sets.at(-1).attempts.length} successes.`}</p><strong>${summary.mastered ? 'Mastery milestone reached' : 'Milestone: 8/10 in two consecutive sets'}</strong><p>${summary.commonMiss ? `Most common miss: ${summary.commonMiss}.` : 'All five steps are accessible.'}</p><details><summary>Recent sets</summary>${summary.sets.slice(-6).map(set => `<p>${set.attempts.filter(attempt => attempt.success).length}/${set.attempts.length} successes${set.attempts.length < 10 ? ' · Partial' : ''}${set.attempts.some(attempt => attempt.skipped) ? ' · Includes skip' : ''}</p>`).join('') || '<p>No history yet.</p>'}</details><p>Same-setup retries are unscored. Each step and fixed/varied setup has separate history.</p>`;
    if (drillTab === 'Session') panel.innerHTML = `<h2>Incoming ground balls</h2><label class="focus-variation"><span>Vary Setup</span><input data-soft-varied type="checkbox" role="switch" ${softVaried ? 'checked' : ''} aria-label="Vary Setup"></label><p>Fixed: 18.0 km/h straight arrival from 1,200 uu. Varied: 1,000–1,400 uu distance and up to 80 uu car offset. Later steps add 14.4–28.8 km/h arrivals at 0 or ±20°. Exit requests alternate right and left; fixed requests left.</p><p>The car starts moving with the arrival at 6.5 km/h. All movement after spawning uses shared physics. Keep the ball below 200 uu. Each attempt has a 15-second cap.</p><details><summary>Sets and retries</summary><p>Ten scored attempts per set. Retry Same Setup repeats the complete last miss as unscored practice. Reset or Skip records a skip. Partial sets and sets with skips do not qualify for mastery.</p></details><button class="secondary" data-view="settings"><i data-lucide="settings-2"></i>Shared settings</button>`;
    content.querySelector('.focus-launch strong').textContent = `${step.title} / ${softVaried ? 'Varied' : 'Fixed'} arrival`;
    content.querySelector('.focus-launch [data-action="practice"]').innerHTML = `<i data-lucide="play"></i>Start ${step.title}`;
  }
  if (selectedMechanic.id === 'ball-roll-touch') {
    const step = ROLL_TOUCH_MASTERY[rollMasteryStep];
    const summary = rollTouchSummary(rollMasteryStep, rollVaried);
    content.querySelector('.focus-visual-label span:last-child').textContent = step.title;
    content.querySelector('.scene-slot').setAttribute('aria-label', `${step.title}: animated air-roll contact setup preview`);
    content.querySelector('.focus-visual>p').textContent = 'Illustrative setup / Airborne roll and contact';
    content.querySelector('.focus-difficulty').innerHTML = `<h2><i data-lucide="route"></i>Mastery steps</h2><div class="focus-mastery" role="group" aria-label="Mastery steps">${ROLL_TOUCH_MASTERY.map((entry, index) => `<button data-roll-step="${index}" aria-pressed="${index === rollMasteryStep}"><span>${index + 1}. ${entry.title}</span><small>Playable</small></button>`).join('')}</div>`;
    const panel = content.querySelector('#focus-panel');
    if (drillTab === 'Objective') panel.innerHTML = renderObjective(step, rollMasteryStep);
    if (drillTab === 'Coaching') panel.innerHTML = `<h2>Focus</h2><p>${step.cue}</p><p>The airborne start isolates the approach. Car and ball fall normally; there is no hover assistance.</p>`;
    if (drillTab === 'Progress') panel.innerHTML = `<h2>${rollVaried ? 'Varied' : 'Fixed'} approach progress</h2><p>${summary.latest === null ? 'No recorded sets yet.' : `Latest set: ${summary.latest}/${summary.sets.at(-1).attempts.length} successes.`}</p><strong>${summary.mastered ? 'Mastery milestone reached' : 'Milestone: 8/10 in two consecutive sets'}</strong><p>${summary.commonMiss ? `Most common miss: ${summary.commonMiss}.` : 'All five stages remain accessible.'}</p><details><summary>Recent sets</summary>${summary.sets.slice(-6).map(set => `<p>${set.attempts.filter(attempt => attempt.success).length}/${set.attempts.length} successes${set.attempts.length < 10 ? ' · Partial' : ''}${set.attempts.some(attempt => attempt.skipped) ? ' · Includes skip' : ''}</p>`).join('') || '<p>No history yet.</p>'}</details><p>Each stage and variation has separate history. Same-setup retries are unscored.</p>`;
    if (drillTab === 'Session') panel.innerHTML = `<h2>Airborne approach</h2><label class="focus-variation"><span>Vary Setup</span><input data-roll-varied type="checkbox" role="switch" ${rollVaried ? 'checked' : ''} aria-label="Vary Setup"></label><p>Fixed: 400 uu separation, 600 uu height and 16.2 km/h approach. The car starts tilted 45 degrees in stage one, 90 degrees thereafter. Varied: 350–450 uu separation, 550–650 uu height, 14.4–18.0 km/h approach, alternating roll sides and later headings of 0 or ±15 degrees.</p><p>Before contact, accumulate at least 0.05 seconds of full-strength-equivalent roll input and 0.15 radians of actual axial rotation. Ten scored attempts per set; skips and partial sets cannot qualify for mastery. Retry Same Setup repeats the complete last miss as unscored practice. Attempts end after 15 seconds.</p><p>Initial scoring and setup bounds, pending playtesting.</p><button class="secondary" data-view="settings"><i data-lucide="settings-2"></i>Shared settings</button>`;
    content.querySelector('.focus-launch strong').textContent = `${step.title} / ${rollVaried ? 'Varied' : 'Fixed'} approach`;
    content.querySelector('.focus-launch [data-action="practice"]').innerHTML = `<i data-lucide="play"></i>Start ${step.title}`;
  }
  if (selectedMechanic.id === 'ball-recovery') {
    const step = RECOVERY_MASTERY[recoveryMasteryStep];
    const summary = recoverySummary(recoveryMasteryStep, recoveryVaried);
    content.querySelector('.focus-visual-label span:last-child').textContent = step.title;
    content.querySelector('.scene-slot').setAttribute('aria-label', `${step.title}: animated recovery preview`);
    content.querySelector('.focus-visual>p').textContent = 'Illustrative setup / Floor recovery';
    content.querySelector('.focus-difficulty').innerHTML = `<h2><i data-lucide="route"></i>Mastery steps</h2><div class="focus-mastery" role="group" aria-label="Mastery steps">${RECOVERY_MASTERY.map((entry, index) => `<button data-recovery-step="${index}" aria-pressed="${index === recoveryMasteryStep}"><span>${index + 1}. ${entry.title}</span><small>Playable</small></button>`).join('')}</div>`;
    const panel = content.querySelector('#focus-panel');
    if (drillTab === 'Objective') panel.innerHTML = renderObjective(step, recoveryMasteryStep);
    if (drillTab === 'Coaching') panel.innerHTML = `<h2>Focus</h2><p>${step.cue}</p><p>Floor recoveries first. Wall landings and advanced movement belong to later drills. The airborne start falls normally; no landing assistance is applied.</p>`;
    if (drillTab === 'Progress') panel.innerHTML = `<h2>${recoveryVaried ? 'Varied' : 'Fixed'} recovery progress</h2><p>${summary.latest === null ? 'No recorded sets yet.' : `Latest set: ${summary.latest}/${summary.sets.at(-1).attempts.length} successes.`}</p><strong>${summary.mastered ? 'Mastery milestone reached' : 'Milestone: 8/10 in two consecutive sets'}</strong><p>${summary.commonMiss ? `Most common miss: ${summary.commonMiss}.` : 'All five stages remain accessible.'}</p><details><summary>Recent sets</summary>${summary.sets.slice(-6).map(set => `<p>${set.attempts.filter(attempt => attempt.success).length}/${set.attempts.length} successes${set.attempts.length < 10 ? ' / Partial' : ''}${set.attempts.some(attempt => attempt.skipped) ? ' / Includes skip' : ''}</p>`).join('') || '<p>No history yet.</p>'}</details><p>Stage and fixed/varied histories are separate. Same-setup retries are unscored.</p>`;
    if (drillTab === 'Session') panel.innerHTML = `<h2>Recovery setup</h2><label class="focus-variation"><span>Vary Setup</span><input data-recovery-varied type="checkbox" role="switch" ${recoveryVaried ? 'checked' : ''} aria-label="Vary Setup"></label><p>Fixed: 600 uu height, 16.2 km/h travel, 90-degree roll and 400 uu approach distance. Varied: 550-650 uu height, 14.4-18.0 km/h, 350-450 uu distance, alternating roll sides and headings of 0 or +/-15 degrees.</p><p>The first three stages isolate landing without a ball in play. Stages four and five add an airborne ball. Upright means the up axis is within approximately 23 degrees of vertical. Alignment means facing within 30 degrees of horizontal velocity.</p><p>Ten attempts per set. Retry Same Setup repeats the last miss as unscored practice. Reset and Skip record a skip; incomplete sets and sets containing skips cannot qualify for mastery. Initial tuning values, pending playtesting.</p><button class="secondary" data-view="settings"><i data-lucide="settings-2"></i>Shared settings</button>`;
    content.querySelector('.focus-launch strong').textContent = `${step.title} / ${recoveryVaried ? 'Varied' : 'Fixed'} recovery`;
    content.querySelector('.focus-launch [data-action="practice"]').innerHTML = `<i data-lucide="play"></i>Start ${step.title}`;
  }
  content.querySelectorAll('.focus-room [data-view="training"], .focus-room [data-view="settings"]').forEach(button => button.remove());
  createIcons({ icons, root: content });
}

const arenaFormats = [
  { id: 'duel', label: '1v1', name: 'Duel', players: '2 players' },
  { id: 'doubles', label: '2v2', name: 'Doubles', players: '4 players' },
  { id: 'standard', label: '3v3', name: 'Standard', players: '6 players' },
  { id: 'chaos', label: '4v4', name: 'Chaos', players: '8 players' },
  { id: 'solo', label: 'Solo', name: 'Open Arena', players: '1 player' },
];
const arenaModes = [
  { id: 'soccar', name: 'Soccar', icon: 'goal', summary: 'The original. Two goals. Every touch matters.', rule: 'Standard ball / Standard gravity' },
  { id: 'hoops', name: 'Hoops', icon: 'circle-dot', summary: 'Take it above the rim. Own the aerial game.', rule: 'Basket goals / Hoops court' },
  { id: 'dropshot', name: 'Dropshot', icon: 'hexagon', summary: 'Charge the ball. Break the floor. Find the opening.', rule: 'Damage tiles / Charged ball' },
  { id: 'snowday', name: 'Snow Day', icon: 'snowflake', summary: 'A fast puck and a frozen pitch. Keep it low.', rule: 'Hockey puck / Ice arena' },
  { id: 'rumble', name: 'Rumble', icon: 'zap', summary: 'Wild power-ups. Unpredictable plays.', rule: 'Random power-ups / Standard arena' },
  { id: 'heatseeker', name: 'Heatseeker', icon: 'flame', summary: 'Return the shot. Survive the rally.', rule: 'Goal-seeking ball / Rising speed' },
  { id: 'boost-heist', name: 'Boost Heist', icon: 'flag', summary: 'Steal the enemy battery. Bring it home before your boost runs dry.', rule: 'Capture the battery / Carrying drains boost' },
  { id: 'airborne', name: 'Airborne', icon: 'wind', summary: 'The floor is dangerous. Stay flying and make every landing count.', rule: 'Hazardous floor after kickoff / Aerial survival' },
  { id: 'hot-potato', name: 'Hot Potato', icon: 'timer', summary: 'Pass the ticking ball. Do not own the last touch when time runs out.', rule: 'Touch transfers ownership / Countdown elimination' },
  { id: 'rift-rally', name: 'Rift Rally', icon: 'route', summary: 'Race through shifting aerial gates. Find the fastest line.', rule: 'Changing gates / Moving obstacles / Timed race' },
  { id: 'bankshot', name: 'Bankshot', icon: 'goal', summary: 'Play the angles. Only wall and ceiling bank shots count.', rule: 'Wall or ceiling bounce required before scoring' },
  { id: 'last-car-flying', name: 'Last Car Flying', icon: 'zap', summary: 'Platforms disappear. Knock rivals off and recover to survive.', rule: 'Disappearing platforms / Last car standing' },
  { id: 'combo-rush', name: 'Combo Rush', icon: 'trophy', summary: 'Chain aerial touches, rolls and clean landings. Beat the clock.', rule: 'Timed score attack / Combo multipliers' },
];
const arenaSections = [
  { id: 'originals', name: 'AIRLAB Originals', modes: ['boost-heist', 'airborne', 'hot-potato', 'bankshot', 'last-car-flying'] },
  { id: 'classic', name: 'Classic', modes: ['soccar', 'hoops', 'dropshot', 'snowday', 'rumble', 'heatseeker'] },
  { id: 'solo-challenges', name: 'Solo Challenges', modes: ['rift-rally', 'combo-rush'] },
];
let arenaFormatId = 'duel';
let arenaModeId = 'soccar';
let arenaSectionId = 'classic';

function renderArena() {
  const mode = arenaModes.find(entry => entry.id === arenaModeId);
  const section = arenaSections.find(entry => entry.id === arenaSectionId);
  const soloChallenge = arenaSections.find(section => section.id === 'solo-challenges').modes.includes(mode.id);
  const format = arenaFormats.find(entry => entry.id === (soloChallenge ? 'solo' : arenaFormatId));
  const playable = arenaFormatId === 'solo' && arenaModeId === 'soccar';
  content.innerHTML = `
    <section class="page-heading arena-heading"><div><p class="eyebrow">ARENA / MATCH LINEUP</p><h1>ARENA.</h1></div><span class="arena-session-label"><i data-lucide="flag"></i>${format.name} / ${mode.name}</span></section>
    <div class="arena-workspace">
      <section class="arena-lineup" aria-label="Match selection">
        <nav class="arena-category-rail" aria-label="Mode category">${arenaSections.map((entry, index) => `<button type="button" data-arena-section="${entry.id}" aria-pressed="${entry.id === arenaSectionId}"><span>0${index + 1}</span><strong>${entry.name}</strong><small>${entry.modes.length}</small></button>`).join('')}</nav>
        <section aria-labelledby="arena-section-${section.id}">
          <header class="arena-mode-heading"><h2 id="arena-section-${section.id}">${section.name}</h2><span>${section.modes.length} MODES</span></header>
          <div class="arena-mode-grid" role="group" aria-label="${section.name}">${section.modes.map(modeId => arenaModes.find(entry => entry.id === modeId)).map(entry => `<button type="button" class="arena-mode" data-arena-mode="${entry.id}" aria-pressed="${entry.id === arenaModeId}"><i data-lucide="${entry.icon}"></i><span class="arena-mode-name">${entry.name}</span><span class="arena-mode-description">${entry.summary}</span><small>${entry.id === 'soccar' ? 'Solo available' : 'Coming soon'}</small></button>`).join('')}</div>
        </section>
      </section>
      <aside class="arena-session" aria-label="Selected match">
        <p class="eyebrow">YOUR MATCH</p><h2>${mode.name}</h2>
        ${soloChallenge ? '' : `<h3>Match format</h3><div class="arena-formats" role="group" aria-label="Match format">${arenaFormats.map(entry => `<button type="button" data-arena-format="${entry.id}" aria-pressed="${entry.id === arenaFormatId}"><strong>${entry.label}</strong></button>`).join('')}</div>`}
        <dl><div><dt>Format</dt><dd>${soloChallenge ? 'Solo / Challenge' : `${format.label} / ${format.name}`}</dd></div><div><dt>Players</dt><dd>${format.players}</dd></div><div><dt>Arena</dt><dd>${mode.id === 'soccar' ? 'Standard soccar' : mode.name}</dd></div><div><dt>Status</dt><dd>${playable ? 'Ready to play' : 'Coming soon'}</dd></div></dl>
        <p class="arena-rules">${mode.rule}</p>
        <button type="button" class="primary arena-launch" data-action="arena-launch" ${playable ? '' : 'disabled'}><i data-lucide="play"></i>${playable ? 'Enter solo arena' : 'Match unavailable'}</button>
        ${playable ? '' : '<p class="arena-availability">Team matches and extra modes are not playable yet.</p><button type="button" class="secondary arena-solo" data-action="arena-solo"><i data-lucide="car"></i>Play solo arena</button>'}
      </aside>
    </div>`;
  createIcons({ icons, root: content });
}

function render(view) {
  settingsObserver?.disconnect();
  if (selectedDesign && view === 'drill') {
    const branch = PHASES.findIndex(phase => phase.modes.some(mode => mode.id === selectedMechanic.id));
    if (branch >= 0) selectedBranch = branch;
    else selectedMechanic = PHASES[selectedBranch].modes[0];
  }
  if (live) {
    trainer.prepare();
    trainer.parkSettings();
    menuRoot.hidden = false;
    document.body.classList.add('live-menu-open');
  }
  const sceneHost = document.querySelector('#scene');
  document.body.append(sceneHost);
  activeView = view;
  document.body.dataset.view = view;
  if (selectedDesign) {
    const themeIndex = { home: 0, arena: 3, training: 3, drill: 2, settings: 13, locker: 13 }[view];
    const theme = themes[themeIndex];
    document.body.dataset.layout = theme[2];
    document.body.classList.toggle('light', styleOption ? styleOption.light : view === 'drill');
    if (!styleOption) ['--accent', '--secondary', '--bg'].forEach((property, index) => document.documentElement.style.setProperty(property, theme[index + 3]));
  }
  document.querySelectorAll('nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
    button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false');
  });
  if (view === 'home') {
    content.innerHTML = `<section class="home-intro"><p class="eyebrow">YOUR NEXT LEVEL STARTS HERE</p><h1>${layout === 'festival' ? 'MAKE<br>SOME NOISE.' : layout === 'esports' ? 'TRAIN.<br>COMPETE.<br>REPEAT.' : layout === 'playbook' ? 'A better game<br>starts here.' : 'BUILT FOR<br>BETTER PLAY.'}</h1><p class="intro-copy">Control the car. Read the ball.<br>Make the next touch count.</p><div class="hero-actions"><button class="primary" data-view="training">Enter training <span>&rarr;</span></button><button class="secondary" data-action="freeplay">Free play</button></div><div class="home-stats"><span><strong>10</strong>Training branches</span><span><strong>32</strong>Mechanics</span><span><strong>13</strong>Playable drills</span></div></section><section class="home-bottom"><div><small>CONTINUE TRAINING</small><button data-view="drill"><strong>Air Roll Sequences</strong><span>Orientation / Intermediate &rarr;</span></button></div><div><small>YOUR LOADOUT</small><button data-action="car"><strong>Octane</strong><span>Standard body / Rotate preview &rarr;</span></button></div><div><small>FEATURED BRANCH</small><button data-view="training"><strong>Recoveries</strong><span>Land ready for the next play &rarr;</span></button></div></section>`;
  } else if (view === 'training') {
    content.innerHTML = `<section class="page-heading"><div><p class="eyebrow">THE TRAINING LIBRARY</p><h1>${layout === 'map' ? 'CHOOSE YOUR ROUTE.' : layout === 'tree' ? 'GROW YOUR GAME.' : 'FIND YOUR EDGE.'}</h1><p>Fundamentals to advanced mechanics.</p></div><label class="filter">Availability<select aria-label="Filter preview categories"><option value="all">All mechanics</option><option value="ready">Playable now</option><option value="planned">Curriculum previews</option></select></label></section><div class="training-layout"><aside class="branch-nav"><strong>Training branches</strong>${categories.map((entry, index) => `<button data-category="${index}">${String(index + 1).padStart(2, '0')} ${entry[0]}</button>`).join('')}<span>Demo catalogue<br>No saved progress</span></aside><section class="category-grid">${categories.map(card).join('')}</section></div>`;
  } else if (view === 'drill') {
    const title = selectedCategory === 0 ? 'Air Roll Sequences' : ['Air Roll Sequences', 'Half Flip', 'First Touch', 'Air Roll Sequences', 'Ground Pinch', 'Single Flip Reset'][selectedCategory];
    const goals = selectedCategory === 1 ? ['Backflip in a straight line', 'Cancel with forward pitch', 'Roll the wheels toward the ground', 'Land facing the opposite direction'] : ['Find the correct approach', 'Match orientation and momentum', 'Execute with controlled timing', 'Repeat the movement consistently'];
    content.innerHTML = `<section class="drill-layout"><div class="drill-copy"><button class="back-link" data-view="training">&larr; Training library</button><p class="eyebrow">MECHANIC / ${categories[selectedCategory][2].toUpperCase()}</p><h1>${title.toUpperCase()}</h1><p class="drill-summary">Precision before power. Build one clean movement at a time.</p><div class="drill-tags"><span>4 learning goals</span><span>Solo practice</span><span>Preview</span></div><h2>Session goals</h2><ol>${goals.map(goal => `<li>${goal}</li>`).join('')}</ol><button class="primary" data-action="practice">Preview session <span>&rarr;</span></button></div><aside class="session-panel"><div class="session-art"><span class="trajectory"></span><span class="ball-mark"></span><strong>${selectedCategory === 1 ? '180°' : 'AIR'}</strong></div><small>SESSION SETUP</small><h2>Focus on the next touch.</h2><dl><div><dt>Car</dt><dd>Octane</dd></div><div><dt>Arena</dt><dd>Standard</dd></div><div><dt>Training</dt><dd>Unlimited boost</dd></div></dl></aside></section>`;
  } else {
    content.innerHTML = `<section class="page-heading"><div><p class="eyebrow">MAKE IT YOURS</p><h1>YOUR SETUP.</h1><p>Controls, camera and training preferences.</p></div></section><div class="settings-layout"><aside class="settings-nav"><button class="active">Gameplay</button><button>Camera</button><button>Controls</button><button>Audio</button></aside><section class="settings-fields"><h2>Training preferences</h2><label class="setting"><span><strong>Unlimited boost</strong><small>Training fuel</small></span><input type="checkbox" checked></label><label class="setting"><span><strong>Training hints</strong><small>Session feedback</small></span><input type="checkbox" checked></label><label class="setting"><span><strong>Camera distance</strong><small><output id="distance-value">270</output> uu</small></span><input aria-label="Camera distance" type="range" min="200" max="400" value="270"></label><label class="setting"><span><strong>Car body</strong><small>Preview loadout</small></span><select aria-label="Car body"><option>Octane</option><option>Fennec</option><option>Dominus</option></select></label><button class="primary" data-action="save">Apply preview settings <span>&rarr;</span></button><p class="settings-note">Temporary preview. Your game settings are unchanged.</p></section></div>`;
  }
  if (view === 'home' && !selectedDesign) content.innerHTML = homeLayout(layout, categories);
  if (view === 'training' && !selectedDesign) arrangeCatalogue(layout, content);
  if (selectedDesign && view === 'training') {
    const phase = PHASES[selectedBranch];
    content.innerHTML = `<section class="page-heading"><div><p class="eyebrow">TRAINING / ESPORTS</p><h1>FIND YOUR EDGE.</h1></div><label class="filter">Availability<select aria-label="Filter drills"><option value="all">All drills</option><option value="ready">Playable now</option><option value="planned">Curriculum previews</option></select></label></section><div class="selected-training"><aside class="selected-categories" aria-label="Training categories"><h2>CATEGORIES</h2>${PHASES.map((branch,index)=>`<button data-branch="${index}" class="${index===selectedBranch?'active':''}" aria-pressed="${index===selectedBranch}"><span>${String(index+1).padStart(2,'0')}</span><strong>${branch.title}</strong><small>${branch.modes.length}</small></button>`).join('')}</aside><section class="selected-drills"><header><p class="eyebrow">${String(selectedBranch+1).padStart(2,'0')} / ${phase.modes.length} DRILLS</p><h2>${phase.title}</h2><p>${phase.blurb}</p></header>${drillGroups(phase)}</section></div>`;
  }
  if (selectedDesign && view === 'drill') {
    content.querySelector('.drill-copy h1').textContent = selectedMechanic.title.toUpperCase();
    content.querySelector('.drill-copy .eyebrow').textContent = `MECHANIC / ${selectedMechanic.level.toUpperCase()}`;
    content.querySelector('.drill-summary').textContent = selectedMechanic.description;
    content.querySelector('.drill-copy .eyebrow').textContent = `${PHASES[selectedBranch].title.toUpperCase()} / ${selectedMechanic.level.toUpperCase()}`;
    content.querySelector('.drill-copy h2').textContent = 'Session goals';
    content.querySelector('.drill-copy h2').before(content.querySelector('[data-action="practice"]'));
    content.querySelector('.drill-copy ol').innerHTML = selectedMechanic.steps.map(step=>`<li>${step}</li>`).join('');
    content.querySelector('.drill-tags').innerHTML = `<span>${selectedMechanic.steps.length} learning goals</span><span>Solo practice</span><span>${selectedMechanic.available?'Playable drill':'Curriculum preview'}</span>`;
    content.querySelector('.session-art strong').textContent = selectedMechanic.id==='half-flip'?'180°':selectedMechanic.title.split(' ').map(word=>word[0]).join('');
  }
  if (selectedDesign && view === 'training') {
    const tags = [...new Set(PHASES[selectedBranch].modes.flatMap(mode => mode.tags))].sort();
    const availability = content.querySelector('.filter');
    const filters = document.createElement('div');
    filters.className = 'training-filters';
    availability.before(filters);
    filters.append(availability);
    filters.insertAdjacentHTML('beforeend', `<label class="filter">Tag<select aria-label="Filter drill tags"><option value="all">All tags</option>${tags.map(tag => `<option>${tag}</option>`).join('')}</select></label>`);
  }
  if (styleOption && view === 'training') content.querySelector('.page-heading .eyebrow').textContent = 'TRAINING LIBRARY';
  if (live) {
    const car = trainer.car();
    menuRoot.querySelector('.profile small').textContent = car.name;
    menuRoot.querySelector('.site-footer span:last-child').textContent = 'ROCKET LEAGUE TRAINING';
    menuRoot.querySelector('.site-footer span:nth-child(2)').textContent = 'Volt';
    if (view === 'home') {
      const stats = content.querySelectorAll('.home-stats strong');
      stats[0].textContent = PHASES.length;
      stats[1].textContent = PHASES.reduce((count, phase) => count + phase.modes.length, 0);
      stats[2].textContent = trainer.playableCount();
      content.querySelector('.home-bottom').remove();
      const totals = trainer.practiceTotals();
      const progress = document.createElement('p');
      progress.className = 'home-progress';
      progress.textContent = `${Math.floor(totals.seconds / 60)} min practised / ${totals.sessions} sessions practised`;
      content.querySelector('.hero-actions').after(progress);
      const recent = trainer.lastDrill();
      const recommendation = document.createElement('div');
      recommendation.className = 'home-recommendation';
      recommendation.innerHTML = `<span>${recent ? 'PICK UP WHERE YOU LEFT OFF' : 'SUGGESTED FIRST DRILL'}</span><button type="button" data-action="recommended-drill">${recent?.title || 'Target Pose'} <span aria-hidden="true">&rarr;</span></button>`;
      progress.after(recommendation);
      const activity = document.createElement('section');
      activity.className = 'home-activity';
      activity.setAttribute('aria-label', 'Your practice');
      progress.before(activity);
      activity.append(progress, recommendation);
      content.append(content.querySelector('.home-stats'));
      updateControllerStatus();
    }
    if (view === 'drill') {
      renderFocusRoom();
    }
    if (view === 'settings') {
      content.innerHTML = `<section class="page-heading master-settings-heading"><div><p class="eyebrow">MAKE IT YOURS</p><h1>YOUR SETUP.</h1></div></section><div class="settings-layout master-settings"><nav class="settings-nav" aria-label="Settings sections"></nav><section class="settings-detail"><header><h2 class="settings-section-heading"></h2></header><nav class="settings-group-nav" aria-label="Settings groups"></nav><section class="settings-editor"><h2 class="settings-group-heading"></h2><div class="settings-fields"></div></section></section></div>`;
      const navigation = content.querySelector('.settings-nav');
      navigation.replaceChildren();
      for (const [label, tab] of [['Controls', 'controls'], ['Bindings', 'bindings'], ['Camera', 'camera']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.settingsTab = tab;
        navigation.append(button);
      }
      showSettingsSection('controls');
    }
    if (view === 'arena') renderArena();
    if (view === 'locker') {
      lockerCarId = car.id;
      content.innerHTML = `<section class="page-heading master-settings-heading"><div><p class="eyebrow">YOUR LOADOUT</p><h1>LOCKER.</h1></div></section><section class="locker-preview"><div class="scene-slot" aria-label="Car preview"></div><div class="locker-preview-caption"><h2>${car.name}</h2><button type="button" class="secondary" data-action="equip-preview" disabled>Equipped</button></div></section><section class="settings-fields locker-fields" aria-label="Car bodies"></section>`;
      trainer.settings(content.querySelector('.locker-fields'), 'loadout');
      const cards = content.querySelector('#locker-list');
      const showCar = event => {
        const button = event.target.closest('[data-car-id]');
        if (!button) return;
        lockerCarId = button.dataset.carId;
        setCar(lockerCarId);
        content.querySelector('.locker-preview-caption h2').textContent = button.querySelector('.mode-card-title').textContent;
        const equipped = lockerCarId === trainer.car().id;
        const action = content.querySelector('[data-action="equip-preview"]');
        action.disabled = equipped;
        action.textContent = equipped ? 'Equipped' : 'Equip car';
      };
      cards.addEventListener('mouseover', showCar);
      cards.addEventListener('focusin', showCar);
      cards.addEventListener('click', showCar);
    }
  }
  const slot = content.querySelector('.scene-slot');
  (slot || document.body).append(sceneHost);
  window.dispatchEvent(new Event('resize'));
}
render('home');
function updateControllerStatus() {
  const status = menuRoot.querySelector('.header-controller-status');
  if (!status) return;
  const connected = Array.from(navigator.getGamepads?.() || []).some(pad => pad?.connected);
  status.textContent = connected ? 'Controller connected' : 'No controller connected';
  status.dataset.connected = String(connected);
}
window.addEventListener('gamepadconnected', updateControllerStatus);
window.addEventListener('gamepaddisconnected', updateControllerStatus);
if (live) trainer.connect({
  home: () => render('home'),
  training: () => render('training'),
  hide: () => { menuRoot.hidden = true; document.body.classList.remove('live-menu-open'); document.querySelector('#scene').hidden = true; },
  active: () => menuRoot.hidden ? null : menuRoot,
  back: () => {
    const returningToLibrary = activeView === 'drill';
    render(returningToLibrary ? 'training' : 'home');
    if (returningToLibrary) content.querySelector(`[data-mechanic="${PHASES[selectedBranch].modes.findIndex(mode => mode.id === selectedMechanic.id)}"]`)?.focus({ preventScroll: true });
  },
  drill: () => render('drill'),
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (live && (!menuRoot.contains(button) || button.closest('#panel-controls,#panel-camera,#locker-list'))) return;
  if (button.dataset.view) render(button.dataset.view);
  if (live && button.dataset.arenaSection) {
    arenaSectionId = button.dataset.arenaSection;
    arenaModeId = arenaSections.find(entry => entry.id === arenaSectionId).modes[0];
    render('arena');
    content.querySelector(`[data-arena-section="${arenaSectionId}"]`).focus({ preventScroll: true });
    return;
  }
  if (live && (button.dataset.arenaFormat || button.dataset.arenaMode)) {
    if (button.dataset.arenaFormat) arenaFormatId = button.dataset.arenaFormat;
    if (button.dataset.arenaMode) arenaModeId = button.dataset.arenaMode;
    const selector = button.dataset.arenaFormat ? `[data-arena-format="${arenaFormatId}"]` : `[data-arena-mode="${arenaModeId}"]`;
    render('arena');
    content.querySelector(selector).focus({ preventScroll: true });
    return;
  }
  if (live && button.dataset.action === 'arena-solo') {
    arenaFormatId = 'solo';
    arenaModeId = 'soccar';
    arenaSectionId = 'classic';
    render('arena');
    content.querySelector('[data-action="arena-launch"]').focus({ preventScroll: true });
    return;
  }
  if (live && button.dataset.action === 'arena-launch') {
    if (arenaFormatId === 'solo' && arenaModeId === 'soccar') trainer.launch(trainer.freeplay);
    return;
  }
  if (live && button.dataset.movementStep !== undefined) {
    movementChoices[selectedMechanic.id].masteryStep = Number(button.dataset.movementStep);
    try { localStorage.setItem(`rl-${selectedMechanic.id}-step`, button.dataset.movementStep); } catch { }
    render('drill');
    content.querySelector(`[data-movement-step="${button.dataset.movementStep}"]`).focus({ preventScroll: true });
    return;
  }
  if (live && button.dataset.recoveryStep !== undefined) {
    recoveryMasteryStep = Number(button.dataset.recoveryStep);
    try { localStorage.setItem('rl-recovery-step', String(recoveryMasteryStep)); } catch { }
    render('drill');
    content.querySelector(`[data-recovery-step="${recoveryMasteryStep}"]`).focus({ preventScroll: true });
    return;
  }
  if (live && button.dataset.rollStep !== undefined) {
    rollMasteryStep = Number(button.dataset.rollStep);
    try { localStorage.setItem('rl-roll-step', String(rollMasteryStep)); } catch { }
    render('drill');
    content.querySelector(`[data-roll-step="${rollMasteryStep}"]`).focus({ preventScroll: true });
    return;
  }
  if (live && button.dataset.softStep !== undefined) {
    softMasteryStep = Number(button.dataset.softStep);
    try { localStorage.setItem('rl-soft-step', String(softMasteryStep)); } catch { }
    render('drill');
    content.querySelector(`[data-soft-step="${softMasteryStep}"]`).focus({ preventScroll: true });
    return;
  }
  if (live && button.dataset.masteryStep !== undefined) {
    staticMasteryStep = Number(button.dataset.masteryStep);
    try { localStorage.setItem('rl-static-step', String(staticMasteryStep)); } catch { }
    render('drill');
    content.querySelector(`[data-mastery-step="${staticMasteryStep}"]`).focus({ preventScroll: true });
    return;
  }
  if (live && button.dataset.drillTab) {
    drillTab = button.dataset.drillTab;
    render('drill');
    content.querySelector(`[data-drill-tab="${drillTab}"]`).focus({ preventScroll: true });
    return;
  }
  if (live && button.dataset.drillLevel) {
    drillDifficulty = GHOST_ALIGN_DIFFICULTIES.find(level => level.id === button.dataset.drillLevel);
    render('drill');
    content.querySelector(`[data-drill-level="${drillDifficulty.id}"]`).focus({ preventScroll: true });
    return;
  }
  if (selectedDesign && button.dataset.branch !== undefined) {
    selectedBranch = Number(button.dataset.branch);
    render('training');
    content.querySelector(`[data-branch="${selectedBranch}"]`).focus({ preventScroll: true });
    return;
  }
  if (selectedDesign && button.dataset.mechanic !== undefined) {
    selectedMechanic = PHASES[selectedBranch].modes[Number(button.dataset.mechanic)];
    drillTab = 'Objective';
    if (live) {
      try { localStorage.setItem('rl-training-selected-drill', selectedMechanic.id); } catch { }
    }
    render('drill');
  }
  if (button.dataset.category !== undefined) {
    selectedCategory = Number(button.dataset.category);
    render(button.closest('.branch-nav') ? 'training' : 'drill');
    return;
  }
  if (button.dataset.action === 'car') {
    if (live) render('locker');
    else controls.autoRotate = !controls.autoRotate;
  }
  if (live && button.dataset.action === 'equip-preview') {
    trainer.equipCar(lockerCarId);
    render('locker');
  }
  if (live && button.dataset.action === 'continue') {
    const drill = trainer.lastDrill() || selectedMechanic;
    if (movementChoices[drill.id]) { trainer.launch(drill, { ...movementChoices[drill.id] }); return; }
    if (drill.id === 'ball-recovery') { trainer.launch(drill, { masteryStep: recoveryMasteryStep, varied: recoveryVaried }); return; }
    trainer.launch(drill, drill.id === 'ball-static' ? { masteryStep: staticMasteryStep, varied: staticVaried } : drill.id === 'ball-soft' ? { masteryStep: softMasteryStep, varied: softVaried } : drill.id === 'ball-roll-touch' ? { masteryStep: rollMasteryStep, varied: rollVaried } : undefined);
  }
  if (live && button.dataset.action === 'recommended-drill') {
    selectedMechanic = trainer.lastDrill() || PHASES.flatMap(phase => phase.modes).find(mode => mode.id === 'ghost-align');
    try { localStorage.setItem('rl-training-selected-drill', selectedMechanic.id); } catch { }
    render('drill');
  }
  if (button.dataset.action === 'save') { button.textContent = 'Applied to this preview'; }
  if (['practice', 'freeplay'].includes(button.dataset.action)) {
    if (live && button.dataset.action === 'practice' && movementChoices[selectedMechanic.id]) { trainer.launch(selectedMechanic, { ...movementChoices[selectedMechanic.id] }); return; }
    if (live && button.dataset.action === 'practice' && selectedMechanic.id === 'ball-recovery') { trainer.launch(selectedMechanic, { masteryStep: recoveryMasteryStep, varied: recoveryVaried }); return; }
    if (live) { trainer.launch(button.dataset.action === 'practice' && selectedMechanic.available ? selectedMechanic : trainer.freeplay, button.dataset.action === 'practice' && selectedMechanic.id === 'ball-static' ? { masteryStep: staticMasteryStep, varied: staticVaried } : button.dataset.action === 'practice' && selectedMechanic.id === 'ball-soft' ? { masteryStep: softMasteryStep, varied: softVaried } : button.dataset.action === 'practice' && selectedMechanic.id === 'ball-roll-touch' ? { masteryStep: rollMasteryStep, varied: rollVaried } : button.dataset.action === 'practice' && selectedMechanic.needsDifficulty ? { difficulty: drillDifficulty } : undefined); return; }
    const dialog = document.createElement('dialog');
    dialog.innerHTML = '<h2>Design preview</h2><p>This study changes presentation only. Live training is available in the main app.</p><form method="dialog"><button class="primary">Back to preview</button></form>';
    document.body.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove());
  }
  if (button.closest('.settings-nav')) {
    document.querySelectorAll('.settings-nav button').forEach(item => item.classList.toggle('active', item === button));
    if (live) showSettingsSection(button.dataset.settingsTab);
    else document.querySelector('.settings-fields h2').textContent = `${button.textContent} preferences`;
  }
});
document.addEventListener('input', event => {
  const output = document.querySelector('#distance-value');
  if (event.target.type === 'range' && output) output.value = event.target.value;
});
document.addEventListener('change', async event => {
  if (event.target.matches('[data-movement-varied]')) {
    movementChoices[selectedMechanic.id].varied = event.target.checked;
    try { localStorage.setItem(`rl-${selectedMechanic.id}-varied`, String(event.target.checked)); } catch { }
    render('drill');
    return;
  }
  if (event.target.matches('[data-recovery-varied]')) {
    recoveryVaried = event.target.checked;
    try { localStorage.setItem('rl-recovery-varied', String(recoveryVaried)); } catch { }
    render('drill');
    return;
  }
  if (event.target.matches('[data-roll-varied]')) {
    rollVaried = event.target.checked;
    try { localStorage.setItem('rl-roll-varied', String(rollVaried)); } catch { }
    render('drill');
    return;
  }
  if (event.target.matches('[data-soft-varied]')) {
    softVaried = event.target.checked;
    try { localStorage.setItem('rl-soft-varied', String(softVaried)); } catch { }
    render('drill');
    return;
  }
  if (event.target.matches('[data-static-varied]')) {
    staticVaried = event.target.checked;
    try { localStorage.setItem('rl-static-varied', String(staticVaried)); } catch { }
    render('drill');
    return;
  }
  if (event.target.closest('.filter')) {
    if (selectedDesign) {
      const availability = content.querySelector('[aria-label="Filter drills"]').value;
      const tag = content.querySelector('[aria-label="Filter drill tags"]').value;
      document.querySelectorAll('.drill-card').forEach(item => {
        const ready = item.dataset.ready === 'true';
        const matchesAvailability = availability === 'ready' ? ready : availability === 'planned' ? !ready : true;
        item.hidden = !matchesAvailability || (tag !== 'all' && !item.dataset.tags.split('|').includes(tag));
      });
      content.querySelectorAll('.drill-specialist').forEach(group => {
        group.hidden = !group.querySelector('.drill-card:not([hidden])');
        if (tag !== 'all' && !group.hidden) group.open = true;
      });
      content.querySelectorAll('.drill-availability-group').forEach(group => {
        group.hidden = !group.querySelector('.drill-card:not([hidden])');
      });
      content.querySelector('.filter-empty')?.remove();
      if (!content.querySelector('.drill-card:not([hidden])')) {
        const empty = document.createElement('p');
        empty.className = 'filter-empty';
        empty.textContent = 'No drills match these filters.';
        content.querySelector('.selected-drills').append(empty);
      }
      return;
    }
    document.querySelectorAll('.category').forEach(item => {
      const ready = [2, 3].includes(Number(item.dataset.category));
      item.hidden = event.target.value === 'ready' ? !ready : event.target.value === 'planned' ? ready : false;
    });
  }
  if (event.target.getAttribute('aria-label') === 'Car body') await setCar(event.target.value.toLowerCase());
});

const host = document.querySelector('#scene');
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
camera.position.set(5, 3, 6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.enableZoom = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
scene.add(new THREE.HemisphereLight(0xffffff, 0x535353, 3));
const light = new THREE.DirectionalLight(0xffffff, 5);
light.position.set(3, 6, 5); scene.add(light);
const rim = new THREE.PointLight(styleOption?.tokens.accent ?? accent, 35, 15);
rim.position.set(-3, 2, -2); scene.add(rim);
const grid = new THREE.GridHelper(16, 24, styleOption?.tokens.accent ?? accent, document.body.classList.contains('light') ? 0xbabdb4 : 0x48504a);
grid.position.y = -0.65;
scene.add(grid);
const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 2), new THREE.MeshStandardMaterial({color:0xf1f1e8, roughness:0.4, metalness:0.2}));
ball.position.set(2.1, -0.15, -1.2); scene.add(ball);
let car;
let carRequest = 0;
const masteryVisual = new THREE.Group();
scene.add(masteryVisual);
const targetGate = new THREE.Group();
const targetMaterial = new THREE.MeshStandardMaterial({ color: 0x83cdec, emissive: 0x83cdec, emissiveIntensity: 0.35 });
for (const offset of [-1.1, 1.1]) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 8), targetMaterial);
  post.position.set(offset, 0.1, 0);
  targetGate.add(post);
}
const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.06), targetMaterial);
crossbar.position.y = 0.85;
targetGate.add(crossbar);
masteryVisual.add(targetGate);
const directionArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -0.6, 0), 4.6, 0x83cdec, 0.5, 0.3);
masteryVisual.add(directionArrow);
const contactRing = new THREE.Mesh(new THREE.RingGeometry(0.53, 0.59, 48), new THREE.MeshBasicMaterial({ color: 0x39ff14, side: THREE.DoubleSide }));
contactRing.rotation.x = -Math.PI / 2;
contactRing.position.y = -0.63;
masteryVisual.add(contactRing);
let visualKey = '';
let visualStarted = 0;
function updateMasteryVisual() {
  const soft = selectedMechanic.id === 'ball-soft';
  const roll = selectedMechanic.id === 'ball-roll-touch';
  const recovery = selectedMechanic.id === 'ball-recovery';
  const movement = movementChoices[selectedMechanic.id];
  const showing = live && activeView === 'drill' && (selectedMechanic.id === 'ball-static' || soft || roll || recovery || movement);
  const nextKey = showing ? movement ? `${selectedMechanic.id}-${movement.masteryStep}` : recovery ? `recovery-${recoveryMasteryStep}` : roll ? `roll-${rollMasteryStep}` : soft ? `soft-${softMasteryStep}` : `static-${staticMasteryStep}` : 'car';
  if (nextKey !== visualKey) {
    visualKey = nextKey;
    visualStarted = performance.now();
    controls.autoRotate = !showing;
    controls.enabled = !showing;
    camera.position.set(showing ? 9 : 5, showing ? 10 : 3, showing ? -12 : 6);
    controls.target.set(0, 0, showing ? 0.5 : 0);
  }
  masteryVisual.visible = showing;
  host.dataset.previewStep = showing ? movement ? MOVEMENT_TRAINING[selectedMechanic.id].steps[movement.masteryStep].title : recovery ? RECOVERY_MASTERY[recoveryMasteryStep].title : roll ? ROLL_TOUCH_MASTERY[rollMasteryStep].title : soft ? SOFT_TOUCH_MASTERY[softMasteryStep].title : STATIC_BALL_MASTERY[staticMasteryStep].title : '';
  if (!car) return;
  const rest = car.userData.menuRest;
  ball.visible = !showing || !movement && (!recovery || recoveryMasteryStep >= 3);
  if (!showing) {
    car.position.copy(rest.position);
    car.scale.copy(rest.scale);
    car.rotation.set(0, 0, 0);
    ball.position.set(2.1, -0.15, -1.2);
    return;
  }
  if (movement) {
    const phase = ((performance.now() - visualStarted) / 5000) % 1;
    const stage = movement.masteryStep;
    const driving = selectedMechanic.id === 'driving';
    const travel = Math.min(phase / 0.75, 1);
    const arc = driving ? 0 : Math.sin(Math.PI * travel) * (stage >= 2 ? 3.1 : stage === 1 ? 2.1 : 1.1);
    const turn = driving && [1, 4].includes(stage) ? Math.sin(Math.PI * travel) : 0;
    car.scale.copy(rest.scale).multiplyScalar(0.55);
    car.position.set(turn * 2 + (!driving && stage === 4 ? travel * 3 : 0), rest.groundY + arc, driving ? -4 + travel * 7 : stage === 3 ? -3 + travel * 5 : 0);
    car.rotation.set(!driving && stage === 3 ? travel * Math.PI * 2 : 0, turn * 0.6, !driving && stage === 4 ? travel * Math.PI * 2 : 0);
    targetGate.visible = driving;
    targetGate.position.set(0, 0, 3);
    targetGate.rotation.set(0, 0, 0);
    directionArrow.visible = driving || stage >= 3;
    directionArrow.setDirection(new THREE.Vector3(!driving && stage === 4 ? 1 : 0, 0, !driving && stage === 4 ? 0 : 1));
    contactRing.visible = false;
    host.dataset.previewPhase = phase.toFixed(3);
    return;
  }
  if (recovery) {
    const phase = ((performance.now() - visualStarted) / 6000) % 1;
    const approach = Math.min(phase / 0.4, 1);
    const landing = Math.min(Math.max((phase - 0.4) / 0.3, 0), 1);
    const exit = [2, 4].includes(recoveryMasteryStep) ? Math.max((phase - 0.75) / 0.25, 0) : 0;
    car.scale.copy(rest.scale).multiplyScalar(0.55);
    car.position.set(0, rest.groundY + 2 * (1 - landing), -4 + approach * 2.8 + exit * 2);
    car.rotation.set(0, 0, Math.PI / 2 * (1 - approach));
    ball.position.set(0, 1.8 - landing * 1.5, Math.max(phase - 0.4, 0) * 4);
    targetGate.visible = false;
    directionArrow.visible = [1, 2, 4].includes(recoveryMasteryStep);
    directionArrow.setDirection(new THREE.Vector3(0, 0, 1));
    contactRing.visible = recoveryMasteryStep >= 3 && phase >= 0.35 && phase <= 0.5;
    contactRing.position.set(0, -0.63, ball.position.z);
    host.dataset.previewPhase = phase.toFixed(3);
    return;
  }
  if (roll) {
    const phase = ((performance.now() - visualStarted) / 6000) % 1;
    const approach = Math.min(phase / 0.45, 1);
    const release = Math.min(Math.max((phase - 0.45) / 0.3, 0), 1);
    const landing = rollMasteryStep === 4 ? Math.min(Math.max((phase - 0.6) / 0.3, 0), 1) : 0;
    car.scale.copy(rest.scale).multiplyScalar(0.55);
    car.position.set(0, rest.groundY + 2 * (1 - landing), -4 + approach * 2.8 + release);
    car.rotation.set(0, 0, (rollMasteryStep === 0 ? Math.PI / 4 : Math.PI / 2) * (1 - approach));
    ball.position.set(0, 1.8 - landing * 1.5, release * (rollMasteryStep >= 3 ? 3 : 2));
    ball.rotation.x = release * 5;
    targetGate.visible = false;
    directionArrow.visible = rollMasteryStep >= 2;
    directionArrow.setDirection(new THREE.Vector3(0, 0, 1));
    contactRing.position.set(0, -0.63, ball.position.z);
    contactRing.visible = phase >= 0.4 && phase <= 0.6;
    host.dataset.previewPhase = phase.toFixed(3);
    return;
  }
  if (soft) {
    const phase = ((performance.now() - visualStarted) / 6000) % 1;
    const arrival = Math.min(phase / 0.45, 1);
    const settle = Math.min(Math.max((phase - 0.45) / 0.35, 0), 1);
    const angled = softMasteryStep >= 2;
    const side = angled ? 1 : 0;
    const nextTouch = softMasteryStep === 4 ? Math.min(Math.max((phase - 0.8) / 0.15, 0), 1) : 0;
    car.scale.copy(rest.scale).multiplyScalar(0.55);
    car.position.set(side * settle * 0.5, rest.groundY, -1.35 + (softMasteryStep >= 1 ? settle * 0.6 : 0));
    car.rotation.set(0, angled ? 0.35 : 0, 0);
    ball.position.set(softMasteryStep === 3 ? (1 - arrival) * -2 + settle : side * settle, -0.19, 4.6 * (1 - arrival) + settle * 0.65 + nextTouch * 1.2);
    ball.rotation.x = arrival * -10 + settle;
    targetGate.visible = softMasteryStep === 2;
    targetGate.position.set(1, 0, 0.9);
    targetGate.rotation.y = 0.65;
    directionArrow.visible = angled;
    directionArrow.setDirection(new THREE.Vector3(side, 0, 1).normalize());
    contactRing.position.set(ball.position.x, contactRing.position.y, ball.position.z);
    contactRing.visible = phase >= 0.4 && phase <= 0.6 || nextTouch > 0;
    host.dataset.previewPhase = phase.toFixed(3);
    return;
  }
  const angled = staticMasteryStep >= 2;
  const direction = new THREE.Vector3(angled ? 0.38 : 0, 0, 1).normalize();
  const duration = staticMasteryStep >= 3 ? 4 : 6;
  const phase = ((performance.now() - visualStarted) / 1000 % duration) / duration;
  const approach = Math.min(phase / 0.45, 1);
  const travel = Math.min(Math.max((phase - 0.45) / 0.35, 0), 1) * (angled ? 4.6 : 2.1);
  const follow = staticMasteryStep === 4 ? travel * 0.8 : Math.min(travel * 0.15, 0.3);
  car.scale.copy(rest.scale).multiplyScalar(0.55);
  car.position.set(-direction.x * (4.2 - approach * 2.85 - follow), rest.groundY, -direction.z * (4.2 - approach * 2.85 - follow));
  car.rotation.set(0, Math.atan2(direction.x, direction.z), 0);
  ball.position.set(direction.x * travel, -0.19, direction.z * travel);
  ball.rotation.x = travel / 0.46;
  targetGate.visible = angled;
  targetGate.position.copy(direction).multiplyScalar(4.6);
  targetGate.rotation.y = Math.atan2(direction.x, direction.z);
  directionArrow.visible = staticMasteryStep >= 1;
  directionArrow.setDirection(direction);
  contactRing.position.x = ball.position.x;
  contactRing.position.z = ball.position.z;
  contactRing.visible = phase < 0.55;
  host.dataset.previewPhase = phase.toFixed(3);
}
async function setCar(id) {
  const request = ++carRequest;
  await preloadCars([id]);
  if (request !== carRequest) return;
  const model = id === 'classic' ? createCar() : cloneGlbCar(id);
  if (id === 'classic') {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(3.2 / size.z);
    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    model.position.sub(center);
  }
  if (!model) { document.querySelector('.asset-status').textContent = 'Car preview unavailable'; return; }
  const bounds = new THREE.Box3().setFromObject(model);
  model.userData.menuRest = { position: model.position.clone(), scale: model.scale.clone(), groundY: -0.65 - (bounds.min.y - model.position.y) * 0.55 };
  if (car) scene.remove(car);
  car = model; scene.add(car);
  document.querySelector('.asset-status').hidden = true;
  host.dataset.loaded = 'true';
  resizeScene();
}
setCar(live ? trainer.car().id : 'octane').then(() => resizeScene());
function resizeScene() {
  updateMasteryVisual();
  if (selectedDesign && activeView === 'home') {
    const intro = content.querySelector('.home-intro');
    host.style.top = innerWidth <= 760 && intro ? `${intro.getBoundingClientRect().bottom + scrollY}px` : '';
  } else host.style.top = '';
  camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
  controls.update();
  renderer.render(scene, camera);
}
resizeScene();
window.addEventListener('resize', resizeScene);
new ResizeObserver(resizeScene).observe(host);
let previewCarId = live ? trainer.car().id : 'octane';
renderer.setAnimationLoop(() => {
  if (live && menuRoot.hidden) return;
  host.hidden = false;
  const wantedCarId = live ? activeView === 'locker' ? lockerCarId : trainer.car().id : previewCarId;
  if (previewCarId !== wantedCarId) { previewCarId = wantedCarId; setCar(previewCarId); }
  updateMasteryVisual();
  controls.update();
  if (car && !masteryVisual.visible && ['orbit', 'festival'].includes(layout)) car.rotation.z = Math.sin(performance.now() / 2400) * 0.12;
  renderer.render(scene, camera);
});
