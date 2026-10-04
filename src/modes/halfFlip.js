import * as THREE from "three";
import { createIcons, icons } from "lucide";
import { ArenaDrillBase } from "../shared/arenaDrill.js";
import { HALF_FLIP_TYPES, HALF_FLIP_ACTIONS, HalfFlipCoach, HalfFlipEvaluator, halfFlipReference, prepareHalfFlipComponent } from "../shared/halfFlipTraining.js";
import { FreePlayMode } from "./freePlay.js";
import { getActiveGamepad, snapshotPressedButtons } from "../shared/input.js";
import { RL, physToThree } from "../shared/carPhysics.js";
import { getBind, formatKeyCode, getPad, formatPadButton } from "../shared/settings.js";
import "./halfFlip.css";

const WALKTHROUGH = [
  "Hold nose-up, tap jump, release jump, then tap it again to backflip.",
  "Backflip, then switch to nose-down and hold to cancel the pitch rotation.",
  "Backflip and cancel, then air roll until your wheels face the floor. Release near upright.",
  "Link everything. Land facing the gold exit and accelerate away.",
];
const WORKSHOPS = [
  "Start on the ground. Backflip and cancel; the landing is not scored.",
  "Start inverted in the air. Air roll upright toward the gold exit; no backflip is needed.",
  "Start upright above the floor. Land, settle the rotation and accelerate toward the exit.",
  "Return to a normal ground start and connect all three components.",
];
const EXPERIMENTS = [
  "Backflip without cancelling or rolling. Observe how the pitch rotation continues.",
  "Backflip, then wait at least 0.35 seconds before holding nose-down. Observe the later cancel.",
  "Backflip, then switch to nose-down within 0.18 seconds. Compare with the late attempt.",
  "Choose your own timing. Add air roll and complete a clean half flip.",
];

function loadRatings() {
  try { return JSON.parse(localStorage.getItem("rl-half-flip-lab-v1")) || {}; } catch { return {}; }
}

export class HalfFlipMode extends ArenaDrillBase {
  constructor(ctx) {
    super(ctx, "Half Flip Lab");
    this.modeId = "half-flip-lab";
    this.type = "walkthrough";
    this.lessonStep = 0;
    this.lessonHits = 0;
    this.coach = new HalfFlipCoach();
    this.phase = "choose";
    this.samples = [];
    this.ratings = loadRatings();
    this.experimentNotes = [];
    this.roundLimit = 6;
    this.exitMarker = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 6, 0xffd166, 1, .7);
    this.root.add(this.exitMarker);
    this.dangerLine = new THREE.Mesh(new THREE.BoxGeometry(.12, .03, 18), new THREE.MeshBasicMaterial({ color: 0xf26c65 }));
    this.dangerLine.position.set(-3.5, .04, 0);
    this.root.add(this.dangerLine);
  }

  start() {
    super.start();
    this.countdown.hidden = true;
    this.ctx.hud.alignMeter?.classList.add("hidden");
    this.panel = document.createElement("section");
    this.panel.className = "half-flip-panel";
    this.panel.setAttribute("aria-label", "Half flip tutorial");
    this.ctx.hud.root.parentElement.append(this.panel);
    this.dimmer = document.createElement("div");
    this.dimmer.className = "half-flip-dimmer";
    this.dimmer.setAttribute("aria-hidden", "true");
    this.ctx.hud.root.parentElement.append(this.dimmer);
    this.onPanelClick = event => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.type) this.chooseType(button.dataset.type);
      else if (button.dataset.command === "types") { this.phase = "choose"; this.renderPanel(); }
      else if (button.dataset.command === "retry") this.beginAttempt();
      else if (button.dataset.command === "next" && this.coach.ready) { this.lessonStep++; this.lessonHits = 0; this.coach.advance(); this.beginAttempt(); }
      else if (button.dataset.command === "challenge" && this.coach.ready) { this.coach.advance(); this.beginAttempt(); }
      else if (button.dataset.command === "back") { this.lessonStep = Math.max(0, this.lessonStep - 1); this.lessonHits = 0; this.coach.review(); this.beginAttempt(); }
      else if (button.dataset.command === "demo") this.beginDemo();
      else if (button.dataset.command === "replay") this.beginReplay();
      else if (button.dataset.command === "test") { this.phase = "test"; this.testAttempts = 0; this.testHits = 0; this.beginAttempt(true); }
      else if (button.dataset.command === "test-next") this.beginAttempt(true);
      else if (button.dataset.rate) {
        const entry = this.ratings[this.type] ??= {};
        entry.preference = Number(button.dataset.rate);
        this.saveRatings(); this.renderPanel();
      }
    };
    this.panel.addEventListener("click", this.onPanelClick);
    this.renderPanel();
  }

  chooseType(id) {
    if (!HALF_FLIP_TYPES.some(type => type.id === id)) return;
    this.type = id;
    this.lessonStep = 0;
    this.lessonHits = 0;
    this.coach = new HalfFlipCoach();
    this.experimentNotes = [];
    this.isTest = false;
    this.phase = "practice";
    if (id === "imitate") this.beginDemo();
    else this.beginAttempt();
  }

  setupRound() {
    const workshop = this.type === "workshop" && !this.isTest;
    const component = workshop ? ["cancel", "roll", "landing", "full"][this.lessonStep] : this.type === "walkthrough" && !this.isTest && this.lessonStep === 1 ? "cancel" : "full";
    const yaw = this.isTest ? [0, Math.PI / 2, -Math.PI / 3, Math.PI, Math.PI / 4][this.testAttempts] : 0;
    this.spawn([0, 0, this.hitbox.restZ], this.type === "scenario" && !this.isTest ? [-1600, 0, RL.BALL_REST_Z] : null, yaw);
    prepareHalfFlipComponent(this.physCar, component);
    if (this.physBall) this.physBall.vel.set(250, 0, 0);
    this.evaluator = new HalfFlipEvaluator(this.physCar, { component, strictness: this.isTest ? 0 : this.coach.level });
    if (component === "roll") this.evaluator.exit.set(-1, 0, 0);
    const exit = physToThree(this.evaluator.exit).normalize();
    this.exitMarker.setDirection(exit);
    this.exitMarker.position.copy(exit).multiplyScalar(3);
    this.exitMarker.position.y = .08;
    this.dangerLine.visible = this.type === "scenario" && !this.isTest;
    this.samples = [];
    this.firstCancel = null;
    this.scenarioContact = false;
    this.prompt = "Half flip toward the gold exit";
    this.resultTime = 0;
  }

  beginAttempt(test = false) {
    this.isTest = test;
    this.phase = "practice";
    this.resetState(true);
    this.renderPanel();
  }

  resetState(fresh = false) {
    if (!fresh && this.phase === "summary") return;
    if (!fresh && this.phase === "settling") return;
    if (!fresh && this.phase === "practice" && this.elapsed > 0 && !this.result) {
      this.finishRound(false, "Attempt restarted");
      return;
    }
    if (!fresh && ["review", "replay"].includes(this.phase)) this.phase = "practice";
    this.result = null;
    this.elapsed = 0;
    super.resetState();
    this.inputReady = true;
    if (this.phase === "demo") this.awaitingInput = false;
    this.renderPanel();
  }

  beginDemo() {
    this.isTest = false;
    this.phase = "demo";
    this.resetState(true);
    this.awaitingInput = false;
    this.renderPanel();
  }

  beginReplay() {
    if (!this.lastSamples?.length) return;
    this.phase = "replay";
    this.replayTime = 0;
    this.renderPanel();
  }

  _stepOnce(dt, controls) {
    if (["settling", "review", "summary", "choose"].includes(this.phase)) {
      if (this.physCar) FreePlayMode.prototype._stepOnce.call(this, dt, this.phase === "choose" ? {} : controls);
      return;
    }
    if (this.phase === "replay") return;
    if (this.phase === "demo") controls = halfFlipReference(this.elapsed);
    super._stepOnce(dt, controls);
  }

  onPhysicsStep(dt, controls, contact) {
    if (this.result) {
      if (this.phase === "settling") {
        this.settleTime += dt;
        if (this.settleTime >= 1.4) { this.phase = this.reviewPhase; this.renderPanel(); }
      }
      return;
    }
    if (this.phase === "choose") return;
    this.elapsed += dt;
    this.samples.push({ time: this.elapsed, pos: this.physCar.pos.toArray(), q: this.physCar.q.toArray(), controls: { ...controls } });
    if (this.samples.length > 750) this.samples.shift();
    const result = this.evaluator.step(this.physCar, controls, dt);
    if (this.evaluator.events.backflip !== undefined && controls.pitch < -.5) this.firstCancel ??= this.elapsed - this.evaluator.events.backflip;
    if (contact && this.evaluator.events.roll !== undefined) this.scenarioContact = true;
    if (this.phase === "demo") {
      if (this.elapsed >= 2.5) { this.phase = "practice"; this.beginAttempt(); }
      return;
    }
    const guided = this.type === "walkthrough" && !this.isTest;
    if (guided && this.lessonStep === 0 && this.evaluator.events.backflip !== undefined) return this.finishRound(true, "Straight backflip detected");
    if ((guided && this.lessonStep === 2 || this.type === "workshop" && this.lessonStep === 1 && !this.isTest) && this.evaluator.events.roll !== undefined) return this.finishRound(true, "Upright rotation detected");
    const experiment = this.type === "discover" && !this.isTest && this.lessonStep < 3;
    if (experiment && this.elapsed >= 3) {
      const backflip = this.evaluator.events.backflip !== undefined;
      const correct = backflip && (this.lessonStep === 0 ? this.firstCancel === null : this.lessonStep === 1 ? this.firstCancel >= .35 : this.firstCancel !== null && this.firstCancel <= .18);
      return this.finishRound(correct, correct ? "Comparison attempt recorded" : "Repeat with the requested cancellation timing");
    }
    if (experiment) return;
    if (this.type === "scenario" && !this.isTest) {
      if (this.physBall.pos.x >= -350) return this.finishRound(false, "The ball reached the danger line before the interception");
      if (result?.success && this.scenarioContact) return this.finishRound(true, "Half flip completed and loose ball intercepted");
      if (result && !result.success) return this.finishRound(false, result.message);
      if (this.elapsed >= 6) return this.finishRound(false, "Finish the recovery, then reach the moving ball");
      return;
    }
    if (result) this.finishRound(result.success, result.message);
  }

  finishRound(success, message) {
    if (this.result) return;
    this.result = { success, message };
    this.lastSamples = this.samples.slice();
    this.phase = "settling";
    this.settleTime = 0;
    this.reviewPhase = "review";
    this.hits += success ? 1 : 0;
    if (this.isTest) {
      this.testAttempts++;
      this.testHits += success ? 1 : 0;
      if (this.testAttempts >= 5) {
        this.reviewPhase = "summary";
        const entry = this.ratings[this.type] ??= {};
        entry.test = { hits: this.testHits, attempts: 5, date: new Date().toISOString() };
        this.saveRatings();
      }
    } else {
      this.coach.record(success);
      this.lessonHits += success ? 1 : 0;
      if (this.type === "discover" && this.lessonStep < 3 && success) this.experimentNotes[this.lessonStep] = this.firstCancel === null ? "No cancel: pitch rotation continued" : `Cancel input ${Math.round(this.firstCancel * 1000)} ms after dodge; ${this.evaluator.events.cancel === undefined ? "inverted cancel not reached" : "inverted cancel reached"}`;
    }
    this.renderPanel();
  }

  saveRatings() { try { localStorage.setItem("rl-half-flip-lab-v1", JSON.stringify(this.ratings)); } catch { } }

  bindingHelp() {
    const key = action => formatKeyCode(getBind(action)) || "Unbound";
    const pad = getPad();
    return `Keyboard: jump ${key("jump")} · nose up ${key("pitchUp")} · nose down ${key("pitchDown")} · roll ${key("airRollLeft")} / ${key("airRollRight")} · drive ${key("throttle")}. Controller: jump ${formatPadButton(pad.jump)} · pitch stick back/forward · roll ${formatPadButton(pad.airRollLeft)} / ${formatPadButton(pad.airRollRight)} · accelerate ${formatPadButton(pad.throttle)}.`;
  }

  instruction() {
    if (this.isTest) return "Normal-speed check. Complete the half flip and drive toward the gold exit without coaching.";
    if (this.coach.level > 0 && this.type !== "walkthrough") {
      if (this.type === "workshop") return ["Controlled cancel.", "Rotate upright facing the exit.", "Stable landing and forward exit.", "Connect the recovery cleanly."][this.lessonStep];
      if (this.type === "discover") return ["No cancellation.", "Cancel at least 0.35s after the dodge.", "Cancel within 0.18s of the dodge.", "Choose your timing; finish cleanly."][this.lessonStep];
      return this.type === "scenario" ? "Recover and intercept before the red line." : this.type === "imitate" ? "Match the reference with a clean, aligned exit." : "Complete the recovery. Review only the first breakdown.";
    }
    if (this.type === "walkthrough") return this.coach.level === 0 ? WALKTHROUGH[this.lessonStep] : ["Straight backward dodge.", "Hold the cancel.", "Recover upright toward the exit.", "Clean recovery, settled landing, decisive exit."][this.lessonStep];
    if (this.type === "workshop") return WORKSHOPS[this.lessonStep];
    if (this.type === "discover") return EXPERIMENTS[this.lessonStep];
    if (this.type === "imitate") return "Watch the reference motion and inputs, then reproduce the whole half flip. Compare after each attempt.";
    if (this.type === "diagnose") return "Try the entire half flip: backflip, hold nose-down to cancel, air roll upright, then land and drive. Review the first breakdown after the attempt.";
    return "You face away from a loose ball. Half flip, land and intercept it before it crosses the red danger line.";
  }

  renderPanel() {
    if (!this.panel) return;
    this.padButtons = snapshotPressedButtons();
    this.padSelection = null;
    this.dimmer?.classList.toggle("is-dipped", ["settling", "review", "summary", "replay"].includes(this.phase));
    this.panel.classList.toggle("half-flip-chooser", this.phase === "choose");
    this.panel.classList.toggle("half-flip-settling", this.phase === "settling");
    if (this.phase === "choose") {
      this.panel.innerHTML = `<header><h2>Half Flip Lab</h2><span>6 teaching systems</span></header><div class="half-flip-types">${HALF_FLIP_TYPES.map((type, index) => {
        const rating = this.ratings[type.id];
        return `<button data-type="${type.id}"><small>0${index + 1}</small><strong>${type.title}</strong><span>${type.description}</span><em>${rating?.test ? `Last unaided check: ${rating.test.hits}/5` : "Not tested"}${rating?.preference ? ` · Preference ${rating.preference}/5` : ""}</em></button>`;
      }).join("")}</div>`;
      return;
    }
    const title = HALF_FLIP_TYPES.find(type => type.id === this.type).title;
    const review = this.phase === "review";
    const staged = ["walkthrough", "workshop", "discover"].includes(this.type);
    const next = staged && this.lessonStep < 3 && this.coach.ready;
    const demo = this.type === "imitate";
    const diagnosis = this.type === "diagnose";
    this.panel.innerHTML = `<header><div><small>HALF FLIP COACH ${this.isTest ? " / UNAIDED CHECK" : ""}</small><h2>${title}</h2></div><button data-command="types">Choose type</button></header>
      ${this.phase === "summary" ? `<h3>Unaided result: ${this.testHits}/5</h3><p>How useful was this teaching style?</p><div class="half-flip-ratings" aria-label="Teaching preference">${[1, 2, 3, 4, 5].map(value => `<button data-rate="${value}" aria-pressed="${this.ratings[this.type]?.preference === value}">${value}</button>`).join("")}</div><small>1 = not useful · 5 = very useful. Saved on this device.</small>` : `
      <p>${this.instruction()}</p>
      ${!this.isTest ? `<div class="half-flip-readiness"><label for="half-flip-readiness">Readiness ${this.coach.readiness}% / ${this.coach.threshold}% target</label><progress id="half-flip-readiness" value="${this.coach.readiness}" max="100"></progress><small>${["Supported", "Independent", "Precision"][this.coach.level]} · last ${this.coach.attempts.length}/5 attempts · at least 3 needed${this.coach.level ? ` · finish within ${5 - this.coach.level}s with tighter alignment` : ""}</small></div>` : ""}
      ${staged && !this.isTest ? `<div class="half-flip-stages">${(this.type === "workshop" ? ["Cancel", "Rotate", "Exit", "Connect"] : this.type === "discover" ? ["No cancel", "Late", "Early", "Choose"] : HALF_FLIP_ACTIONS).map((label, index) => `<span ${index === this.lessonStep ? 'aria-current="step"' : ''}>${index + 1}. ${label}</span>`).join("")}</div>` : ""}
      ${this.phase === "demo" ? `<strong>Reference demonstration · normal speed</strong><output data-live-input></output>` : this.phase === "replay" ? `<strong>Your attempt · half-speed review</strong><output data-live-input></output>` : this.isTest ? `<strong>Attempt ${Math.min(5, this.testAttempts + (review ? 0 : 1))}/5 · ${this.testHits} clean</strong>` : `<output data-live-cue aria-live="polite"></output>`}
      ${review ? `<div class="half-flip-result" data-success="${this.result.success}"><strong>${this.result.success ? "Completed" : diagnosis ? `First breakdown: ${this.evaluator.result?.phase ?? "Execution"}` : "Try again"}</strong><p>${this.result.message}</p>${diagnosis || demo ? `<div class="half-flip-events">${HALF_FLIP_ACTIONS.map((label, index) => { const time = this.evaluator.events[["backflip", "cancel", "roll", "landing"][index]]; return `<span>${label}: ${time === undefined ? "not reached" : `${time.toFixed(2)} s`}</span>`; }).join("")}</div>` : ""}</div>` : ""}
      ${this.type === "discover" && !this.isTest ? `<ul>${this.experimentNotes.map(note => `<li>${note}</li>`).join("")}</ul>` : ""}
      ${this.phase === "settling" ? `<strong class="half-flip-settle-message">${this.result.success ? "That step is recorded. Let the car settle." : "Let it settle. We will fix one thing at a time."}</strong>` : ""}
      ${review && !this.isTest ? `<p class="half-flip-coach-advice" role="status">${this.coach.needsReview ? this.lessonStep > 0 ? "Three attempts broke down in a row. I recommend revisiting the previous step before trying again." : "Three attempts broke down in a row. Stay here, practise one correction, and try again without rushing." : this.coach.ready ? "Your recent attempts are consistent. You are ready for the next challenge." : this.result.success ? "Good. Repeat it so we know it is repeatable, not just one successful attempt." : `Focus only on this correction: ${this.result.message}`}</p>` : ""}
      <div class="half-flip-buttons">${review ? this.isTest ? '<button data-command="test-next">Next attempt</button>' : `<button data-command="retry">Retry</button>${next ? '<button data-command="next">Next step</button>' : ""}${this.coach.ready && (!staged || this.lessonStep === 3) && this.coach.level < 2 ? '<button data-command="challenge">Increase precision</button>' : ""}${this.coach.needsReview ? `<button data-command="back">${this.lessonStep > 0 ? "Revisit previous step" : "Restore full guidance"}</button>` : ""}${demo || diagnosis ? '<button data-command="replay">Review attempt</button>' : ""}` : ""}${demo && !["demo", "settling"].includes(this.phase) && !this.isTest ? '<button data-command="demo">Watch reference</button>' : ""}${this.phase === "replay" ? '<button data-command="retry">Try again</button>' : ""}${!this.isTest && !["demo", "settling"].includes(this.phase) ? '<button data-command="test">Test without help</button>' : ""}</div>
      ${!this.isTest ? `<details ${this.coach.level === 0 && this.awaitingInput && this.phase === "practice" ? "open" : ""}><summary>Controls</summary><p>${this.bindingHelp()}</p></details>` : ""}`}`;
    const commands = { retry: ["rotate-ccw", "Retry"], replay: ["play", "Review attempt"], demo: ["clapperboard", "Watch reference"] };
    for (const button of this.panel.querySelectorAll("button[data-command]")) {
      const command = commands[button.dataset.command];
      if (!command) continue;
      button.title = command[1];
      button.setAttribute("aria-label", command[1]);
      button.innerHTML = `<i data-lucide="${command[0]}"></i>`;
    }
    createIcons({ icons, root: this.panel });
  }

  updatePanelController() {
    const pad = getActiveGamepad();
    if (!pad) { this.padButtons = new Set(); return; }
    const pressed = snapshotPressedButtons();
    const previous = this.padButtons ?? pressed;
    this.padButtons = pressed;
    if (!["choose", "review", "summary", "replay"].includes(this.phase)) return;
    const buttons = [...this.panel.querySelectorAll("button:not([disabled])")];
    const direction = [12, 14].some(index => pressed.has(index) && !previous.has(index)) ? -1
      : [13, 15].some(index => pressed.has(index) && !previous.has(index)) ? 1 : 0;
    if (direction && buttons.length) {
      this.padSelection?.classList.remove("menu-focus");
      const index = buttons.indexOf(this.padSelection);
      this.padSelection = buttons[index < 0 ? 0 : (index + direction + buttons.length) % buttons.length];
      this.padSelection.classList.add("menu-focus");
      this.padSelection.focus({ preventScroll: true });
      this.padSelection.scrollIntoView({ block: "nearest" });
    }
    if (this.padSelection && pressed.has(0) && !previous.has(0)) this.padSelection.click();
  }

  update(dt, now) {
    this.updatePanelController();
    if (this.phase === "replay") {
      this.replayTime += dt * .5;
      const frame = this.lastSamples[Math.min(this.lastSamples.length - 1, Math.floor(this.replayTime / RL.DT))];
      this.physCar.pos.fromArray(frame.pos);
      this.physCar.q.fromArray(frame.q);
      this.physCar.vel.set(0, 0, 0);
      this.carRenderPose.reset();
      if (this.replayTime > this.lastSamples.at(-1).time + .8) this.replayTime = 0;
    }
    super.update(dt, now);
    const inputOutput = this.panel?.querySelector("[data-live-input]");
    if (inputOutput) {
      const controls = this.phase === "replay" ? this.lastSamples[Math.min(this.lastSamples.length - 1, Math.floor(this.replayTime / RL.DT))].controls : halfFlipReference(this.elapsed);
      inputOutput.textContent = `Jump ${controls.jump ? "ON" : "off"} · Pitch ${controls.pitch > .5 ? "nose up" : controls.pitch < -.5 ? "nose down" : "neutral"} · Roll ${Math.abs(controls.roll || 0) > .1 ? "ON" : "off"} · Drive ${controls.throttle > .1 ? "forward" : "neutral"}`;
    }
    const cue = this.panel?.querySelector("[data-live-cue]");
    if (cue && this.phase === "practice") {
      cue.textContent = this.awaitingInput ? this.coach.level === 0 ? `Take your time. ${this.instruction()}` : "Start when ready." : this.coach.level === 2 ? "Precision attempt in progress." : this.type === "walkthrough" ? this.coach.level === 0 ? `${HALF_FLIP_ACTIONS[this.evaluator.action]} · ${WALKTHROUGH[this.evaluator.action]}` : HALF_FLIP_ACTIONS[this.evaluator.action] : this.type === "workshop" ? this.instruction() : this.type === "scenario" ? this.evaluator.events.landing !== undefined ? "Recovered. Now steer toward the moving ball." : "Recover first, then intercept the ball." : this.type === "discover" ? `${this.elapsed.toFixed(1)} s · ${this.instruction()}` : this.type === "imitate" ? "Copy the reference. I will compare your attempt when you finish." : "Try the whole sequence. I will identify the first breakdown afterwards.";
    }
  }

  updateDrillStatus() {
    this.ctx.hud.status.textContent = this.phase === "choose" ? "Choose a half-flip tutorial" : this.phase === "demo" ? "Reference demonstration" : this.result?.message ?? "Half Flip Lab";
    this.setScoreRow(this.hits, 0, 0, "Half Flip Lab");
  }

  stop() {
    this.panel?.removeEventListener("click", this.onPanelClick);
    this.panel?.remove();
    this.dimmer?.remove();
    this.exitMarker.line.geometry.dispose();
    this.exitMarker.line.material.dispose();
    this.exitMarker.cone.geometry.dispose();
    this.exitMarker.cone.material.dispose();
    this.dangerLine.geometry.dispose();
    this.dangerLine.material.dispose();
    super.stop();
  }
}