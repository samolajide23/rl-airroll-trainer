import { createBallTrainingHistory } from "./staticBallTraining.js";

export const MOVEMENT_TRAINING = {
  driving: {
    history: createBallTrainingHistory("rl-driving-mastery-v1"),
    steps: [
      { title: "Straight-Line Control", goal: "Drive a clean line to the target.", success: "Reach the target without boost or jumping, staying within 180 uu of the starting line.", cue: "Make small steering corrections before speed builds." },
      { title: "Turn With Control", goal: "Turn toward a target from an angled start.", success: "Use steering and reach the target wheels-down, facing within 30 degrees of the approach line.", cue: "Ease off the throttle if the turn starts running wide." },
      { title: "Boost With Purpose", goal: "Build speed toward a useful destination.", success: "Use at least 0.1 seconds of boost and reach the target at 1,600 uu/s or faster, wheels-down.", cue: "Line up first, then boost along the target line." },
      { title: "Brake and Reposition", goal: "Arrive under control instead of racing past the target.", success: "Use the brake and stop within 180 uu of the target at under 150 uu/s for 0.25 seconds.", cue: "Start braking before you enter the target." },
      { title: "Follow a Route", goal: "Connect three destinations in order.", success: "Reach each active yellow target within 180 uu, wheels-down, without skipping a target.", cue: "Look toward the next turn while finishing the current approach." },
    ],
    setup: "Fixed: 1,000 uu target distance; boost target 1,800 uu away. Turning starts 45 degrees off line. Braking starts at 700 uu/s. Varied: distances change by up to 100 uu, headings by up to 10 degrees, and turn/route sides alternate. Route legs are approximately 700 uu.",
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
    setup: "Stationary, wheels-down starts. Fixed faces upfield; varied headings rotate by up to 15 degrees. Stage five alternates backward, left and right in varied practice. Jump height is measured above the starting physics origin.",
  },
};

export function generateMovementSetup(variant, step, varied, index = 0, random = Math.random) {
  const side = varied && index % 2 ? -1 : 1;
  const yaw = Math.PI / 2 + (varied ? (random() * 2 - 1) * (variant === "dodges" ? 15 : 10) * Math.PI / 180 : 0);
  const distance = (step === 2 ? 1800 : 1000) + (varied ? (random() * 2 - 1) * 100 : 0);
  const targets = step === 4 ? [[0, 700, 0], [side * 450, 1300, 0], [0, 1900, 0]] : [[0, distance, 0]];
  const dodge = step === 4 ? (varied ? ["backward", "left", "right"][index % 3] : "right") : "forward";
  return { position: [0, 0, 0], ballPosition: null, yaw: yaw + (variant === "driving" && step === 1 ? side * Math.PI / 4 : 0), velocity: variant === "driving" && step === 3 ? [0, 700, 0] : [0, 0, 0], targets, dodge };
}