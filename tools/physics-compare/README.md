# Physics compare harness

Offline validation of `src/shared/carSim.js` against **[RocketSim](https://github.com/ZealanL/RocketSim)** (Python bindings).

## Free Play parity work — 2026-09-30

Reference is pinned to **RocketSim 2.2.1**. This is a regression suite, not proof
of exact Rocket League parity. Live-game measurements are a separate requirement.

- `npm test`: standalone physics and comparison-integrity tests (no Python).
- `npm run physics:compare`: regenerate and enforce the 35 car scenarios.
- `npm run physics:ball`: regenerate and enforce 10 isolated ball scenarios.
- `npm run physics:parity`: scalar/config checks, including live RocketSim when available.
- `npm run physics:contact`: strict coupled car/ball comparisons; currently fails
	and exposes contact timing/solver gaps. See `docs/physics-source-evidence.md`.
- `npm run physics:meshes`: fetch 16 soccar fixtures from the SHA-256-pinned
	RLGym 2.0.1 source archive. Does not install RLGym or replace browser geometry.
	Keeps source/hash metadata and available package license beside ignored fixtures.

Use a project `.venv` and install `requirements.txt` there. The Python launcher
prefers `PYTHON` (an executable path, no quotes/arguments), then `.venv`, then
platform Python 3 commands. Windows paths with spaces and redirected UTF-8
output are supported. Missing/different meshes fail explicitly.

### Current measured results

- Existing car trajectory accuracy is preserved: approximately 0.001 uu in air,
	up to 0.17 uu ordinary ground motion, 1.56 uu floor scrape, 7.86 uu wall jump.
- Nine ball scenarios (sleep, freefall, drag, caps, void, floor, spin, wall,
	ceiling) have maximum position error below **0.0013 uu**.
- Goal entry no longer collides with a distant goal-roof plane. Its curved
	back-ramp contact retains **<0.2 uu** position / **<4 uu/s** velocity error.
- Budgets in `tolerances.json` explicitly retain the above approximation limits.
	The old wall-jump **0.28 boost** allowance has been removed: version-matched
	source showed full-boost cars must not consume pads. Error is now <0.0002 boost.
	Do not tighten/relax these budgets without inspecting the first divergent tick.

Comparison now rejects different scenario-file hashes, initial conditions,
tick counts/rates, controls, missing frames, and nonfinite states. It also checks
boost, air time, and grounded-state mismatch. Numerical failures exit nonzero;
`--report-only` prints failures without enforcing them for exploratory work.

### Next fidelity work (not completed)

Boost-pad pass: cooldown subtraction now uses float32, collection is permitted
on the tick cooldown reaches zero, inactive locks are cleared, and cylinder
boundaries use strict comparisons. A stationary small-pad reference collected
on ticks **1 and 481**; the regression test checks that sequence. Locked-contact
queries use a projected car-hitbox AABB instead of requiring its root to enter
the pad box. Full-boost/demoed/high cars now skip pickup per the version-matched
grid source; inactive-pad lock tracking is evaluated when the car is eligible.
The former wall-jump boost discrepancy is resolved. Full grid broadphase and
multi-car ordering still need dedicated coverage. Live-game recordings are still
required before certifying parity with Rocket League itself.

1. Coupled car–ball trajectory fixtures and unified contact/tick ordering.
	 Current collision response is not a complete Bullet manifold solver.
2. Triangle internal-edge handling, simultaneous contacts, posts, corners,
	 goal roof, and high-speed sweeps; current ball solver is sequential.
3. Boost-pad broadphase/locked-car AABB, cooldown expiry, and pickup timing.
4. Floor-scraping flips, wall-jump lateral drift, additional hitbox trajectories.
5. Match rendered arena geometry to collision geometry and validate input/camera
	 behavior separately from physical trajectories.

Zero linear **and** angular velocity explicitly sleeps RocketSim's ball even
when positioned in mid-air. Drop fixtures use a 0.001 uu/s initial velocity so
both engines are awake; a separate test covers kickoff sleep.

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
| Air roll/yaw from tilted starts (pitch45/90, roll90) | ~0 uu |
| Partial combined air inputs | ~0 uu |
| Air dodges | ~0.001 uu |
| Ground rest / throttle / boost / coast / brake | ≤ 0.02 uu |
| Ground steer / powerslide | ≤ 0.17 uu |
| Ground jump (full + tap) | ≤ 0.01 uu |
| Wall drive (throttle climb) | ≤ 0.10 uu |
| Jump + boost into wall curve (climb) | ~0.2 uu in XZ; ≤ ~8 uu lateral Y drift |
| Ground flip that scrapes the floor (musty/wavedash) | ~1.6 uu residual |

Floor-scraping dodges use a Bullet-manifold lever-arm inset on edge contacts only (`CONTACT_*_INSET_UU`). Arena SDF uses `min(signed)` so ramp wedges push outward (jump-into-wall climbs like RocketSim).
