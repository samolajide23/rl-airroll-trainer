import * as THREE from 'three';
import { cloneGlbCar, preloadCars } from '../src/shared/carAssets.js';

const layouts = ['Side Rail', 'Top Tabs', 'Split Console', 'Accordion', 'Comparison Matrix', 'Master Detail', 'Bottom Dock', 'Workbench', 'Horizontal Lanes', 'Compact Inspector'];
const sections = ['Controls', 'Bindings', 'Camera', 'Loadout'];
const defaults = { steering: 1, aerial: 1, deadzone: .1, dodge: .5, ballcam: 'Toggle', distance: 270, height: 100, angle: -4, fov: 110, stiffness: .5, shake: false, car: 'octane', preset: 'Default' };
const values = { ...defaults };
const bindings = { 'Drive Forward': 'W', 'Drive Backwards': 'S', 'Steer Left': 'A', 'Steer Right': 'D', Jump: 'Space', Boost: 'Shift', 'Air Roll Left': 'Q', 'Air Roll Right': 'E' };
const originalBindings = { ...bindings };
let selected = Math.max(1, Math.min(10, Number(new URLSearchParams(location.search).get('layout')) || 1));
let section = 'Controls';
let focusedGroup = 'Sensitivity';
let listening = null;
let renderer;
let scene;
let camera;
let carMesh;
let assetRequest = 0;
const preview = document.querySelector('#preview');

const range = (key, label, min, max, step) => `<label class="field"><span>${label}</span><div class="value-control"><input aria-label="${label}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${values[key]}"><output>${values[key]}</output></div></label>`;
const select = (key, label, options) => `<label class="field"><span>${label}</span><select aria-label="${label}" data-key="${key}">${options.map(option => `<option ${values[key] === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label>`;
const toggle = (key, label) => `<label class="field"><span>${label}</span><input aria-label="${label}" data-key="${key}" type="checkbox" ${values[key] ? 'checked' : ''}></label>`;

function groups() {
  if (section === 'Controls') return [
    ['Sensitivity', range('steering', 'Steering sensitivity', .1, 2, .05) + range('aerial', 'Aerial sensitivity', .1, 2, .05)],
    ['Deadzones', range('deadzone', 'Controller deadzone', 0, .5, .01) + range('dodge', 'Dodge deadzone', 0, 1, .01)],
    ['Camera Behaviour', select('ballcam', 'Ball camera mode', ['Toggle', 'Hold'])],
  ];
  if (section === 'Camera') return [
    ['Framing', range('fov', 'Field of view', 60, 110, 1) + range('distance', 'Distance', 100, 400, 10)],
    ['Position', range('height', 'Height', 40, 200, 10) + range('angle', 'Angle', -15, 0, 1)],
    ['Motion', range('stiffness', 'Stiffness', 0, 1, .05) + toggle('shake', 'Camera shake')],
  ];
  if (section === 'Bindings') return [
    ['Preset', select('preset', 'Control preset', ['Default', 'Custom'])],
    ['Keyboard / Mouse', `<div class="bind-heading"><span>Action</span><span>Binding</span></div>${Object.entries(bindings).map(([action, key]) => `<div class="binding field"><span>${action}</span><div class="bind-controls"><button class="bind" data-bind="${action}">${listening === action ? 'Press key...' : key || 'Unbound'}</button><button class="clear" data-clear="${action}" title="Clear ${action}" aria-label="Clear ${action}" ${!key ? 'disabled' : ''}>&times;</button></div></div>`).join('')}`],
  ];
  return [
    ['Car Body', `<div class="car-scene" aria-label="Selected car preview"></div><div class="car-choices">${['octane', 'fennec', 'dominus'].map(car => `<button data-car="${car}" aria-pressed="${values.car === car}">${car}</button>`).join('')}</div>`],
    ['Equipped', `<dl><div><dt>Body</dt><dd>${values.car}</dd></div><div><dt>Arena</dt><dd>Standard soccar</dd></div><div><dt>Profile</dt><dd>Training</dd></div></dl>`],
  ];
}

function nav() {
  return `<nav class="section-nav" aria-label="Settings sections">${sections.map((name, index) => `<button data-section="${name}" aria-pressed="${section === name}"><small>0${index + 1}</small><span>${name}</span></button>`).join('')}</nav>`;
}

function render() {
  listening = null;
  document.title = `${selected.toString().padStart(2, '0')} ${layouts[selected - 1]} | AIRLAB Settings`;
  document.querySelector('#options').innerHTML = layouts.map((name, index) => `<button data-layout="${index + 1}" aria-pressed="${selected === index + 1}"><b>${String(index + 1).padStart(2, '0')}</b>${name}</button>`).join('');
  const entries = groups();
  if (!entries.some(([name]) => name === focusedGroup)) focusedGroup = entries[0][0];
  const groupMarkup = entries.map(([name, fields], index) => selected === 4
    ? `<details class="group" open><summary><small>0${index + 1}</small>${name}</summary><div class="group-body">${fields}</div></details>`
    : `<section class="group" data-group="${name}" ${selected === 6 && name !== focusedGroup ? 'hidden' : ''}><h2><small>0${index + 1}</small>${name}</h2><div class="group-body">${fields}</div></section>`).join('');
  preview.className = `layout layout-${selected}`;
  preview.innerHTML = `<div class="app-header"><a class="brand" href="/">AIR<span>LAB</span><small>ROCKET LEAGUE TRAINING</small></a><span class="app-location">SETTINGS</span><span class="profile">TRAINING PROFILE <b>01</b></span></div>
    <div class="page-title"><div><span class="eyebrow">${String(selected).padStart(2, '0')} / ${layouts[selected - 1]}</span><h1>YOUR SETUP.</h1></div><button class="reset" data-reset>Reset defaults</button></div>
    <div class="settings-workspace">${nav()}<div class="settings-content"><header class="content-heading"><h2>${section}</h2><span class="status">SANDBOX PROFILE</span></header>${selected === 6 ? `<nav class="group-nav" aria-label="Setting groups">${entries.map(([name]) => `<button data-group-select="${name}" aria-pressed="${name === focusedGroup}">${name}<span>&rarr;</span></button>`).join('')}</nav>` : ''}<div class="groups">${groupMarkup}</div></div>${[3, 8, 10].includes(selected) ? `<aside class="inspector"><span class="eyebrow">ACTIVE PROFILE</span><h2>${section === 'Loadout' ? values.car : 'PLAYER ONE'}</h2><div class="signal"><span></span><span></span><span></span><span></span><span></span></div><dl><div><dt>Steering</dt><dd data-stat="steering">${values.steering}</dd></div><div><dt>Aerial</dt><dd data-stat="aerial">${values.aerial}</dd></div><div><dt>Deadzone</dt><dd data-stat="deadzone">${values.deadzone}</dd></div><div><dt>Ball camera</dt><dd data-stat="ballcam">${values.ballcam}</dd></div></dl><span class="inspector-foot">VOLT / TRAINING</span></aside>` : ''}</div>
    <footer class="app-footer"><span>TRAIN WITH INTENT.</span><span>VOLT</span><span>${String(selected).padStart(2, '0')} / ${layouts[selected - 1].toUpperCase()}</span></footer>`;
  if (section === 'Loadout') mountCar();
}

async function mountCar() {
  const request = ++assetRequest;
  const host = document.querySelector('.car-scene');
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x83cdec, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(3, 5, 4);
    scene.add(light);
    camera = new THREE.PerspectiveCamera(36, 1, .01, 100);
    renderer.setAnimationLoop(() => {
      if (!renderer.domElement.isConnected) return;
      const width = renderer.domElement.parentElement.clientWidth;
      renderer.setSize(width, 230, false);
      camera.aspect = width / 230;
      camera.updateProjectionMatrix();
      if (carMesh) carMesh.rotation.y += .003;
      renderer.render(scene, camera);
    });
  }
  host.append(renderer.domElement);
  try {
    const selectedCar = values.car;
    await preloadCars([selectedCar]);
    const mesh = cloneGlbCar(selectedCar);
    if (!mesh) throw new Error('Car asset unavailable');
    if (request !== assetRequest || !host.isConnected) return;
    if (carMesh) scene.remove(carMesh);
    carMesh = mesh;
    const bounds = new THREE.Box3().setFromObject(mesh);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3()).length();
    mesh.position.sub(center);
    scene.add(mesh);
    camera.position.set(size, size * .65, size);
    camera.lookAt(0, 0, 0);
  } catch { host.textContent = 'Car preview unavailable'; }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.layout) {
    selected = Number(button.dataset.layout);
    history.replaceState(null, '', `?layout=${selected}`);
    render();
  } else if (button.dataset.section) { section = button.dataset.section; render(); }
  else if (button.dataset.groupSelect) { focusedGroup = button.dataset.groupSelect; render(); }
  else if (button.dataset.car) { values.car = button.dataset.car; render(); }
  else if (button.hasAttribute('data-reset')) { Object.assign(values, defaults); Object.assign(bindings, originalBindings); render(); }
  else if (button.dataset.clear) { bindings[button.dataset.clear] = ''; render(); }
  else if (button.dataset.bind) { listening = button.dataset.bind; button.textContent = 'Press key...'; button.classList.add('listening'); }
});
document.addEventListener('input', event => {
  const input = event.target;
  if (!input.dataset.key) return;
  values[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
  const output = input.parentElement.querySelector('output');
  if (output) output.value = input.value;
  const stat = document.querySelector(`[data-stat="${input.dataset.key}"]`);
  if (stat) stat.textContent = input.value;
});
document.addEventListener('keydown', event => {
  if (!listening) return;
  event.preventDefault();
  if (event.code !== 'Escape') bindings[listening] = ['Backspace', 'Delete'].includes(event.code) ? '' : event.code.replace('Key', '').replace('Digit', '');
  render();
});
render();