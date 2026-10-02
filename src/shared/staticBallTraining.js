import * as THREE from "three";

export function createBallTrainingHistory(storageKey) {
  let history = {};
  try { history = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { }
  if (!history || typeof history !== "object" || Array.isArray(history)) history = {};
  const read = (step, varied) => {
    const records = history[`${step}-${varied}`];
    return Array.isArray(records) ? records.filter(set => Array.isArray(set.attempts)) : [];
  };
  const record = (step, varied, attempts) => {
    const key = `${step}-${varied}`;
    history[key] = [...read(step, varied), { attempts, at: Date.now() }].slice(-20);
    try { localStorage.setItem(storageKey, JSON.stringify(history)); } catch { }
  };
  return { read, record, summary: (step, varied) => summarizeBallSets(read(step, varied)) };
}

const staticHistory = createBallTrainingHistory("rl-static-ball-mastery-v1");
export const staticBallHistory = staticHistory.read;
export const recordStaticBallSet = staticHistory.record;
export const staticBallSummary = staticHistory.summary;

function summarizeBallSets(sets) {
  const last = sets.at(-1);
  const hits = set => set.attempts.filter(attempt => attempt.success).length;
  const qualified = set => set?.attempts.length === 10 && !set.attempts.some(attempt => attempt.skipped) && hits(set) >= 8;
  const misses = {};
  for (const set of sets.slice(-3)) for (const attempt of set.attempts) {
    if (!attempt.success) misses[attempt.label] = (misses[attempt.label] || 0) + 1;
  }
  return { sets, latest: last ? hits(last) : null, mastered: qualified(last) && qualified(sets.at(-2)), commonMiss: Object.entries(misses).sort((first, second) => second[1] - first[1])[0]?.[0] };
}

export function generateStaticBallSetup(step, varied, index = 0, random = Math.random) {
  const ranges = [[700, 1100, 150, 10], [800, 1200, 200, 15], [900, 1300, 250, 20]];
  const [minimum, maximum, lateral, heading] = ranges[Math.min(step, 2)];
  const distance = varied ? minimum + random() * (maximum - minimum) : step === 0 ? 900 : 1000;
  const offset = varied ? (random() * 2 - 1) * lateral : 0;
  const angle = varied ? [0, -20, 20, -35, 35, -50, 50, -65, 65][index % 9] * Math.PI / 180 : 0;
  const direction = new THREE.Vector3(Math.sin(angle), Math.cos(angle), 0);
  const position = direction.clone().multiplyScalar(-distance).add(new THREE.Vector3(direction.y, -direction.x, 0).multiplyScalar(offset));
  const yaw = Math.atan2(-position.y, -position.x) + (varied ? (random() * 2 - 1) * heading * Math.PI / 180 : 0);
  return { position: position.toArray(), yaw, direction: direction.toArray() };
}

export function classifyStaticContact(car, contact) {
  if (!contact?.normal?.isVector3) return "Unknown contact";
  const normal = contact.normal.clone().applyQuaternion(car.q.clone().invert()).normalize();
  if (normal.x >= Math.cos(Math.PI / 6)) return "Front contact";
  if (normal.x <= -Math.cos(Math.PI / 6)) return "Rear contact";
  return Math.abs(normal.z) > Math.abs(normal.y) ? "Roof contact" : "Side contact";
}

export function staticGateCrossing(previous, current, direction) {
  const before = previous.dot(direction) - 1400;
  const after = current.dot(direction) - 1400;
  if (before >= 0 || after < 0) return null;
  const point = previous.clone().lerp(current, before / (before - after));
  const lateral = point.x * direction.y - point.y * direction.x;
  return { hit: Math.abs(lateral) <= 300 && point.z <= 200, label: point.z > 200 ? "Too high" : lateral < -300 ? "Missed right" : lateral > 300 ? "Missed left" : "Target hit" };
}