#!/usr/bin/env python3
"""Generate RocketSim reference trajectories for physics-compare scenarios.

Air scenarios use GameMode.THE_VOID (no meshes).
Ground scenarios use GameMode.SOCCAR and require collision meshes:

  tools/physics-compare/collision_meshes/soccar/*.cmf

Copy from rlgym or dump via RLArenaCollisionDumper, then:

  pip install -r tools/physics-compare/requirements.txt
  npm run physics:ref
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import sys
from pathlib import Path
from typing import Any

try:
    import RocketSim as rs
except ImportError:
    print(
        "RocketSim is not installed. Run:\n"
        "  pip install -r tools/physics-compare/requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)


HERE = Path(__file__).resolve().parent
DEFAULT_SCENARIOS = HERE / "scenarios.json"
DEFAULT_OUT = HERE / "out" / "rocketsim"
DEFAULT_MESHES = HERE / "collision_meshes"


def deep_merge(base: dict[str, Any], overlay: dict[str, Any] | None) -> dict[str, Any]:
    out = dict(base)
    if not overlay:
        return out
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def vec_list(v: Any) -> list[float]:
    return [float(v.x), float(v.y), float(v.z)]


def angle_list(a: Any) -> list[float]:
    return [float(a.yaw), float(a.pitch), float(a.roll)]


def rot_payload(rm: Any) -> dict[str, list[float]]:
    return {
        "forward": vec_list(rm.forward),
        "right": vec_list(rm.right),
        "up": vec_list(rm.up),
    }


def make_controls(spec: dict[str, Any]) -> rs.CarControls:
    return rs.CarControls(
        throttle=float(spec.get("throttle", 0) or 0),
        steer=float(spec.get("steer", 0) or 0),
        pitch=float(spec.get("pitch", 0) or 0),
        yaw=float(spec.get("yaw", 0) or 0),
        roll=float(spec.get("roll", 0) or 0),
        jump=bool(spec.get("jump", False)),
        boost=bool(spec.get("boost", False)),
        handbrake=bool(spec.get("handbrake", False)),
    )


def controls_at_tick(
    tick: int,
    defaults: dict[str, Any],
    scenario: dict[str, Any],
) -> dict[str, Any]:
    base = deep_merge(defaults.get("controls", {}), scenario.get("controls"))
    schedule = scenario.get("control_schedule")
    if not schedule:
        return base
    for entry in schedule:
        if tick < int(entry["until_tick"]):
            return deep_merge(base, entry.get("controls"))
    return deep_merge(base, schedule[-1].get("controls"))


def angle_rot(initial: dict[str, Any]) -> Any:
    return rs.Angle(
        float(initial.get("yaw", 0) or 0),
        float(initial.get("pitch", 0) or 0),
        float(initial.get("roll", 0) or 0),
    ).as_rot_mat()


def scenario_mode(scenario: dict[str, Any], initial: dict[str, Any]) -> str:
    explicit = scenario.get("game_mode") or initial.get("game_mode")
    if explicit:
        return str(explicit).lower()
    return "soccar" if initial.get("on_ground") else "void"


def prepare_airborne(arena: rs.Arena, car: rs.Car, initial: dict[str, Any]) -> None:
    """RocketSim keeps is_on_ground True after a cold set_state even at high Z.

    Warm up one freefall tick, then rewrite kinematics so recorded tick 0 is
    cleanly airborne with the requested start state.
    """
    cold = rs.CarState()
    cold.pos = rs.Vec(*initial["pos"])
    cold.vel = rs.Vec(0, 0, 0)
    cold.ang_vel = rs.Vec(0, 0, 0)
    cold.rot_mat = angle_rot(initial)
    cold.boost = float(initial.get("boost", 100))
    car.set_state(cold)
    car.set_controls(rs.CarControls())
    arena.step(1)

    st = rs.CarState()
    st.pos = rs.Vec(*initial["pos"])
    st.vel = rs.Vec(*initial["vel"])
    st.ang_vel = rs.Vec(*initial["ang_vel"])
    st.rot_mat = angle_rot(initial)
    st.boost = float(initial.get("boost", 100))
    car.set_state(st)


def prepare_ground(arena: rs.Arena, car: rs.Car, initial: dict[str, Any], settle_ticks: int) -> None:
    """Drop the car onto the soccar floor and settle suspension before tick 0."""
    st = rs.CarState()
    st.pos = rs.Vec(*initial["pos"])
    st.vel = rs.Vec(0, 0, 0)
    st.ang_vel = rs.Vec(0, 0, 0)
    st.rot_mat = angle_rot(initial)
    st.boost = float(initial.get("boost", 100))
    car.set_state(st)
    car.set_controls(rs.CarControls())
    for _ in range(settle_ticks):
        arena.step(1)

    # Re-apply requested horizontal / angular velocity after settle; keep settled Z.
    settled = car.get_state()
    st = rs.CarState()
    st.pos = rs.Vec(float(initial["pos"][0]), float(initial["pos"][1]), float(settled.pos.z))
    st.vel = rs.Vec(*initial["vel"])
    st.ang_vel = rs.Vec(*initial["ang_vel"])
    st.rot_mat = angle_rot(initial)
    st.boost = float(initial.get("boost", 100))
    car.set_state(st)
    # One more tick with no input so wheels/contact refresh without advancing controls.
    car.set_controls(rs.CarControls())
    arena.step(1)
    # Restore kinematics again so tick 0 matches the requested vel at settled pose.
    settled = car.get_state()
    st = rs.CarState()
    st.pos = rs.Vec(float(settled.pos.x), float(settled.pos.y), float(settled.pos.z))
    st.vel = rs.Vec(*initial["vel"])
    st.ang_vel = rs.Vec(*initial["ang_vel"])
    st.rot_mat = angle_rot(initial)
    st.boost = float(initial.get("boost", 100))
    car.set_state(st)


def snapshot(car: rs.Car, tick: int, controls: dict[str, Any]) -> dict[str, Any]:
    st = car.get_state()
    return {
        "tick": tick,
        "controls": controls,
        "pos": vec_list(st.pos),
        "vel": vec_list(st.vel),
        "ang_vel": vec_list(st.ang_vel),
        "angle": angle_list(st.rot_mat.as_angle()),
        "rot": rot_payload(st.rot_mat),
        "boost": float(st.boost),
        "on_ground": bool(st.is_on_ground),
        "air_time": float(st.air_time),
        "ball_hit": {
            "valid": bool(st.ball_hit_info.is_valid),
            "tick": int(st.ball_hit_info.tick_count_when_hit),
            "extra_tick": int(st.ball_hit_info.tick_count_when_extra_impulse_applied),
            "extra_vel": vec_list(st.ball_hit_info.extra_hit_vel),
            "point": vec_list(st.ball_hit_info.relative_pos_on_ball),
        },
    }


def dump_constants() -> dict[str, Any]:
    keys = [
        "GRAVITY_Z",
        "CAR_MAX_SPEED",
        "CAR_MAX_ANG_SPEED",
        "BOOST_ACCEL_AIR",
        "BOOST_ACCEL_GROUND",
        "BOOST_USED_PER_SECOND",
        "BOOST_SPAWN_AMOUNT",
        "BOOST_MIN_TIME",
        "THROTTLE_AIR_ACCEL",
        "JUMP_IMMEDIATE_FORCE",
        "JUMP_ACCEL",
        "JUMP_MAX_TIME",
        "JUMP_MIN_TIME",
        "JUMP_RESET_TIME_PAD",
        "DOUBLEJUMP_MAX_DELAY",
        "CAR_AIR_CONTROL_TORQUE",
        "CAR_AIR_CONTROL_DAMPING",
        "CAR_TORQUE_SCALE",
        "CAR_AUTOFLIP_IMPULSE",
        "CAR_AUTOFLIP_TORQUE",
        "CAR_AUTOFLIP_TIME",
        "CAR_AUTOFLIP_NORMZ_THRESH",
        "CAR_AUTOFLIP_ROLL_THRESH",
        "CAR_AUTOROLL_FORCE",
        "CAR_AUTOROLL_TORQUE",
        "BALL_DRAG",
        "BALL_RESTITUTION",
        "BALL_FRICTION",
        "BALL_MAX_ANG_SPEED",
        "BALL_MAX_SPEED",
        "BALL_REST_Z",
        "BALL_COLLISION_RADIUS_SOCCAR",
        "BALL_CAR_EXTRA_IMPULSE_Z_SCALE",
        "BALL_CAR_EXTRA_IMPULSE_FORWARD_SCALE",
        "BALL_CAR_EXTRA_IMPULSE_MAXDELTAVEL_UU",
        "CAR_SPAWN_REST_Z",
        "CAR_RESPAWN_Z",
        "BUMP_COOLDOWN_TIME",
        "BUMP_MIN_FORWARD_DIST",
        "DEMO_RESPAWN_TIME",
        "FLIP_TORQUE_TIME",
        "FLIP_TORQUE_MIN_TIME",
        "FLIP_PITCHLOCK_TIME",
        "FLIP_PITCHLOCK_EXTRA_TIME",
        "FLIP_Z_DAMP_120",
        "FLIP_Z_DAMP_START",
        "FLIP_Z_DAMP_END",
        "FLIP_INITIAL_VEL_SCALE",
        "FLIP_TORQUE_X",
        "FLIP_TORQUE_Y",
        "FLIP_BACKWARD_IMPULSE_SCALE_X",
        "COASTING_BRAKE_FACTOR",
        "STOPPING_FORWARD_VEL",
        "THROTTLE_DEADZONE",
        "POWERSLIDE_RISE_RATE",
        "POWERSLIDE_FALL_RATE",
        "SUPERSONIC_START_SPEED",
        "SUPERSONIC_MAINTAIN_MIN_SPEED",
        "SUPERSONIC_MAINTAIN_MAX_TIME",
        "CARWORLD_COLLISION_FRICTION",
        "CARWORLD_COLLISION_RESTITUTION",
        "CARBALL_COLLISION_FRICTION",
        "CARBALL_COLLISION_RESTITUTION",
        "CARCAR_COLLISION_FRICTION",
        "CARCAR_COLLISION_RESTITUTION",
    ]
    out: dict[str, Any] = {}
    for key in keys:
        val = getattr(rs.RLConst, key)
        if hasattr(val, "as_tuple"):
            out[key] = list(val.as_tuple())
        elif isinstance(val, tuple):
            out[key] = list(val)
        else:
            out[key] = val
    torque = out["CAR_AIR_CONTROL_TORQUE"]
    damp = out["CAR_AIR_CONTROL_DAMPING"]
    scale = float(out["CAR_TORQUE_SCALE"])
    out["EFFECTIVE_T_PITCH"] = float(torque[0]) * scale
    out["EFFECTIVE_T_YAW"] = float(torque[1]) * scale
    out["EFFECTIVE_T_ROLL"] = float(torque[2]) * scale
    out["EFFECTIVE_D_PITCH"] = float(damp[0]) * scale
    out["EFFECTIVE_D_YAW"] = float(damp[1]) * scale
    out["EFFECTIVE_D_ROLL"] = float(damp[2]) * scale
    return out


_MESHES_READY = False


def ensure_meshes(mesh_dir: Path) -> None:
    global _MESHES_READY
    if _MESHES_READY:
        return
    soccar = mesh_dir / "soccar"
    if not soccar.is_dir() or not any(soccar.glob("*.cmf")):
        print(
            "SOCCAR collision meshes not found.\n"
            f"  Expected: {soccar}/*.cmf\n"
            "Copy from rlgym (rlgym/rocket_league/sim/collision_meshes/soccar)\n"
            "or dump via https://github.com/ZealanL/RLArenaCollisionDumper",
            file=sys.stderr,
        )
        sys.exit(1)
    rs.init(str(mesh_dir))
    _MESHES_READY = True


def audit_value(value: Any) -> Any:
    if isinstance(value, (bool, int, float, str)) or value is None:
        return value
    if isinstance(value, (tuple, list)):
        return [audit_value(entry) for entry in value]
    if hasattr(value, "x") and hasattr(value, "y") and hasattr(value, "z"):
        return vec_list(value)
    if hasattr(value, "forward") and hasattr(value, "right") and hasattr(value, "up"):
        return rot_payload(value)
    result = {}
    for key in dir(value):
        if key.startswith("_") or key.isupper() or key == "last_rel_dodge_torque":
            continue
        entry = getattr(value, key)
        if not callable(entry):
            result[key] = audit_value(entry)
    return result


def audit_pads(arena: rs.Arena) -> list[dict[str, Any]]:
    return sorted([
        {"pos": vec_list(pad.get_pos()), "big": pad.is_big, "state": audit_value(pad.get_state())}
        for pad in arena.get_boost_pads()
    ], key=lambda pad: tuple(pad["pos"]))


def run_scenario(
    scenario: dict[str, Any],
    defaults: dict[str, Any],
    mesh_dir: Path,
) -> dict[str, Any]:
    initial = deep_merge(defaults.get("initial", {}), scenario.get("initial"))
    ticks = int(scenario["ticks"])
    mode = scenario_mode(scenario, initial)
    settle_ticks = int(scenario.get("settle_ticks", defaults.get("settle_ticks", 240)))

    if mode == "soccar":
        ensure_meshes(mesh_dir)
        arena = rs.Arena(rs.GameMode.SOCCAR)
    else:
        arena = rs.Arena(rs.GameMode.THE_VOID)

    if scenario.get("entity") == "ball":
        ball = arena.ball
        state = rs.BallState()
        state.pos = rs.Vec(*initial["pos"])
        state.vel = rs.Vec(*initial["vel"])
        state.ang_vel = rs.Vec(*initial["ang_vel"])
        ball.set_state(state)

        def ball_snapshot(tick: int) -> dict[str, Any]:
            state = ball.get_state()
            return {"tick": tick, "pos": vec_list(state.pos), "vel": vec_list(state.vel), "ang_vel": vec_list(state.ang_vel)}

        if scenario.get("audit"):
            original_ball_snapshot = ball_snapshot

            def ball_snapshot(tick: int) -> dict[str, Any]:
                frame = original_ball_snapshot(tick)
                frame["audit"] = {"ball": audit_value(ball.get_state()), "pads": audit_pads(arena)}
                return frame

        frames = [ball_snapshot(0)]
        for tick in range(ticks):
            arena.step(1)
            frames.append(ball_snapshot(tick + 1))
        return {
            "id": scenario["id"], "description": scenario.get("description", ""),
            "entity": "ball", "engine": "rocketsim",
            "rocketsim_version": importlib.metadata.version("RocketSim"),
            "game_mode": mode, "tick_rate": float(arena.tick_rate),
            "tick_time": float(arena.tick_time), "ticks": ticks,
            "initial": initial, "frames": frames,
            **({"audit_setup": {"mutators": audit_value(arena.get_mutator_config()), "preparation": "raw"}} if scenario.get("audit") else {}),
        }

    hitbox = str(initial.get("hitbox", "octane")).upper()
    if hitbox not in {"OCTANE", "DOMINUS", "PLANK", "BREAKOUT", "HYBRID", "MERC"}:
        raise ValueError(f"Unsupported hitbox: {hitbox}")
    car = arena.add_car(rs.Team.BLUE, getattr(rs.CarConfig, hitbox))
    if mode == "soccar":
        # Park the default kickoff ball far away so it cannot collide with car tests.
        try:
            ball = arena.ball
            bs = ball.get_state()
            bs.pos = rs.Vec(0, 0, 3000)
            bs.vel = rs.Vec(0, 0, 0)
            bs.ang_vel = rs.Vec(0, 0, 0)
            ball.set_state(bs)
        except Exception:
            pass
    if scenario.get("preparation") == "raw":
        state = rs.CarState()
        state.pos = rs.Vec(*initial["pos"])
        state.vel = rs.Vec(*initial["vel"])
        state.ang_vel = rs.Vec(*initial["ang_vel"])
        state.rot_mat = angle_rot(initial)
        state.boost = float(initial["boost"])
        car.set_state(state)
    elif initial.get("on_ground", False):
        prepare_ground(arena, car, initial, settle_ticks)
    else:
        prepare_airborne(arena, car, initial)

    if "air_time_since_jump" in initial:
        state = car.get_state()
        state.has_jumped = bool(initial.get("has_jumped", True))
        state.is_jumping = False
        state.air_time_since_jump = float(initial["air_time_since_jump"])
        car.set_state(state)

    ball_initial = scenario.get("ball")
    car_only = bool(scenario.get("car_only", False))
    if car_only and ball_initial:
        raise ValueError("Car-only scenarios cannot include a ball")
    parked_ball = rs.BallState() if car_only else None
    if parked_ball is not None:
        parked_ball.pos = rs.Vec(0, 0, 10000)
        arena.ball.set_state(parked_ball)
    if ball_initial:
        state = rs.BallState()
        state.pos = rs.Vec(*ball_initial["pos"])
        state.vel = rs.Vec(*ball_initial.get("vel", [0, 0, 0]))
        state.ang_vel = rs.Vec(*ball_initial.get("ang_vel", [0, 0, 0]))
        arena.ball.set_state(state)

    touch_callbacks: list[dict[str, Any]] = []
    if ball_initial:
        def capture_touch(arena: rs.Arena, car: rs.Car, data: Any) -> None:
            car_state = car.get_state()
            ball_state = arena.ball.get_state()
            touch_callbacks.append({
                "tick": tick + 1,
                "car_pos": vec_list(car_state.pos),
                "car_vel": vec_list(car_state.vel),
                "car_ang_vel": vec_list(car_state.ang_vel),
                "ball_pos": vec_list(ball_state.pos),
                "ball_vel": vec_list(ball_state.vel),
                "ball_ang_vel": vec_list(ball_state.ang_vel),
            })
        arena.set_ball_touch_callback(capture_touch)

    def capture(tick: int, controls: dict[str, Any]) -> dict[str, Any]:
        frame = snapshot(car, tick, controls)
        if ball_initial:
            state = arena.ball.get_state()
            frame["ball"] = {"pos": vec_list(state.pos), "vel": vec_list(state.vel), "ang_vel": vec_list(state.ang_vel)}
        if scenario.get("audit"):
            frame["audit"] = {
                "car": audit_value(car.get_state()),
                "ball": audit_value(arena.ball.get_state()),
                "pads": audit_pads(arena),
            }
        return frame

    frames: list[dict[str, Any]] = []
    ctrl0 = controls_at_tick(0, defaults, scenario)
    frames.append(capture(0, ctrl0))

    for tick in range(ticks):
        ctrl = controls_at_tick(tick, defaults, scenario)
        car.set_controls(make_controls(ctrl))
        if parked_ball is not None:
            arena.ball.set_state(parked_ball)
        arena.step(1)
        frames.append(capture(tick + 1, ctrl))

    return {
        "id": scenario["id"],
        "description": scenario.get("description", ""),
        "engine": "rocketsim",
        "rocketsim_version": importlib.metadata.version("RocketSim"),
        "game_mode": mode,
        "tick_rate": float(arena.tick_rate),
        "tick_time": float(arena.tick_time),
        "ticks": ticks,
        "initial": initial,
        "ball_initial": ball_initial,
        "car_only": car_only,
        "touch_callbacks": touch_callbacks,
        **({"audit_setup": {
            "mutators": audit_value(arena.get_mutator_config()),
            "car_config": audit_value(car.get_config()),
            "preparation": scenario.get("preparation", "settled" if initial.get("on_ground") else "airborne_warmup"),
            "settle_ticks": settle_ticks,
        }} if scenario.get("audit") else {}),
        "frames": frames,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenarios", type=Path, default=DEFAULT_SCENARIOS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--meshes", type=Path, default=DEFAULT_MESHES)
    parser.add_argument("--only", action="append", default=[])
    args = parser.parse_args()

    data = json.loads(args.scenarios.read_text())
    defaults = data.get("defaults", {})
    scenarios = data["scenarios"]
    if args.only:
        wanted = set(args.only)
        scenarios = [s for s in scenarios if s["id"] in wanted]
        missing = wanted - {s["id"] for s in scenarios}
        if missing:
            print(f"Unknown scenario ids: {sorted(missing)}", file=sys.stderr)
            sys.exit(1)

    # Init meshes once if any soccar scenario is present.
    if any(
        scenario_mode(s, deep_merge(defaults.get("initial", {}), s.get("initial")))
        == "soccar"
        for s in scenarios
    ):
        ensure_meshes(args.meshes)

    args.out.mkdir(parents=True, exist_ok=True)
    const_path = args.out / "rocketsim_constants.json"
    const_path.write_text(json.dumps(dump_constants(), indent=2) + "\n")
    print(f"wrote {const_path}")

    index: list[dict[str, str]] = []
    for scenario in scenarios:
        result = run_scenario(scenario, defaults, args.meshes)
        result["scenario_sha256"] = hashlib.sha256(args.scenarios.read_bytes()).hexdigest()
        result["reference_provenance"] = {
            "distribution": "RocketSim", "version": importlib.metadata.version("RocketSim"),
            "binding_source_commit": "2da51b1dac7b8127127613a5ff30e490bdd70dd8",
            "module_sha256": hashlib.sha256(Path(rs.__file__).read_bytes()).hexdigest(),
        }
        path = args.out / f"{scenario['id']}.json"
        path.write_text(json.dumps(result, indent=2) + "\n")
        index.append({"id": scenario["id"], "path": path.name})
        final = result["frames"][-1]
        print(
            f"{scenario['id']}: {len(result['frames'])} frames, "
            f"final pos={[round(x, 2) for x in final['pos']]}, "
            f"ang_vel={[round(x, 3) for x in final['ang_vel']]}"
        )

    (args.out / "index.json").write_text(
        json.dumps({"engine": "rocketsim", "scenarios": index}, indent=2) + "\n"
    )
    print(f"done — {len(index)} scenarios → {args.out}")


if __name__ == "__main__":
    main()
