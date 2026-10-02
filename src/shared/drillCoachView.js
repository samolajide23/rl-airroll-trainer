import { createElement, ChevronLeft, ChevronRight, RotateCcw, SkipForward, CircleCheck, CircleX } from "lucide";
import { consumePadButtonUntilRelease } from "./input.js";
import { drillBriefing } from "./drillBriefings.js";

const quickTips = {
  lane: ["Stay in the lane", "Steer gently toward the centre."],
  brake: ["Brake now", "Slow down before the yellow target."],
  boost: ["Use boost", "Build speed before the target."],
  "stop-speed": ["Keep braking", "Stop inside the yellow target."],
  "short-hold": ["Hold jump longer", "Don't release jump so soon."],
  neutral: ["Centre the stick", "Then press jump again."],
  "dodge-request": [null, "Release jump, then jump again in that direction."],
  "over-roll": ["Release air roll", "Your wheels are already facing down."],
  "touch-tilt": ["Straighten up", "Get your wheels underneath before the touch."],
  "landing-tilt": ["Land wheels down", "Straighten the car before landing."],
  momentum: ["Face where you're moving", "Turn your nose along your landing path."],
  settle: ["Let the car settle", "Stop adding rotation."],
  "ball-height": ["Keep the ball low", "Use a gentler touch."],
  separation: ["Follow the ball", "Close the gap before touching again."],
  "second-touch": ["Touch it again", "Make your second touch now."],
  nose: ["Face the ball", "Line up your nose before the touch."],
  closing: ["Slow down", "Brake for a gentler touch."],
  follow: ["Stay with the ball", "Drive after your touch."],
  "follow-facing": ["Face the ball", "Turn back toward it."],
};

export class DrillCoachView {
  constructor(root, { retry = () => {}, nextDrill, previousDrill, stages = [], currentStage = 0, selectStage, variant } = {}) {
    this.hud = root;
    this.briefing = stages[currentStage] ? drillBriefing(variant, currentStage, stages[currentStage]) : null;
    root.classList.add("coached-hud");
    this.root = document.createElement("section");
    this.root.className = "training-tip";
    this.root.setAttribute("aria-label", "Training tip");
    this.root.setAttribute("role", "status");
    this.root.setAttribute("aria-live", "polite");
    this.root.hidden = true;
    this.title = document.createElement("strong");
    this.detail = document.createElement("p");
    this.root.append(this.title, this.detail);
    root.parentElement.append(this.root);
    this.failure = document.createElement("dialog");
    this.failure.className = "training-failure";
    this.failureTitle = document.createElement("h2");
    this.failureTitle.id = "training-failure-title";
    this.failure.setAttribute("aria-labelledby", this.failureTitle.id);
    this.failureDetail = document.createElement("p");
    this.failureDetail.id = "training-failure-detail";
    this.failure.setAttribute("aria-describedby", this.failureDetail.id);
    const label = this.resultLabel = document.createElement("span");
    label.className = "training-failure-label";
    label.textContent = "TRY AGAIN";
    const actions = document.createElement("div");
    this.retryButton = document.createElement("button");
    this.retryLabel = document.createElement("span");
    this.retryLabel.textContent = "Try again";
    this.retryButton.append(createElement(RotateCcw), this.retryLabel);
    this.retryButton.addEventListener("click", () => { this.closeFailure(); retry(); });
    actions.append(this.retryButton);
    this.nextDrillButton = document.createElement("button");
    const drillLabel = document.createElement("span");
    drillLabel.textContent = "Next drill";
    this.nextDrillButton.append(createElement(SkipForward), drillLabel);
    this.nextDrillButton.hidden = !nextDrill;
    this.nextDrillButton.addEventListener("click", () => { this.closeFailure(); nextDrill?.(); });
    actions.append(this.nextDrillButton);
    this.previousDrillButton = document.createElement("button");
    const previousLabel = document.createElement("span");
    previousLabel.textContent = "Previous drill";
    this.previousDrillButton.append(createElement(ChevronLeft), previousLabel);
    this.previousDrillButton.hidden = !previousDrill;
    this.previousDrillButton.addEventListener("click", () => { this.closeFailure(); previousDrill?.(); });
    actions.append(this.previousDrillButton);
    this.failure.append(label, this.failureTitle, this.failureDetail, actions);
    this.failure.addEventListener("cancel", event => event.preventDefault());
    root.parentElement.append(this.failure);
    if (stages.length && selectStage) {
      this.stageList = document.createElement("nav");
      this.stageList.className = "training-stages";
      this.stageList.setAttribute("aria-label", "Drill stages");
      const heading = document.createElement("strong");
      heading.textContent = "STAGES";
      const strip = document.createElement("div");
      strip.className = "training-stage-strip";
      const cycleButton = (direction, icon, key, label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "training-stage-cycle";
        button.title = `${label} stage (${key})`;
        button.setAttribute("aria-label", `${label} stage (${key})`);
        const binding = document.createElement("kbd");
        binding.textContent = key;
        button.append(createElement(icon), binding);
        button.addEventListener("click", () => selectStage((currentStage + direction + stages.length) % stages.length));
        return button;
      };
      strip.append(cycleButton(-1, ChevronLeft, "[", "Previous"));
      stages.forEach((stage, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "training-stage-number";
        button.textContent = index + 1;
        button.title = stage.title;
        button.setAttribute("aria-label", `${index + 1}. ${stage.title}`);
        if (index === currentStage) button.setAttribute("aria-current", "step");
        button.addEventListener("click", () => selectStage(index));
        strip.append(button);
      });
      strip.append(cycleButton(1, ChevronRight, "]", "Next"));
      const currentTitle = document.createElement("div");
      currentTitle.className = "training-stage-title";
      currentTitle.textContent = stages[currentStage].title;
      this.stageList.append(heading, strip, currentTitle);
      root.parentElement.append(this.stageList);
      this.stageKeys = event => {
        if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        if (!root.getClientRects().length || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
        const direction = event.code === "BracketLeft" ? -1 : event.code === "BracketRight" ? 1 : 0;
        if (!direction) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        selectStage((currentStage + direction + stages.length) % stages.length);
      };
      window.addEventListener("keydown", this.stageKeys, true);
    }
  }

  closeFailure() {
    this.failure.close();
  }

  render(feedback, force = false) {
    if (!feedback) return;
    const pad = [...(navigator.getGamepads?.() || [])].find(candidate => candidate?.connected);
    const confirm = Boolean(pad?.buttons[0]?.pressed);
    const direction = pad?.buttons[15]?.pressed || pad?.buttons[13]?.pressed || pad?.axes[0] > 0.5 || pad?.axes[1] > 0.5 ? 1 : pad?.buttons[14]?.pressed || pad?.buttons[12]?.pressed || pad?.axes[0] < -0.5 || pad?.axes[1] < -0.5 ? -1 : 0;
    if (this.failure.open && direction && direction !== this.directionHeld) {
      const buttons = [...this.failure.querySelectorAll("button")].filter(button => !button.hidden && !button.disabled);
      const index = buttons.indexOf(document.activeElement);
      if (buttons.length) buttons[(Math.max(0, index) + direction + buttons.length) % buttons.length].focus();
    }
    this.directionHeld = direction;
    if (this.failure.open && confirm && !this.confirmHeld) {
      this.confirmHeld = confirm;
      consumePadButtonUntilRelease(0);
      const focused = document.activeElement;
      (this.failure.contains(focused) && focused.tagName === "BUTTON" ? focused : this.retryButton).click();
      return;
    }
    this.confirmHeld = confirm;
    const key = `${feedback.id}:${feedback.title}:${feedback.detail}`;
    if (!force && key === this.lastTip) return;
    this.lastTip = key;
    clearTimeout(this.hideTimer);
    if (feedback.id === "success" || feedback.id.startsWith("result-") && !["result-Skipped", "result-Round restarted"].includes(feedback.id)) {
      this.root.hidden = true;
      const success = feedback.id === "success";
      this.failure.dataset.state = success ? "success" : "fault";
      this.resultLabel.replaceChildren(createElement(success ? CircleCheck : CircleX), document.createTextNode(success ? "DRILL PASSED" : "DRILL FAILED"));
      this.retryLabel.textContent = success ? "Repeat drill" : "Try again";
      this.failureTitle.textContent = feedback.title;
      this.failureDetail.textContent = feedback.detail;
      if (!this.failure.open) {
        this.failure.showModal();
        this.retryButton.focus();
      }
      return;
    }
    this.closeFailure();
    this.root.dataset.state = feedback.id === "success" ? "success" : feedback.priority >= 2 ? "fault" : "objective";
    const summary = this.briefing && (feedback.id.startsWith("action-") || ["objective", "repeat"].includes(feedback.id)) ? this.briefing : feedback;
    const quick = quickTips[feedback.id];
    this.title.textContent = quick?.[0] || summary.title;
    this.detail.textContent = quick?.[1] || summary.detail;
    this.detail.hidden = !this.detail.textContent;
    this.root.hidden = false;
    if (!feedback.id.startsWith("action-") && !["objective", "repeat", "turn-direction", "wrong-turn"].includes(feedback.id)) {
      this.hideTimer = setTimeout(() => { this.root.hidden = true; }, feedback.priority >= 2 ? 5000 : 3500);
    }
  }

  dispose() {
    clearTimeout(this.hideTimer);
    this.closeFailure();
    this.failure.remove();
    this.stageList?.remove();
    if (this.stageKeys) window.removeEventListener("keydown", this.stageKeys, true);
    this.hud.classList.remove("coached-hud");
    this.root.remove();
  }
}