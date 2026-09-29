# Physics compare harness

Offline validation of `src/shared/carSim.js` against **[RocketSim](https://github.com/ZealanL/RocketSim)** (Python bindings).

Keep the browser JS sim; use RocketSim as ground truth; fix deltas iteratively.

## What it does

1. Runs shared scenarios in RocketSim (`THE_VOID` for air, `SOCCAR` for ground).
2. Replays the same inputs through `carSim.js` in Node.
3. Writes a markdown report of position / velocity / ω / orientation errors.

## Setup

```bash
pip install -r tools/physics-compare/requirements.txt
npm install

# SOCCAR collision meshes (required for ground scenarios)
# Copy from rlgym: rlgym/rocket_league/sim/collision_meshes/soccar →
#   tools/physics-compare/collision_meshes/soccar/
# Or dump via https://github.com/ZealanL/RLArenaCollisionDumper
```

Regenerate the browser mesh pack after changing `.cmf` files:

```bash
node tools/physics-compare/gen_soccar_mesh.mjs
```

## Run

```bash
npm run physics:compare
```

Or step by step:

```bash
npm run physics:ref      # → tools/physics-compare/out/rocketsim/
npm run physics:js       # → tools/physics-compare/out/js/
npm run physics:diff     # → tools/physics-compare/out/report.md
```

## Scenario format

See `scenarios.json`. Controls use RocketSim / RLBot signs:

- `+pitch` = nose up
- `+yaw` = nose right
- `+roll` = roll right
- `+steer` = turn right

Frame: Z-up, identity car faces +X with right = +Y.

Ground scenarios set `"game_mode": "soccar"` and `"on_ground": true`.

## Current match quality (max position error vs RocketSim)

| Area | Max pos error |
|---|---|
| Air freefall / throttle / boost / pitch / yaw / roll | ~0 uu |
| Air dodges | ~0.001 uu |
| Ground rest / throttle / boost / coast / brake | ≤ 0.02 uu |
| Ground steer / powerslide | ≤ 0.17 uu |
| Ground jump (full + tap) | ≤ 0.01 uu |
| Wall drive (throttle climb) | ≤ 0.10 uu |
| Ground flip that scrapes the floor (musty) | ~28 uu residual |

The residual on floor-scraping dodges comes from Bullet’s contact manifold vs our merged OBB-corner solver; drive, jump, air, and wall paths are effectively 1:1.
