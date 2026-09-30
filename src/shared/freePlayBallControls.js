import * as THREE from "three";
import { RL, axes, carHitbox, makeBall } from "./rl-physics.js";

const PASS_SPEED = 1500;
const LAUNCH_SPEED = 1800;
const SHOT_SPEED = 2000;

function aimBall(ball, target, speed, targetVelocity = new THREE.Vector3()) {
  let duration = Math.min(2, Math.max(0.3, ball.pos.distanceTo(target) / speed));
  for (let iteration = 0; iteration < 3; iteration++) {
    const predicted = target.clone().addScaledVector(targetVelocity, duration);
    duration = Math.min(2, Math.max(0.3, ball.pos.distanceTo(predicted) / speed));
  }
  const ticks = Math.max(1, Math.round(duration / RL.DT));
  duration = ticks * RL.DT;
  const predicted = target.clone().addScaledVector(targetVelocity, duration);
  const damping = Math.pow(1 - RL.BALL_DRAG, RL.DT);
  const decaySum = damping * (1 - Math.pow(damping, ticks)) / (1 - damping);
  const gravityDisplacement = RL.GRAVITY * RL.DT * RL.DT * (ticks - decaySum) / (1 - damping);
  ball.vel.copy(predicted).sub(ball.pos);
  ball.vel.z += gravityDisplacement;
  ball.vel.divideScalar(RL.DT * decaySum);
  if (ball.vel.length() > RL.BALL_MAX_SPEED) ball.vel.setLength(RL.BALL_MAX_SPEED);
  ball.omega.set(0, 0, 0);
}

export function applyFreePlayBallControl(action, car, ball) {
  if (action === "resetBall") return makeBall(new THREE.Vector3(0, 0, RL.BALL_REST_Z));
  const frame = axes(car.q);
  if (action === "takePossession" || action === "startDribble") {
    const next = makeBall();
    const box = carHitbox(car);
    if (action === "takePossession") {
      const forward = new THREE.Vector3(frame.f.x, frame.f.y, 0);
      if (forward.lengthSq() < 1e-8) forward.set(1, 0, 0);
      forward.normalize();
      next.pos.copy(box.center).addScaledVector(forward, box.half[0] + RL.BALL_RADIUS + 35);
      next.pos.z = RL.BALL_REST_Z;
      next.vel.set(car.vel.x, car.vel.y, 0);
    } else {
      next.pos.copy(box.center).addScaledVector(box.u, box.half[2] + RL.BALL_RADIUS + 2).addScaledVector(box.f, box.half[0] * 0.25);
      next.pos.z = Math.max(RL.BALL_REST_Z, next.pos.z);
      next.vel.copy(car.vel);
      if (next.vel.lengthSq() === 0) next.vel.z = -0.001;
    }
    return next;
  }
  if (action === "passBall") {
    const target = car.pos.clone();
    target.z = Math.max(RL.BALL_REST_Z, target.z);
    aimBall(ball, target, PASS_SPEED, new THREE.Vector3(car.vel.x, car.vel.y, 0));
  } else if (action === "launchBall") {
    ball.vel.set(0, 0, LAUNCH_SPEED);
    ball.omega.set(0, 0, 0);
  } else if (action === "defendShot") {
    const goalY = ball.pos.y >= 0 ? RL.HALF_L : -RL.HALF_L;
    aimBall(ball, new THREE.Vector3(0, goalY, RL.BALL_RADIUS + 120), SHOT_SPEED);
  }
  return ball;
}