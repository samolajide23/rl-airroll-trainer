import * as THREE from "three";

const radians = Math.PI / 180;
const cue = (id, title, detail, priority = 1, value = null) => ({ id, title, detail, priority, value });
const horizontal = vector => vector.clone().setZ(0);

export function coachingFault(mode, controls = {}) {
  const car = mode.physCar;
  if (!car) return null;
  const stage = mode.masteryStep;
  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(car.q);
  const up = new THREE.Vector3(0, 0, 1).applyQuaternion(car.q);
  const speed = Math.hypot(car.vel.x, car.vel.y);
  const rollSpeed = car.omega.dot(forward);
  const tilt = Math.acos(THREE.MathUtils.clamp(up.z, -1, 1)) / radians;
  if (mode.variant === "driving") {
    const target = mode.setup.targets[mode.nextTarget];
    if (!target) return null;
    const delta = new THREE.Vector3(...target).sub(car.pos).setZ(0);
    const error = Math.atan2(forward.x * delta.y - forward.y * delta.x, forward.x * delta.x + forward.y * delta.y);
    const distance = delta.length();
    if (stage === 0 && Math.abs(car.pos.x) > 100) return cue("lane", "Return to the lane", "Steer toward the centre line before crossing the lane boundary.", 4, `${Math.round(Math.abs(car.pos.x))} / 180 uu offset`);
    if (stage === 3 && speed > 150 && distance < speed * speed / 7000 + 180 && controls.throttle >= 0) return cue("brake", "Brake now", "You are closing on the stopping target. Reduce speed before entering it.", 4, `${Math.round(speed)} uu/s · ${Math.round(distance)} uu remaining`);
    if (Math.abs(error) > 15 * radians && controls.steer * error < -0.1 && controls.throttle > 0) return cue("wrong-turn", error > 0 ? "Turn left toward the target" : "Turn right toward the target", "Your steering input points away from the active target.", 3, `${Math.round(Math.abs(error) / radians)} degrees off target`);
    if (Math.abs(error) > 30 * radians && speed > 700 && controls.throttle > 0) return cue("turn-speed", "Ease off while turning", "Reduce throttle until your nose points toward the active target.", 2, `${Math.round(Math.abs(error) / radians)} degrees off target`);
    if (stage === 2 && distance < 900 && speed < 1600 && !car.isBoosting) return cue("boost", "Build speed with boost", "This stage requires boost and at least 1,600 uu/s at the target.", 2, `${Math.round(speed)} / 1,600 uu/s`);
    if (stage === 3 && distance <= 180 && speed >= 150) return cue("stop-speed", "Keep braking inside the target", "Settle below 150 uu/s, wheels-down, to complete the stop.", 3, `${Math.round(speed)} / 150 uu/s`);
    return null;
  }
  if (mode.variant === "dodges") {
    if (stage === 1 && mode.jumped && !controls.jump && mode.jumpHold < 0.18 && car.vel.z > 0) return cue("short-hold", "Hold the first jump longer", "The jump was released before the required 0.18-second hold. Hold it longer on the next attempt.", 3, `${(mode.jumpHold || 0).toFixed(2)} / 0.18 s`);
    if (stage === 2 && mode.jumped && !mode.doubleJumped && !controls.jump && Math.hypot(controls.pitch || 0, controls.yaw || 0) > 0.2) return cue("neutral", "Centre directional input before jump two", "Directional input on the second press can turn your double jump into a dodge.", 3);
    if (stage >= 3 && mode.jumped && !mode.flipped && mode.elapsed > 0.4) return cue("dodge-request", `Dodge ${mode.setup.dodge}`, "Release jump, then press it again with the requested direction.", 2);
  }
  if (!car.onGround && ["rollTouch", "recovery", "dodges"].includes(mode.variant)) {
    if (up.z > 0.92 && Math.abs(rollSpeed) > 0.7 && controls.roll * rollSpeed > 0.1) return cue("over-roll", "Release air roll; you passed alignment", "Your wheels are nearly down, but continued roll is carrying you past the landing orientation. Counter-roll if needed.", 4, `${Math.round(tilt)} degrees tilt`);
    const beforeTouch = ["rollTouch", "recovery"].includes(mode.variant) && mode.firstTouchTime === null && (mode.variant === "rollTouch" || stage >= 3);
    if (beforeTouch && mode.variant === "rollTouch" && stage >= 1 && tilt > 30 && mode.physBall && car.pos.distanceTo(mode.physBall.pos) < 250) return cue("touch-tilt", "Align before reaching the ball", "The ball is close, but the car is still tilted. Bring the wheels underneath before contact.", 3, `${Math.round(tilt)} degrees tilt`);
    if (!beforeTouch && car.vel.z < -100 && tilt > 30 && !car.isFlipping) return cue("landing-tilt", "Bring your wheels toward the floor", "You are descending while tilted. Correct your orientation before landing.", 3, `${Math.round(tilt)} degrees tilt`);
    if (mode.variant === "recovery" && [1, 2, 4].includes(stage) && (stage < 3 || mode.firstTouchTime !== null) && speed >= 300 && horizontal(forward).normalize().dot(horizontal(car.vel).normalize()) < Math.cos(30 * radians)) return cue("momentum", "Point your nose along your travel", "Your nose faces across your momentum. Align with your movement before landing.", 2);
  }
  if (car.onGround && ["recovery", "dodges"].includes(mode.variant) && car.omega.length() > 0.6) return cue("settle", "Settle the landing", "Rotation is still above the stable-landing limit. Stop adding rotation and let the wheels settle.", 2, `${car.omega.length().toFixed(2)} / 0.60 rad/s`);
  const ball = mode.physBall;
  if (!ball) return null;
  const offset = horizontal(ball.pos.clone().sub(car.pos));
  const gap = car.pos.distanceTo(ball.pos);
  if (mode.variant === "soft" && mode.firstTouchTime !== null) {
    if (ball.pos.z > 150) return cue("ball-height", "Keep the reception low", "The ball is nearing the height limit. Avoid lifting it on the next touch.", 3, `${Math.round(ball.pos.z)} / 200 uu height`);
    if (stage >= 1 && gap > 330) return cue("separation", "Follow the ball before another touch", "The reception is nearing the separation limit. Close the gap without hitting it again too early.", 3, `${Math.round(gap)} / 450 uu separation`);
    if (stage === 4 && mode.receptionReady) return cue("second-touch", "Now make a separate second touch", "The ball is cushioned and close. Make the next contact before the window closes.", 1);
  }
  if (["static", "soft", "rollTouch"].includes(mode.variant) && !mode.touches && gap < 700 && offset.length() > 1) {
    const error = Math.acos(THREE.MathUtils.clamp(horizontal(forward).normalize().dot(offset.normalize()), -1, 1));
    if (stage >= 1 && error > 25 * radians) return cue("nose", "Square your nose to the ball", "Your approach is side-on. Align the nose before contact.", 2, `${Math.round(error / radians)} degrees off ball`);
    if (mode.variant === "soft") {
      const closing = horizontal(car.vel.clone().sub(ball.vel)).dot(offset);
      if (closing > 900) return cue("closing", "Reduce your closing speed", "You are closing quickly. Ease off or brake to cushion the incoming ball.", 3, `${Math.round(closing)} uu/s closing speed`);
    }
  }
  if (mode.variant === "static" && stage === 4 && mode.gateHit) {
    if (gap > 450) return cue("follow", "Stay close to the ball", "Follow through before the ball leaves the 600 uu control zone.", 3, `${Math.round(gap)} / 600 uu separation`);
    if (horizontal(forward).normalize().dot(offset.normalize()) < Math.cos(30 * radians)) return cue("follow-facing", "Keep facing the ball", "Turn back toward the ball to continue the follow-through hold.", 2);
  }
  return null;
}

const explanations = {
  "Keep the wheels down": "A jump was detected. Keep jump released throughout this driving stage.",
  "Throttle only": "Boost was used. Use throttle without boost in this stage.",
  "Left the lane": "The car crossed the 180 uu lane boundary. Make smaller steering corrections toward the centre.",
  "Overshot the stop": "The car travelled beyond the stopping area. Begin braking earlier on the next attempt.",
  "No boost in this stage": "Boost was used. Complete the jump using jump and directional controls only.",
  "Single jump only": "A second jump or dodge was detected. Use one jump, then land.",
  "Neutral second jump required": "The second jump became a dodge. Centre directional input before the second press.",
  "Wrong dodge direction": "The measured dodge impulse missed the requested direction. Set the requested direction before the second jump press.",
  "No deliberate air roll": "Not enough deliberate roll was measured before contact. Add a short air roll, then align for the touch.",
  "Touch before alignment": "Contact occurred while the car was tilted. Release roll earlier and settle the orientation before contact.",
  "Grounded contact": "The touch happened on the ground. Reach the ball while airborne in this stage.",
  "Side contact": "The ball met the side of the hitbox. Square your nose to the approach before touching.",
  "Rear contact": "The ball met the rear of the hitbox. Turn the nose toward the ball before touching.",
  "Roof contact": "The ball met the roof. Correct your tilt before touching.",
  "Extra touch": "Another contact occurred before the stage was complete. Let the first touch travel and focus on the next objective.",
  "Extra touch before reception": "The next contact happened before a controlled reception was ready. Cushion and follow first.",
  "Reception too high": "The ball rose above 200 uu. Use a lower, gentler contact on the next attempt.",
  "Not cushioned enough": "The ball retained more than 60% of its incoming speed. Reduce the impact's closing speed.",
  "Too far away": "The ball left the control zone. Follow sooner without adding an uncontrolled touch.",
  "Facing away": "The car stopped facing the ball. Keep the nose aligned during follow-through.",
  "Not wheels-down": "The wheels-down hold was interrupted. Remain upright and grounded while following.",
  "Too soft": "The measured ball speed was below the stage's pace band. Add a little more approach speed next time.",
  "Too hard": "The measured ball speed exceeded the stage's pace band. Reduce approach speed next time.",
  "Landing timeout": "A qualifying stable landing was not held in time. Prioritise wheels-down orientation and the required travel alignment.",
  "Recovery timeout": "The post-touch stable landing was not completed in time. Start correcting orientation immediately after contact.",
  "Exit timeout": "The forward exit was not completed in time. After settling, drive along the landing direction.",
  "No contact": "No ball contact was recorded. Align with the ball and close the gap before the attempt ends.",
  "Target timeout": "The ball did not complete the target crossing in time. Aim the first touch through the gate.",
  "Too high": "The ball crossed above the 200 uu target height. Use a lower contact on the next attempt.",
  "Missed left": "The ball crossed left of the gate. Aim the first touch farther right on the next attempt.",
  "Missed right": "The ball crossed right of the gate. Aim the first touch farther left on the next attempt.",
  "Skipped": "This attempt was skipped. The next attempt starts with the same stage objective.",
  "Second touch timeout": "A qualifying second contact was not recorded within the window. Cushion first, then make a distinct second touch.",
  "Exit missed": "The ball did not reach the requested exit while controlled. Guide it toward the marked side and stay close.",
};

export function resultCoaching(mode, opening) {
  const message = mode.result.message.replace(/^Practice: /, "");
  if (mode.result.success) return cue("success", message, "Stage complete. Repeat the same control on the next attempt.", 5);
  const detail = explanations[message] || `The stage ended without completing all its conditions. Next attempt: ${opening}`;
  let value = null;
  if (message === "Wrong dodge direction") value = `Requested: ${mode.setup.dodge}`;
  if (message === "Not cushioned enough" && mode.receivedSpeed != null) value = `${Math.round(mode.receivedSpeed)} uu/s after contact · limit ${Math.round(mode.incomingSpeed * 0.6)} uu/s`;
  if (["Too soft", "Too hard"].includes(message)) value = `${Math.round(mode.variant === "rollTouch" ? mode.receivedSpeed : mode.gateSpeed)} uu/s measured`;
  return cue(`result-${message}`, message, detail, 5, value);
}

export class DrillCoach {
  constructor() {
    this.repeatedMiss = null;
    this.missCount = 0;
    this.reset();
  }

  reset() {
    this.current = null;
    this.pending = null;
    this.pendingTime = 0;
    this.clearTime = 0;
    this.resultSeen = false;
  }

  update(mode, controls, dt, opening) {
    if (this.setup !== mode.setup) {
      this.setup = mode.setup;
      this.reset();
    }
    if (mode.result) {
      const feedback = resultCoaching(mode, opening);
      if (mode.result.message === "Time expired") {
        if (this.current?.priority >= 2) {
          feedback.detail = `At the end of the attempt: ${this.current.detail}`;
          feedback.value = this.current.value;
        } else if (mode.variant === "dodges") {
          feedback.detail = !mode.jumped ? "No jump was detected. Make the first jump, then complete the stage's landing." : mode.masteryStep === 1 && mode.jumpHold < 0.18 ? "The first jump hold was shorter than 0.18 seconds. Hold it longer on the next attempt." : mode.masteryStep === 2 && !mode.doubleJumped ? "No neutral second jump was detected. Release jump, centre directional input, then press jump again." : mode.masteryStep >= 3 && !mode.flipped ? `No dodge was detected. Release jump, then press it again with ${mode.setup.dodge} directional input.` : "The stable landing or required travel was not completed. Land wheels-down and let rotation settle.";
          feedback.value = `${Math.round(mode.maxHeight || 0)} uu peak height`;
        }
      }
      if (!this.resultSeen && !mode.practiceRetry && mode.result.message !== "Skipped") {
        if (mode.result.success) { this.repeatedMiss = null; this.missCount = 0; }
        else { this.missCount = this.repeatedMiss?.id === feedback.id ? this.missCount + 1 : 1; this.repeatedMiss = feedback; }
        this.resultSeen = true;
      }
      this.current = feedback;
      return feedback;
    }
    const fault = coachingFault(mode, controls);
    if (fault) {
      this.clearTime = 0;
      this.pendingTime = this.pending?.id === fault.id ? this.pendingTime + dt : dt;
      this.pending = fault;
      if (this.pendingTime >= 0.18) this.current = fault;
    } else {
      this.pending = null;
      this.pendingTime = 0;
      this.clearTime += dt;
      if (this.clearTime >= 0.5) this.current = null;
    }
    return this.current || (mode.elapsed < 1.5 && this.missCount >= 2 ? cue("repeat", "Focus for this attempt", this.repeatedMiss.detail, 1) : cue("objective", mode.prompt || "Stage objective", opening, 0));
  }
}