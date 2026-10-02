import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import tempfile
import urllib.request

import numpy as np
import torch
from rlgym.api import RLGym
from rlgym.rocket_league import common_values
from rlgym.rocket_league.action_parsers import LookupTableAction, RepeatAction
from rlgym.rocket_league.done_conditions import GoalCondition, TimeoutCondition
from rlgym.rocket_league.obs_builders import DefaultObs
from rlgym.rocket_league.reward_functions import GoalReward
from rlgym.rocket_league.sim import RocketSimEngine
from rlgym.rocket_league.state_mutators import FixedTeamSizeMutator, KickoffMutator, MutatorSequence

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ["LOCALAPPDATA"]) / "AIRLAB" / "coconut"
REVISION = "358512cb27f7d55d52cf203e2a42f5fbd55e10cd"
CHECKPOINT = "PPO_POLICY_V4_E2G1.pt"
MECHANICS_CASES = ("boost", "jump", "forward_flip", "diagonal_flip",
                   "side_flip", "backflip", "cancel_sustained", "cancel_partial",
                   "ground_flip")


def native_batch_cases():
    cases = []

    def add(name, *, position=(0, 0, 17), velocity=(0, 0, 0), rotation=(0, 0, 0),
            boost=50, windows=(), ball_position=(3000, 3000, 100),
            ball_velocity=(0, 0, 0), ball_omega=(0, 0, 0)):
        cases.append(dict(name=name, position=position, velocity=velocity,
                          rotation=rotation, boost=boost, windows=windows,
                          ball_position=ball_position, ball_velocity=ball_velocity,
                          ball_omega=ball_omega, duration_ticks=360))

    for name, end, amount, throttle in (
            ("boost_tap", 61, 50, 0), ("boost_hold", 180, 50, 0),
            ("boost_exhaustion", 180, 1, 0), ("boost_reverse", 120, 50, -1),
            ("boost_forward", 120, 50, 1)):
        add(name, position=(0, 0, 1500), boost=amount,
            windows=((60, end, dict(boost=True, throttle=throttle)),))
    add("boost_ground", windows=((60, 180, dict(boost=True)),))
    add("boost_takeoff", windows=((60, 84, dict(jump=True)),
                                  (60, 120, dict(boost=True))))
    for held in (1, 3, 6, 12, 24, 36):
        add(f"jump_hold_{held}", windows=((60, 60 + held, dict(jump=True)),))
    add("jump_moving", velocity=(600, 0, 0), windows=((60, 84, dict(jump=True)),))
    add("jump_release_repress", windows=((60, 66, dict(jump=True)),
                                         (72, 84, dict(jump=True))))
    for delay in (8, 40, 140, 180):
        add(f"double_jump_delay_{delay}", windows=((60, 64, dict(jump=True)),
                                                   (60 + delay, 62 + delay, dict(jump=True))))
    for name, pitch, yaw in (("forward", -1, 0), ("back", 1, 0),
                              ("left", 0, -1), ("right", 0, 1),
                              ("diagonal_left", -1, -1), ("diagonal_right", -1, 1)):
        add(f"flip_{name}", windows=((60, 84, dict(jump=True)),
                                     (100, 102, dict(jump=True, pitch=pitch, yaw=yaw))))
    for delay in (0, 2, 5, 10, 20):
        for amount in (0.5, 1):
            add(f"cancel_delay_{delay}_amount_{amount}",
                windows=((60, 84, dict(jump=True)),
                         (100, 102, dict(jump=True, pitch=-1)),
                         (102 + delay, 180, dict(pitch=amount))))
    add("flip_early_ground", windows=((60, 64, dict(jump=True)),
                                     (68, 70, dict(jump=True, pitch=-1))))
    add("flip_moving_diagonal", velocity=(600, 0, 0),
        windows=((60, 84, dict(jump=True)),
                 (100, 102, dict(jump=True, pitch=-1, yaw=1))))
    for axis in ("pitch", "yaw", "roll"):
        for direction in (-1, 1):
            add(f"air_{axis}_{direction}", position=(0, 0, 1500),
                windows=((60, 120, {axis: direction}),))
    add("air_combined", position=(0, 0, 1500),
        windows=((60, 120, dict(pitch=0.3, yaw=-0.2, roll=0.4)),))
    add("air_throttle", position=(0, 0, 1500), windows=((60, 120, dict(throttle=1)),))
    add("air_coast", position=(0, 0, 1500), velocity=(500, 200, 100))
    for name, controls in (("throttle", dict(throttle=1)),
                            ("reverse", dict(throttle=-1)),
                            ("steer", dict(throttle=1, steer=1)),
                            ("powerslide", dict(throttle=1, steer=1, handbrake=True))):
        add(f"ground_{name}", windows=((60, 240, controls),))
    add("ground_brake", velocity=(1000, 0, 0), windows=((60, 180, dict(throttle=-1)),))
    add("wall_drive", position=(3700, 0, 17), windows=((60, 240, dict(throttle=1)),))
    add("wall_jump", position=(3600, 0, 17), velocity=(500, 0, 0),
        windows=((60, 84, dict(jump=True)), (60, 240, dict(throttle=1))))
    add("wall_impact", position=(3000, 0, 600), velocity=(600, 0, 0))
    add("ceiling_impact", position=(0, 0, 1500), velocity=(0, 0, 900))
    add("inverted_landing", position=(0, 0, 600), rotation=(0, 0, np.pi))
    add("ball_floor_drop", ball_position=(0, 500, 600))
    add("ball_wall_bounce", ball_position=(3000, 0, 500), ball_velocity=(900, 0, 0))
    add("ball_ceiling_bounce", ball_position=(0, 500, 1500), ball_velocity=(0, 0, 900))
    add("ball_spin_bounce", ball_position=(0, 500, 600),
        ball_velocity=(300, 0, -100), ball_omega=(0, 3, 0))
    add("car_ball_nose", ball_position=(500, 0, 93), windows=((60, 180, dict(throttle=1)),))
    add("car_ball_offset", ball_position=(500, 55, 93), windows=((60, 180, dict(throttle=1)),))
    add("car_ball_boost", ball_position=(800, 0, 93), windows=((60, 180, dict(boost=True)),))
    add("carry_flick", ball_position=(0, 0, 150),
        windows=((60, 84, dict(jump=True)), (100, 102, dict(jump=True, pitch=-1))))
    return cases


def batch_controls(tick, definition):
    controls = {}
    for start, end, values in definition["windows"]:
        if start <= tick < end:
            controls.update(values)
    return controls


def receive_native_packet(bot, packet, scripted):
    if scripted:
        if bot._initialized_bot:
            bot._packet_processor(packet)
    else:
        bot._latest_packet = packet


def batch_case_selection(retry_path=None, case_offset=0, case_limit=None):
    if case_offset < 0 or (case_limit is not None and case_limit < 1):
        raise ValueError("Case offset must be nonnegative and limit must be positive")
    definitions = native_batch_cases()
    if retry_path is not None:
        report = json.loads(retry_path.read_text(encoding="utf-8"))
        if not report.get("completed") or report.get("required_repeats") != 2:
            raise ValueError("Retry requires a completed two-pass coverage report")
        if set(report["coverage"]) != {definition["name"] for definition in definitions}:
            raise ValueError("Retry report must cover the canonical batch")
        definitions = [definition for definition in definitions if report["coverage"][definition["name"]] < 2]
    return definitions[case_offset:None if case_limit is None else case_offset + case_limit]


def audit_native_batches(paths):
    if len({path.resolve() for path in paths}) != len(paths):
        raise ValueError("Cannot count the same capture twice")
    canonical = {definition["name"]: json.loads(json.dumps(definition))
                 for definition in native_batch_cases()}
    coverage = {name: 0 for name in canonical}
    sources = []
    digests = set()
    for path in paths:
        with path.open("rb") as capture:
            digest = hashlib.file_digest(capture, "sha256").hexdigest()
        if digest in digests:
            raise ValueError("Cannot count duplicate capture content twice")
        digests.add(digest)
        with path.open(encoding="utf-8") as capture:
            header = json.loads(capture.readline())
        if header.get("probe_repeats") != 2 or any(
                canonical.get(definition["name"]) != definition
                for definition in header["probe_definitions"]):
            raise ValueError("Capture case definitions differ from canonical batch")
        report = audit_native_batch(path)
        for name, count in report["coverage"].items():
            coverage[name] += count
        sources.append(dict(capture=str(path), sha256=digest, completed=report["completed"],
                            accepted_segments=sum(report["coverage"].values()),
                            rejected_segments=len(report["rejected"])))
    combined = dict(completed=all(source["completed"] for source in sources),
                    sources=sources, coverage=coverage, required_repeats=2,
                    parity_certified=False)
    combined["coverage_passed"] = combined["completed"] and all(count >= 2 for count in coverage.values())
    paths[-1].with_suffix(".combined-coverage.json").write_text(
        json.dumps(combined, indent=2), encoding="utf-8")
    return combined


def audit_native_batch(path):
    header = None
    segments = {}
    completed = False
    with path.open(encoding="utf-8") as capture:
        for line in capture:
            record = json.loads(line)
            if record["type"] == "header":
                header = record
            elif record["type"] == "batch_complete":
                completed = True
            elif record["type"] == "physics" and record.get("probe_case"):
                segments.setdefault(record["probe_index"], []).append(record)
    if not header or header.get("scenario") != "native_batch":
        raise ValueError("Expected native batch capture")
    coverage = {case["name"]: 0 for case in header["probe_definitions"]}
    rejected = []
    outcomes = []
    for index, rows in segments.items():
        name = rows[0]["probe_case"]
        definition = header["probe_definitions"][index % len(coverage)]
        active = all(row["packet"]["match_info"]["match_phase"] == 3 for row in rows)
        standard = all(row["packet"]["match_info"]["world_gravity_z"] == -650 and
                   row["packet"]["match_info"]["game_speed"] == 1 and
                   len(row["packet"]["players"]) == 1 and
                   row["packet"]["players"][0]["player_id"] == header["player_id"]
                   for row in rows)
        continuous = all(after["frame"] == before["frame"] + 1 and
                         abs(after["packet"]["match_info"]["seconds_elapsed"] -
                             before["packet"]["match_info"]["seconds_elapsed"] - 1 / 120) < 0.0001
                         for before, after in zip(rows, rows[1:]))
        full = (len(rows) == definition["duration_ticks"] and
                rows[0]["probe_tick"] == 0 and
                rows[-1]["probe_tick"] == definition["duration_ticks"] - 1 and
                rows[0].get("reset_after_packet") is True and
                all(row["probe_case"] == definition["name"] and
                    row["probe_tick"] == offset for offset, row in enumerate(rows)))
        gaps = [dict(before_tick=before["probe_tick"], after_tick=after["probe_tick"],
                     frame_delta=after["frame"] - before["frame"],
                     seconds_delta=after["packet"]["match_info"]["seconds_elapsed"] -
                                   before["packet"]["match_info"]["seconds_elapsed"])
                for before, after in zip(rows, rows[1:])
                if after["frame"] != before["frame"] + 1 or
                abs(after["packet"]["match_info"]["seconds_elapsed"] -
                    before["packet"]["match_info"]["seconds_elapsed"] - 1 / 120) >= 0.0001]
        players = [player for row in rows[1:] for player in row["packet"]["players"]
                   if player["player_id"] == header["player_id"]]
        observed = dict(index=index, case=name, frames=len(rows),
                        gap_count=len(gaps),
                        accepted=active and standard and continuous and full)
        if players and "physics" in players[0]:
            observed.update(
                car_height_range=[min(player["physics"]["location"]["z"] for player in players),
                                  max(player["physics"]["location"]["z"] for player in players)],
                boost_range=[min(player["boost"] for player in players),
                             max(player["boost"] for player in players)],
                max_speed=max(sum(value ** 2 for value in player["physics"]["velocity"].values()) ** 0.5 for player in players),
                jumped=any(player["has_jumped"] for player in players),
                double_jumped=any(player["has_double_jumped"] for player in players),
                dodged=any(player["has_dodged"] for player in players),
                air_states=sorted({player["air_state"] for player in players}),
                recorded_hitbox=players[min(40, len(players) - 1)]["hitbox"],
                latest_touch_changed=any(player["latest_touch"] != players[0]["latest_touch"] for player in players[1:]))
        outcomes.append(observed)
        if active and standard and continuous and full:
            coverage[name] += 1
        else:
            rejected.append(dict(index=index, case=name, active=active, standard=standard,
                                 continuous=continuous, full=full, gaps=gaps))
    report = dict(capture=str(path), completed=completed, coverage=coverage,
                  required_repeats=header["probe_repeats"], rejected=rejected,
                  outcomes=outcomes,
                  parity_certified=False,
                  limitations=["No wheel suspension or jump-hold/contact-release timers in RLBot packets",
                               "Coverage is not a physics comparison or contact certification"])
    report["coverage_passed"] = completed and all(count >= header["probe_repeats"] for count in coverage.values())
    path.with_suffix(".coverage.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def check_batch_audit():
    from types import SimpleNamespace

    received = []
    receiver = SimpleNamespace(_initialized_bot=True, _latest_packet=None,
                               _packet_processor=received.append)
    for frame in range(3):
        receive_native_packet(receiver, frame, True)
    assert received == [0, 1, 2] and receiver._latest_packet is None
    receive_native_packet(receiver, 3, False)
    assert received == [0, 1, 2] and receiver._latest_packet == 3
    receiver._initialized_bot = False
    receive_native_packet(receiver, 4, True)
    assert received == [0, 1, 2]
    definition = dict(name="fixture", duration_ticks=3)
    header = dict(type="header", scenario="native_batch", player_id=7,
                  probe_definitions=[definition], probe_repeats=2)
    rows = [header]
    for index in range(2):
        for tick in range(3):
            frame = index * 3 + tick
            rows.append(dict(type="physics", probe_index=index, probe_case="fixture",
                             probe_tick=tick, frame=frame,
                             reset_after_packet=tick == 0,
                             packet=dict(match_info=dict(match_phase=3, world_gravity_z=-650,
                                                         game_speed=1, seconds_elapsed=frame / 120),
                                         players=[dict(player_id=7)])))
    rows.append(dict(type="batch_complete"))
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "fixture.ndjson"
        path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
        assert audit_native_batch(path)["coverage_passed"]
        for section, field, invalid in (("match_info", "match_phase", 2),
                                        ("match_info", "world_gravity_z", -325),
                                        ("match_info", "game_speed", 0.5)):
            original = rows[2]["packet"][section][field]
            rows[2]["packet"][section][field] = invalid
            path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            assert not audit_native_batch(path)["coverage_passed"]
            rows[2]["packet"][section][field] = original
        rows[1]["reset_after_packet"] = False
        path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
        assert not audit_native_batch(path)["coverage_passed"]
        rows[1]["reset_after_packet"] = True
        rows.pop(2)
        path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
        report = audit_native_batch(path)
        assert not report["coverage_passed"]
        assert report["rejected"][0]["gaps"][0]["frame_delta"] == 2
        rows = [row for row in rows if row["type"] != "batch_complete"]
        path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
        assert not audit_native_batch(path)["coverage_passed"]
        definitions = native_batch_cases()
        assert batch_case_selection(case_limit=6) == definitions[:6]
        assert batch_case_selection(case_offset=6, case_limit=6) == definitions[6:12]
        assert not batch_case_selection(case_offset=len(definitions), case_limit=6)
        for options in (dict(case_offset=-1), dict(case_limit=0)):
            try:
                batch_case_selection(**options)
            except ValueError:
                pass
            else:
                raise AssertionError("Invalid batch bounds accepted")
        retry = Path(directory) / "retry.json"
        retry_report = dict(completed=True, required_repeats=2,
                            coverage={case["name"]: 2 for case in definitions})
        retry_report["coverage"][definitions[0]["name"]] = 1
        retry.write_text(json.dumps(retry_report), encoding="utf-8")
        assert batch_case_selection(retry) == definitions[:1]
        assert batch_case_selection(retry, case_limit=6) == definitions[:1]
        assert not batch_case_selection(retry, case_offset=1, case_limit=6)
        definition = definitions[0]
        rows = [dict(header, probe_definitions=[definition])]
        for index in range(2):
            for tick in range(definition["duration_ticks"]):
                frame = index * definition["duration_ticks"] + tick
                rows.append(dict(type="physics", probe_index=index,
                                 probe_case=definition["name"], probe_tick=tick,
                                 reset_after_packet=tick == 0, frame=frame,
                                 packet=dict(match_info=dict(match_phase=3, world_gravity_z=-650,
                                                             game_speed=1, seconds_elapsed=frame / 120),
                                             players=[dict(player_id=7)])))
        rows.append(dict(type="batch_complete"))
        path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
        combined = audit_native_batches([path])
        assert combined["coverage"][definition["name"]] == 2
        assert not combined["coverage_passed"]
        try:
            audit_native_batches([path, path])
        except ValueError:
            pass
        else:
            raise AssertionError("Duplicate capture accepted")
        duplicate = Path(directory) / "duplicate.ndjson"
        duplicate.write_bytes(path.read_bytes())
        try:
            audit_native_batches([path, duplicate])
        except ValueError:
            pass
        else:
            raise AssertionError("Copied capture accepted")
        rows[0]["probe_definitions"] = [dict(definition, boost=99)]
        path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
        try:
            audit_native_batches([path])
        except ValueError:
            pass
        else:
            raise AssertionError("Changed case definition accepted")


def packet_record(value):
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, (list, tuple)):
        return [packet_record(item) for item in value]
    fields = getattr(type(value), "__match_args__", ())
    if fields:
        return {name: packet_record(getattr(value, name)) for name in fields}
    return int(value)


def load_policy():
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / CHECKPOINT
    if not path.exists():
        url = f"https://raw.githubusercontent.com/SentientPlatypus/indonesian_coconut/{REVISION}/checkpoints_to_test/{CHECKPOINT}"
        temporary = path.with_suffix(".download")
        urllib.request.urlretrieve(url, temporary)
        temporary.replace(path)
    weights = torch.load(path, map_location="cpu", weights_only=True)
    matrices = [value for key, value in weights.items() if key.endswith(".weight")]
    layers = []
    for index, matrix in enumerate(matrices):
        layers.append(torch.nn.Linear(matrix.shape[1], matrix.shape[0]))
        layers.append(torch.nn.Softmax(dim=-1) if index == len(matrices) - 1 else torch.nn.ReLU())
    policy = torch.nn.Module()
    policy.model = torch.nn.Sequential(*layers)
    policy.load_state_dict(weights, strict=True)
    policy.eval()
    torch.set_num_threads(1)
    return policy, matrices[0].shape[1], hashlib.sha256(path.read_bytes()).hexdigest()


def observation_builder():
    return DefaultObs(
        zero_padding=None,
        pos_coef=np.asarray([1 / common_values.SIDE_WALL_X, 1 / common_values.BACK_NET_Y,
                             1 / common_values.CEILING_Z]),
        ang_coef=1 / np.pi,
        lin_vel_coef=1 / common_values.CAR_MAX_SPEED,
        ang_vel_coef=1 / common_values.CAR_MAX_ANG_VEL,
        boost_coef=1 / 100.0,
    )


def choose_action(policy, observation, inputs, generator):
    vector = np.asarray(observation, dtype=np.float32)
    if vector.shape != (inputs,) or not np.isfinite(vector).all():
        raise ValueError(f"Invalid observation: shape {vector.shape}, expected {(inputs,)}")
    with torch.inference_mode():
        probabilities = policy.model(torch.from_numpy(vector)).clamp(1e-11, 1.0)
        if not torch.isfinite(probabilities).all():
            raise ValueError("Nonfinite policy output")
        return int(torch.multinomial(probabilities, 1, generator=generator).item())


def mechanics_probe(tick, case):
    if case == "boost":
        return {"boost": 60 <= tick < 120}
    if case not in MECHANICS_CASES:
        raise ValueError(f"Unknown mechanics case: {case}")
    controls = {"jump": 60 <= tick < (64 if case == "ground_flip" else 84)}
    if case != "jump":
        flip_tick = 68 if case == "ground_flip" else 100
        pressing = flip_tick <= tick < flip_tick + 2
        controls.update(jump=controls["jump"] or pressing,
                        pitch=(1 if case == "backflip" else -1) if pressing and case != "side_flip" else 0,
                        yaw=1 if case in ("diagonal_flip", "side_flip") and pressing else 0)
        if case in ("cancel_sustained", "cancel_partial") and 102 <= tick < 180:
            controls["pitch"] = 1 if case == "cancel_sustained" else 0.5
    return controls


def native_config(launcher="NoLaunch", air_probe=False, mechanics=False, batch=False, retry_path=None, case_offset=0, case_limit=None):
    from rlbot.config import load_match_config
    from rlbot.flat import PlayerLoadout, MatchLengthMutator

    directory = CACHE / "native"
    directory.mkdir(parents=True, exist_ok=True)
    command = f'"{sys.executable}" -u "{Path(__file__).resolve()}" --agent'
    if air_probe:
        command += " --air-probe"
    if mechanics:
        command += " --mechanics-probe"
    if batch:
        command += " --batch-probe"
        command += f" --case-offset {case_offset}"
        if case_limit is not None:
            command += f" --case-limit {case_limit}"
    if retry_path is not None:
        command += f' --retry-batch "{retry_path.resolve()}"'
    if os.name == "nt":
        command = f'"{command}"'
    (directory / "coconut.bot.toml").write_text(
        '[settings]\nagent_id = "airlab/coconut-trial"\nname = "Indonesian Coconut"\n'
        f'root_dir = {json.dumps(str(ROOT / "tools" / "physics-compare"))}\n'
        f'run_command = {json.dumps(command)}\n', encoding="utf-8")
    path = directory / "match.toml"
    path.write_text(
        f'[rlbot]\nlauncher = {json.dumps(launcher)}\n'
        'auto_start_agents = true\n\n'
        '[match]\ngame_mode = "Soccar"\ngame_map_upk = "Stadium_P"\n'
        'skip_replays = true\n\n'
        '[[cars]]\nconfig_file = "coconut.bot.toml"\nteam = 0\n\n'
        '[[cars]]\ntype = "Psyonix"\nskill = "AllStar"\nteam = 1\n', encoding="utf-8")
    config = load_match_config(path)
    if air_probe:
        config.player_configurations = config.player_configurations[:1]
        config.player_configurations[0].variety.loadout = PlayerLoadout(car_id=23)
    config.enable_state_setting = air_probe
    if batch:
        config.mutators.match_length = MatchLengthMutator.Unlimited
    return config


def run_native_agent(air_probe=False, mechanics=False, batch=False, retry_path=None, case_offset=0, case_limit=None):
    from rlbot.flat import (ControllerState, MatchPhase, DesiredCarState,
                           DesiredBallState, DesiredPhysics, Vector3Partial, RotatorPartial)
    from rlbot.managers import Bot
    from rlbot.utils import fill_desired_game_state
    from rlgym_compat import GameState
    from rlgym_compat.sim_extra_info import SimExtraInfo

    class CoconutNative(Bot):
        def _handle_packet(self, packet):
            receive_native_packet(self, packet, air_probe)

        def retire(self):
            if hasattr(self, "capture"):
                self.capture.close()

        def initialize(self):
            if not air_probe:
                self.policy, self.inputs, digest = load_policy()
                self.generator = torch.Generator().manual_seed(42)
                self.obs = observation_builder()
                self.actions = LookupTableAction()
                self.state = GameState.create_compat_game_state(self.field_info, self.match_config)
                self.state._tick_skip = 8
                self.extra = SimExtraInfo(self.field_info, self.match_config)
            else:
                self.inputs, digest = None, None
            self.next_decision = 0
            self.last_frame = -1
            self.next_probe = 0
            self.probe_start = 0
            self.probe_index = -1
            self.batch_cases = batch_case_selection(retry_path, case_offset, case_limit) if batch else []
            if batch and not self.batch_cases:
                raise ValueError("No missing cases to record")
            self.batch_completed = False
            self.controls = ControllerState()
            path = CACHE / "native" / f"capture-{time.time_ns()}.ndjson"
            self.capture = path.open("w", encoding="utf-8", buffering=65536)
            self.capture.write(json.dumps({"type": "header", "checkpoint": CHECKPOINT,
                                           "sha256": digest, "observation_size": self.inputs,
                                           "version": 2, "player_id": self.player_id,
                                           "match_configuration": packet_record(self.match_config),
                                           "scenario": "native_batch" if batch else "mechanics_probe" if mechanics else "isolated_air_probe" if air_probe else "coconut_match",
                                           "probe_definitions": self.batch_cases,
                                           "probe_repeats": 2 if batch else None,
                                           "input_phase": "packet_last_input; commands_sent_after_packet"}) + "\n")
            self.capture.flush()
            print(f"Coconut native ready; recording {path}", flush=True)

        def get_output(self, packet):
            frame = packet.match_info.frame_num
            if not packet.balls or packet.match_info.match_phase == MatchPhase.Ended:
                return ControllerState()
            if frame == self.last_frame:
                return self.controls
            if frame < self.last_frame:
                self.next_decision = 0
            self.last_frame = frame
            if not air_probe:
                self.state.update(packet, extra_info=self.extra.get_extra_info(packet))
            reset_probe = air_probe and frame >= self.next_probe and not self.batch_completed and (not mechanics or packet.match_info.match_phase == MatchPhase.Active)
            if mechanics and reset_probe:
                self.probe_start = frame
                self.probe_index += 1
                if batch and self.probe_index >= len(self.batch_cases) * 2:
                    self.batch_completed = True
                    reset_probe = False
                    self.capture.write(json.dumps(dict(type="batch_complete", frame=frame)) + "\n")
                    self.capture.flush()
                    print("Native batch completed both passes", flush=True)
            definition = self.batch_cases[self.probe_index % len(self.batch_cases)] if batch and self.probe_index >= 0 and not self.batch_completed else None
            probe_case = definition["name"] if definition else MECHANICS_CASES[self.probe_index % len(MECHANICS_CASES)] if mechanics and not batch and self.probe_index >= 0 else None
            if air_probe:
                self.controls = ControllerState(**batch_controls(frame - self.probe_start, definition)) if definition else ControllerState(**mechanics_probe(frame - self.probe_start, probe_case)) if mechanics and probe_case else ControllerState()
                if not mechanics:
                    self.controls = ControllerState(throttle=1, pitch=0.3, yaw=-0.2, roll=0.4)
                if mechanics and not probe_case and not self.batch_completed:
                    self.controls = ControllerState(throttle=1, boost=True)
            self.capture.write(json.dumps({"type": "physics", "frame": frame,
                                           "reset_after_packet": reset_probe,
                                           "probe_case": probe_case,
                                           "probe_index": self.probe_index,
                                           "commands_after_packet": packet_record(self.controls) if air_probe else None,
                                           "probe_tick": frame - self.probe_start if probe_case else None,
                                           "packet": packet_record(packet)}, allow_nan=False) + "\n")
            if reset_probe:
                self.capture.flush()
            if air_probe:
                if reset_probe:
                    self.next_probe = frame + (360 if mechanics else 120)
                    position = definition["position"] if definition else (0, 0, (1500 if probe_case == "boost" else 17) if mechanics else 1100)
                    velocity = definition["velocity"] if definition else (0 if mechanics else 100, 0, 0)
                    rotation = definition["rotation"] if definition else (0, 0, 0)
                    ball_position = definition["ball_position"] if definition else (3000, 3000, 100)
                    ball_velocity = definition["ball_velocity"] if definition else (0, 0, 0)
                    ball_omega = definition["ball_omega"] if definition else (0, 0, 0)
                    desired_state = fill_desired_game_state(
                        cars={self.index: DesiredCarState(physics=DesiredPhysics(
                            location=Vector3Partial(*position),
                            velocity=Vector3Partial(*velocity),
                            angular_velocity=Vector3Partial(0, 0, 0),
                            rotation=RotatorPartial(*rotation)), boost_amount=definition["boost"] if definition else 50)},
                        balls={0: DesiredBallState(physics=DesiredPhysics(
                            location=Vector3Partial(*ball_position),
                            velocity=Vector3Partial(*ball_velocity),
                            angular_velocity=Vector3Partial(*ball_omega)))})
                    self._game_interface.send_msg(desired_state)
                return self.controls
            if frame < self.next_decision:
                return self.controls
            self.next_decision = frame + 8
            observation = self.obs.build_obs([self.player_id], self.state, {})[self.player_id]
            action = choose_action(self.policy, observation, self.inputs, self.generator)
            values = self.actions.parse_actions({self.player_id: np.asarray([action])}, self.state, {})[self.player_id][0]
            names = ("throttle", "steer", "pitch", "yaw", "roll", "jump", "boost", "handbrake")
            controls = {name: float(value) if index < 5 else bool(value)
                        for index, (name, value) in enumerate(zip(names, values))}
            self.controls = ControllerState(**controls)
            car = self.state.cars[self.player_id]
            self.capture.write(json.dumps({"type": "tick", "frame": frame,
                                           "seconds": packet.match_info.seconds_elapsed,
                                           "controls": controls, "action": action,
                                           "position": car.physics.position.tolist(),
                                           "speed": float(np.linalg.norm(car.physics.linear_velocity)),
                                           "on_ground": bool(car.on_ground),
                                           "ball_touches": car.ball_touches}, allow_nan=False) + "\n")
            self.state.reset_car_ball_touches()
            return self.controls

    CoconutNative("airlab/coconut-trial").run(wants_match_communications=False, wants_ball_predictions=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=float, default=30)
    parser.add_argument("--native", action="store_true")
    parser.add_argument("--check-native", action="store_true")
    parser.add_argument("--agent", action="store_true")
    parser.add_argument("--air-probe", action="store_true")
    parser.add_argument("--mechanics-probe", action="store_true")
    parser.add_argument("--batch-probe", action="store_true")
    parser.add_argument("--audit-batch", type=Path)
    parser.add_argument("--retry-batch", type=Path)
    parser.add_argument("--case-offset", type=int, default=0)
    parser.add_argument("--case-limit", type=int)
    parser.add_argument("--merge-batches", type=Path, nargs="+")
    parser.add_argument("--check-batch", action="store_true")
    parser.add_argument("--launch-game", type=Path)
    parser.add_argument("--launcher", choices=("NoLaunch", "Epic", "Steam"), default="NoLaunch")
    args = parser.parse_args()
    if args.case_offset < 0 or (args.case_limit is not None and args.case_limit < 1):
        parser.error("case offset must be nonnegative and limit must be positive")
    if (args.case_offset or args.case_limit is not None) and not (args.batch_probe or args.retry_batch):
        parser.error("case bounds require --batch-probe or --retry-batch")
    args.batch_probe = args.batch_probe or args.retry_batch is not None
    args.mechanics_probe = args.mechanics_probe or args.batch_probe
    args.air_probe = args.air_probe or args.mechanics_probe
    if not 0 < args.seconds <= (900 if args.batch_probe else 300):
        parser.error("seconds exceeds the capture limit")
    if args.audit_batch:
        report = audit_native_batch(args.audit_batch)
        print(json.dumps({key: value for key, value in report.items() if key not in ("outcomes", "rejected")}, indent=2))
        print(f"Rejected segments: {len(report['rejected'])}; details saved in .coverage.json")
        if not report["coverage_passed"]:
            raise RuntimeError("Native batch coverage incomplete; see coverage report")
        return
    if args.merge_batches:
        report = audit_native_batches(args.merge_batches)
        print(json.dumps(report, indent=2))
        if not report["coverage_passed"]:
            raise RuntimeError("Combined native coverage incomplete")
        return
    if args.check_batch:
        check_batch_audit()
        definitions = batch_case_selection(args.retry_batch, args.case_offset, args.case_limit)
        assert len({case["name"] for case in definitions}) == len(definitions)
        for definition in definitions:
            for start, end, controls in definition["windows"]:
                assert 0 <= start < end <= definition["duration_ticks"]
                for tick in (start, end - 1, end):
                    mechanics = batch_controls(tick, definition)
                    assert all(key in ("throttle", "steer", "pitch", "yaw", "roll", "jump", "boost", "handbrake") for key in mechanics)
            assert not batch_controls(0, definition)
        print(json.dumps(dict(cases=len(definitions), repeats=2,
                             game_seconds=len(definitions) * 6,
                             audit_self_check="passed", packet_dispatch_self_check="passed"), indent=2))
        return
    if args.agent:
        run_native_agent(args.air_probe, args.mechanics_probe, args.batch_probe, args.retry_batch, args.case_offset, args.case_limit)
        return
    if args.native or args.check_native:
        from rlbot.managers.match import MatchManager

        if args.batch_probe and not batch_case_selection(args.retry_batch, args.case_offset, args.case_limit):
            parser.error("No cases selected")
        config = native_config(args.launcher, args.air_probe, args.mechanics_probe, args.batch_probe, args.retry_batch, args.case_offset, args.case_limit)
        if args.check_native:
            print(json.dumps({"launcher": str(config.launcher), "players": len(config.player_configurations),
                              "observation_size": load_policy()[1]}, indent=2))
            return
        server = CACHE / "native" / "RLBotServer.exe"
        if not server.exists():
            urllib.request.urlretrieve("https://github.com/RLBot/core/releases/download/v5.0.0-rc17/RLBotServer.exe", server)
        if hashlib.sha256(server.read_bytes()).hexdigest() != "b64dc026d61b9f2b2d5645e80dbc6a9d7391231ff49246d29028018dcb036ab8":
            raise ValueError("RLBotServer hash mismatch")
        if args.launch_game:
            import psutil

            if not args.launch_game.is_file():
                raise FileNotFoundError(args.launch_game)
            if any((process.info["name"] or "").lower() == "rocketleague.exe"
                   for process in psutil.process_iter(["name"])):
                raise RuntimeError("Close Rocket League before using --launch-game.")
            subprocess.Popen([str(args.launch_game), "-rlbot", "RLBot_ControllerURL=127.0.0.1:23233",
                              "RLBot_PacketSendRate=240", "-nomovie"], cwd=args.launch_game.parent)
        manager = MatchManager(server)
        capture_started = time.time()
        try:
            manager.start_match(config, wait_for_start=False)
            threading.Event().wait(args.seconds)
            if manager.packet is None:
                raise RuntimeError("No native game packets received. Rocket League must be running in RLBot v5 mode.")
            print(json.dumps({"runtime": "native Rocket League", "frame": manager.packet.match_info.frame_num,
                              "players": [player.name for player in manager.packet.players]}, indent=2))
        finally:
            manager.shut_down()
        if args.batch_probe:
            captures = [path for path in (CACHE / "native").glob("capture-*.ndjson")
                        if path.stat().st_mtime >= capture_started]
            if len(captures) != 1:
                raise RuntimeError(f"Expected one fresh batch capture, found {len(captures)}")
            report = audit_native_batch(captures[0])
            print(json.dumps({key: value for key, value in report.items() if key not in ("outcomes", "rejected")}, indent=2))
            print(f"Rejected segments: {len(report['rejected'])}; details saved in .coverage.json")
            if not report["coverage_passed"]:
                raise RuntimeError("Native batch coverage incomplete; see coverage report")
        return
    policy, inputs, digest = load_policy()
    os.chdir(ROOT / "tools" / "physics-compare")
    environment = RLGym(
        state_mutator=MutatorSequence(FixedTeamSizeMutator(blue_size=1, orange_size=1), KickoffMutator()),
        obs_builder=observation_builder(),
        action_parser=RepeatAction(LookupTableAction(), repeats=8),
        reward_fn=GoalReward(),
        termination_cond=GoalCondition(),
        truncation_cond=TimeoutCondition(timeout_seconds=300),
        transition_engine=RocketSimEngine(),
    )
    generator = torch.Generator().manual_seed(42)
    observations = environment.reset()
    moving_steps = airborne_steps = touches = goals = 0
    maximum_speed = maximum_height = 0.0
    for _ in range(round(args.seconds * 15)):
        actions = {agent: np.asarray([choose_action(policy, obs, inputs, generator)])
                   for agent, obs in observations.items()}
        observations, _, terminated, truncated = environment.step(actions)
        car = next(car for car in environment.state.cars.values() if car.team_num == 0)
        speed = float(np.linalg.norm(car.physics.linear_velocity))
        moving_steps += speed > 100
        airborne_steps += not car.on_ground
        touches += int(car.ball_touches)
        maximum_speed = max(maximum_speed, speed)
        maximum_height = max(maximum_height, float(car.physics.position[2]))
        if any(terminated.values()) or any(truncated.values()):
            goals += int(environment.state.goal_scored)
            observations = environment.reset()
    print(json.dumps({"checkpoint": CHECKPOINT, "revision": REVISION, "sha256": digest,
                      "observation_size": inputs, "seconds": args.seconds,
                      "moving_steps": moving_steps, "airborne_steps": airborne_steps,
                      "ball_touches": touches, "goals": goals, "max_speed": maximum_speed,
                      "max_height": maximum_height, "runtime": "RocketSim; not native Rocket League"}, indent=2))
    environment.close()


if __name__ == "__main__":
    main()