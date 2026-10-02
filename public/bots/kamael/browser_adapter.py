import json
import sys
import types
from queue import Queue
from types import SimpleNamespace
import numpy as np


class Signature:
    def __call__(self, *args, **kwargs):
        if len(args) == 1 and isinstance(args[0], (int, float, np.number)):
            return np.float32(args[0])
        return self


def jit(*args, **kwargs):
    if len(args) == 1 and isinstance(args[0], types.FunctionType):
        return args[0]
    return lambda function: function


numba = types.ModuleType("numba")
numba.jit = jit
numba.float32 = Signature()
numba.boolean = bool
numba.typeof = lambda value: Signature()
sys.modules["numba"] = numba


class Controller:
    def __init__(self, **kwargs):
        self.throttle = self.steer = self.pitch = self.yaw = self.roll = 0.0
        self.jump = self.boost = self.handbrake = False
        self.__dict__.update(kwargs)


class Renderer:
    def __getattr__(self, name):
        return lambda *args, **kwargs: (255, 255, 255)


class BaseAgent:
    pass


class GameState:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class Vector3:
    def __init__(self, x=0, y=0, z=0):
        self.x, self.y, self.z = x, y, z


class Rotator:
    def __init__(self, pitch=0, yaw=0, roll=0):
        self.pitch, self.yaw, self.roll = pitch, yaw, roll


modules = {
    "rlbot.agents.base_agent": {"BaseAgent": BaseAgent, "SimpleControllerState": Controller},
    "rlbot.agents.standalone.standalone_bot": {"StandaloneBot": BaseAgent, "run_bot": lambda *args: None},
    "rlbot.utils.structures.game_data_struct": {"GameTickPacket": GameState},
    "rlbot.utils.game_state_util": {**{name: GameState for name in ["GameState", "BallState", "CarState", "Physics"]}, "Vector3": Vector3, "Rotator": Rotator},
}
for name, contents in modules.items():
    parts = name.split(".")
    for index in range(1, len(parts) + 1):
        module_name = ".".join(parts[:index])
        if module_name not in sys.modules:
            sys.modules[module_name] = types.ModuleType(module_name)
    sys.modules[name].__dict__.update(contents)

from Kamael import Kamael


def namespace(value):
    if isinstance(value, dict):
        return SimpleNamespace(**{key: namespace(item) for key, item in value.items()})
    if isinstance(value, list):
        return [namespace(item) for item in value]
    return value


def browser_begin(name="Kamael"):
    global bot
    bot = Kamael()
    bot.name = name
    bot.index = 0
    bot.team = 0
    bot.renderer = Renderer()
    bot.matchcomms = SimpleNamespace(incoming_broadcast=Queue(), outgoing_broadcast=Queue())
    bot.init_match_config(namespace({"game_mode": "Soccar", "mutators": {"boost_amount": "Normal", "boost_strength": "1x"}}))
    bot.initialize_agent()
    bot.get_ball_prediction_struct = lambda: prediction
    bot.get_field_info = lambda: field
    bot.set_game_state = lambda state: None
    return "ready"


def browser_step(encoded):
    global prediction, field
    data = json.loads(encoded)
    prediction = namespace(data["prediction"])
    field = namespace(data["field"])
    controls = bot.get_output(namespace(data["packet"]))
    while not bot.matchcomms.outgoing_broadcast.empty():
        bot.matchcomms.outgoing_broadcast.get_nowait()
    return json.dumps({"controls": {key: getattr(controls, key) for key in ["throttle", "steer", "pitch", "yaw", "roll", "jump", "boost", "handbrake"]}, "action": type(bot.activeState).__name__})