import { readFileSync } from "node:fs";
import { axes } from "../../src/shared/carPhysics.js";
import { RL } from "../../src/shared/rl-physics.js";
import { BOOST_PAD } from "../../src/shared/boostPads.js";

export const stateSchema = JSON.parse(readFileSync(new URL("./audit-state.json", import.meta.url), "utf8"));

export function validateAuditScenarios(source) {
  const keys = (value, allowed, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: expected object`);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label}: unsupported ${key}`);
  };
  const vector = (value, label) => {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`${label}: expected finite vector`);
  };
  const controls = value => {
    keys(value, ["throttle", "steer", "pitch", "yaw", "roll", "boost", "jump", "handbrake"], "controls");
    for (const [key, entry] of Object.entries(value)) {
      if (["boost", "jump", "handbrake"].includes(key)) {
        if (typeof entry !== "boolean") throw new Error(`controls.${key}: expected boolean`);
      } else if (!Number.isFinite(entry) || Math.abs(entry) > 1) throw new Error(`controls.${key}: outside [-1,1]`);
    }
  };
  keys(source, ["version", "notes", "defaults", "scenarios"], "source");
  keys(source.defaults, ["tick_rate", "settle_ticks", "initial", "controls"], "defaults");
  if (source.defaults.tick_rate !== 120) throw new Error("tick_rate must be 120");
  controls(source.defaults.controls);
  if (!Array.isArray(source.scenarios) || source.scenarios.length === 0) throw new Error("Audit requires nonempty scenarios");
  const ids = new Set();
  for (const scenario of source.scenarios) {
    keys(scenario, ["id", "description", "ticks", "entity", "game_mode", "initial", "ball", "controls", "control_schedule", "settle_ticks", "audit", "preparation"], "scenario");
    if (!/^[a-z0-9_]+$/.test(scenario.id) || ids.has(scenario.id)) throw new Error("Invalid or duplicate id");
    ids.add(scenario.id);
    if (!scenario.audit || !["raw", "legacy"].includes(scenario.preparation)) throw new Error(`${scenario.id}: explicit audit/preparation required`);
    if (!Number.isInteger(scenario.ticks) || scenario.ticks < 1) throw new Error("Invalid ticks");
    if (!["soccar", "void"].includes(scenario.game_mode)) throw new Error("Explicit game_mode required");
    if (scenario.entity !== undefined && scenario.entity !== "ball") throw new Error("Unsupported entity");
    const settle = scenario.settle_ticks ?? source.defaults.settle_ticks;
    if (!Number.isInteger(settle) || settle < 0) throw new Error("Invalid settle_ticks");
    const initial = { ...source.defaults.initial, ...scenario.initial };
    keys(initial, ["pos", "vel", "ang_vel", "yaw", "pitch", "roll", "boost", "on_ground", "hitbox", "air_time_since_jump", "has_jumped"], "initial");
    for (const field of ["pos", "vel", "ang_vel"]) vector(initial[field], `initial.${field}`);
    for (const field of ["yaw", "pitch", "roll", "boost"]) if (!Number.isFinite(initial[field])) throw new Error(`Invalid ${field}`);
    if (initial.boost < 0 || initial.boost > 100 || typeof initial.on_ground !== "boolean") throw new Error("Invalid boost/on_ground");
    if (initial.hitbox && !["octane", "dominus", "plank", "breakout", "hybrid", "merc"].includes(initial.hitbox)) throw new Error("Unsupported hitbox");
    if (initial.air_time_since_jump !== undefined && (!Number.isFinite(initial.air_time_since_jump) || initial.air_time_since_jump < 0)) throw new Error("Invalid air_time_since_jump");
    if (initial.has_jumped !== undefined && (typeof initial.has_jumped !== "boolean" || initial.air_time_since_jump === undefined)) throw new Error("Invalid has_jumped");
    if (scenario.preparation === "raw" && initial.air_time_since_jump !== undefined) throw new Error("Raw jump history unsupported");
    if (scenario.entity !== "ball") {
      keys(scenario.ball, ["pos", "vel", "ang_vel"], "ball");
      for (const field of ["pos", "vel", "ang_vel"]) vector(scenario.ball[field], `ball.${field}`);
    } else if (scenario.ball || scenario.controls || scenario.control_schedule) throw new Error("Ball-only controls are unsupported");
    controls(scenario.controls ?? {});
    let previous = 0;
    for (const segment of scenario.control_schedule ?? []) {
      keys(segment, ["until_tick", "controls"], "segment");
      if (!Number.isInteger(segment.until_tick) || segment.until_tick <= previous || segment.until_tick > scenario.ticks) throw new Error("Invalid schedule boundary");
      controls(segment.controls);
      previous = segment.until_tick;
    }
    if (scenario.control_schedule && previous !== scenario.ticks) throw new Error("Incomplete schedule");
  }
  return source;
}

export function requestedRotation(initial) {
  const yaw = Math.fround(initial.yaw), pitch = Math.fround(initial.pitch), roll = Math.fround(initial.roll);
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
  const cosRoll = Math.cos(roll), sinRoll = Math.sin(roll);
  return {
    forward: [cosPitch * cosYaw, cosPitch * sinYaw, sinPitch],
    right: [sinPitch * sinRoll * cosYaw - cosRoll * sinYaw, sinPitch * sinRoll * sinYaw + cosRoll * cosYaw, -cosPitch * sinRoll],
    up: [-sinPitch * cosRoll * cosYaw - sinRoll * sinYaw, -sinPitch * cosRoll * sinYaw + sinRoll * cosYaw, cosPitch * cosRoll],
  };
}

export function auditState(entity, kind) {
  return Object.fromEntries(Object.entries(stateSchema[kind]).map(([name, path]) => {
    if (!path || !entity) return [name, null];
    const value = path.split(".").reduce((current, key) => current?.[key], entity);
    if (path === "q") {
      const basis = axes(value);
      return [name, { forward: basis.f.toArray(), right: basis.l.toArray(), up: basis.u.toArray() }];
    }
    if (path === "wheels") return [name, value.map(wheel => wheel.inContact)];
    return [name, value?.toArray ? value.toArray() : value ?? null];
  }));
}

export function auditPads(pads) {
  return pads.map(pad => ({ pos: [pad.x, pad.y, pad.z], big: pad.big,
    state: { cooldown: pad.timer, is_active: pad.active, prev_locked_car_id: null },
  })).sort((left, right) => left.pos[0] - right.pos[0] || left.pos[1] - right.pos[1] || left.pos[2] - right.pos[2]);
}

export function auditSetup(car, preparation, settleTicks) {
  const wheel = state => ({ connection_point_offset: state.connection.toArray(), suspension_rest_length: state.suspensionRest, wheel_radius: state.radius });
  return {
    preparation, ...(car ? { settle_ticks: settleTicks, car_config: {
      hitbox_size: car.hitbox.size, hitbox_pos_offset: car.hitbox.offset, dodge_deadzone: car.dodgeDeadzone,
      front_wheels: wheel(car.wheels[0]), back_wheels: wheel(car.wheels[2]),
    } } : {}),
    mutators: {
      ball_drag: RL.BALL_DRAG, ball_hit_extra_force_scale: RL.EXTRA_FORCE_SCALE, ball_mass: RL.BALL_MASS,
      ball_max_speed: RL.BALL_MAX_SPEED, ball_radius: RL.BALL_RADIUS, ball_world_friction: RL.BALL_FRICTION,
      ball_world_restitution: RL.BALL_RESTITUTION, boost_accel_air: RL.BOOST_ACCEL_AIR,
      boost_accel_ground: RL.BOOST_ACCEL_GROUND, boost_pad_cooldown_big: BOOST_PAD.BIG_COOLDOWN,
      boost_pad_cooldown_small: BOOST_PAD.SMALL_COOLDOWN, boost_used_per_second: RL.BOOST_USE,
      bump_cooldown_time: RL.BUMP_COOLDOWN_TIME, bump_force_scale: RL.BUMP_FORCE_SCALE, car_mass: RL.CAR_MASS,
      car_spawn_boost_amount: RL.BOOST_SPAWN, car_world_friction: RL.ARENA_FRICTION,
      car_world_restitution: RL.ARENA_RESTITUTION, goal_base_threshold_y: RL.GOAL_SCORE_Y,
      gravity: [0, 0, -RL.GRAVITY], jump_accel: RL.JUMP_HOLD_ACCEL, jump_immediate_force: RL.JUMP_IMPULSE,
      respawn_delay: RL.DEMO_RESPAWN_TIME,
      demo_mode: null, enable_car_ball_collision: null, enable_car_car_collision: null,
      enable_team_demos: null, unlimited_double_jumps: null, unlimited_flips: null,
    },
  };
}

export function auditLeaves(reference, candidate, limits, prefix = "") {
  for (const key of ["pos_max", "vel_max", "omega_max", "fwd_max_deg", "boost_max", "air_time_max"]) {
    if (!Number.isFinite(limits[key]) || limits[key] < 0) throw new Error(`Missing/invalid audit limit: ${key}`);
  }
  if (reference === null || candidate === null || reference === undefined || candidate === undefined) {
    const available = reference ?? candidate;
    if (available && typeof available === "object" && Object.keys(available).length) {
      return Object.keys(available).flatMap(key => auditLeaves(reference?.[key], candidate?.[key], limits,
        prefix ? `${prefix}.${key}` : key));
    }
    return [{ field: prefix, status: "unavailable", reference, candidate }];
  }
  if (typeof reference === "object") {
    if (typeof candidate !== "object" || Array.isArray(reference) !== Array.isArray(candidate)) {
      return [{ field: prefix, status: "schema_mismatch" }];
    }
    return [...new Set([...Object.keys(reference), ...Object.keys(candidate)])].flatMap(key =>
      auditLeaves(reference[key], candidate[key], limits, prefix ? `${prefix}.${key}` : key));
  }
  if (typeof reference !== typeof candidate || (typeof reference === "number" && (!Number.isFinite(reference) || !Number.isFinite(candidate)))) {
    return [{ field: prefix, status: "invalid", reference, candidate }];
  }
  const error = typeof reference === "number" ? Math.abs(reference - candidate) : Number(reference !== candidate);
  let tolerance = 0;
  if (typeof reference === "number") {
    if (/\.(pos|hitbox_size|hitbox_pos_offset)\./.test(prefix)) tolerance = limits.pos_max;
    else if (/\.vel\./.test(prefix)) tolerance = limits.vel_max;
    else if (/\.(ang_vel|flip_rel_torque)\./.test(prefix)) tolerance = limits.omega_max;
    else if (/rot_mat\./.test(prefix)) tolerance = Math.sin(limits.fwd_max_deg * Math.PI / 180);
    else if (/\.boost$/.test(prefix)) tolerance = limits.boost_max;
    else if (/(_time|_timer|cooldown)$/.test(prefix)) tolerance = limits.air_time_max;
  }
  return [{ field: prefix, status: error > tolerance ? "mismatch" : "checked", error, tolerance,
    exact: reference === candidate, reference, candidate }];
}