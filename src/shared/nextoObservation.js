import * as THREE from "three";

export const NEXTO_ACTIONS = [];
for (const throttle of [-1, 0, 1]) for (const steer of [-1, 0, 1]) {
  for (const boost of [0, 1]) for (const handbrake of [0, 1]) {
    if (boost && throttle !== 1) continue;
    NEXTO_ACTIONS.push([throttle || boost, steer, 0, steer, 0, 0, boost, handbrake]);
  }
}
for (const pitch of [-1, 0, 1]) for (const yaw of [-1, 0, 1]) for (const roll of [-1, 0, 1]) {
  for (const jump of [0, 1]) for (const boost of [0, 1]) {
    if (jump && yaw !== 0) continue;
    if (pitch === 0 && roll === 0 && jump === 0) continue;
    NEXTO_ACTIONS.push([boost, yaw, pitch, yaw, roll, jump, boost, Number(Boolean(jump && (pitch || yaw || roll)))]);
  }
}

export function nextoControls(action) {
  return {
    throttle: action[0], steer: action[1], pitch: action[2], yaw: action[3], roll: action[4],
    jump: action[5] > 0, boost: action[6] > 0, handbrake: action[7] > 0,
  };
}

export function nextoObservation(self, opponent, ball, pads, previousAction = Array(8).fill(0)) {
  if (pads.length !== 34) throw new Error("Nexto requires 34 soccar boost pads");
  const rows = [self, opponent].map((car, index) => {
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(car.q);
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(car.q);
    return [Number(index === 0), Number(car.team === 0), Number(car.team === 1), 0, 0,
      ...car.pos.toArray(), ...car.vel.toArray(), ...forward.toArray(), ...up.toArray(), ...car.omega.toArray(),
      car.boost / 100, Number(Boolean(car.isDemoed)), Number(Boolean(car.onGround)),
      Number(!car.hasDoubleJumped && !car.hasFlipped && (car.onGround || !car.hasJumped || car.airTimeSinceJump < 1.25)),
    ];
  });
  rows.push([0, 0, 0, 1, 0, ...ball.pos.toArray(), ...ball.vel.toArray(), 0, 0, 0, 0, 0, 0, ...ball.omega.toArray(), 0, 0, 0, 0]);
  const ordered = [...pads].sort((first, second) => first.y - second.y || first.x - second.x);
  for (const centerY of [-1024, 1024]) {
    const centerIndex = ordered.findIndex(pad => pad.x === 0 && pad.y === centerY);
    const [center] = ordered.splice(centerIndex, 1);
    const leftIndex = ordered.findIndex(pad => pad.x === -2048 && Math.sign(pad.y) === Math.sign(centerY));
    ordered.splice(leftIndex + 1, 0, center);
  }
  for (const pad of ordered) rows.push([0, 0, 0, 0, 1, pad.x, pad.y, pad.big ? 73 : 70,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, pad.big ? 1 : 0.12, Number(pad.active), 0, 0]);
  for (const row of rows) {
    if (self.team === 1) {
      [row[1], row[2]] = [row[2], row[1]];
      for (let offset = 5; offset < 20; offset += 3) { row[offset] *= -1; row[offset + 1] *= -1; }
    }
    for (let offset = 5; offset < 11; offset++) row[offset] /= 2300;
    for (let offset = 17; offset < 20; offset++) row[offset] /= 5.5;
  }
  const query = [...rows[0], ...previousAction];
  const theta = Math.atan2(rows[0][11], rows[0][12]);
  const cosine = Math.cos(theta);
  const sine = Math.sin(theta);
  for (const row of rows) {
    for (let offset = 5; offset < 8; offset++) row[offset] -= query[offset];
    for (let offset = 5; offset < 20; offset += 3) {
      const horizontal = cosine * row[offset] - sine * row[offset + 1];
      const vertical = sine * row[offset] + cosine * row[offset + 1];
      row[offset] = horizontal; row[offset + 1] = vertical;
    }
  }
  const entities = new Float32Array(rows.flat());
  if (![...query, ...entities].every(Number.isFinite)) throw new Error("Nexto received non-finite observations");
  return { query: new Float32Array(query), entities, mask: new Float32Array(37) };
}