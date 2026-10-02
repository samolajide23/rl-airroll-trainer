# Skybot Diagnostic

Enable **Bot control** in Free Play to give the equipped car to the selected bot.
The selector offers Skybot ground interception, **Kamael**, and
**Kamael / Wyrm dribbler**. Kamael runs Impossibum's original Python decision
code from RLBotPack, not a relabeled custom JavaScript controller. Wyrm selects
the original name-based dribbler personality; it does not guarantee a flick.

## Kamael Browser Runtime

Source is pinned to RLBotPack revision
`0033a98d4e060670f334f60f7f8dc5ee21ba93bb`. The original Python files are
unchanged, with SHA-256 hashes checked by the worker. Refresh the vendor assets
with `node tools/physics-compare/vendor-kamael.mjs`.

Pyodide 0.27.7 and NumPy load from jsDelivr into a module worker. First load
requires network access and may take several seconds. No local Python install
or separate bot server is required. The separate browser adapter supplies
RLBot packet interfaces and no-op rendering, game-state edits and match
communications. Numba JIT is disabled; its decorated functions run as Python.
This is not native RLBot/Numba execution parity.

Packets use the equipped car, live pad states in canonical RLBot order, and a
six-second trainer ball forecast sampled at 60 Hz. There are no opponents or
teammates. Forecasts exclude future car touches and are not RLBot predictions.
After runtime initialization, physics advances at fixed 120 Hz from elapsed
render time, holding the last controller output until the worker supplies a
replacement. Pending decisions no longer pause movement or limit it to one
tick per rendered frame. Packet timestamps match the current simulation tick.
Loading and runtime failures stop bot stepping; elapsed catch-up is bounded
by the shared clock's 0.1-second cap. Slow Python decisions can still change
closed-loop behavior even though physics timing is independent of them.

Regression tests compare one second of movement at 30, 60, and 144 render FPS
with delayed worker replies: all advance 120 ticks with identical position
and velocity. This verifies scheduling, not equality to Rocket League's
physics or native bot decision latency.

Browser checks exercised initialization, kickoff, a ball touch, airborne
control, restart, and Wyrm control output. Packet and restart tests cover pad
index alignment, finite forecasts, non-mutation, and stale worker replies.
Advanced mechanics and full original-runtime output equivalence are not
certified. Replay exports retain the controls actually issued.

Kamael source: https://github.com/RLBot/RLBotPack/tree/0033a98d4e060670f334f60f7f8dc5ee21ba93bb/RLBotPack/Kamael_family

The pinned family directory contains no separate license file. RLBotPack's
root MIT license is retained in `public/bots/kamael/LICENSE`. Kamael is credited
to Impossibum in the upstream configuration; the browser adapter is separate
from the unchanged vendor code.

## Native Rocket League Check

On 2026-10-01, the pinned Kamael ran in an offline Rocket League match against
a built-in All-Star opponent. A short capture contained 729 decisions spanning
10.208 game seconds. Kamael touched the ball at game time 9.325 and the final
captured score was 1-0 for blue. States included PreemptiveStrike, LeapOfFaith,
HolyProtector, DivineGrace, and BlessingOfSafety. Mean decision time, excluding
capture serialization, was 7.391 ms. This is a smoke test, not a mechanics or
playing-strength certification.

Replaying all 729 captured inputs through a fresh browser worker produced no
state or control mismatches: booleans matched exactly and numeric controls
agreed within 0.001. The replay used real opponent packets and real RLBot ball
predictions, not the trainer's synthetic input. This bounded result does not
establish equivalence on other scenarios or certify trainer physics.

The trainer's no-opponent packet exercises an upstream fallback which sets
the nearest enemy to the bot itself. Wyrm also deliberately disables aerial
planning. These are important differences from a normal match, not verified
explanations for every observed trainer failure.

The native wrapper leaves the upstream strategy unchanged and records packet,
field information, prediction, controls, state, and decision timing into
`tools/physics-compare/out/kamael-native/`. Use an isolated Python 3.11 environment:

```powershell
.\.venv-kamael\Scripts\python.exe -m pip install rlbot==1.67.7 numba==0.60.0 numpy==1.26.4 scipy==1.17.1 websockets==10.4
.\.venv-kamael\Scripts\python.exe tools/physics-compare/kamael_native.py --check
.\.venv-kamael\Scripts\python.exe tools/physics-compare/kamael_native.py --seconds 120
```

Add `--wyrm` to select that personality. Launch only for an offline test; this
starts a match and stops its bot processes afterward. The duration starts when
bot processes launch, so startup reduces the recorded playing time. RLBot v1's
matchcomms requires the pinned websockets version. Standard boost uses the
native `Default` amount enum and `1x` strength. Initial stationary-car attempts
failed before agent initialization and are not evidence of bad strategy.

## Controls And Skybot Overlays

Restart run resets the simulation and recording. Disabling it restores manual
control. Ball manipulation is suppressed while the bot runs; camera controls
remain available. Export replay downloads a scenario file, capped at 60 seconds.

For Skybot, green is an independent five-second ball forecast; blue is the observed path
over the same time window. Forecasts refresh every 2.5 seconds. The green marker
is the current drive target. Ball error measures the forecast at the current
tick, including unmodelled car touches. First-contact timing and position deltas
compare the first predicted reachable interception with the first actual touch.
They measure the complete planning/control/simulation result, not just physics.

This is a **Skybot-derived ground-intercept diagnostic**, not a complete or exact
Skybot port. It adapts steering thresholds, speed limits, boost estimation and
timed forward dodges from RLBotPack's SkyBot.py. The predictor adapts constants
and bounce/spin ideas from bot_functions.py, but uses incremental integration,
a low-bounce cutoff and simplified wall/ceiling reflection. It does not model
rounded corners, goal interiors, car collisions or accurate spin contacts.
Full match strategy, opponents, dribbling/flick strategy and aerial recovery
are not ported. Getting stuck is possible. No Python or RLBot runtime is needed
in the browser.

Sources:
- https://github.com/RLBot/RLBotPack/tree/master/RLBotPack/Skybot
- https://github.com/RLBot/RLBotPack/blob/master/RLBotPack/Skybot/SkyBot.py
- https://github.com/RLBot/RLBotPack/blob/master/RLBotPack/Skybot/bot_functions.py
- https://github.com/RLBot/RLBotPack/blob/master/LICENSE

## Repeatable Reference Replay

```sh
npm run bot:record
node tools/physics-compare/run_js.mjs --scenarios tools/physics-compare/out/skybot/scenarios.json --out tools/physics-compare/out/skybot/js
node tools/python-runner.mjs tools/physics-compare/generate_rocketsim.py --scenarios tools/physics-compare/out/skybot/scenarios.json --out tools/physics-compare/out/skybot/rocketsim
node tools/physics-compare/compare.mjs --rs tools/physics-compare/out/skybot/rocketsim --js tools/physics-compare/out/skybot/js --out tools/physics-compare/out/skybot/report.md
```

For a browser export, use its downloaded path as `--scenarios` in both runners.
RocketSim requires the project's Python environment and collision meshes.
The browser reference replay (`?replay=rocketsim`) is available only when
`tools/physics-compare/out/skybot/rocketsim/skybot-recording.json` exists before
starting or building Vite. Production builds do not require this generated
diagnostic file; without it, the replay URL keeps the normal menu visible.
The same recorded inputs are replayed open-loop in both engines, not recomputed
by each bot. The report compares car and ball trajectories. Divergence after a
touch can compound rapidly. Initial suspension warmup in the reference runner
can differ from browser startup. This is diagnostic evidence, not a certified
parity test or proof of equivalence to current Rocket League.

## Contact Timing Repairs

The recorded ten-second run exposed late positive-distance contacts. Coupled
car-ball contacts now accept a gap up to 1.905 uu, and ball-arena contacts use the
same range. This does not enlarge the physical radius or penetration correction.
Measured regression tests cover the first touch, contact-range boundary, and
first floor rebound.

Against the same RocketSim recording, first touch now occurs at tick 389 rather
than 390. Corrected callback timing and safe-margin box geometry/inertia move
the first car-velocity error above 0.5 uu/s to tick 812. Interleaving ball-floor
and car-ball constraint iterations moves that boundary to tick 836. All five isolated
contact cases pass unchanged budgets. Maximum ball/car position errors in the
full replay remain 61.021/324.164 uu after later grounded and goal-area
interactions. The strict replay gate still fails; these fixes do not establish
full solver parity or correct the approximate bot predictor.

Mesh-local internal-edge correction fixes isolated ball goal-seam impulses.
Rounded chassis support removes the replay tick-1092 false wall impulse from an
exact reference state. Native tracing identified two goal-wall contacts at tick
1093, including a positive-gap finite-triangle witness. Preserving the raw query
normal for the margin offset and retaining both rows reduces that tick's car
velocity error from 483.58 to 0.05832 uu/s and angular-velocity error to
0.0001412 rad/s. Wall split rotation now uses Bullet's 0.1 turn ERP; the recorded
forward/up basis matches within 0.00001 vector distance in the regression.
Inverted-floor contact history and support corrections also resolve the roof
recovery gate. All 73 movement cases and five strict contact cases pass their
unchanged budgets. This is not exact tick-by-tick parity: grounded touches and
the penetrating goal-wall witness retain small local residuals which compound
in the full replay.

## Reference-Seeded Diagnostics

```sh
node tools/physics-compare/run_js.mjs --scenarios tools/physics-compare/out/skybot/scenarios.json --out tools/physics-compare/out/skybot/seeded-js --seed-reference tools/physics-compare/out/skybot/rocketsim/skybot-recording.json
```

`--seed-every N` restores the exported car/ball transform and velocity every N
ticks (default 1). JS wheel, gameplay, contact and boost-pad histories continue;
this does not reproduce native hidden state. Hashes, controls, initial states,
rates and finite frame data are validated before replay. Output includes
`diagnostic_reference_seed_interval` and optional arena-contact rows. The normal
comparison gate rejects these outputs on either side, since reseeding cannot
certify an open-loop trajectory.

## Third-Party License

MIT License

Copyright (c) 2019 RLBot

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.