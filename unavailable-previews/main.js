import { PHASES } from '../src/modes/catalog.js';

const options = [
  ['Quiet Label', 'label'], ['Red Corner', 'corner'], ['Locked Artwork', 'lock'],
  ['Diagonal Stamp', 'stamp'], ['Fine Full Cross', 'fine-x'], ['Artwork Cross', 'art-x'],
  ['Outline Cross', 'outline-x'], ['Broken Cross', 'broken-x'], ['Hazard Footer', 'hazard'],
  ['Left Signal', 'rail'], ['Ghost Card', 'ghost'], ['Blueprint', 'blueprint'],
  ['Restricted Band', 'band'], ['Corner Brackets', 'brackets'], ['Unavailable Seal', 'seal'],
  ['Muted Slash', 'slash'], ['Paused', 'pause'], ['Red Title', 'title'],
  ['Status Window', 'window'], ['Shutter', 'shutter'], ['Dashed Boundary', 'dashed'],
  ['Not Yet', 'not-yet'], ['Cut Corner', 'cut'], ['Offline Signal', 'offline'],
  ['Minimal Cross', 'minimal'],
];
const planned = PHASES.flatMap(phase => phase.modes).filter(mode => !mode.available);
const sample = document.querySelector('#sample');
const gallery = document.querySelector('#gallery');
const selected = new Set();
const escape = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
sample.innerHTML = planned.map(mode => `<option value="${escape(mode.id)}">${escape(mode.title)}</option>`).join('');
const cross = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M10 10 90 90 M90 10 10 90"/></svg>`;
const lock = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3 M12 14v3"/></svg>`;

function render() {
  const mode = planned.find(entry => entry.id === sample.value) || planned[0];
  gallery.innerHTML = options.map(([name, treatment], index) => {
    const number = index + 1;
    return `<section class="option" ${document.querySelector('#shortlist').checked && !selected.has(number) ? 'hidden' : ''}>
      <header><h2><span>${String(number).padStart(2, '0')}</span> ${name}</h2><label class="pick"><input type="checkbox" data-pick="${number}" ${selected.has(number) ? 'checked' : ''} aria-label="Shortlist option ${number}"></label></header>
      <article class="drill-card" data-treatment="${treatment}" aria-label="${escape(mode.title)}: unavailable">
        <span class="card-number">01</span>
        <div class="art"><i></i><b>${escape(mode.title.split(' ').map(word => word[0]).join(''))}</b></div>
        <div class="copy"><h3>${escape(mode.title)}</h3><small>${escape(mode.level || 'Intermediate')}</small><p>${escape(mode.description)}</p></div>
        <footer><span>Unavailable</span><span aria-hidden="true">&rarr;</span></footer>
        <div class="mark" aria-hidden="true">${cross}</div>
        <div class="lock" aria-hidden="true">${lock}</div>
        <span class="badge" aria-hidden="true">${treatment === 'not-yet' ? 'NOT YET' : treatment === 'offline' ? 'OFFLINE' : 'UNAVAILABLE'}</span>
      </article>
    </section>`;
  }).join('');
  document.querySelector('#count').textContent = document.querySelector('#shortlist').checked ? `${selected.size} shortlisted` : '25 options';
}
sample.addEventListener('change', render);
document.querySelector('#shortlist').addEventListener('change', render);
gallery.addEventListener('change', event => {
  const number = Number(event.target.dataset.pick);
  if (!number) return;
  if (event.target.checked) selected.add(number); else selected.delete(number);
  render();
});
render();