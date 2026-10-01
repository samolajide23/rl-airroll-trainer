import { createElement, Compass } from "lucide";
import { getBinds, getPad, formatKeyCode, formatPadButton } from "./settings.js";

function inputHint(id) {
  const binds = getBinds();
  const pad = getPad();
  if (/jump|neutral|dodge|short-hold/.test(id)) return `Jump: ${formatKeyCode(binds.jump)} / ${formatPadButton(pad.jump)}`;
  if (/boost|Throttle only/.test(id)) return `Boost: ${formatKeyCode(binds.boost)} / ${formatPadButton(pad.boost)}`;
  if (/brake|stop-speed|closing/.test(id)) return `Brake: ${formatKeyCode(binds.reverse)} / ${formatPadButton(pad.brake)}`;
  if (/roll|alignment|landing-tilt/.test(id)) return `Air roll: ${formatKeyCode(binds.airRoll)} / ${formatKeyCode(binds.airRollLeft)} / ${formatKeyCode(binds.airRollRight)}`;
  if (/lane|turn|nose|momentum/.test(id)) return `Steer: ${formatKeyCode(binds.steerLeft)} / ${formatKeyCode(binds.steerRight)} or steering stick`;
  return "";
}

export class DrillCoachView {
  constructor(root) {
    this.root = document.createElement("section");
    this.root.className = "drill-coach";
    this.root.setAttribute("aria-label", "Stage guide");
    const header = document.createElement("div");
    header.className = "drill-coach-header";
    const label = document.createElement("span");
    label.append(createElement(Compass, { width: 16, height: 16, "aria-hidden": "true" }), "Guide");
    this.select = document.createElement("select");
    this.select.setAttribute("aria-label", "Coaching detail");
    for (const [value, text] of [["full", "Full"], ["minimal", "Minimal"], ["off", "Off"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      this.select.append(option);
    }
    try { this.select.value = ["full", "minimal", "off"].includes(localStorage.getItem("rl-drill-guide")) ? localStorage.getItem("rl-drill-guide") : "full"; } catch { this.select.value = "full"; }
    header.append(label, this.select);
    this.message = document.createElement("div");
    this.title = document.createElement("strong");
    this.title.setAttribute("role", "status");
    this.title.setAttribute("aria-live", "polite");
    this.detail = document.createElement("p");
    this.value = document.createElement("output");
    this.message.append(this.title, this.detail, this.value);
    this.root.append(header, this.message);
    root.prepend(this.root);
    this.select.addEventListener("change", () => {
      try { localStorage.setItem("rl-drill-guide", this.select.value); } catch {}
      this.render(this.feedback, true);
    });
  }

  render(feedback, force = false) {
    if (!feedback) return;
    this.feedback = feedback;
    this.root.dataset.level = this.select.value;
    this.root.dataset.state = feedback.id === "success" ? "success" : feedback.priority >= 2 ? "fault" : "objective";
    this.message.hidden = this.select.value === "off";
    this.detail.hidden = this.select.value !== "full";
    if (force || this.title.textContent !== feedback.title) this.title.textContent = feedback.title;
    if (force || this.detail.textContent !== feedback.detail) this.detail.textContent = feedback.detail;
    const value = [feedback.value, inputHint(feedback.id)].filter(Boolean).join(" · ");
    this.value.hidden = this.select.value !== "full" || !value;
    if (force || this.value.textContent !== value) this.value.textContent = value;
  }

  dispose() {
    this.root.remove();
  }
}