const STORAGE_KEY = "rl-airroll-trainer-metrics-v1";

/**
 * @typedef {{
 *   success: boolean,
 *   angleErrorDeg?: number,
 *   timeOnTarget?: number,
 *   touches?: number,
 *   duration?: number,
 *   label?: string,
 * }} AttemptRecord
 */

/** @type {Record<string, AttemptRecord[]>} */
let history = Object.create(null);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    for (const [modeId, records] of Object.entries(parsed)) {
      if (!Array.isArray(records)) continue;
      history[modeId] = records.filter(record => {
        if (!record || typeof record !== "object" || Array.isArray(record)) return false;
        if (typeof record.success !== "boolean") return false;
        for (const key of ["angleErrorDeg", "timeOnTarget", "touches", "duration", "at"]) {
          if (record[key] !== undefined && (typeof record[key] !== "number" || !Number.isFinite(record[key]) || record[key] < 0)) return false;
        }
        return record.label === undefined || typeof record.label === "string";
      }).slice(-40);
    }
  } catch {
    history = Object.create(null);
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch { }
}

load();

/**
 * @param {string} modeId
 * @param {AttemptRecord} record
 */
export function recordAttempt(modeId, record) {
  if (!history[modeId]) history[modeId] = [];
  history[modeId].push({ ...record, at: Date.now() });
  if (history[modeId].length > 40) history[modeId].shift();
  save();
}

/**
 * @param {string} modeId
 * @param {number} [n=20]
 */
export function recentAttempts(modeId, n = 20) {
  const list = history[modeId] ?? [];
  return list.slice(-n);
}

/**
 * @param {string} modeId
 */
export function consistencyRate(modeId) {
  const list = recentAttempts(modeId, 20);
  if (!list.length) return null;
  const ok = list.filter((a) => a.success).length;
  return ok / list.length;
}

/**
 * @param {string} modeId
 */
export function formatConsistency(modeId) {
  const rate = consistencyRate(modeId);
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

/**
 * Angle between two unit directions in degrees.
 * @param {import("three").Vector3} a
 * @param {import("three").Vector3} b
 */
export function angleErrorDeg(a, b) {
  const d = Math.max(-1, Math.min(1, a.dot(b)));
  return (Math.acos(d) * 180) / Math.PI;
}
