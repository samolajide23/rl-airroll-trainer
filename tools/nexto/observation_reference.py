from agent import Agent
from nexto_obs import NextoObsBuilder, BOOST_LOCATIONS
import json
import sys
import types
from pathlib import Path

import numpy as np

compat = types.ModuleType("rlgym_compat")
values = types.ModuleType("rlgym_compat.common_values")
values.BLUE_TEAM = 0
values.ORANGE_TEAM = 1
state_module = types.ModuleType("rlgym_compat.game_state")
state_module.GameState = object
state_module.PlayerData = object
sys.modules.update({"rlgym_compat": compat,
                    "rlgym_compat.common_values": values,
                    "rlgym_compat.game_state": state_module})
sys.path.insert(0, str(Path(__file__).parent / "upstream"))

payload = json.load(sys.stdin)
locations = [list(location) for location in BOOST_LOCATIONS]
locations[27][1] = 3308
field = types.SimpleNamespace(num_boosts=34, boost_pads=[
    types.SimpleNamespace(location=types.SimpleNamespace(x=location[0], y=location[1], z=location[2]),
                          is_full_boost=location[2] > 72) for location in locations
])
builder = NextoObsBuilder(field_info=field)
encoded = [0, 0, 0] + payload["pads"]
ball = payload["ball"]
ball_values = ball["pos"] + ball["vel"] + ball["omega"]
encoded += ball_values + ball_values
for index, car in enumerate(payload["cars"]):
    quaternion = car["q"]
    car_values = car["pos"] + [quaternion[3], *
                               quaternion[:3]] + car["vel"] + car["omega"]
    encoded += [index, car["team"]] + car_values + car_values
    encoded += [0, 0, 0, 0, 0, car["demo"],
                car["ground"], 0, car["flip"], car["boost"] / 100]
observations = builder.batched_build_obs(np.array([encoded], dtype=float))
builder.add_actions(observations, np.array(payload["action"]), 0)
query, entities, mask = observations[0]
print(json.dumps({"query": query.flatten().tolist(), "entities": entities.flatten().tolist(),
                  "mask": mask.flatten().tolist(), "actions": Agent.make_lookup_table().tolist()}))
