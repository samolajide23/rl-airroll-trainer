import assert from "node:assert/strict";

const length = (v) => Math.hypot(...v);
const delta = (a, b) => length(a.map((x, i) => x - b[i]));
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1,
  a.reduce((sum, x, i) => sum + x * b[i], 0) / (length(a) * length(b))))) * 180 / Math.PI;
const mean = (xs) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const maximum = (xs) => Math.max(...xs);

function vector(v, name) {
  assert(Array.isArray(v) && v.length === 3 && v.every(Number.isFinite), `${name}: expected three finite numbers`);
}

function controls(c = {}) {
  return Object.fromEntries(["throttle", "steer", "pitch", "yaw", "roll", "boost", "jump", "handbrake"].map(
    (key) => [key, ["boost", "jump", "handbrake"].includes(key) ? Boolean(c[key]) : c[key] ?? 0],
  ));
}

/** Reject stale/misaligned/incomplete fixtures before computing any errors. */
export function validatePair(rs, js) {
  for (const key of ["id", "game_mode", "ticks", "scenario_sha256"]) {
    assert(rs[key] !== undefined, `Missing reference ${key}`);
    assert.deepEqual(js[key], rs[key], `${rs.id}: ${key} mismatch`);
  }
  assert.equal(js.entity ?? "car", rs.entity ?? "car", "entity mismatch");
  assert.deepEqual(js.initial, rs.initial, `${rs.id}: initial state mismatch`);
  assert.deepEqual(js.ball_initial ?? null, rs.ball_initial ?? null, `${rs.id}: initial ball mismatch`);
  for (const data of [rs, js]) {
    assert(Number.isInteger(data.ticks) && data.ticks > 0, "ticks must be positive");
    assert(Number.isFinite(data.tick_rate) && Math.abs(data.tick_rate - 120) < 0.001, "expected 120 Hz");
    assert(Number.isFinite(data.tick_time) && Math.abs(data.tick_time - 1 / 120) < 1e-8, "tick_time mismatch");
    assert.equal(data.frames.length, data.ticks + 1, `${data.id}: incomplete trajectory`);
    data.frames.forEach((frame, index) => {
      assert.equal(frame.tick, index, `${data.id}: tick misalignment`);
      for (const field of ["pos", "vel", "ang_vel"]) vector(frame[field], `${data.id}:${index}:${field}`);
      if (data.ball_initial) for (const field of ["pos", "vel", "ang_vel"]) vector(frame.ball?.[field], `${data.id}:${index}:ball.${field}`);
      if (data.entity !== "ball") {
        for (const axis of ["forward", "right", "up"]) {
          vector(frame.rot?.[axis], `${data.id}:${index}:rot.${axis}`);
          assert(Math.abs(length(frame.rot[axis]) - 1) < 0.001, "invalid orientation basis");
        }
        assert(Number.isFinite(frame.boost) && Number.isFinite(frame.air_time), "invalid car state");
        assert.equal(typeof frame.on_ground, "boolean", "invalid ground state");
        assert.deepEqual(controls(frame.controls), controls((data === rs ? js : rs).frames[index]?.controls), `${data.id}:${index}: controls mismatch`);
      }
    });
  }
}

export function compareScenario(rs, js) {
  validatePair(rs, js);
  const errors = { pos: [], vel: [], omega: [], fwd: [], up: [], boost: [], air_time: [] };
  let groundMismatch = 0;
  let worst = { tick: 0, pos: 0 };
  rs.frames.forEach((a, i) => {
    const b = js.frames[i];
    const pe = delta(a.pos, b.pos);
    errors.pos.push(pe);
    errors.vel.push(delta(a.vel, b.vel));
    errors.omega.push(delta(a.ang_vel, b.ang_vel));
    if (pe >= worst.pos) worst = { tick: a.tick, pos: pe };
    if (rs.entity !== "ball") {
      errors.fwd.push(angle(a.rot.forward, b.rot.forward));
      errors.up.push(angle(a.rot.up, b.rot.up));
      errors.boost.push(Math.abs(a.boost - b.boost));
      errors.air_time.push(Math.abs(a.air_time - b.air_time));
      if (a.on_ground !== b.on_ground) groundMismatch++;
    }
  });
  const a = rs.frames.at(-1), b = js.frames.at(-1);
  const result = { id: rs.id, description: rs.description, entity: rs.entity ?? "car", frames: rs.frames.length, worst_tick: worst.tick, ground_mismatch_ticks: groundMismatch,
    final: { rs_pos: a.pos, js_pos: b.pos, rs_ang_vel: a.ang_vel, js_ang_vel: b.ang_vel, rs_forward: a.rot?.forward, js_forward: b.rot?.forward } };
  for (const [key, values] of Object.entries(errors)) {
    const suffix = key === "fwd" || key === "up" ? "_deg" : "";
    result[`${key}_mean${suffix}`] = values.length ? mean(values) : 0;
    result[`${key}_max${suffix}`] = values.length ? maximum(values) : 0;
  }
  if (rs.ball_initial) {
    for (const [metric, field] of [["ball_pos", "pos"], ["ball_vel", "vel"], ["ball_omega", "ang_vel"]]) {
      const values = rs.frames.map((frame, i) => delta(frame.ball[field], js.frames[i].ball[field]));
      result[`${metric}_max`] = maximum(values);
      result[`${metric}_mean`] = mean(values);
    }
  }
  return result;
}

/** Explicit budgets are regression limits, not claims of exact game parity. */
export function failuresFor(result, budgets) {
  const limits = { ...budgets.defaults, ...budgets.scenarios?.[result.id] };
  return Object.entries(limits).flatMap(([metric, limit]) => {
    assert(Number.isFinite(limit) && limit >= 0, `Invalid budget: ${metric}`);
    assert(Number.isFinite(result[metric]), `Unknown/nonfinite metric: ${metric}`);
    return result[metric] > limit ? [`${result.id}: ${metric} ${result[metric].toFixed(6)} > ${limit}`] : [];
  });
}