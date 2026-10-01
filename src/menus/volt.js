import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { preloadCars, cloneGlbCar } from '../shared/carAssets.js';
import { createCar } from '../shared/car.js';
import './preview.css';
import './themes.css';
import { homeLayout, arrangeCatalogue } from './layouts.js';
import './layouts.css';
import { PHASES } from '../modes/catalog.js';
import './selected.css';
import { styleOptions } from './style-options.js';
import './style-options.css';
import './live.css';

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
    selectedMechanic = PHASES.flatMap(phase => phase.modes).find(mode => mode.id === selectedId) || trainer.lastDrill() || selectedMechanic;
  } catch { }
  selectedBranch = PHASES.findIndex(phase => phase.modes.some(mode => mode.id === selectedMechanic.id));
}
if (live) {
  menuRoot.querySelector('.preview-bar').remove();
  menuRoot.querySelector('nav').setAttribute('aria-label', 'Main menu');
  const lockerTab = document.createElement('button');
  lockerTab.type = 'button';
  lockerTab.dataset.view = 'locker';
  lockerTab.textContent = 'Locker';
  menuRoot.querySelector('.site-header nav').append(lockerTab);
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
  controls: ['Sensitivity', 'Deadzones', 'Camera Behaviour'],
  bindings: ['Key Bindings', 'Controller Axes'],
  camera: ['Presets', 'Framing', 'Position', 'Motion'],
  loadout: ['Car Body'],
};

function showSettingsSection(tab) {
  settingsObserver?.disconnect();
  trainer.parkSettings();
  const fields = content.querySelector('.settings-fields');
  trainer.settings(fields, tab);
  settingsGroup = 0;
  const groupNav = content.querySelector('.settings-group-nav');
  groupNav.innerHTML = settingsGroups[tab].map((label, index) => `<button type="button" data-settings-group="${index}">${label}<span>&rarr;</span></button>`).join('');
  content.querySelector('.settings-section-heading').textContent = tab[0].toUpperCase() + tab.slice(1);
  const applyGroup = () => {
    content.querySelector('.settings-group-heading').textContent = settingsGroups[tab][settingsGroup];
    groupNav.querySelectorAll('button').forEach((button, index) => button.setAttribute('aria-pressed', String(index === settingsGroup)));
    fields.querySelectorAll('#control-options > .bind-row,#camera-list > .bind-row').forEach(row => {
      const id = row.querySelector('input')?.id || '';
      const label = row.querySelector('.bind-label')?.textContent.toLowerCase() || '';
      let group;
      if (tab === 'controls') group = label.includes('sensitivity') ? 0 : label.includes('deadzone') ? 1 : 2;
      else group = row.querySelector('#camera-preset') ? 0 : /-(fov|distance)$/.test(id) ? 1 : /-(height|angle)$/.test(id) ? 2 : 3;
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

function render(view) {
  settingsObserver?.disconnect();
  if (selectedDesign && view === 'drill') {
    selectedBranch = PHASES.findIndex(phase => phase.modes.some(mode => mode.id === selectedMechanic.id));
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
    const themeIndex = { home: 0, training: 3, drill: 2, settings: 13, locker: 13 }[view];
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
      content.querySelector('[data-action="practice"]').innerHTML = `${selectedMechanic.available ? 'Start practice' : 'Open Free Play'} <span>&rarr;</span>`;
      const details = content.querySelectorAll('.session-panel dd');
      details[0].textContent = car.name;
      details[1].textContent = 'Standard soccar';
      details[2].textContent = selectedMechanic.available ? 'Dedicated drill' : 'Open practice';
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
  hide: () => { menuRoot.hidden = true; document.body.classList.remove('live-menu-open'); document.querySelector('#scene').hidden = true; },
  active: () => menuRoot.hidden ? null : menuRoot,
  back: () => render(activeView === 'drill' ? 'training' : 'home'),
  drill: () => render('drill'),
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (live && (!menuRoot.contains(button) || button.closest('#panel-controls,#panel-camera,#locker-list'))) return;
  if (button.dataset.view) render(button.dataset.view);
  if (selectedDesign && button.dataset.branch !== undefined) {
    selectedBranch = Number(button.dataset.branch);
    render('training');
    return;
  }
  if (selectedDesign && button.dataset.mechanic !== undefined) {
    selectedMechanic = PHASES[selectedBranch].modes[Number(button.dataset.mechanic)];
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
  if (live && button.dataset.action === 'continue') trainer.launch(trainer.lastDrill() || selectedMechanic);
  if (live && button.dataset.action === 'recommended-drill') {
    selectedMechanic = trainer.lastDrill() || PHASES.flatMap(phase => phase.modes).find(mode => mode.id === 'ghost-align');
    try { localStorage.setItem('rl-training-selected-drill', selectedMechanic.id); } catch { }
    render('drill');
  }
  if (button.dataset.action === 'save') { button.textContent = 'Applied to this preview'; }
  if (['practice', 'freeplay'].includes(button.dataset.action)) {
    if (live) { trainer.launch(button.dataset.action === 'practice' && selectedMechanic.available ? selectedMechanic : trainer.freeplay); return; }
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
  if (car) scene.remove(car);
  car = model; scene.add(car);
  document.querySelector('.asset-status').hidden = true;
  host.dataset.loaded = 'true';
  resizeScene();
}
setCar(live ? trainer.car().id : 'octane').then(() => resizeScene());
function resizeScene() {
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
  controls.update();
  if (car && ['orbit', 'festival'].includes(layout)) car.rotation.z = Math.sin(performance.now() / 2400) * 0.12;
  renderer.render(scene, camera);
});
