import { Vector3, Quaternion, Matrix4 } from "three";
import { ChaseCamera } from "../shared/chaseCamera.js";
import { frameAt, samplePose } from "./timeline.js";
import { raycastArena } from "../shared/arenaMesh.js";
import { getHitboxForCarId } from "../shared/hitboxPresets.js";

export function inferReplayCameraSurface(pose, carId, query = raycastArena) {
  const hitbox = getHitboxForCarId(carId);
  const up = new Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
  const direction = new Vector3(-up.x, -up.z, -up.y);
  const normal = new Vector3();
  let contacts = 0;
  for (const pair of [hitbox.wheels.front, hitbox.wheels.back]) {
    for (const side of [-1, 1]) {
      const offset = new Vector3(pair.offset[0], pair.offset[2], side * pair.offset[1])
        .multiplyScalar(0.01).applyQuaternion(pose.quaternion).add(pose.position);
      const hit = query(new Vector3(offset.x, offset.z, offset.y).multiplyScalar(100),
        direction, pair.suspensionRest + pair.radius);
      if (!hit?.normal || hit.normal.dot(direction) > -0.5) continue;
      const surfaceNormal = new Vector3(hit.normal.x, hit.normal.z, hit.normal.y);
      if (contacts && surfaceNormal.dot(normal.clone().normalize()) < 0.8) continue;
      normal.add(surfaceNormal);
      contacts++;
    }
  }
  return { onGround: contacts >= 3, groundNormal: contacts >= 3 ? normal.normalize() : undefined };
}

export function constrainReplayCamera(position, target) {
  const origin = new Vector3(target.x, target.z, target.y).multiplyScalar(100);
  const destination = new Vector3(position.x, position.z, position.y).multiplyScalar(100);
  const direction = destination.sub(origin);
  const distance = direction.length();
  if (distance <= 20) return false;
  direction.divideScalar(distance);
  const hit = raycastArena(origin, direction, distance + 20);
  if (!hit || hit.dist >= distance + 20) return false;
  origin.addScaledVector(direction, Math.max(0, hit.dist - 20));
  position.set(origin.x, origin.z, origin.y).multiplyScalar(0.01);
  return true;
}

export function playerCameraSettings(player) {
  const recorded = player.cameraSettings ?? {};
  const value = (name, fallback) => Number.isFinite(recorded[name]) ? recorded[name] : fallback;
  return { fov: value("fov", 110), distance: value("distance", 270),
    height: value("height", 100), angle: value("angle", -3), stiffness: value("stiffness", 0.5),
    swivelSpeed: value("swivel_speed", 2.5), transitionSpeed: value("transition_speed", 1), shake: false };
}

export function createPlayerCameraTrack(replay, playerIndex, ballCam) {
  const player = replay.players[playerIndex];
  const settings = playerCameraSettings(player);
  const chase = new ChaseCamera();
  const frames = [];
  const worldUp = new Vector3(0, 1, 0);
  const matrix = new Matrix4();
  const virtual = { aspect: 16 / 9, fov: 65, position: new Vector3(), quaternion: new Quaternion(), up: worldUp.clone(),
    updateProjectionMatrix() {}, lookAt(target) { this.quaternion.setFromRotationMatrix(matrix.lookAt(this.position, target, worldUp)); } };
  let previousPosition;
  return (camera, cursor) => {
    const time = replay.times[cursor.index] +
      (replay.times[cursor.next] - replay.times[cursor.index]) * cursor.blend;
    const tick = time * 120;
    const firstTick = Math.floor(tick);
    const nextTick = Math.ceil(tick);
    while (frames.length <= nextTick) {
      const index = frames.length;
      const sample = frameAt(replay.times, Math.min(index / 120, replay.times.at(-1)));
      const pose = samplePose(player.frames, sample);
      const ball = samplePose(replay.ball, sample);
      let cut = !pose;
      if (pose) {
        const data = player.frames[sample.index].Data;
        const look = data.camera ?? {};
        const axis = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, (value - 128) / 127)) : 0;
        cut = !previousPosition || previousPosition.distanceTo(pose.position) > 15;
        const nextPose = samplePose(player.frames, { index: sample.next, next: sample.next, blend: 0 });
        const nextLook = player.frames[sample.next]?.Data?.camera ?? {};
        const lookBlend = !cut && sample.interval <= 0.1 && nextPose &&
          nextPose.position.distanceTo(pose.position) <= 15 ? sample.blend : 0;
        const lookAxis = name => axis(look[name]) +
          (axis(nextLook[name] ?? look[name]) - axis(look[name])) * lookBlend;
        const surface = inferReplayCameraSurface(pose, player.carId);
        chase.update(virtual, 1 / 120, {
          settings, target: pose.position, forward: new Vector3(1, 0, 0).applyQuaternion(pose.quaternion),
          velocity: pose.velocity,
          onGround: surface.onGround, groundNormal: surface.groundNormal,
          boosting: pose.boost, lookAt: ball?.position,
          ballCam: (ballCam ?? player.ballCam?.[sample.index] ?? true) && Boolean(ball),
          lookBehind: player.rearView?.[sample.index] === true,
          lookRight: lookAxis("yaw"), lookUp: -lookAxis("pitch"),
          snap: cut,
        });
        constrainReplayCamera(virtual.position, pose.position);
        previousPosition = pose.position.clone();
      } else previousPosition = undefined;
      frames.push({ position: virtual.position.clone(), quaternion: virtual.quaternion.clone(),
        fov: virtual.fov, cut });
    }
    const first = frames[firstTick];
    const next = frames[nextTick];
    const blend = next.cut ? 0 : tick - firstTick;
    camera.position.copy(first.position).lerp(next.position, blend);
    camera.quaternion.copy(first.quaternion).slerp(next.quaternion, blend);
    const pose = samplePose(player.frames, cursor);
    if (pose) constrainReplayCamera(camera.position, pose.position);
    camera.fov = first.fov + (next.fov - first.fov) * blend;
    camera.updateProjectionMatrix();
  };
}