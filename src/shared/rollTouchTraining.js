import { createBallTrainingHistory } from "./staticBallTraining.js";

const history = createBallTrainingHistory("rl-roll-touch-mastery-v1");
export const recordRollTouchSet = history.record;
export const rollTouchSummary = history.summary;

export const ROLL_TOUCH_MASTERY = [
  { title: "Roll Into Contact", goal: "Use air roll during a short airborne approach and meet the ball.", success: "Make an airborne contact after deliberate air-roll movement.", cue: "Use a short roll input; keep the ball on your approach line." },
  { title: "Present the Wheels", goal: "Rotate from a tilted start into a wheels-down aerial touch.", success: "Roll, then contact while airborne with your up axis within 23 degrees of upright.", cue: "Release the roll early enough to arrive upright." },
  { title: "Present the Nose", goal: "Combine roll alignment with a front-of-car strike.", success: "Arrive upright and airborne, with the contact normal within 30 degrees of the nose.", cue: "Keep the nose on the ball while rotating the wheels underneath." },
  { title: "Control the Release", goal: "Use the aligned front touch to produce a controlled release.", success: "Complete the aligned front touch with 10.8–32.4 km/h ball speed, sampled 0.1 seconds after contact.", cue: "Adjust your approach speed before the touch rather than correcting the ball afterward." },
  { title: "Touch and Recover", goal: "Connect the controlled aerial touch to a stable landing.", success: "Complete the controlled release, then land upright with angular speed below 0.6 rad/s for 0.35 seconds, within 3 seconds of contact.", cue: "After the strike, stop rotating and prepare the wheels for the floor." },
];

export function generateRollTouchSetup(step, varied, index = 0, random = Math.random) {
  const angle = varied ? [0, -15, 15, -30, 30, -45, 45, -60, 60][index % 9] * Math.PI / 180 : 0;
  const direction = [Math.sin(angle), Math.cos(angle), 0];
  const distance = varied ? 350 + random() * 100 : 400;
  const height = varied ? 550 + random() * 100 : 600;
  const speed = varied ? 400 + random() * 100 : 450;
  const roll = ((step === 0 ? Math.PI / 4 : Math.PI / 2) + (varied ? [-10, 0, 10][Math.floor(index / 9) % 3] * Math.PI / 180 : 0)) * (varied && index % 2 ? -1 : 1);
  return { position: [-direction[0] * distance, -direction[1] * distance, height], ballPosition: [0, 0, height], carVelocity: direction.map(component => component * speed), yaw: Math.atan2(direction[1], direction[0]), roll, direction };
}