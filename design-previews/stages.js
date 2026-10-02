import { createIcons, ChevronLeft, ChevronRight, LayoutGrid, Check, ChevronDown, ChevronUp } from "lucide";
import { MOVEMENT_TRAINING } from "../src/shared/movementTraining.js";

const layouts = ["Line List", "Progress Spine", "Step Ribbon", "Compact Drawer", "Stage Grid", "Number Strip", "Split Focus", "Tab Stack"];
const stages = MOVEMENT_TRAINING.driving.steps;
const icons = { ChevronLeft, ChevronRight, LayoutGrid, Check, ChevronDown, ChevronUp };
const selector = document.querySelector("#stage-selector");
const layoutSelect = document.querySelector("#layout");
let layout = 0;
let stage = 1;
let expanded = false;
let chosen = Number(localStorage.getItem("airlab-stage-layout-study") ?? -1);

layouts.forEach((name, index) => layoutSelect.add(new Option(`${index + 1}. ${name}`, index)));

function stageButton(index, numbersOnly = false) {
  return `<button class="stage" data-stage="${index}" ${index === stage ? 'aria-current="step"' : ""} title="${stages[index].title}"><span class="number">${index + 1}</span>${numbersOnly ? "" : `<span class="title">${stages[index].title}</span>`}</button>`;
}

function render() {
  layoutSelect.value = layout;
  selector.className = `stage-selector layout-${layout + 1}`;
  const heading = `<header><strong>STAGES</strong><small>[ Previous / ] Next</small></header>`;
  const buttons = stages.map((_, index) => stageButton(index)).join("");
  const numbers = stages.map((_, index) => stageButton(index, true)).join("");
  const current = `<div class="current"><span>${stage + 1} / ${stages.length}</span><strong>${stages[stage].title}</strong></div>`;
  if (layout === 3) {
    selector.innerHTML = `${heading}<div class="drawer-row">${current}<button class="icon" data-expand title="${expanded ? "Collapse stages" : "Expand stages"}" aria-label="${expanded ? "Collapse stages" : "Expand stages"}" aria-expanded="${expanded}"><i data-lucide="${expanded ? "chevron-up" : "chevron-down"}"></i></button></div><div class="entries" ${expanded ? "" : "hidden"}>${buttons}</div><div class="quick-nav"><button class="icon" data-cycle="-1" title="Previous stage" aria-label="Previous stage"><i data-lucide="chevron-left"></i></button><button class="icon" data-cycle="1" title="Next stage" aria-label="Next stage"><i data-lucide="chevron-right"></i></button></div>`;
  } else if (layout === 5) {
    selector.innerHTML = `${heading}<div class="entries">${numbers}</div>${current}`;
  } else if (layout === 6) {
    selector.innerHTML = `${heading}<div class="split">${current}<div class="entries">${buttons}</div></div>`;
  } else {
    selector.innerHTML = `${heading}<div class="entries">${buttons}</div>`;
  }
  document.querySelector("#preview-label").textContent = `${String(layout + 1).padStart(2, "0")} / ${layouts[layout]}`;
  document.querySelector("#choose span").textContent = chosen === layout ? "Chosen" : "Choose layout";
  document.querySelector("#choose").setAttribute("aria-pressed", chosen === layout);
  document.querySelectorAll("[data-layout]").forEach(button => button.setAttribute("aria-pressed", Number(button.dataset.layout) === layout));
  createIcons({ icons });
}

function cycleStage(direction) {
  stage = (stage + direction + stages.length) % stages.length;
  render();
}

selector.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-stage")) stage = Number(button.dataset.stage);
  if (button.hasAttribute("data-cycle")) return cycleStage(Number(button.dataset.cycle));
  if (button.hasAttribute("data-expand")) expanded = !expanded;
  render();
});
layoutSelect.addEventListener("change", () => { layout = Number(layoutSelect.value); render(); });
document.querySelector("#previous").addEventListener("click", () => { layout = (layout + 7) % 8; render(); });
document.querySelector("#next").addEventListener("click", () => { layout = (layout + 1) % 8; render(); });
document.querySelector("#choose").addEventListener("click", () => {
  chosen = layout;
  localStorage.setItem("airlab-stage-layout-study", chosen);
  render();
});
const comparison = document.querySelector("#comparison");
comparison.innerHTML = layouts.map((name, index) => `<button data-layout="${index}"><span class="mini mini-${index + 1}" aria-hidden="true">${stages.map((_, stageIndex) => `<b ${stageIndex === stage ? 'class="active"' : ""}></b>`).join("")}</span><strong>${index + 1}. ${name}</strong></button>`).join("");
comparison.addEventListener("click", event => {
  const button = event.target.closest("[data-layout]");
  if (button) { layout = Number(button.dataset.layout); render(); }
});
document.querySelector("#compare").addEventListener("click", event => {
  comparison.hidden = !comparison.hidden;
  event.currentTarget.setAttribute("aria-expanded", !comparison.hidden);
});
window.addEventListener("keydown", event => {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
  const direction = event.code === "BracketLeft" ? -1 : event.code === "BracketRight" ? 1 : 0;
  if (direction) { event.preventDefault(); cycleStage(direction); }
});
render();