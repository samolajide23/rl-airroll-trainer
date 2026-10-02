import argparse
import configparser
import ctypes
import hashlib
import json
import os
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public" / "bots" / "kamael"
OUTPUT = ROOT / "tools" / "physics-compare" / "out" / "kamael-native"
sys.path.insert(0, str(SOURCE))

import Kamael as original
from rlbot.matchconfig.match_config import MatchConfig, PlayerConfig, Team
from rlbot.setup_manager import SetupManager


def structure(value):
    if isinstance(value, ctypes.Array):
        return [structure(item) for item in value]
    if isinstance(value, ctypes.Structure):
        result = {}
        counts = {
            "game_cars": "num_cars", "game_boosts": "num_boost",
            "teams": "num_teams", "boost_pads": "num_boosts",
            "goals": "num_goals", "slices": "num_slices",
        }
        for name, *_ in value._fields_:
            item = getattr(value, name)
            count = counts.get(name)
            if count and hasattr(value, count):
                item = list(item)[:getattr(value, count)]
            result[name] = [structure(entry) for entry in item] if isinstance(item, list) else structure(item)
        return result
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


class NativeCapture(original.Kamael):
    def initialize_agent(self):
        super().initialize_agent()
        OUTPUT.mkdir(parents=True, exist_ok=True)
        self.capture_path = OUTPUT / f"capture-{time.time_ns()}-{self.index}.ndjson"
        self.capture = self.capture_path.open("w", encoding="utf-8", buffering=1)
        self.capture.write(json.dumps({"type": "header", "name": self.name, "team": self.team, "index": self.index,
                                       "manifest": json.loads((SOURCE / "manifest.json").read_text())}) + "\n")
        self.capture_prediction = None
        self.capture_field = None
        print(f"Native Kamael recording: {self.capture_path}", flush=True)

    def get_ball_prediction_struct(self):
        prediction = super().get_ball_prediction_struct()
        self.capture_prediction = structure(prediction)
        return prediction

    def get_field_info(self):
        field = super().get_field_info()
        self.capture_field = structure(field)
        return field

    def get_output(self, packet):
        started = time.perf_counter()
        controls = super().get_output(packet)
        elapsed = time.perf_counter() - started
        row = {
            "type": "tick", "input": {"packet": structure(packet), "prediction": self.capture_prediction,
                                       "field": self.capture_field},
            "controls": {name: getattr(controls, name) for name in
                         ("throttle", "steer", "pitch", "yaw", "roll", "jump", "boost", "handbrake")},
            "action": type(self.activeState).__name__, "decision_seconds": elapsed,
        }
        self.capture.write(json.dumps(row, allow_nan=False) + "\n")
        return controls


def match_config(name):
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    for filename, expected in manifest["files"].items():
        actual = hashlib.sha256((SOURCE / filename).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Pinned source hash mismatch: {filename}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    config = configparser.ConfigParser()
    config.read(SOURCE / "Kamael.cfg")
    config["Locations"].update({"python_file": str(Path(__file__).resolve()), "looks_config": str(SOURCE / "kam_appearance.cfg"),
                                "logo_file": str(SOURCE / "kam_logo.png"), "use_virtual_environment": "False",
                                "supports_standalone": "False", "name": name})
    config_path = OUTPUT / "native.cfg"
    with config_path.open("w", encoding="utf-8") as stream:
        config.write(stream)
    match = MatchConfig()
    match.game_mode = "Soccer"
    match.game_map = "DFHStadium"
    match.networking_role = "none"
    match.network_address = "127.0.0.1"
    match.mutators.boost_strength = "1x"
    match.mutators.boost_amount = "Default"
    match.skip_replays = True
    match.enable_rendering = False
    match.enable_state_setting = False
    opponent = PlayerConfig()
    opponent.bot = True
    opponent.rlbot_controlled = False
    opponent.bot_skill = 1.0
    opponent.team = 1
    opponent.name = "All-Star baseline"
    match.player_configs = [PlayerConfig.bot_config(config_path, Team.BLUE), opponent]
    return match


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--seconds", type=float, default=120)
    parser.add_argument("--wyrm", action="store_true")
    args = parser.parse_args()
    os.chdir(SOURCE)
    match = match_config("Wyrm" if args.wyrm else "Kamael")
    if args.check:
        from importlib.metadata import version
        from rlbot.utils.class_importer import import_agent
        agent = import_agent(str(Path(__file__).resolve()))
        print(json.dumps({"rlbot": version("rlbot"), "numba": version("numba"), "numpy": version("numpy"),
                          "agent": agent.get_loaded_class().__name__, "players": [player.name for player in match.player_configs],
                          "capture_directory": str(OUTPUT)}, indent=2))
        return
    manager = SetupManager()
    try:
        manager.load_match_config(match)
        manager.connect_to_game()
        manager.launch_ball_prediction()
        manager.start_match()
        manager.launch_bot_processes()
        deadline = time.monotonic() + args.seconds
        stop = threading.Event()
        while time.monotonic() < deadline:
            stop.wait(0.1)
    finally:
        manager.shut_down(kill_all_pids=True)


if __name__ == "__main__":
    main()