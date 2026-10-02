import * as THREE from "three";
import { formatSpeed } from "./rl-units.js";

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
    if (mode.setup.laneWidth && Math.abs(car.pos.x) > mode.setup.laneWidth * 0.7) return cue("lane", "Return to the lane", "Steer toward the centre line before crossing the lane boundary.", 4, `${Math.round(Math.abs(car.pos.x))} / ${mode.setup.laneWidth} uu offset`);
    if (stage === 3 && speed > mode.setup.stopSpeed && distance < speed * speed / 7000 + mode.setup.targetRadius && controls.throttle >= 0) return cue("brake", "Brake now", "You are closing on the stopping target. Reduce speed before entering it.", 4, `${formatSpeed(speed)} · ${Math.round(distance)} uu remaining`);
    if (distance > mode.setup.targetRadius && Math.abs(error) > 15 * radians) {
      const wrongTurn = (controls.steer || 0) * error < -0.1 && controls.throttle > 0;
      const fastTurn = Math.abs(error) > 30 * radians && speed > 700 && controls.throttle > 0;
      const detail = wrongTurn ? "Your steering points away from the target. Steer the other way." : "Steer toward the yellow target, then straighten as it comes ahead.";
      return cue(wrongTurn ? "wrong-turn" : "turn-direction", error > 0 ? "Turn right toward the target" : "Turn left toward the target", fastTurn ? `${detail} Ease off the throttle through the turn.` : detail, 3, `${Math.round(Math.abs(error) / radians)} degrees off target`);
    }
    if (stage === 2 && distance < 1500 && speed < mode.setup.minSpeed && !car.isBoosting) return cue("boost", "Build speed with boost", "Use at least 0.8 seconds of boost and arrive at 80 km/h or faster.", 2, `${formatSpeed(speed)} / 80 km/h`);
    if (stage === 3 && distance <= mode.setup.targetRadius && speed >= mode.setup.stopSpeed) return cue("stop-speed", "Keep braking inside the target", "Settle below 5 km/h, wheels-down, for half a second.", 3, `${formatSpeed(speed)} / 5 km/h`);
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
      if (closing > 900) return cue("closing", "Reduce your closing speed", "You are closing quickly. Ease off or brake to cushion the incoming ball.", 3, `${formatSpeed(closing)} closing speed`);
    }
  }
  if (mode.variant === "static" && stage === 4 && mode.gateHit) {
    if (gap > 450) return cue("follow", "Stay close to the ball", "Follow through before the ball leaves the 600 uu control zone.", 3, `${Math.round(gap)} / 600 uu separation`);
    if (horizontal(forward).normalize().dot(offset.normalize()) < Math.cos(30 * radians)) return cue("follow-facing", "Keep facing the ball", "Turn back toward the ball to continue the follow-through hold.", 2);
  }
  return null;
}

export function coachingAction(mode, controls = {}) {
  const stage = mode.masteryStep;
  const car = mode.physCar;
  if (!car) return null;
  const speed = Math.hypot(car.vel.x, car.vel.y);
  if (mode.variant === "driving") {
    const target = mode.setup?.targets[mode.nextTarget];
    if (!target) return null;
    const distance = Math.hypot(target[0] - car.pos.x, target[1] - car.pos.y);
    if (stage === 3) return distance <= mode.setup.targetRadius
      ? cue("action-stop", "Hold your stop inside the target", "Keep the wheels down and stay below 5 km/h for half a second.")
      : cue("action-arrive", "Brake before the target", "You start at speed. Brake early enough to stop inside the small yellow circle; do not boost.");
    if (stage === 2) return cue("action-boost", `Boost through target ${mode.nextTarget + 1} of ${mode.setup.targets.length}`, "Reach each target while boosting at 80 km/h or faster. Stay between the lane edges.");
    if (stage === 4) return cue("action-route", `Drive to target ${mode.nextTarget + 1} of ${mode.setup.targets.length}`, "Reach checkpoints in order at 25 km/h or faster without boost. Lift before turns and accelerate out.");
    return cue("action-drive", stage === 0 ? "Build throttle speed in the narrow lane" : `Take corner checkpoint ${mode.nextTarget + 1} of ${mode.setup.targets.length}`, stage === 0 ? "Stay between the lane edges without boost. Enter the target at 35 km/h or faster." : "Use throttle and steering without boost. Ease off before the corner, then accelerate toward the next checkpoint.");
  }
  if (mode.variant === "dodges") {
    if (!mode.jumped) return cue("action-jump", stage === 0 ? "Tap jump once" : "Hold your first jump", stage === 0 ? "Release jump after the tap. Do not jump again; prepare to land wheels-down." : "Hold through the initial rise, then release before the next action.");
    if (stage === 1 && controls.jump && mode.jumpHold < 0.18) return cue("action-hold", "Keep holding jump", "Finish the 0.18-second hold, then release and prepare your landing.");
    if (stage >= 2 && !mode.doubleJumped && !mode.flipped) return controls.jump
      ? cue("action-release", "Release jump before pressing again", "A second jump needs a fresh press, not a continuous hold.")
      : cue("action-second-jump", stage === 2 ? "Press jump again with neutral input" : `Press jump again to dodge ${mode.setup.dodge}`, stage === 2 ? "Centre your directional input for a double jump, then prepare to land upright." : "Hold the requested direction on the second press, then release it and prepare to land.");
    return cue("action-land", car.onGround ? "Stay upright and let the landing settle" : "Prepare to land wheels-down", "Stop adding rotation and hold a stable upright landing for a quarter second. Do not boost.");
  }
  if (mode.variant === "static") {
    if (!mode.touches) return cue("action-contact", stage >= 2 ? "Line up the ball with the yellow gate" : "Drive into the ball with your nose", stage >= 2 ? "Aim your first touch through the gate. Keep the touch low and do not hit it again." : "Use a controlled approach and keep the front of the car facing the ball.");
    if (stage === 4 && mode.gateHit) return cue("action-follow", "Follow the ball through the gate", "Stay within 600 uu, grounded and facing the ball, for half a second.");
    return cue("action-watch", "Let your first touch travel", stage >= 3 ? "Do not add another touch. Watch the ball cross the gate at 28.8-43.2 km/h." : "Do not hit it again. Let the ball travel through the yellow gate.");
  }
  if (mode.variant === "soft") {
    if (mode.firstTouchTime == null) return cue("action-receive", "Meet the ball gently", "Face the incoming ball, ease off the throttle and cushion it with a low first touch.");
    if (stage === 2) return cue("action-exit", `Guide the reception ${mode.setup.exitSide > 0 ? "left" : "right"}`, "Move toward the marked exit while keeping the ball close and low. Avoid an extra hit.");
    if (stage === 4 && mode.receptionReady) return cue("action-next-touch", "Make your separate second touch now", "The reception is ready. Reach the ball again before the three-second window closes.");
    return cue("action-cushion", "Follow gently while the ball settles", "Stay close without another hit yet. Keep the ball low and match its movement.");
  }
  if (["rollTouch", "recovery"].includes(mode.variant)) {
    const needsTouch = mode.variant === "rollTouch" || stage >= 3;
    if (needsTouch && mode.firstTouchTime == null) return cue("action-roll-touch", "Roll into alignment, then meet the ball", stage === 0 && mode.variant === "rollTouch" ? "Use a short deliberate air roll while keeping your approach on the ball." : "Bring the wheels underneath, release roll as you align, and keep your nose aimed at the ball.");
    if (mode.variant === "rollTouch" && stage < 4) return cue("action-release-touch", "Let the aerial touch settle", "Do not add another hit. Let the release speed be measured before the attempt finishes.");
    if (car.onGround && mode.variant === "recovery" && [2, 4].includes(stage) && mode.landingTime != null) return cue("action-drive-out", "Drive forward out of the landing", "Stay wheels-down and carry at least 10.8 km/h along your landing direction for the 150 uu exit.");
    return cue("action-recover", car.onGround ? "Hold a stable wheels-down landing" : "Recover toward the floor", "Release unnecessary rotation, face along your movement and settle on all four wheels.");
  }
  return null;
}

const explanations = {
  "Entered target too slowly": "You entered below the required pace. Build speed before reaching the checkpoint.",
  "Not enough boost": "Use at least 0.8 seconds of boost before entering the first target.",
  "Boost through each target": "Keep boost active as you reach each of the five targets.",
  "Skipped checkpoint": "You reached a later checkpoint first. Follow the active yellow target in order.",
  "Keep the wheels down": "You jumped. Stay on the ground for this drill.",
  "Throttle only": "You used boost. Drive without boost this time.",
  "Left the lane": "You drove outside the lane. Use smaller turns to stay between the lines.",
  "Overshot the stop": "You went past the target. Brake earlier and stop inside it.",
  "No boost in this stage": "You used boost. Use only jump and steering for this drill.",
  "Single jump only": "You jumped twice. Jump once, then land.",
  "Neutral second jump required": "You dodged instead of double jumping. Centre the stick before your second jump.",
  "Wrong dodge direction": "You dodged the wrong way. Hold the requested direction on your second jump.",
  "No deliberate air roll": "Not enough deliberate roll was measured before contact. Add a short air roll, then align for the touch.",
  "Touch before alignment": "Contact occurred while the car was tilted. Release roll earlier and settle the orientation before contact.",
  "Grounded contact": "The touch happened on the ground. Reach the ball while airborne in this stage.",
  "Side contact": "The ball met the side of the hitbox. Square your nose to the approach before touching.",
  "Rear contact": "The ball met the rear of the hitbox. Turn the nose toward the ball before touching.",
  "Roof contact": "The ball met the roof. Correct your tilt before touching.",
  "Extra touch": "Another contact occurred before the stage was complete. Let the first touch travel and focus on the next objective.",
  "Extra touch before reception": "The next contact happened before a controlled reception was ready. Cushion and follow first.",
  "Reception too high": "The ball rose above 200 uu. Use a lower, gentler contact on the next attempt.",
  "Not cushioned enough": "Your touch did not slow the ball enough. Brake and meet it more gently.",
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
  const detail = explanations[message] || `You didn't finish the goal. Try again: ${mode.prompt || opening}`;
  let value = null;
  if (message === "Wrong dodge direction") value = `Requested: ${mode.setup.dodge}`;
  if (message === "Not cushioned enough" && mode.receivedSpeed != null) value = `${formatSpeed(mode.receivedSpeed)} after contact · limit ${formatSpeed(mode.incomingSpeed * 0.6)}`;
  if (["Too soft", "Too hard"].includes(message)) value = `${formatSpeed(mode.variant === "rollTouch" ? mode.receivedSpeed : mode.gateSpeed)} measured`;
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
    this.finishedResult = null;
    this.resultFeedback = null;
  }

  update(mode, controls, dt, opening) {
    if (this.setup !== mode.setup) {
      this.setup = mode.setup;
      this.reset();
    }
    if (mode.result) {
      if (this.finishedResult === mode.result) return this.resultFeedback;
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
      this.finishedResult = mode.result;
      this.resultFeedback = feedback;
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
    return this.current || (mode.elapsed < 1.5 && this.missCount >= 2 ? cue("repeat", "Focus for this attempt", this.repeatedMiss.detail, 1) : coachingAction(mode, controls) || cue("objective", mode.prompt || "Stage objective", opening, 0));
  }
}