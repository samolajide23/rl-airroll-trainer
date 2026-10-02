import { PerspectiveCamera, Vector3, MathUtils } from "three";
import { frameAt, samplePose } from "./timeline.js";

export function frameReplayGoal(camera, replay, time) {
  const goal = (replay.events ?? []).find(event => event.type === "goal" &&
    time >= event.time - 3 && time <= event.time + 3);
  if (!goal) return 0;
  const age = time - goal.time;
  const weight = MathUtils.smoothstep(age, -3, -1) * (1 - MathUtils.smoothstep(age, 1, 3));
  if (!weight) return 0;
  const sign = goal.team === 0 ? 1 : -1;
  const ball = samplePose(replay.ball, frameAt(replay.times, Math.min(time, goal.time)))?.position;
  const minimum = new Vector3(-9.5, 0, sign * 51.2);
  const maximum = new Vector3(9.5, 7.5, sign * 51.2);
  if (ball) { minimum.min(ball); maximum.max(ball); }
  const target = minimum.clone().add(maximum).multiplyScalar(0.5);
  const radius = Math.max(8, minimum.distanceTo(maximum) * 0.5) + 2;
  const shot = new PerspectiveCamera(65, camera.aspect, camera.near, camera.far);
  const halfAngle = Math.min(shot.fov * Math.PI / 360,
    Math.atan(Math.tan(shot.fov * Math.PI / 360) * shot.aspect));
  const distance = radius / Math.sin(halfAngle);
  const side = (goal.position?.[0] ?? 0) >= 0 ? -1 : 1;
  shot.position.copy(target).addScaledVector(new Vector3(side * 0.65, 0.45, -sign).normalize(), distance);
  shot.lookAt(target);
  camera.position.lerp(shot.position, weight);
  camera.quaternion.slerp(shot.quaternion, weight);
  camera.fov = MathUtils.lerp(camera.fov, shot.fov, weight);
  camera.updateProjectionMatrix();
  return weight;
}