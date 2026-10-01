# Car-only movement bot

Run `npm run bot:movement`. The first run records RocketSim references in
`out/movement-bot/rocketsim`; subsequent runs reuse those references and the
recorded scenario file. Existing Skybot and chassis references are untouched.
The suite includes the 73 isolated movement fixtures plus six longer scripted
routes: straight boost/brake, analog slalom, powerslide/reverse, jump/dodge,
aerial/landing, and goal-roof recovery. Inputs are open-loop, not separate
adaptive bot decisions in each engine. Native car-only cases keep the ball
parked at z=10000 every tick; JS uses `stepCar` without a ball.

`report.md` enforces the tightened regression budgets: defaults are 0.002 uu
position, 0.005 uu/s velocity, 0.0001 rad/s omega, 0.0005 degrees forward/up,
0.0001 boost, 0.0003 seconds air time, and zero ground-state mismatch ticks.
Numeric car budgets, including legacy car-contact exceptions, were reduced
100-fold from the original budgets. Dedicated ball/contact budgets and the ball-goal velocity exception
are unchanged. `tick-report.md` and `tick-errors.json` report the first allowed
budget failure using the same defaults and scenario exceptions. They also
report finer diagnostics: 0.0001 uu position, 0.0001 uu/s velocity, 0.00001
rad/s omega, and 0.00001 degrees forward/up. Per-tick orientation errors use
atan2 of cross-product magnitude and dot product to resolve tiny angles.
These thresholds are not a claim of bit-exact parity. The command exits
nonzero when the regression gate fails.

Airborne replay now matches the native replacement CarState's grounded flag at
tick zero; both engines recompute wheel contact before applying first-tick
controls. Boost consumption uses native float32 rate/product/subtraction.
Persistent float32 Bullet-unit translation now keeps the internal origin
between ticks and resynchronizes after external position changes. Together,
these fixes yield 66/79 passing at the current tighter budgets. Remaining
failures include force/velocity drift and arena contact divergence.
A partial float32 translation probe improved individual jumps but reduced
overall passes to 37/79 because it reconstructed the internal origin from
rounded public snapshots every tick; it was replaced by persistent storage.

Before tightening, all 73 existing fixtures and the new powerslide route passed
their budgets; the other five long routes failed. At jump/dodge tick 302,
exact-start diagnostic replay matches velocity within 0.000389 uu/s and omega
within 0.000011 rad/s, while the unseeded route selects the opposite lateral
landing contact after inherited drift. At aerial tick 305, exact-start replay
still differs by 68.600235 uu/s: this is a local upright-floor contact defect.
Removing tuned corner offsets reduced that local error to 0.071087 uu/s but
worsened the long jump/dodge route; both offset probes were reverted. Exact
native witnesses and consistent contact generation are needed before retaining
a production physics change. Seeded diagnostic output is never accepted as
formal parity evidence.

# Physics compare harness

Offline validation of `src/shared/carSim.js` against **[RocketSim](https://github.com/ZealanL/RocketSim)** (Python bindings).

## Free Play parity work — 2026-09-30

Reference is pinned to **RocketSim 2.2.1**. This is a regression suite, not proof
of exact Rocket League parity. Live-game measurements are a separate requirement.

- `npm test`: standalone physics and comparison-integrity tests (no Python).
- `npm run physics:compare`: regenerate and enforce the 73 car scenarios.
- `npm run physics:ball`: regenerate and enforce 10 isolated ball scenarios.
- `npm run physics:parity`: scalar/config checks, including live RocketSim when available.
- `npm run physics:contact`: five strict coupled car/ball comparisons, passing
	unchanged budgets. See `docs/physics-source-evidence.md`.
- `npm run physics:meshes`: fetch 16 soccar fixtures from the SHA-256-pinned
	RLGym 2.0.1 source archive. Does not install RLGym or replace browser geometry.
	Keeps source/hash metadata and available package license beside ignored fixtures.

Use a project `.venv` and install `requirements.txt` there. The Python launcher
prefers `PYTHON` (an executable path, no quotes/arguments), then `.venv`, then
platform Python 3 commands. Windows paths with spaces and redirected UTF-8
output are supported. Missing/different meshes fail explicitly.

### Current measured results

Latest continuation supersedes the historical baseline below: **73/73 movement
and 5/5 strict coupled-contact cases pass**. Roof recovery and ceiling gates are
resolved. The immutable ten-second bot replay still fails, with maximum car
position error 79.726 uu and ball position error 61.012 uu. Exact goal-wall
tick-1093 velocity error is reduced from 483.58 to 0.05832 uu/s; angular velocity
error is 0.0001412 rad/s. A native two-contact witness and split-rotation
regression covers this repair. References, controls and budgets are unchanged.

Coupled iterations now follow RocketSim's special-row ordering: ordinary
car-ball normal, special ball-world normal, ordinary car-ball friction, then
special ball-world friction. The grounded tick-812 reference-state regression
requires ball/car velocity errors below 0.001 uu/s and angular error below
0.00001 rad/s. This isolated check does not certify the full trajectory.

The full replay's first car velocity-budget failure is tick 885. Tiny early
wheel/suspension and orientation differences accumulate before later contacts.
`roof_trace.cpp MESH_DIRECTORY drive` traces the first four boosted-drive ticks,
including wheel lengths, forces, pushback and contact points. Its scalar
Zig/Clang build differs from the saved Windows reference by about 0.0000017
rad/s on the first tick. The SIMD build now reproduces that first-tick velocity
and angular velocity exactly. Required Clang flags are `-ffp-contract=off`,
`-DBT_NO_SIMD_OPERATOR_OVERLOADS`, `-DBT_USE_SSE`, `-DBT_USE_SSE_IN_API`,
`-DBT_USE_SIMD_VECTOR3` and `-include emmintrin.h`.

`roof_trace_sse.exe MESH_DIRECTORY replay` reads 1200 whitespace-separated
control rows from stdin: throttle, steer, pitch, yaw, roll, boost, jump,
handbrake. Boolean fields use 0/1. It emits car and ball contacts around the
first divergence windows, including witness points and contact lifetimes.
This diagnostic has a small late-replay residual (about 0.014 uu final X),
so it must not replace the immutable reference. Partial float32 orientation,
ball-integration, wheel-ray and suspension-force probes were rejected and
are not retained.

An exact-start replay of the low bounce at ticks 739-749 matches native height
and vertical velocity within 0.00001 per tick. Native floor contacts are fresh
(lifetime 1), not persistent across these ticks; the earlier full-replay stop
comes from accumulated incoming-state drift, not an incorrect floor threshold.
The one-tick reference-seeded diagnostic has maximum velocity errors of
0.02294 uu/s for the ball and 0.05832 uu/s for the car. These local results do
not establish unseeded trajectory parity.

For local investigation, `run_js.mjs --seed-reference FILE --seed-every N`
restores exported transforms/velocities while retaining JS hidden histories.
Seed inputs are validated against the scenario and output is marked diagnostic.
Normal parity comparison rejects reference-seeded output. See
`docs/skybot-diagnostic.md` for the replay command and limitations.

Historical baseline before these repairs:

- Movement audit: **62/69 scenarios pass** with unchanged tolerances. Coverage
	includes speed/spin caps, analog/high-speed steering, reverse and diagonal
	flips, early double jump, valid/expired dodge windows, minimum boost duration,
	six hitbox jump configurations, and airborne wheel landings.
- Fixed minimum boost duration using reference float32 timer accumulation;
	initialized wheel friction coefficients to zero, matching the reference's
	first-contact ordering. Both have focused unit tests.
- Remaining failures: powerslide release, Dominus/Plank/Breakout/Hybrid landings,
	roof recovery, and ceiling impact. Roof/ceiling errors begin at first chassis
	contact; maximum position errors are **36.33/120.77 uu**, respectively.
	Separate box-corner face constraints worsened recovery and were not retained.
- Coupled contact: **2/5 pass overall**. All five ball trajectories meet their
	budgets; three car orientation residuals remain around 0.06-0.11 degrees.
- Verification: 33 unit tests, 13 orientation-sign checks, isolated ball suite,
	arena vertex checks, scalar/config parity and production build pass.
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

Keep the browser JS sim; use RocketSim as a versioned comparison reference,
not ground truth for the current proprietary game. Fix deltas iteratively.

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
Airborne SOCCAR scenarios use airborne preparation, not suspension settling.
`initial.hitbox` selects one of the six standard configurations. Airborne
fixtures can set `initial.air_time_since_jump` and `initial.has_jumped` to
exercise dodge eligibility without an ambiguous launch or landing sequence.

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
