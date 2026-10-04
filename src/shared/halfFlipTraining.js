import * as THREE from "three";

export const HALF_FLIP_TYPES = [
  { id: "walkthrough", title: "Guided Walkthrough", description: "Follow one detected action at a time, then link the sequence." },
  { id: "imitate", title: "Demonstrate & Imitate", description: "Watch a reference half flip, reproduce it, then compare." },
  { id: "workshop", title: "Component Workshops", description: "Practise cancellation, upright rotation and the exit independently." },
  { id: "diagnose", title: "Attempt & Diagnose", description: "Make full attempts and review the first breakdown afterwards." },
  { id: "discover", title: "Experiment & Discover", description: "Compare early, late and missing cancels before finding your own timing." },
  { id: "scenario", title: "Scenario-Based Learning", description: "Half flip toward a loose ball before it enters the danger zone." },
];

export const HALF_FLIP_ACTIONS = ["Backflip", "Cancel", "Roll upright", "Land & drive"];

export class HalfFlipCoach {
  constructor() { this.level = 0; this.attempts = []; this.failures = 0; }
  record(success) {
    this.attempts.push(Boolean(success));
    this.attempts = this.attempts.slice(-5);
    this.failures = success ? 0 : this.failures + 1;
  }
  get threshold() { return [70, 80, 90][this.level]; }
  get readiness() { return this.attempts.length ? Math.round(this.attempts.filter(Boolean).length / Math.max(3, this.attempts.length) * 100) : 0; }
  get ready() { return this.attempts.length >= 3 && this.readiness >= this.threshold; }
  get needsReview() { return this.failures >= 3; }
  advance() { this.level = Math.min(2, this.level + 1); this.attempts = []; this.failures = 0; }
  review() { this.level = Math.max(0, this.level - 1); this.attempts = []; this.failures = 0; }
}

export function halfFlipReference(time) {
  return {
    jump: time < .1 || time >= .2 && time < .3,
    pitch: time < .4 ? 1 : time < 1 ? -1 : 0,
    roll: time >= .6 && time < 1.2 ? 1 : 0,
    throttle: time < .2 ? -1 : time >= 1.2 ? 1 : 0,
    powerslide: time >= 1.1 && time < 1.5,
  };
}

export function prepareHalfFlipComponent(car, component) {
  if (component === "roll") {
    car.q.setFromEuler(new THREE.Euler(Math.PI, 0, Math.PI, "ZYX"));
    car.pos.set(0, 0, 260);
    car.vel.set(-400, 0, 0);
    car.omega.set(0, 0, 0);
    car.onGround = false;
  } else if (component === "landing") {
    car.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    car.pos.z = 130;
    car.vel.set(-350, 0, -100);
    car.onGround = false;
  }
}

export class HalfFlipEvaluator {
  constructor(car, { component = "full", strictness = 0 } = {}) {
    this.component = component;
    this.strictness = strictness;
    this.origin = car.pos.clone();
    this.initialForward = new THREE.Vector3(1, 0, 0).applyQuaternion(car.q).setZ(0).normalize();
    this.exit = this.initialForward.clone().negate();
    this.time = 0;
    this.events = {};
    this.cancelHold = 0;
    this.rollTime = 0;
    this.landHold = 0;
    this.previousFlipped = false;
    this.result = null;
    if (component === "roll" || component === "landing") {
      this.events.backflip = 0;
      this.events.cancel = 0;
      this.exit.copy(new THREE.Vector3(1, 0, 0).applyQuaternion(car.q).setZ(0).normalize());
    }
    if (component === "landing") this.events.roll = 0;
  }

  step(car, controls, dt) {
    if (this.result) return this.result;
    this.time += dt;
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(car.q);
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(car.q);
    if (car.hasFlipped && !this.previousFlipped && this.events.backflip === undefined) {
      if (controls.pitch < .5 || Math.abs(controls.yaw || 0) > .35) return this.fail("Backflip", "The dodge was not straight backward. Hold nose-up input for the second jump.");
      this.events.backflip = this.time;
    }
    this.previousFlipped = car.hasFlipped;
    if (this.events.backflip !== undefined && this.events.cancel === undefined) {
      this.cancelHold = controls.pitch < -.5 && car.isFlipping ? this.cancelHold + dt : 0;
      if (this.cancelHold >= .05 && Math.abs(forward.z) < .65 && up.z < -.25) {
        this.events.cancel = this.time;
        if (this.component === "cancel") return this.pass("Backflip cancelled");
      }
    }
    if (this.events.cancel !== undefined && !car.onGround) {
      this.rollTime += Math.abs(controls.roll || 0) * dt;
      if (this.rollTime >= .08 && up.z > .8 + this.strictness * .04 && forward.clone().setZ(0).normalize().dot(this.exit) > .8 + this.strictness * .04) this.events.roll ??= this.time;
    }
    if (this.events.roll !== undefined && car.onGround) {
      const aligned = forward.clone().setZ(0).normalize().dot(this.exit) > .85 + this.strictness * .02;
      this.landHold = up.z > .9 && aligned && car.omega.length() < 1 - this.strictness * .2 ? this.landHold + dt : 0;
      if (this.landHold >= .15) this.events.landing ??= this.time;
      if (this.events.landing !== undefined && controls.throttle > .2 && car.vel.dot(this.exit) > 200 && car.pos.clone().sub(this.origin).dot(this.exit) > 180) return this.pass("Clean half flip and exit");
    }
    if (this.time > 5 - this.strictness) {
      if (this.events.backflip === undefined) return this.fail("Backflip", "No backward dodge detected. Release jump before pressing it again with nose-up input.");
      if (this.events.cancel === undefined) return this.fail("Cancel", "No controlled inverted cancel detected. Switch to nose-down input shortly after the backflip.");
      if (this.events.roll === undefined) return this.fail("Roll upright", "The car did not roll upright facing the exit. Roll after the cancel and release near upright.");
      return this.fail("Land & drive", "Land facing the exit, release rotation and accelerate away.");
    }
    return null;
  }

  pass(message) { return this.result = { success: true, message, phase: "Complete", events: { ...this.events } }; }
  fail(phase, message) { return this.result = { success: false, message, phase, events: { ...this.events } }; }
  get action() {
    if (this.events.backflip === undefined) return 0;
    if (this.events.cancel === undefined) return 1;
    if (this.events.roll === undefined) return 2;
    return 3;
  }
}