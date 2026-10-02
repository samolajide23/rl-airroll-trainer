import { createBallTrainingHistory } from "./staticBallTraining.js";

const history = createBallTrainingHistory("rl-recovery-mastery-v1");
export const recordRecoverySet = history.record;
export const recoverySummary = history.summary;

export const RECOVERY_MASTERY = [
  { title: "Land Wheels Down", goal: "Recover from a tilted airborne start onto the floor.", success: "Stay grounded and upright, with angular speed below 0.6 rad/s, for 0.35 seconds within 4 seconds of launch.", cue: "Rotate early, then release the roll before the wheels arrive." },
  { title: "Land With Momentum", goal: "Point the nose along your travel before settling.", success: "Complete the stable landing while moving at least 10.8 km/h, facing within 30 degrees of horizontal velocity.", cue: "Follow your travel direction rather than fighting it." },
  { title: "Drive Out", goal: "Turn the landing into a useful forward exit.", success: "After the aligned landing, travel 150 uu forward within 1.5 seconds while grounded, aligned and moving at least 10.8 km/h.", cue: "Settle the wheels, then carry the speed into your exit." },
  { title: "Touch and Land", goal: "Make an airborne touch and recover to a stable landing.", success: "Make one airborne touch, then complete the stable landing within 3 seconds of contact.", cue: "After contact, shift your attention from the ball to the floor." },
  { title: "Ready for the Next Play", goal: "Connect an aerial touch, aligned landing and forward exit.", success: "Make one airborne touch, land stably along your momentum within 3 seconds, then complete the 150 uu forward exit within 1.5 seconds.", cue: "Keep the recovery moving so the next action is available." },
];

export function generateRecoverySetup(step, varied, index = 0, random = Math.random) {
  const angle = varied ? [0, -15, 15, -30, 30, -45, 45, -60, 60][index % 9] * Math.PI / 180 : 0;
  const direction = [Math.sin(angle), Math.cos(angle), 0];
  const height = varied ? 550 + random() * 100 : 600;
  const speed = varied ? 400 + random() * 100 : 450;
  const distance = varied ? 350 + random() * 100 : 400;
  const roll = (Math.PI / 2 + (varied ? [-15, 0, 15][Math.floor(index / 9) % 3] * Math.PI / 180 : 0)) * (varied && index % 2 ? -1 : 1);
  return { position: direction.map((component, axis) => axis === 2 ? height : -component * distance), ballPosition: step >= 3 ? [0, 0, height] : null, carVelocity: direction.map(component => component * speed), yaw: Math.atan2(direction[1], direction[0]), roll, direction };
}