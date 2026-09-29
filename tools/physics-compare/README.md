# Physics compare harness

Offline validation of `src/shared/rl-physics.js` against **[RocketSim](https://github.com/ZealanL/RocketSim)** (Python bindings from [mtheall/RocketSim](https://github.com/mtheall/RocketSim)).

This is option 1 from the integration plan: keep the browser JS sim, use RocketSim as ground truth, and fix deltas iteratively.

## What it does

1. Runs shared air-control scenarios in RocketSim (`GameMode.THE_VOID` — no collision meshes needed).
2. Replays the same inputs through `rl-physics.js` in Node.
3. Writes a markdown report of position / velocity / ω / orientation errors, plus a constants table.

## Setup

```bash
# Python ground truth
pip install -r tools/physics-compare/requirements.txt

# JS deps (from repo root)
npm install
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

Filter scenarios:

```bash
python3 tools/physics-compare/generate_rocketsim.py --only roll_right_1s
node tools/physics-compare/run_js.mjs --only roll_right_1s
node tools/physics-compare/compare.mjs
```

## Scenario format

See `scenarios.json`. Controls use RocketSim / RLBot signs:

- `+pitch` = nose up
- `+yaw` = nose right
- `+roll` = roll right

Frame: Z-up, identity car faces +X with right = +Y.

## Scope / limits

- **Covered now:** freefall, air throttle/boost, pitch/yaw/roll, coast-after-roll.
- **Not covered yet:** ground driving, jumps/flips, walls, car-ball collisions (need `SOCCAR` + dumped collision meshes from [RLArenaCollisionDumper](https://github.com/ZealanL/RLArenaCollisionDumper)).
- Orientation drills in the app also use `AerialBody` (`aerial.js`) on a Three.js Y-up car — that path is a separate coordinate mapping and should be validated after `rl-physics.js` matches.

## Interpreting the first report

Expect constant mismatches before any fixes:

| Area | Typical cause |
|---|---|
| Air torque / damping | JS uses smish.dev fits; RocketSim uses `CAR_AIR_CONTROL_* * CAR_TORQUE_SCALE` |
| Roll / yaw ω sign | Local axis / sign convention bugs in `airControl` |
| Extra ball impulse forward | JS `0.35` vs RocketSim `0.65` (constants table) |
