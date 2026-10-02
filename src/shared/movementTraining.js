import { createBallTrainingHistory } from "./staticBallTraining.js";

export const MOVEMENT_TRAINING = {
  driving: {
    history: createBallTrainingHistory("rl-driving-mastery-v2"),
    steps: [
      { title: "Precision Straight", goal: "Hold a narrow line while building throttle speed.", success: "Stay within 100 uu of the centre line without boost or jumping. Enter the 100 uu target at 35 km/h or faster.", cue: "Use small corrections; creeping into the target does not count." },
      { title: "Controlled Corner", goal: "Connect five corner checkpoints using throttle and steering.", success: "Reach all five 120 uu checkpoints in order, wheels-down and without boost. Use deliberate steering through the corners.", cue: "Ease off before turning, then accelerate out of the corner." },
      { title: "Boosted Sprint", goal: "Drive through five targets while boosting.", success: "Stay within 140 uu of the centre line. Reach all five 120 uu targets in order while boosting at 80 km/h or faster, wheels-down. Use at least 0.8 seconds of boost before target one.", cue: "Build speed early and keep boosting through each target." },
      { title: "High-Speed Stop", goal: "Brake a fast approach into a precise stationary finish.", success: "Start at 50 km/h. Brake and hold inside the 100 uu target below 5 km/h for 0.5 seconds, without boost or jumping.", cue: "Judge stopping distance early; rolling through the target is not enough." },
      { title: "Slalom at Pace", goal: "Link opposing turns without losing all your momentum.", success: "Reach three 120 uu checkpoints in order at 25 km/h or faster, wheels-down and without boost. Passing a later checkpoint first fails.", cue: "Lift before each turn and accelerate toward the next checkpoint." },
    ],
    setup: "Fixed practice repeats the same route. Varied mixes starting offset, initial alignment, run length, corner width, checkpoint spacing and slalom width. Corner and slalom routes alternate left and right. Speed limits, target sizes and lane widths stay the same.",
  },
  dodges: {
    history: createBallTrainingHistory("rl-dodges-mastery-v1"),
    steps: [
      { title: "Single Jump", goal: "Leave the ground once and land under control.", success: "Make one jump, gain at least 60 uu of height and land upright for 0.25 seconds. No second jump or boost.", cue: "Release jump and let the car settle back onto its wheels." },
      { title: "Control Jump Height", goal: "Use jump hold to reach a higher apex.", success: "Hold jump for at least 0.18 seconds, gain at least 180 uu of height and land upright. No second jump or boost.", cue: "Keep jump held through the initial rise, then release." },
      { title: "Double Jump", goal: "Gain height with a neutral second jump.", success: "Release and press jump again with neutral directional input; gain at least 250 uu and land upright. Dodging or boosting fails.", cue: "Centre your directional input before the second press." },
      { title: "Forward Dodge", goal: "Turn the second jump into a purposeful forward dodge.", success: "Make a forward dodge, travel at least 400 uu forward and finish with a stable upright landing. No boost.", cue: "Release jump, then press again with forward pitch." },
      { title: "Directional Dodges", goal: "Dodge toward the requested direction.", success: "Dodge backward, left or right as requested, travel at least 300 uu that way and land upright. Fixed requests right; varied alternates all three.", cue: "Choose the second-press direction before leaving the ground." },
    ],
    setup: "Stationary, wheels-down starts. Fixed faces upfield; varied uses nine headings with small heading offsets. Stage five alternates backward, left and right independently of the heading. Jump height is measured above the starting physics origin.",
  },
};

MOVEMENT_TRAINING.driving.steps.forEach((step, index) => {
  step.goal = ["Drive straight through the target.", "Follow the five targets around the corners.", "Drive through all five targets while boosting.", "Brake and stop inside the target.", "Weave through all three targets."][index];
  step.requirements = [
    ["Stay between the lines", "Finish at 35 km/h or faster", "No boost or jump"],
    ["Hit all 5 targets in order", "Steer through the corners", "No boost or jump"],
    ["Hit all 5 targets in order", "Boost through each at 80 km/h or faster", "Stay between the lines", "No jump"],
    ["Start at 50 km/h", "Brake inside the circle", "Stay below 5 km/h for half a second", "No boost or jump"],
    ["Hit all 3 targets in order", "Reach each at 25 km/h or faster", "No boost or jump"],
  ][index];
});

export function generateMovementSetup(variant, step, varied, index = 0, random = Math.random) {
  const side = varied && index % 2 ? -1 : 1;
  const heading = variant === "dodges" && varied ? [0, -20, 20, -45, 45, -90, 90, -135, 135][index % 9] : 0;
  const alignment = variant === "driving" && varied ? [-6, 0, 6][Math.floor(index / 2) % 3] + (random() * 2 - 1) * 4 : varied ? (random() * 2 - 1) * 10 : 0;
  const yaw = Math.PI / 2 + (heading + alignment) * Math.PI / 180;
  const distance = (variant === "dodges" ? step === 2 ? 1800 : 1000 : step === 2 ? 3000 : step === 3 ? 1800 : 2200) + (varied ? (random() * 2 - 1) * 300 : 0);
  const routes = [[[0, 900, 0], [700, 1700, 0], [-250, 2600, 0]], [[250, 900, 0], [-650, 1750, 0], [350, 2700, 0]], [[-200, 1000, 0], [750, 1850, 0], [-150, 2850, 0]]];
  const routeIndex = Math.floor(index / 2);
  const drivingVariation = variant === "driving" && varied;
  const widthScale = drivingVariation ? [0.85, 1, 1.15][Math.floor(routeIndex / 3) % 3] + (random() - 0.5) * 0.1 : 1;
  const spacingScale = drivingVariation ? [0.9, 1, 1.1][routeIndex % 3] + (random() - 0.5) * 0.1 : 1;
  const targets = variant === "driving" && step === 2
    ? [0, 1, 2, 3, 4].map(checkpoint => [0, distance + checkpoint * 350, 0])
    : step === 4 ? routes[varied ? routeIndex % routes.length : 0].map(([horizontal, forward, height]) => [horizontal * side * widthScale, forward * spacingScale, height])
    : variant === "driving" && step === 1 ? [[0, 700, 0], [650, 1300, 0], [1200, 1500, 0], [1700, 1900, 0], [1600, 2800, 0]].map(([horizontal, forward, height]) => [horizontal * side * widthScale, forward * spacingScale, height]) : [[0, distance, 0]];
  const offsetLimit = step === 0 ? 40 : step === 2 ? 60 : 100;
  const offset = drivingVariation ? [-1, 0, 1][routeIndex % 3] * offsetLimit + (random() - 0.5) * offsetLimit * 0.4 : 0;
  const dodge = step === 4 ? (varied ? ["backward", "left", "right"][(index + Math.floor(index / 9)) % 3] : "right") : "forward";
  const turnAngle = varied ? [35, 45, 60, 75][Math.floor(index / 2) % 4] * Math.PI / 180 : Math.PI / 4;
  return { position: [offset * side, 0, 0], ballPosition: null, yaw: yaw + (variant === "driving" && step === 1 ? side * turnAngle : 0), velocity: variant === "driving" && step === 3 ? [0, 50 / 0.036, 0] : [0, 0, 0], targets, dodge, ...(variant === "driving" ? { targetRadius: [100, 120, 120, 100, 120][step], laneWidth: step === 0 ? 100 : step === 2 ? 140 : null, minSpeed: [35, 0, 80, 0, 25][step] / 0.036, boostRequired: step === 2 ? 0.8 : 0, stopSpeed: 5 / 0.036, stopHold: 0.5 } : {}) };
}