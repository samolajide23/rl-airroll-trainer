import { createBallTrainingHistory } from "./staticBallTraining.js";

const history = createBallTrainingHistory("rl-soft-ball-mastery-v1");
export const softBallHistory = history.read;
export const recordSoftBallSet = history.record;
export const softBallSummary = history.summary;

export function generateSoftBallSetup(step, varied, index = 0, random = Math.random) {
  const advanced = step >= 3;
  const speed = varied ? advanced ? 400 + random() * 400 : 450 + random() * 150 : 500;
  const angle = varied ? [0, -20, 20, -35, 35, -50, 50, -65, 65][index % 9] * Math.PI / 180 : 0;
  const direction = [Math.sin(angle), -Math.cos(angle), 0];
  const distance = varied ? 1000 + random() * 400 : 1200;
  const offset = varied ? (random() * 2 - 1) * 80 : 0;
  return {
    position: [-direction[1] * offset, direction[0] * offset, 0],
    yaw: Math.PI / 2 + angle,
    ballPosition: direction.map(component => -component * distance),
    ballVelocity: direction.map(component => component * speed),
    carVelocity: direction.map(component => component * 180),
    direction,
    exitSide: varied ? index % 2 === 0 ? 1 : -1 : 1,
  };
}

export function softExitOffset(position, origin, direction) {
  const horizontal = position.x - origin.x;
  const vertical = position.y - origin.y;
  return { lateral: horizontal * -direction.y + vertical * direction.x, forward: horizontal * -direction.x + vertical * -direction.y };
}