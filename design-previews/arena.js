import { createIcons, icons } from 'lucide';

const concepts = ['Volt Lineup', 'Category Tabs', 'Command Rail', 'Match Ledger', 'Open Playbook', 'Three Lanes', 'Spotlight', 'Quick Select', 'Match Builder', 'Broadcast Strips'];
const categories = [
  { name: 'AIRLAB Originals', modes: ['boost-heist', 'airborne', 'hot-potato', 'bankshot', 'last-car-flying'] },
  { name: 'Classic', modes: ['soccar', 'hoops', 'dropshot', 'snowday', 'rumble', 'heatseeker'] },
  { name: 'Solo Challenges', modes: ['rift-rally', 'combo-rush'] },
];
const modes = [
  ['boost-heist', 'Boost Heist', 'flag', 'Capture the battery. Carrying drains boost.'],
  ['airborne', 'Airborne', 'wind', 'Hazardous floor. Stay airborne to survive.'],
  ['hot-potato', 'Hot Potato', 'timer', 'Pass the ticking ball. Last touch owns the countdown.'],
  ['bankshot', 'Bankshot', 'goal', 'Only wall and ceiling bank shots count.'],
  ['last-car-flying', 'Last Car Flying', 'zap', 'Disappearing platforms. Last car standing.'],
  ['soccar', 'Soccar', 'goal', 'Two goals. Standard ball and gravity.'],
  ['hoops', 'Hoops', 'circle-dot', 'Basket goals. Take it above the rim.'],
  ['dropshot', 'Dropshot', 'hexagon', 'Charge the ball and break the floor.'],
  ['snowday', 'Snow Day', 'snowflake', 'Hockey puck. Keep it low on the ice.'],
  ['rumble', 'Rumble', 'zap', 'Random power-ups. Unpredictable plays.'],
  ['heatseeker', 'Heatseeker', 'flame', 'Goal-seeking ball. Rising rally speed.'],
  ['rift-rally', 'Rift Rally', 'route', 'Changing aerial gates. Timed race.'],
  ['combo-rush', 'Combo Rush', 'trophy', 'Timed score attack. Chain touches and recoveries.'],
].map(([id, name, icon, rule]) => ({ id, name, icon, rule }));
const formats = ['1v1', '2v2', '3v3', '4v4', 'Solo'];
const preview = document.querySelector('#preview');
let concept = Math.min(10, Math.max(1, Number(new URLSearchParams(location.search).get('design')) || 1));
let selected = 'boost-heist';
let category = 0;
let format = '2v2';
let step = 0;
let shortlist;
try { shortlist = JSON.parse(localStorage.getItem('airlab-arena-concepts') || '[]'); } catch { shortlist = []; }
if (!Array.isArray(shortlist)) shortlist = [];
const icon = name => `<i data-lucide="${name}"></i>`;
const isSolo = id => categories[2].modes.includes(id);
const status = id => id === 'soccar' ? 'Solo available' : 'Coming soon';

function modeButton(mode) {
  return `<button class="mode" data-mode="${mode.id}" aria-pressed="${selected === mode.id}"><canvas width="320" height="140" data-art="${mode.id}" aria-hidden="true"></canvas><span class="mode-body"><span class="mode-title">${icon(mode.icon)}<strong>${mode.name}</strong></span><span class="rule">${mode.rule}</span><small>${status(mode.id)}</small></span>${icon('arrow-up-right')}</button>`;
}

function group(index) {
  const entry = categories[index];
  return `<section class="mode-section" aria-label="${entry.name}"><header><h2>${entry.name}</h2><span>${entry.modes.length} MODES</span></header><div class="mode-grid">${entry.modes.map(id => modeButton(modes.find(mode => mode.id === id))).join('')}</div></section>`;
}

function categoryNav() {
  return `<nav class="categories" aria-label="Mode category">${categories.map((entry, index) => `<button data-category="${index}" aria-pressed="${index === category}"><span>0${index + 1}</span>${entry.name}<small>${entry.modes.length}</small></button>`).join('')}</nav>`;
}

function formatControls() {
  return isSolo(selected) ? '<p class="solo-label">SOLO CHALLENGE / 1 PLAYER</p>' : `<div class="format-control"><h3>Match format</h3><div class="formats" role="group" aria-label="Match format">${formats.map(value => `<button data-format="${value}" aria-pressed="${value === format}">${value}</button>`).join('')}</div></div>`;
}

function matchDetails() {
  const mode = modes.find(entry => entry.id === selected);
  const solo = isSolo(selected);
  const ready = selected === 'soccar' && format === 'Solo';
  return `<aside class="match" aria-label="Selected match"><p class="eyebrow">YOUR SESSION</p><h2>${mode.name}</h2><p>${mode.rule}</p>${formatControls()}<dl><div><dt>Players</dt><dd>${solo || format === 'Solo' ? '1' : Number(format[0]) * 2}</dd></div><div><dt>Status</dt><dd>${ready ? 'Ready to play' : 'Coming soon'}</dd></div></dl>${ready ? `<a class="launch" href="/">${icon('play')}Open trainer</a>` : `<button class="launch" disabled>${icon('lock-keyhole')}Coming soon</button>`}<a class="solo-link" href="/">${icon('arrow-left')}Solo arena in trainer</a></aside>`;
}

function render() {
  document.body.dataset.concept = concept;
  document.title = `${concept}. ${concepts[concept - 1]} | AIRLAB Arena Studies`;
  const url = new URL(location.href);
  url.searchParams.set('design', concept);
  history.replaceState(null, '', url);
  document.querySelector('#concept').innerHTML = concepts.map((name, index) => `<option value="${index + 1}" ${concept === index + 1 ? 'selected' : ''}>${String(index + 1).padStart(2, '0')} / ${name}</option>`).join('');
  document.querySelector('#shortlist').setAttribute('aria-pressed', shortlist.includes(concept));
  document.querySelector('#shortlist span').textContent = shortlist.includes(concept) ? 'Shortlisted' : 'Shortlist';
  document.querySelector('#comparison').innerHTML = concepts.map((name, index) => `<a href="?design=${index + 1}" data-design="${index + 1}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${name}</strong>${shortlist.includes(index + 1) ? icon('star') : icon('arrow-up-right')}</a>`).join('');
  let library = categories.map((entry, index) => group(index)).join('');
  if ([2, 3, 8].includes(concept)) library = categoryNav() + group(category);
  if (concept === 4) library = `<table><thead><tr><th>Mode</th><th>Rules</th><th>Availability</th><th></th></tr></thead>${categories.map(entry => `<tbody><tr class="table-category"><th colspan="4">${entry.name}</th></tr>${entry.modes.map(id => { const mode = modes.find(value => value.id === id); return `<tr data-selected="${id === selected}"><td><button data-mode="${id}" aria-pressed="${id === selected}">${icon(mode.icon)}${mode.name}</button></td><td>${mode.rule}</td><td>${status(id)}</td><td>${icon('chevron-right')}</td></tr>`; }).join('')}</tbody>`).join('')}</table>`;
  if (concept === 5) library = categories.map((entry, index) => `<details ${index === category ? 'open' : ''}><summary>${entry.name}<span>${entry.modes.length} modes</span></summary>${group(index)}</details>`).join('');
  if (concept === 7) library = `<div class="spotlight">${modeButton(modes.find(mode => mode.id === selected))}</div>${categoryNav()}${group(category)}`;
  if (concept === 9) library = `<nav class="steps" aria-label="Match setup"><button data-step="0" aria-pressed="${step === 0}">01 / Choose a collection</button><button data-step="1" aria-pressed="${step === 1}">02 / Choose a mode</button></nav>${step === 0 ? `<div class="collections">${categories.map((entry, index) => `<button data-collection="${index}"><span>0${index + 1}</span><h2>${entry.name}</h2><p>${entry.modes.length} modes</p>${icon('arrow-right')}</button>`).join('')}</div>` : categoryNav() + group(category)}`;
  preview.innerHTML = `<header class="app-header"><a class="brand" href="/">AIR<span>LAB</span></a><nav aria-label="Trainer navigation"><a href="/">Home</a><strong>Arena</strong><a href="/">Training</a></nav><span class="profile">CLASSIC / SHARED PROFILE</span></header><header class="page-title"><div><p class="eyebrow">PLAY / COMPETE / EXPERIMENT</p><h1>ARENA.</h1></div><div class="concept-label"><span>${String(concept).padStart(2, '0')}</span><strong>${concepts[concept - 1]}</strong></div></header><div class="workspace"><div class="library">${library}</div>${matchDetails()}</div><footer>TRAIN WITH INTENT.<span>AIRLAB / ARENA</span></footer>`;
  createIcons({ icons });
  drawArtwork();
}

function drawArtwork() {
  const styles = getComputedStyle(document.body);
  const accent = styles.getPropertyValue('--accent').trim();
  const secondary = styles.getPropertyValue('--secondary').trim();
  for (const canvas of preview.querySelectorAll('canvas')) {
    const context = canvas.getContext('2d');
    const modeIndex = modes.findIndex(mode => mode.id === canvas.dataset.art);
    context.clearRect(0, 0, 320, 140);
    context.strokeStyle = secondary;
    context.lineWidth = 2;
    context.globalAlpha = 0.45;
    context.strokeRect(24, 18, 272, 104);
    context.beginPath();
    context.moveTo(160, 18); context.lineTo(160, 122);
    context.arc(160, 70, 26, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
    context.strokeStyle = accent;
    context.setLineDash([6, 6]);
    context.beginPath();
    context.moveTo(40, 105);
    context.bezierCurveTo(100, 20 + modeIndex * 3, 220, 115 - modeIndex * 5, 277, 35);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = accent;
    context.beginPath(); context.arc(100 + modeIndex * 11, 60 + modeIndex % 3 * 12, 7, 0, Math.PI * 2); context.fill();
    context.fillStyle = secondary;
    context.fillRect(38, 99, 16, 9);
    context.strokeRect(273, 30, 13, 26);
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button, a[data-design]');
  if (!button) return;
  if (button.dataset.mode) { selected = button.dataset.mode; category = categories.findIndex(entry => entry.modes.includes(selected)); }
  else if (button.dataset.format) format = button.dataset.format;
  else if (button.dataset.category) category = Number(button.dataset.category);
  else if (button.dataset.collection) { category = Number(button.dataset.collection); step = 1; }
  else if (button.dataset.step) step = Number(button.dataset.step);
  else if (button.dataset.design) { event.preventDefault(); concept = Number(button.dataset.design); }
  else if (button.id === 'previous') concept = concept === 1 ? 10 : concept - 1;
  else if (button.id === 'next') concept = concept === 10 ? 1 : concept + 1;
  else if (button.id === 'overview') { document.querySelector('#comparison').hidden = !document.querySelector('#comparison').hidden; return; }
  else if (button.id === 'shortlist') { shortlist = shortlist.includes(concept) ? shortlist.filter(value => value !== concept) : [...shortlist, concept]; try { localStorage.setItem('airlab-arena-concepts', JSON.stringify(shortlist)); } catch { } }
  else return;
  const focusSelector = button.dataset.mode ? `[data-mode="${selected}"]` : button.dataset.format ? `[data-format="${format}"]` : button.id ? `#${button.id}` : null;
  render();
  if (focusSelector) document.querySelector(focusSelector)?.focus({ preventScroll: true });
});
document.querySelector('#concept').addEventListener('change', event => { concept = Number(event.target.value); render(); });
render();