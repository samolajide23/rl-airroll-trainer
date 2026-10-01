# Skybot Diagnostic

Enable **Skybot diagnostic** in Free Play to give the equipped car to the bot.
Restart run resets the simulation and recording. Disabling it restores manual
control. Ball manipulation is suppressed while the bot runs; camera controls
remain available. Export replay downloads a scenario file, capped at 60 seconds.

Green is an independent five-second ball forecast; blue is the observed path
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