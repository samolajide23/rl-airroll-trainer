# Local Free Play telemetry recorder

## Native Camera Diagnostics 0.4.0

### Automated Camera Settings And Response

Native Free Play sweeps are available through `airroll_camera_batch` and
`airroll_camera_controls`. The controls command accepts `fov`, `height`,
`distance` or `angle` for bounded ten-case ascending/descending captures in
both camera modes. Each setting case lasts 2.8 seconds. These sweeps place the
car and ball at scripted stationary positions; they are camera stimuli, not
physics parity recordings. Completion restores saved settings and actor states
when still in local Free Play. Restoration has not independently been audited.

Run `camera-batch-audit.mjs <capture>` for setting readback, or
`camera-controls-audit.mjs <capture> --fov` / `--arm` for response diagnostics.
The arm audit rejects gaps over 25 ms, requested/readback mismatches and short
cases. Passing its continuity checks does not establish rendered-motion parity.

Run `node tools/telemetry/camera-native-batch.mjs height distance angle fov`
to coordinate captures and audits automatically. It watches completed files,
retries each sweep at most three times, and saves accepted cases with source
paths in BakkesMod's `data/airroll-telemetry/camera-response-coverage.json`.
Use `node tools/telemetry/camera-native-batch.mjs --report` for a read-only
summary. Updating a sweep retains reports for other sweep kinds.
A lock prevents overlapping coordinators. Failure stops the recorder and
preserves partial evidence. An abandoned lock after a forced process kill
requires checking that no coordinator is active before removing it.
The four setting sweeps achieved complete ten-case coverage each in the first
automated batch; this is not full trainer trajectory parity.

FOV acceptance includes a median slew-rate tolerance of 0.75 degrees/second
around 25. Transition acceptance requires the measured duration and less than
0.05 degrees mean quadratic ease-out yaw error. Controls reject gaps over
25 ms. Swivel requires every sampled hold input to equal the requested input; the original
control capture fails this stimulus check because lookup is repeatedly zero
during the pulse. The unsuccessful PlayerMove probe was removed. Input is now
injected immediately before native `Camera_TA.UpdateSwivel`; accepted samples
require a consumption-boundary timestamp no older than 25 ms. No native camera
pose or current swivel is assigned by this probe.

Pitch updates use the previous desired target, interpolate at configured swivel
speed (twice that rate when the cached target is zero), and truncate the final
Unreal angle. Offline replay seeds the first observed angle once and then
accumulates without per-update resets. Capture `1791021686470594` independently
verified the full-positive response without target-query proxy calls.

Signed captures establish input/target anchors of -1/-8900, -0.5/-5353,
0/0, 0.5/3291 and 1/5500 Unreal units. The trainer uses these anchors and
piecewise-linear interpolation between them; intermediate amplitudes remain
an approximation, not a certified native input-processing equation. Standalone
target queries and passive native argument telemetry distinguish asymmetric
target ranges from upstream input processing.

Offline holdouts `1791023231915652` (car) and `1791023314793945` (ball) pass
all nine signed-pitch cases each, including continuous accumulated trajectory
parity. No Rocket League launch or native command is needed to rerun those
saved audits. This verifies sampled pitch inputs, not complete camera parity.

### Offline Full-Motion Follow-Up

No Rocket League launch or native command was used for this follow-up. Recorded
callback-time car/ball observations drive comparison without timing offsets;
ground/contact flags still come from the bracketing input stream. Nonzero swivel
samples are excluded, so these results do not certify horizontal/diagonal input.

Rear view now keeps its hidden ball tracker current, uses current horizontal car
heading in airborne rear view, and switches immediately for non-wall rear taps.
Wall recovery retains continuous rear blending. Close-ball yaw uses smooth
confidence between 10 and 100 UU rather than freezing throughout that region;
this confidence curve remains a comfort approximation, not a native equation.

| Capture suffix | Samples | Mean position error (UU) | Mean rotation error (degrees) |
| --- | --- | --- | --- |
| `1791013565733095` | 5716 | 7.49 | 1.02 |
| `1791013637402769` | 3400 | 8.11 | 1.29 |
| `1791013693249937` | 9966 | 12.30 | 2.02 |
| `1791014208655059` | 7939 | 65.19 | 12.15 |
| `1791014277373667` | 6423 | 11.15 | 1.93 |

Before these rear-view changes the controls capture had mean position/rotation
errors of 41.03 UU / 9.73 degrees; its rear-view subgroup improved from
128.66 UU / 34.03 degrees to 12.40 UU / 2.44 degrees. Raised-ball mean errors
improved from 92.29 UU / 19.70 degrees, but maximum rotation error remains
137.95 degrees. The controls maximum remains 40.27 degrees. Neither is a
full-camera parity pass. Ceiling evidence is absent from these two captures.
Intermediate analog response, stiffness and full wall/air motion remain
uncertified; passing continuity tests cannot establish native accuracy or
freedom from motion sickness.

The 2026-10-04 close-pass follow-up narrows yaw confidence to 10--20 UU and
raises the tracking rate bound from 180 to 540 degrees/second. Native close
passes exceed the former bound. The new bound is an approximation, not a
reconstructed engine constant. Overhead heading still holds within 10 UU.
Raised-ball mean position/rotation error improves to 39.70 UU / 5.55 degrees;
maximum rotation error remains 88.69 degrees. The other four captures above
are unchanged. Prompt close-ball convergence is tested at 30--240 Hz.
A 50 UU pivot-lift candidate was rejected: it improved mean position error
but worsened mean rotation error. No experimental lift remains in gameplay.

| Capture suffix | Measured evidence |
| --- | --- |
| `1791016877149443` | 46 setting cases, completed with matching readbacks |
| `1791017216051803` | 18 swivel/rear/transition cases; transition speeds 1 / 1.5 / 2 yield 0.5 / 0.25 / 0 seconds |
| `1791017727538295` | Ten settled FOV cases, no gaps over 25 ms, approximately 25 horizontal degrees/second |
| `1791017971031754` | Height settling: fitted effective rate 2.03/s, continuous ascending/descending fits below 0.022 uu RMS; one descending case has a gap |
| `1791018063911650` | Distance settling: fitted effective rate 4.14--4.15/s, below 0.049 uu RMS, ten continuous cases |
| `1791018419522264` | Corrected native mode-entry profile activation; floor angle responds immediately; one descending case has a gap |

Transition progress uses `duration = (2 - speed) / 2` and quadratic ease-out
`blend = 1 - (1 - progress)^2`. Native yaw fits in both directions have mean
error below 0.004 degrees. Use the actual observed outgoing pose: SDK transition
snapshots can contain inconsistent yaw and zero distance/FOV.

The trainer now applies these transition and FOV responses, effective
exponential height/distance settling, and immediate flat-floor car-camera
angle updates. Height/distance rates are fits at the captured native cadence,
not verified engine equations or proof of native frame-rate independence.
Mode-entry can cache an older profile even when the settings getter reports
the requested values. The runner refreshes settings during the first 100 ms
after mode entry; inspect actual pose as well as setting readback.

Close/raised-ball pivot motion, moving-target tracking, stiffness, swivel,
supersonic FOV response, shake, wall/airborne dynamics and complete motion
acceptance remain unresolved. Readback coverage is not an all-settings accuracy
claim. Earlier holdout metrics below predate these response changes.

### Floor Ball Pitch Correction

The flat-floor ball-camera target now uses the ball's physical lower edge
(RocketSim radius 91.25 uu), retaining configured angle as the minimum pitch.
Airborne and wall target rules are unchanged. This is an evidence-backed
approximation, not a verified native equation.

Direct same-callback comparisons at zero timestamp offset show:

| Capture suffix | Previous mean rotation | Corrected mean rotation | Corrected mean position |
| --- | ---: | ---: | ---: |
| `1791013565733095` | 2.946 degrees | 1.016 degrees | 7.486 uu |
| `1791013637402769` | 1.915 degrees | 1.293 degrees | 8.109 uu |
| `1791013693249937` | 2.506 degrees | 2.017 degrees | 12.298 uu |
| `1791014208655059` ball-cam group | approximately 26.3 degrees | 19.697 degrees | 92.270 uu |
| `1791014277373667` ball-cam group | 6.611 degrees | 5.256 degrees | 22.299 uu |

The earlier three captures are holdouts for this correction. Raised-ball
position tails worsen despite improved means, and near-180-degree yaw errors
remain. Native focus reconstructed as camera position plus the configured
distance along camera forward rises above configured height during close
dribbles. The trainer does not yet reproduce that pivot lift. Trial lift
distances are diagnostic candidates only and were not added to gameplay.
Controls rear-view mean rotation changes slightly from 33.969 to 34.036
degrees through inherited blend state; this correction is not a rear-view fix.

Run `node tools/telemetry/ball-camera-geometry.mjs <capture>` to inspect pivot
and pitch hypotheses, or append `--compare` for the direct-state comparison.
The probe validates the capture before analysis. Camera tests include resting
and elevated ball targets, with existing rotation bounds retained.

### Raised Ball And Controls, 2026-10-03

The next two captures passed diagnostics/contact validation without repeated
or backwards physics timestamps:

| Capture suffix | Duration | Camera samples | Recorded behavior |
| --- | ---: | ---: | --- |
| `1791014208655059` | 55.16 s | 10,520 | Raised ball, 10,467 ball-cam samples and a brief car-cam toggle |
| `1791014277373667` | 35.97 s | 8,305 | 1,696 ball-cam / 6,609 car-cam samples, 953 rear-view samples, 1,245 nonzero swivel samples |

Their maximum sample gaps were approximately 0.857 and 0.833 seconds. Both
kept FOV 108, height 80, angle -3, distance 270, stiffness 1, swivel speed 7.7,
transition speed 1.8 and shake disabled. Thirteen observed transition starts
across the two files reported blend time 0.100000024 seconds, function 2,
exponent 2 and unlocked outgoing state. This verifies those getter values at
this setting, not the complete slider-to-duration mapping or rendered curve.
Snapshot distance/FOV returned zero and must not be treated as valid final
camera settings.

The raised-ball capture disproves a direct focus-to-ball pitch rule even on
flat-floor contacts: geometric pitch-bin means near 3.36 / 14.80 / 24.40 /
35.23 / 45.03 degrees corresponded to native means near -2.98 / -2.77 / -1.93 /
-0.09 / 6.13 degrees. These moving, history-dependent bin means are not fitted
equations. Near-overhead samples can have negative native pitch; a global
clamp reversal or simple configured-angle offset is not justified.

In stationary car-cam rear-view holds, native yaw is already opposite the car
at the observed flag edge and returns on release. The trainer's half-second
rear rotation is therefore a concrete discrepancy for those states. The
ball-cam rear-view edge has different history and must be graded separately.

At this earlier baseline, the trainer switched rear view immediately for
flat-floor car cam only. The Offline Full-Motion Follow-Up above supersedes
that restriction and records the current callback-time results.
On the controls capture, the recorded-mode comparison's overall mean position
error decreased from 92.05 to 42.92 uu and rotation from 23.45 to 10.47 degrees;
rear-view means decreased from 332.09 to 128.54 uu and 87.84 to 33.97 degrees.
These are same-capture results, not an independent holdout or parity pass.
Ball-cam, wall/airborne rear behavior and the raised-ball pitch rule remain
unresolved. Camera regressions verify press/release edges at 30--240 Hz.

Use `node tools/telemetry/camera-compare.mjs <capture> recorded` to follow
native car/ball state and behind-view flags. Reports break out car, ball,
rear-view and active-transition samples. Nonzero swivel samples are excluded
and restart warmup because captures contain resulting swivel angles, not
controller stick input. The comparator retains the ball target across toggles;
it still evaluates trainer dynamics rather than replacing them with recorded
transition values. These captures expose substantial raised-ball and rear-view
errors and are not native parity passes.

### First Ball-Cam Batch, 2026-10-03

All three new captures passed diagnostics/contact validation using recorder
0.4.0 and BakkesMod 228, Octane body 23. Both native state getters reported
`CameraState_BallCam_TA` on every camera sample. Rear view remained false,
swivel remained zero, and no active transitions were recorded.

| Capture suffix | Duration | Camera samples | Observed coverage | Baseline mean position / rotation error |
| --- | ---: | ---: | --- | --- |
| `1791013565733095` | 27.98 s | 6,557 | Floor | 13.95 uu / 2.93 degrees |
| `1791013637402769` | 22.64 s | 4,471 | Floor and airborne | 9.12 uu / 1.89 degrees |
| `1791013693249937` | 50.68 s | 11,258 | Floor, wall, ceiling and airborne | 13.87 uu / 2.50 degrees |

These are zero-offset interpolated-state comparisons of the existing camera,
not parity passes. Gaps up to 0.17 / 1.48 / 0.50 seconds respectively were
excluded, and continuous segments exclude their first 0.5 seconds.

The SDK default car-camera rates consistently returned: to-ground 2, to-air 4,
ground rotation 13.3900003, wall rotation 2.02999997, normal 10.46, FOV 25,
supersonic FOV 40. Live camera fields returned swivel-fast 2500, swivel-decay 2,
clip 4. Their units and use by active ball-camera equations remain unverified.

Every same-callback car RB timestamp equalled the preceding input-state car RB
timestamp. Direct observed-body comparisons still leave mean rotation errors
2.95 / 1.92 / 2.51 degrees and mean position errors 15.24 / 10.73 / 14.45 uu.
Consequently, direct body getters are not established as the camera's rendered
target pose, and timestamp equality does not establish render interpolation.

On flat-floor samples in the first two captures, native pitch was consistently
-2.999267578125 degrees with configured angle -3. The geometric direction from
car-plus-height to ball averaged approximately -0.086 / -0.083 degrees. This
disconfirms the current near-horizontal floor view for those recorded states,
but does not identify the complete ball-camera pitch rule. A raised-ball case
is needed to distinguish angle offsets, floor-specific clamps and focus rules.
Keep separate car-cam and transition/swivel captures as additional evidence;
this batch did not exercise those behaviors. Original captures remain under
the BakkesMod data directory and must not be overwritten.

The recorder now emits `camera_diagnostics_version: 1` with its existing
NDJSON v1 header. Older captures remain supported. Each drawable camera sample
adds the native state name, blender state type, rear-view flag, live swivel/clip
rates, active transition parameters and outgoing snapshot, and car/ball rigid
states observed in the same callback. Missing wrappers are explicitly `null`;
inactive transition snapshots are not read. `camera_callback_interval` is a
measured steady-clock interval, not an assumed render delta or engine tick.

`car_camera_default_rates` comes from the SDK's default car-camera instance:
ground/air, ground/wall rotation, normal and FOV interpolation rates. These are
default-object values, not proof that every active camera state uses them.
No camera setters or update function proxies are called. Same-callback body
observations do not establish the engine's camera/physics update order.

After installing the DLL, restart Rocket League/BakkesMod or unload and reload
the plugin before capturing. In local Free Play, use F6 to start/stop separate
short recordings for floor turns/reversing, jump/landing, wall ascent/takeoff,
ball-cam crossings, rear-view toggles and swivel release. Retain the original
captures and note the scenario, camera settings and FPS cap. Start with fixed
settings and one FPS cap; repeat at another cap only after checking the first
batch. Output is under BakkesMod's `data/airroll-telemetry` directory.

Validate each file with `node tools/telemetry/validate.mjs <capture.ndjson>`.
Compilation and schema tests alone do not verify native getter availability or
sampling order at runtime. Confirm the header reports recorder `0.4.0`, that
state/transition fields respond to toggles, and that observed body timestamps
advance before using these values to replace camera equations. Camera fidelity
is not certified by this instrumentation upgrade.

## Independent Bounce Evidence Status

Checked 2026-10-02: Samuel Mish's
[ball bounce article](https://www.smish.dev/rocket_league/ball_simulation_1/)
mentions `episode_000218.csv` and a dataset, but its current HTML contains no
dataset download link. The former GitHub Pages article redirects to
`https://www.smish.dev/notes/RocketLeague/ball_simulation_1/`, which returns 404.
Part 2 still links to
[`ball_bounce_data.zip`](https://www.smish.dev/rocket_league/ball_simulation_2/ball_bounce_data.zip),
but that download also returns 404. Archive searches returned no copy of that
ZIP. No source CSV was obtained. The documented local native-capture cache was
also absent, and the user confirmed Rocket League is not installed on this PC.
Plots, approximate model output and published endpoint values are not
substitutes for the missing measured trajectory and initial state.

To add an independent bounce diagnostic, supply the original dataset or a native
capture with timestamps/ticks, position, linear velocity and angular velocity,
plus coordinate/unit conventions, sampling phase/rate, map, game version and
mutator/contact context where available. Preserve the original bytes and hash;
initialize once from the first observed state and compare subsequent samples
without reseeding or fitting timing from predicted motion. Unknown metadata must
remain explicit limitations, not assumed standard conditions or parity passes.

The separate ceiling regression is available now:

```text
node --test tools/physics-compare/movement-bot.test.mjs
```

`RocketSim ceiling recording preserves impact timing and full ball vectors`
checks the initial state, ticks 9/10/11 around the rebound, and tick 90, with
position/velocity limits of 0.0002 uu / 0.0005 uu/s and zero spin on every tick.
The first downward velocity must occur on tick 10. It uses the unmodified
RocketSim 2.2.1 recording
`tools/physics-compare/out/edge-audit-20261002-v1/rocketsim/ball_ball_ceiling.json`,
SHA256 `82ac1fa3951eaa6501d4967ab38877ce97071b34efa0a134af69a1ef14190962`.
The initial position is [0, 0, 1850] uu, velocity [0, 0, 1500] uu/s, spin zero,
and simulation rate 120 Hz. Checkpoints are embedded so the unit test does not
depend on locally ignored recording files. This verifies the current 2048 uu
RocketSim ceiling response, not whether native RL uses 2044 or 2048 uu.
No production physics, dimensions, references or parity budgets were changed.

## Public Physics Research Captures

Downloaded five raw datasets from
[RLUtilities analysis](https://github.com/samuelpmish/RLUtilities/tree/b9d1cdbd3965a24c6ecdc6d662ac7d6af2407ed7/extras/analysis)
at immutable commit `b9d1cdbd3965a24c6ecdc6d662ac7d6af2407ed7`.
The original bytes are preserved locally in
`tools/physics-compare/out/public-physics-captures/`, outside the served assets.
Local dataset names replace the slash in the paths below with a hyphen.
These are research data, not ordinary match replay downloads and not a
recovered copy of `ball_bounce_data.zip`.

| Path under `extras/analysis/` | Records | Observed contents | Timing limitations |
| --- | ---: | --- | --- |
| `collision/ground_hits.json` | 7,436 | Ball/car rigid states and eight controls | 2,998 repeated frame IDs; nine increments of 2 and one of 4 |
| `collision/dodges.json` | 5,658 | Ball/car rigid states and eight controls | 2,271 repeated frame IDs; nine increments of 2 |
| `jumping/jump.json` | 1,000 | Ball/car rigid states and eight controls | 30 repeated frame IDs; 110 increments of 2 and one of 3 |
| `aerial/aerial.ndjson` | 344 | Car state, controls, flags and timers; no ball | Monotonic time; initial 0.233276 s gap, 35 increments near 0.016663 s |
| `aerial_turn/aerial_turn.ndjson` | 815 | Car state, controls, flags and timers; no ball | Monotonic time; 751 increments of 0.0087890625 s, 62 of 0.017578125 s |

All 15,253 records parsed and contained no nonfinite numeric values. All 14,094
JSON records have finite three-component position, velocity and angular
velocity, four-component quaternion for both bodies, integer `frame`, five
finite analog controls and three boolean controls. This is a schema check,
not a check that every value is physically correct or independent native truth.
The JSON body fields omit boost amount, wheel contacts, jump history, hitbox,
mutators, map and game version. First recorded states are available; requested
spawn states and reset boundaries are not established.

Repeated frame IDs must not be silently deduplicated: six dodge pairs and three
ground-hit pairs contain different rigid states; 34 dodge pairs and 432
ground-hit pairs contain different controls. Jump duplicates have identical
states and controls. All 815 aerial-turn records contain a `dodge_dir` component
with magnitude above 1e6, including approximately 2.62e30 in the first record.
That field cannot be assumed to be a meaningful initialized direction.
The aerial-turn time spacing must not be relabeled as exact 120 Hz or fitted
to simulation output without establishing the clock's semantics.

### Provenance And Permitted Use

The pinned collision notebook imports `dodges.json` with
`ImportPhysicsTickJSONEpisode`, compares observations with separately calculated
collision predictions, and filters candidate contacts using adjacent frame IDs.
The repository's `tests/record_inputs.unsupported` reads RLBot game state and
logs game time, wall time, car state and controls before sending those controls.
However, that recorder's schema differs from these files and does not record a
ball. It does not establish the exact collection pipeline for each dataset.
The JSON importer in `extras/analysis/RLBot.m` also describes a different
time-based episode layout. Both files and the collision notebook are preserved
locally at the same commit for further investigation, without executing them.

Treat the collision/jump JSON as promising historical observation datasets,
not certified current-game captures. Native-versus-simulated provenance of the
selected NDJSON files remains unresolved. Unit/axis mapping, quaternion order,
input application phase, frame-clock meaning, resets and contact context must
be established before comparison. Ground hits and dodges concern car-ball
contacts; they are not an isolated ball-arena bounce benchmark. No production
physics was changed and no new parity pass is claimed from these downloads.

Original dataset SHA256 values:

- `collision-ground_hits.json`: `f1b85765ed15e5e5d4fae398f47b25cfac1029d7064b69659900fb079aa7a52a`
- `collision-dodges.json`: `93596f0419028cbcfa34ebd4463d08b9437935c9ae3cb08dedd59763f4bc0098`
- `jumping-jump.json`: `bcb533478be4e2e5a6ecc5f4d7090e673d109d34552b4eab2b5df18a6ee46f59`
- `aerial-aerial.ndjson`: `190ce6738a08574d04bac823f69f8bfc7fd4147ac03f49d1d3dfc08a0bad9779`
- `aerial_turn-aerial_turn.ndjson`: `ea81bfba61948272b780a5739d291042edb5c1b724b9df23ef516303585dd8b5`

Other checked leads did not publish usable capture data:
[Aurmeilius/rocketball-physics](https://github.com/Aurmeilius/rocketball-physics)
contains a replay-processing/training script, not the resulting NPZ dataset;
[gbvanrenswoude/rocket-league-ball-bounce](https://github.com/gbvanrenswoude/rocket-league-ball-bounce)
contains an analytical bounce function, not measured trajectories.
The missing Smish ZIP remains unresolved. The next useful step is resolving
the collision JSON recorder/frame semantics, then extracting uncontaminated
observed contact intervals without inventing inputs or hidden state.

### Historical Importer And Contact Audit

Follow-up recovered the matching
[frame importer](https://github.com/samuelpmish/RLUtilities/blob/273d2c98bbc4cec34f5e6315e07a46fe9d0e152c/analysis/RLBot.m)
at commit `273d2c98bbc4cec34f5e6315e07a46fe9d0e152c` (2019-03-17).
This supersedes the missing-importer limitation above, but not the missing
recorder limitation. A copy is preserved locally as `RLBot-273d2c98.m`.
It reads fields by name, calls `DeleteDuplicatesBy` on frame ID (keeping the
first observation), and converts XYZW quaternion to scalar-first by negating
all four components. A global quaternion sign change preserves rotation.
That establishes the author's intended quaternion interpretation, not the
exact native recorder's synchronization or unit conversion.

The collision notebook assumes 1/120 s for its model. The same historical
[game-state bridge](https://github.com/samuelpmish/RLUtilities/blob/273d2c98bbc4cec34f5e6315e07a46fe9d0e152c/rlutilities/cpp/src/simulation/game.cc)
reads `frame` from `phystick.ball.state.frame`, but body vectors from the
separate `gametick` packet. This is a concrete synchronization risk, not proof
that this bridge generated the downloaded files. Neither source establishes
the exact recorder or input application phase. A model timestep is not an
independently verified capture clock. The datasets contain no wall/game time
with which to independently resolve that relationship.

`research-capture.mjs` now validates every JSON record's exact field sets,
finite vector components, quaternion norm, nonnegative integer frame, analog
control ranges and boolean controls. Malformed records and frame reversals
fail the audit. Identical observations are grouped with all source indices
retained; any conflicting state or control excludes the entire frame group.
Windows cannot cross excluded groups, gaps or position steps above 100 raw
units. The latter is a heuristic discontinuity screen, not a reset detector.

Candidate contact windows require five contiguous retained frames, a ball
velocity change of at least 100 raw units and ball/car center separation no
greater than 250 raw units on either side of the event. Selection uses no
simulator residual. These are triage thresholds, not parity tolerances.
Reports preserve the raw source hash and indices, never reseed a simulation,
and explicitly set `comparisonEligible: false`. Existing reports and input
files cannot be overwritten by the CLI.

| Dataset | Unique frames | Conflicting groups excluded | Retained segments | Candidate windows |
| --- | ---: | ---: | ---: | ---: |
| Ground hits | 4,438 | 431 | 320 | 11 |
| Dodges | 3,387 | 40 | 59 | 11 |
| Jump | 970 | 0 | 112 | 0 |

Reports are locally preserved as `*-audit-v1.json` beside the original files.
The 22 windows are not 22 certified impacts; overlapping events, floor contact
and unknown history remain. Ground-hit samples include ball/floor contact and
grounded cars. Dodge candidates are airborne, but flip timers and internal
torque state are missing. A cold car state would not reproduce that history.
No independent requested spawn, car body, hitbox or mutator configuration is
recorded. These gaps block a defensible coupled comparison against both our
solver and RocketSim. No physics constants, references or tolerances changed.

Reproduce with a new output filename (the command refuses existing reports):

```text
node tools/telemetry/research-capture.mjs tools/physics-compare/out/public-physics-captures/collision-dodges.json tools/physics-compare/out/public-physics-captures/collision-dodges-audit-v2.json
node --test tools/telemetry/research-capture.test.mjs
```

To unlock engine comparison, obtain the actual capture-producing recorder or
equivalent synchronized native evidence defining frame duration, body sampling
and input phase, plus hitbox/mutators and sufficient jump/contact history.
Do not choose those values by minimizing error against this dataset.

## Online Match Replay Diagnostic

### Additional Public Recordings

Downloaded and CRC-checked two real-game fixtures from
[boxcars](https://github.com/nickbabcock/boxcars/tree/c1d7cb75399520667e5e6b058c8e27fcc0fa5b63/assets/replays/good)
at commit `c1d7cb75399520667e5e6b058c8e27fcc0fa5b63`, using rrrocket 0.11.6.
These are public replay fixtures, not the missing Samuel Mish bounce dataset.
Original files, decoded JSON and reports are stored locally outside `public`
under `tools/physics-compare/out/smish-bounce/boxcars-*`.

| Fixture | Recorded date / map | Awake ball samples | Eligible 3-interval windows |
| --- | --- | ---: | ---: |
| `002c.replay` | 2017-08-09 / Underwater_P | 7,351 | 0 |
| `00bb.replay` | 2020-10-29 / TrainStation_Dawn_P | 6,625 | 47 |

Original SHA256 values:

- `002c.replay`: `49b90d48044840f15bad8ef66da773eaa3ba26f919b87f9ba94cf3b7c6a309e9`
- `00bb.replay`: `999cc381fa29dad9c002e0a0f0e6c494a1019f441a1dff6f497f2baa7fc646b9`

The 2020 recording's maximum continuous-flight errors were 93.729334 uu position
and 25.860523 uu/s velocity using replay timestamps. Displacement-inferred ticks
gave 0.058662 uu and 0.164361 uu/s; 94 of 141 accepted intervals disagreed with
nominal timing. These smaller residuals are diagnostic, not an independent pass:
timing is inferred from motion and the existing model-based exclusion biases
accepted windows. No filters or physics constants were changed.

The 2017 recording had zero samples satisfying the existing safety selection;
its diagnostic exited 1 for no eligible windows. This is unavailable evidence,
not zero error or a physics failure. Its older network encoding has not been
validated for this analyzer. Both timing audits lacked a per-body physics clock;
they found 175 and 10 frame gaps over 50 ms respectively. Neither recording
certifies spin, bounce response, ceiling height, car controls or current-game parity.

Reproduce the 2020 diagnostic and field audit after decoding:

```text
node tools/telemetry/match-replay.mjs tools/physics-compare/out/smish-bounce/boxcars-00bb.json tools/physics-compare/out/smish-bounce/boxcars-00bb-flight.json 3
node tools/telemetry/match-replay.mjs tools/physics-compare/out/smish-bounce/boxcars-00bb.json tools/physics-compare/out/smish-bounce/boxcars-00bb-audit.json --audit
```

### Diagnostic Procedure

Decode a `.replay` with rrrocket 0.11.6 using `--network-parse --crc-check`.
Keep decoded JSON outside `public`: it contains player identifiers.
Run `node tools/telemetry/match-replay.mjs decoded.json report.json 3` for
three-interval flight windows; omit `3` for the default 15-interval horizon.
The tool tracks ball actor lifetimes, uses only fresh rigid-body updates and
excludes nearby/stale car states, arena proximity, timing gaps and motion jumps.
It integrates continuously within each window, without reference resets.

Measured on 2026-10-02: source replay SHA256
`1ad038e034006bc8b23eb3a7d87d74a5b0e6ad16b84ad7b8bb90d95d474124db`.
This is a March 2023 online Soccar replay at 30 FPS, not fresh current-game
telemetry. Its 8,835 awake ball updates yielded no accepted 15-interval windows:
768 candidates failed contact-risk checks and 43 failed timing checks.
The explicitly shorter three-interval diagnostic accepted 78 windows.
Maximum replay-timestamp errors were 68.068002 uu position and 20.976533 uu/s
velocity. Displacement-inferred physics ticks reduced these to 0.030579 uu
and 0.158520 uu/s; 157 of 234 accepted intervals disagreed with nominal timing.

These are diagnostic residuals, not a parity gate. Inferred timing depends on
observed displacement, and model-based motion exclusion biases the accepted
windows. Contact exclusion is heuristic. No bounce, angular-state, car or
full-match certification follows. Do not tune physics to nominal replay timing
or treat inferred ticks as independently recorded engine timestamps.

Run `node tools/telemetry/match-replay.mjs decoded.json evidence.json --audit`
to inventory timing fields and extract raw car control/component events.
Events are associated with car lifetimes rather than player identities;
component links cannot survive deletion and reuse of a car actor ID.
The report includes a SHA256 of the decoded input. Raw analog/activity bytes
remain unconverted because encoding and application phase are unverified.

The same source yielded 15,292 linked events across 91 car lifetimes, with
four unresolved events. There were 3,493 throttle, 8,221 steering and 616
handbrake updates; 705 boost-amount updates; and 916 boost, 517 jump, 454
dodge and 61 double-jump activity updates. These are network update counts,
not press counts or separate players. Respawns/recreation produce new lifetimes.
There are 36 frame intervals over 50 ms, with a maximum gap of 6.979599 s.
Only the match-state countdown has observed time-property updates.
`ReplicatedActivityTime` is declared in the object table but never updated;
there is no independently recorded per-rigid-state physics clock in this file.

No complete aerial pitch/yaw/roll controls were observed. Camera angles,
dodge torque and double-jump impulse must not substitute for those controls.
Faithful car/contact replay is therefore blocked by missing input and timing
evidence. Raw event analysis and the explicitly limited ball-flight diagnostic
remain supported; do not invent inputs or certify native parity from them.

## Contact Replay

### Complete Reset Replay Windows

`node tools/telemetry/flip-reset-replay.mjs` extracts two user-confirmed Zen
flip-reset sequences from the local `001e6892-e801-4815-952e-732ff39531a3.replay`.
The output defaults to `tools/physics-compare/out/replay-resets/zen-reset-windows.json`,
outside `public`. It preserves original car/ball rigid states, available inputs,
jump/dodge activity, absolute timestamps, source-relative elapsed timestamps,
and the replay SHA256. It does not seed or run a physics simulation.

| Window | Raw Replay Range | Closest Underside Approach | Separated Dodge | Samples |
| --- | --- | --- | --- | --- |
| `zen-reset-247` | 242-250 s | 247.457443 s | 247.976135 s | 956 |
| `zen-reset-319` | 317-324 s | 319.586884 s | 321.134430 s | 837 |

Both windows have wheel-side alignment above 0.95 and car-ball separation below
110 uu at the selected approach frame. At the dodge, separation exceeds 300 uu;
the car stays above 300 uu between approach and dodge, with no intervening
recorded jump activation. The last jump activation precedes the dodge by
4.525 s and 3.162 s respectively. These are recorded observations, not inferred
four-wheel contact or restored internal flip flags. Network component activity
is not an exact controller button history.

No explicit dodge-refresh events are decoded from this replay. Available inputs
are throttle, steer and dodge torque, not aerial pitch/yaw/roll. Frame intervals
in these windows are below 9 ms, but do not establish exact engine tick timing.
The extracted samples can support visual review, recorded geometry and maneuver
event ordering. A continuous RocketSim recreation must label recovered controls
as reconstructed, use only an initial state seed, and independently demonstrate
four-wheel acquisition, airborne separation and a direct dodge without a jump
from ball contact. Exact control-driven replay parity remains unsupported.

Run the VS Code tasks `Extract replay flip reset windows` and
`Verify confirmed replay resets` to reproduce extraction and its regression gate.

The `Reconstruct continuous replay reset` task runs an experimental single-seed
WASM feedback controller from each extracted approach, with 0.35, 0.2, 0.1 and
0.05 second lead-ins. It starts with exhausted flip availability and rejects
floor landings as acquisitions. A candidate must acquire all-wheel contact near
an airborne ball, separate without wheel contact, then directly dodge. The
script exits nonzero if none succeeds. The initial failed trials used encoded
replay angular velocities without their 0.01 conversion to radians per second
and left a spent flip's timer at zero, unintentionally enabling pitch lock.
After correcting these and pitch feedback's sign, the second reset's 0.1-second
approach succeeds: four-wheel acquisition on tick 11, airborne separation on
tick 20, and a direct dodge on tick 21. Exactly one jump is issued, after
separation. The same input trace without a ball remains airborne and cannot
reset or dodge. Neither car nor ball state is reseeded after initialization.
The successful seed, reconstructed inputs and events are saved outside public
in `tools/physics-compare/out/replay-resets/reconstructed-resets.json`.
Run `Verify continuous reconstructed reset` for the runtime regression.
The other seven approach trials still fail. This verifies one short continuous
WASM maneuver, not the entire original approach or recorded dodge timing.
Initial hidden jump/contact state is assumed; missing controls and contact
history are not recovered. Native parity and exact replay parity remain
unverified for this reconstructed sequence.

Replay recorder 0.3.0 Octane captures with continuous coupled car-ball physics:

```text
node tools/telemetry/replay.mjs capture.ndjson contact-report.json --contact --pre-roll 30
node tools/telemetry/replay.mjs capture.ndjson short-report.json --contact --pre-roll 1
```

Pre-roll must be an integer from 1 to 30. Compare the continuous 30-tick
approach with the one-tick recorded-state diagnostic to distinguish approach
drift from collision response. Reports include first simulated contact,
pre-impact errors, car orientation and angular velocity, ball angular velocity,
wheel/ground contact mismatches and the first state divergence. The first-state
thresholds are diagnostic: 1 uu/s car velocity, 0.01 rad/s angular velocity,
0.001 rad orientation or any wheel/ground mismatch, not parity gates.
Two preceding recorded transforms and inputs seed cached wheel commands and
steering geometry before restoring the starting rigid state, avoiding
artificial first-tick idle braking. This does not restore hidden contact
impulses or complete powerslide history. Candidate impulses
are not confirmed touches; warmed suspension is not recorded internal state.
Boosted windows, discontinuities and already-active jump histories are excluded.
Shorter histories may admit additional candidates and do not prove continuous
parity. Neither report certifies exact native physics. The original straight
replay positional command remains unchanged.

## Comprehensive Native Batch

The VS Code task **Native comprehensive parity batch** runs a single Octane
(body ID 23) in an unlimited-length, state-setting-enabled solo Soccar match.
It records two passes of 64 cases: boost taps/holds/exhaustion and mixed
throttle; jump hold lengths, re-press and delayed double jumps; directional
flips and cancellation delays/strengths; independent and combined aerial
inputs; ground throttle/braking/steering/powerslide; wall/ceiling impacts and
inverted landing; ball bounces/spin and car-ball approaches/flick setup.

Each case lasts 360 physics ticks, with scripted controls starting at tick 60
where applicable. A complete two-pass sequence requires 384 game seconds;
the task allows 450 wall-clock seconds for startup. No opponent is spawned.
The batch changes match length only, not gravity or physics speed.

```text
python tools/physics-compare/coconut_trial.py --check-batch
python tools/physics-compare/coconut_trial.py --native --batch-probe --seconds 450
python tools/physics-compare/coconut_trial.py --audit-batch path/to/capture.ndjson
```

Use the configured Coconut native Python environment. Captures remain in the
local AIRLAB Coconut cache, not the repository. The header includes resolved
match configuration and full case definitions. Every packet records case/pass
index, relative tick, reset marker, observed inputs and commands sent after
that packet. Native packets also contain actual hitbox/offset, dodge elapsed
time/direction and latest touch metadata; retain those for later comparisons.

Scripted probes bypass RLBot's normal latest-packet coalescing and process every
received packet. Coconut policy matches keep the SDK's usual loop. Packet writes
are buffered, with flushes at headers, resets and batch completion, and the file
is closed on normal agent retirement. This removes known client-side packet loss;
it does not guarantee that Rocket League or RLBotServer delivered every frame.

The adjacent `.coverage.json` report requires a completion marker and two full,
gap-free Active-phase segments per case, standard gravity/speed and the sole
recorded player. It reports observed jumps/dodges, boost and height ranges,
speed, hitbox and touch metadata changes, excluding the pre-reset packet from
outcomes. Rejections include exact frame/time gaps. Missing frames, incorrect
case/tick labels, absent reset markers or incomplete passes fail rather than
silently reducing the required coverage. The self-check tests packet dispatch,
complete synthetic segments, and rejection of gaps, missing footer/reset markers,
non-Active phases and nonstandard gravity/speed.

If a completed canonical batch lacks clean segments, retry only its missing
cases, then combine the original and retry captures:

```text
python tools/physics-compare/coconut_trial.py --check-batch --retry-batch original.coverage.json
python tools/physics-compare/coconut_trial.py --native --retry-batch original.coverage.json --seconds 195
python tools/physics-compare/coconut_trial.py --merge-batches original.ndjson retry.ndjson
```

Prefer short retries, with at most six cases per capture:

```text
python tools/physics-compare/coconut_trial.py --check-batch --retry-batch original.coverage.json --case-limit 6
python tools/physics-compare/coconut_trial.py --native --retry-batch original.coverage.json --case-limit 6 --seconds 180
```

Use `--case-offset 6`, then 12, etc. to select subsequent groups from the same
report. Bounds apply after missing-case filtering; using an updated combined
report instead selects only the remaining cases. Never run native captures
concurrently. Six cases require 36 game seconds for both passes. Allow extra
wall time: observed game progression can be slower than real time, and a
195-second allowance did not finish the 156-game-second retry in this session.
Short batches reduce wasted retries, not server packet-loss risk; retain the
strict gap checks. Retry case definitions stay canonical.
The combined report retains source paths and SHA256 hashes, rejects
duplicate paths/content or changed definitions, reruns strict per-segment audits and
requires two accepted segments for every original case. It does not join across
packet gaps or turn rejected segments into accepted ones.

Sample coverage is not event certification. Confirm that intended impacts,
touches and successful carries actually occurred from packet trajectories and
touch metadata before using a case to tune physics. Settling can change the
requested initial state, so replay starts must use observed packets, not the
reset request. The native mechanics replayer supports its original isolated
cases and strictly complete jump-hold or unboosted aerial batch segments:

```text
node tools/telemetry/native-air-replay.mjs path/to/batch.ndjson jump-report.json --summary
node tools/telemetry/native-air-replay.mjs path/to/batch.ndjson air-report.json --air-batch --summary
```

Jump replay warms rather than observes suspension. Aerial replay retains state
for up to 180 steps, excludes jump/dodge/boost transitions and stops before
nearby arena, ball or car contact. Both packet input timings are reported.
Complete-segment guards reject gaps, incorrect case/tick labels and extra resets;
this does not replace the canonical source-hash coverage audit. Simulator-generated
fixtures test replay consistency, not independent native parity.

Historical results before removal of per-tick displacement rounding on
2026-10-02: three cached captures yielded 23 accepted aerial trajectories across all nine
cases, with at least two per case. Following-packet inputs fit rotation better:
peak angular velocity error is 0.003280 rad/s and orientation error is
0.002553 rad. Peak position and velocity errors are 1.230549 uu and
1.246657 uu/s over 180 steps. These are measured residuals, not exact parity.
These position maxima have not been rerun against the current implementation;
the original native capture cache is required. Other batch families remain
excluded; do not label the full batch certified.

Remaining measurements include per-wheel suspension/contact normals and hidden
jump timers, other car hitboxes, car-car collisions and camera behavior. RLBot
packets do not expose suspension internals. The separate BakkesMod recorder
below exposes wheel-contact counts but is limited to local Free Play; it is not
automatically synchronized with this solo Soccar batch. Neither recording
format certifies exact parity.

## Recorder Panel

Version 0.3.0 adds read-only per-wheel contact flags, change timestamps,
contact locations/normals, suspension distance and configured geometry/damping.
It also records ground normal, time on/off ground, sticky-force settings and
jump-component active state, activity timestamps and force settings. These
accessors compile and link against the installed SDK, but their runtime units,
stale no-contact values and callback phase still require a real capture.
No gameplay setters or contact-delay constants were added.

For the takeoff investigation, reload the plugin in local Free Play, start a
capture, let the stationary Octane settle, then perform three short jump taps
and three full jump holds. Allow each landing to settle; do not boost, steer,
double jump or reset during the capture. Stop and save after about 20 seconds.
Validate the resulting file with the command below before comparing takeoff
gains to wheel release and jump activity. `contact_samples` counts samples with
all four wheels and a jump component; `unavailable_contact_samples` reports
missing wrappers. Neither count certifies tick alignment or physics parity.

Version 0.2.0 adds **F2 > Plugins > Airroll Recorder** with Start Recording,
Stop & Save, elapsed time, input/camera counts, capture size and Copy File Path.
The updated DLL has been compiled and installed; panel rendering still needs an
in-game smoke test. Reload the plugin in the F6 console before opening the panel:

```text
plugin unload airroll_recorder
plugin load airroll_recorder
```

Stop any active capture before reloading. Closing the panel does not stop capture.
Start/stop actions dispatch to the game thread; UI status reads use a locked
snapshot and do not read game wrappers directly from the settings-render thread.
Console start/stop commands remain available.

Status: compiled successfully with MSVC x64 against the locally installed SDK
and copied to the local BakkesMod plugins folder on 2026-09-30. Required plugin
exports and x64 architecture were checked. Not tested in Rocket League yet.
Do not treat this as a verified 120 Hz recorder until the first capture is checked.

## Build

Install Visual Studio Build Tools with **Desktop development with C++**, including
the MSVC x64 compiler and Windows SDK. Open **x64 Native Tools Command Prompt**:

```powershell
powershell -ExecutionPolicy Bypass -File tools\telemetry\build.ps1
```

The script builds `tools/telemetry/build/airroll_recorder.dll`; it does not install
or load it. Build for x64, not Win32. Use an SDK matching your BakkesMod version.

After compilation and review, place the DLL in
`%APPDATA%\bakkesmod\bakkesmod\plugins`. In BakkesMod's F6 console:

```text
plugin load airroll_recorder
airroll_record_start
airroll_record_stop
plugin unload airroll_recorder
```

Start only in local Free Play. Record 10-15 seconds for each isolated test and
stop before opening menus or resetting the car. Start OBS/NVIDIA video separately.
The recorder stops outside Free Play, after 60 wall-clock seconds, or around
32 MiB of buffered records. It pauses sampling while the game is paused.

Output: BakkesMod's data folder, subfolder `airroll-telemetry`, as NDJSON.
No account names/IDs, chat, audio, network uploads, or gameplay setters are used.
The initial release buffers records in memory and writes at stop to avoid
per-sample disk writes. Serialization overhead still needs in-game measurement.

## Camera Reference Captures

Use the installed Airroll Recorder in local Rocket League Free Play. These
captures measure the real camera; RocketSim does not supply a camera controller.
Keep the trainer camera's comfort adjustments separate from any eventual
reference-matching configuration. Capturing data does not establish parity.

First capture: choose car cam before recording, turn camera shake off, keep
camera settings unchanged, and leave the right stick and rear-view button alone.
On a flat part of the field, record about 15 seconds: rest for 2 seconds, drive
straight, make a gentle turn, stop, then rest for 2 seconds. Do not reset or open
menus while recording. In the F6 console:

```text
plugin load airroll_recorder
airroll_record_start
```

Close the console before driving. Afterwards reopen it and run:

```text
airroll_record_stop
```

Alternatively use F2 > Plugins > Airroll Recorder > Start Recording / Stop & Save.
Copy File Path gives the saved NDJSON location. Console/menu opening can create
gaps; the audit reports these instead of treating them as continuous motion.

```text
node tools/telemetry/camera-capture.mjs "path/to/capture.ndjson" car
```

Then make separate 10-20 second clips for each case, first in fixed car cam and
then in fixed ball cam (use `ball` instead of `car` in the audit command):

- Flat driving, braking and left/right turns.
- Floor-to-side-wall ascent, wall driving and return to the floor.
- Both left and right rounded corner transitions, at slow and faster speeds.
- Jump, aerial rotation and landing; include a side flip and a backward flip.
- Ball close passes across the car, behind it and overhead.
- Driving near goal posts, inside the goal and near the ceiling if reachable.

Do not toggle camera mode inside these baseline clips. The mode argument is your
declaration, not a state detected by the recorder. Name each clip's case and mode
when supplying its path. Record simultaneous video if practical, including the
camera settings before starting; video helps establish obstruction and wall
coverage that contact normals cannot prove. Keep captures under the recorder's
60-second limit and stop before resetting. Do not play through nausea to capture
data; recordings can wait until you feel well.

The audit validates the file, reports sampling gaps, observed contact surfaces,
swivel activity and setting changes, and brackets camera samples using elapsed
timestamps from the independent state stream. It rejects state brackets longer
than 25 ms or with nonadvancing physics time. This cutoff is a capture-quality
filter, not an allowed camera error. Bracketing does not resolve the drawable
camera callback's offset from physics; comparison must measure that offset, not
pair stream entries by index. Ball-cam toggles, rear-view and swivel-input tests
need separately labelled captures because authoritative input/state labels are
not recorded. No camera position/rotation error gate is defined yet.

Compare the current trainer camera against interpolated recorded car/ball states:

```text
node tools/telemetry/camera-compare.mjs "path/to/capture.ndjson" car
```

Use `ball` for a fixed ball-cam capture. This uses recorded camera settings,
reports position (UU), full rotation (degrees), horizontal FOV and contact-surface
metrics, and sweeps state timestamp offsets from -50 to +50 ms in 5 ms steps.
Each continuous segment excludes its first 0.5 seconds. Gaps and car teleports
reset tracking. The best position offset is a diagnostic, not proof of engine
phase: camera-model error can bias it. Gameplay render interpolation, visual car
offsets and native obstruction geometry are not reproduced. Current comfort
tracking remains enabled. The command does not modify gameplay or saved settings
and does not certify parity.

### Measured Camera Refinements (2026-10-02)

Fixed-mode mixed-driving recordings `capture-1790976699671699.ndjson` (ball)
and `capture-1790976736781346.ndjson` (car) use FOV 108, height 80, angle -3,
distance 270 and stiffness 1. At zero timestamp offset, the grounded pitched
surface arm plus slower wall tracking reduces overall car-camera mean position
error from 109.61 to 47.53 UU and rotation error from 22.26 to 12.29 degrees.
Wall mean position error falls from 225.41 to 76.94 UU. Floor error is 23.94 UU.
The wall tracking rate is a bounded empirical approximation, not recovered
engine logic; other settings and unrecorded paths remain unverified.

Both recordings support horizontal FOV defined at a 16:9 reference aspect,
with a linear 5-degree expansion at 2300 UU/s (clamped above that speed).
Comparing actual viewport horizontal FOV gives mean errors of 0.00179 degrees
(ball) and 0.00151 degrees (car), down from about 2.7 degrees. Maximum errors
remain 0.91 and 0.67 degrees respectively, so this is not an exact frame-phase
match. Other base FOV values and viewports have synthetic coverage only.
Allowing downward ball tracking while airborne reduces that segment's mean
position error from 250.87 to 65.96 UU and rotation error from 46.96 to 18.89
degrees. Overall ball-camera errors fall from 61.91 to 48.99 UU and from 12.76
to 10.88 degrees. Angular speed caps and near-overhead heading hold remain;
airborne-to-ground recovery has synthetic rotation-bound tests at 30/60/120 FPS.
Obstruction behavior and remaining geometry errors still require refinement.
These figures use the same recordings that informed the changes, not held-out data.

The subsequent operator-declared car-camera clips, in recording order, are
`capture-1790978869726968.ndjson` (floor/wall),
`capture-1790978903382949.ndjson` (corner/goal route), and
`capture-1790978967180182.ndjson` (ordinary jumps). They retain the same settings
and have no recorded swivel or settings changes. Before further tuning, mean
position/rotation errors are respectively 34.63 UU/9.91 degrees,
53.22 UU/11.56 degrees, and 5.76 UU/1.34 degrees.

Releasing the wall-relative arm toward the horizontal view at the existing
bounded wall response rate, instead of discarding it immediately on takeoff,
reduces corner-route errors to 50.03 UU/11.10 degrees; airborne samples improve
from 151.14 UU/29.46 degrees to 134.86 UU/27.09 degrees. The ordinary jump clip
is unchanged. The original mixed car-camera clip slightly regresses from
47.53 UU/12.29 degrees to 47.82 UU/12.30 degrees. This is an empirical transition
approximation, not native recovery logic, and the corner clip now informs tuning
rather than serving as independent validation.

A subsequent surface-view pitch bound of +/-65 degrees, including wall release,
reduces the floor/wall clip to 31.71 UU/9.10 degrees and the corner/goal clip to
49.49 UU/10.94 degrees. The original mixed car clip improves to
47.50 UU/12.06 degrees. Ordinary jumps and the mixed ball-camera comparison are
unchanged. This bound is supported by these recordings but is not established
for all camera settings. Large residual native yaw lag and airborne pitch
retention remain, including a near-180-degree wall orientation error in the
original capture. No camera obstruction parity is claimed.

The subsequent camera-state overhaul replaces normalized forward-vector lag
with independent yaw/pitch state, reduces yaw confidence near vertical, retains
wall-flight pitch, and recovers wall-flight yaw toward momentum. Floor jumps
continue holding takeoff heading. Car/ball transitions now derive their endpoint
from the actual surface view; the mode adapter preserves the ball target while
blending back to car cam. Rear view rotates continuously, and invalidation clears
all orientation and obstruction state.

At the recorded settings, the final surface response is 10/s, wall-flight yaw
recovery is 4/s and pitch recovery is 1/s. A bounded parameter comparison used
the floor/wall and corner/goal clips; the original mixed car clip was checked for
regression, not used as independent certification. Mean position/rotation errors
are 29.18 UU/7.62 degrees (floor/wall), 41.26 UU/8.75 degrees (corner/goal),
5.76 UU/1.34 degrees (ordinary jumps), and 46.56 UU/11.61 degrees (mixed car).
Mixed ball-camera errors remain 48.99 UU/10.88 degrees. Large outliers, including
near-180-degree mixed-wall orientation errors, remain unresolved.

Mesh-based arm shortening with smooth extension is available only through the
explicit `arenaCollision` camera option. Enabling it in all arena gameplay
worsened the native comparisons, especially ball cam, so it is disabled by
default. Native camera obstruction rules are not equivalent to keeping the lens
inside the physics arena. Tests cover this optional safety behavior but do not
establish native obstruction parity. The camera suite also covers moving-wall
render-rate consistency, interrupted view switches, rear view and resets.

## Fields And Timing

- Input/state records: throttle, steering, pitch/yaw/roll, separate dodge axes,
  both boost flags, jump, handbrake; car and ball RB state; physics time, grounded,
  jumped/double-jumped/flip availability, supersonic, wheel contact counts, raw boost.
- Camera records: location, Unreal rotator, FOV, current swivel, viewport, profile
  camera settings and camera shake. Recorded from the drawable callback.
- Header: schema/recorder/BakkesMod version, body ID and coordinate/phase metadata.
- Footer: sample counts and stop reason. Empty/incomplete captures must fail validation.

Positions are Unreal units, Z-up. Quaternions are `[W,X,Y,Z]`. Rotators are raw
Unreal units (65536 units per revolution); retain raw values before conversion.
Raw boost scale, RB-state timestamps and callback ordering require measurement.

The official MechanicalPlugin example uses `Car_TA.SetVehicleInput` with a
`ControllerInput` parameter. This recorder observes the **post-input** hook and
reads the local car without altering params. This is **not a post-physics tick**.
Calls may repeat a physics timestamp; camera samples use their own sequence and
steady-clock elapsed time. Do not align streams by array index or assume 120 Hz.
Capture does not yet include raw device inputs, all hidden jump timers,
mutators, ball-command labels, or authoritative camera input/state names.
Version 0.3.0 includes wheel normals and jump-component activity observations,
not a guaranteed post-physics suspension history.

The first capture must establish which records precede/follow physics integration,
then a dedicated post-physics hook can be validated against it. Hook existence
and runtime behavior cannot be proved by SDK headers alone.

## Validate

```text
node tools/telemetry/validate.mjs "path/to/capture.ndjson"
```

Validation checks structure, finite values, sequence/timing, footer counts and
reports observed sampling intervals. It does not certify game parity. A trainer
replay importer is deliberately deferred until real capture timing is established.

## First Capture Alignment

## Bounded Movement Replay

```text
node tools/telemetry/replay.mjs "path/to/capture.ndjson" report.json octane
```

The tool selects a grounded resting start clear of the ball, warms suspension,
then retains simulation state while replaying up to six seconds. Both earlier
and later input alignments are measured. Sampling gaps, steering, jumps,
handbrake, ball proximity and non-ground movement terminate the section.
This is deliberately not a full-mechanics importer; hidden timers, mutators,
hitbox identification and camera-input phase remain unresolved.

The second real capture selected elapsed 10.4719-16.4724 seconds (720 ticks).
This section contains reverse throttle/coasting, no boost presses. Earlier-input
position error: mean 1.0723 uu, max 3.1921 uu, final 1.2226 uu. Later-input:
mean 2.4092 uu, max/final 8.7318 uu. Earlier-input max velocity error is
6.4874 uu/s versus 2.9988 uu/s for later input, so the metrics do not establish
one uniformly superior alignment. Orientation errors remain below 0.005 degrees
and neither replay has grounded-state mismatches.

The first velocity error above 1 uu/s occurs during reverse-throttle ramp-up at
elapsed 12.6070 seconds. Reconstruction assumes Octane hitbox for recorded body
ID 23, unlimited boost and warmed rather than recorded suspension history.
No physics parameters were changed from this diagnostic. Camera comparison is
not yet implemented: recorded camera state lacks explicit ball-cam and swivel
input metadata, and phase alignment needs separate verification.

Capture `capture-1790800870507432.ndjson` passed validation: 6,298 input/state
samples and 12,475 camera samples over 54.2587 wall-clock seconds. Physics
timestamps advance approximately 1/120 second. A 1.44-second wall-clock gap
advances physics only one tick; do not replay that gap as continuous simulation.

```text
node tools/telemetry/alignment.mjs "path/to/capture.ndjson" octane
```

The one-step reconstructed grounded comparison was inconclusive (301 transitions;
approximately 11.75 versus 11.81 uu/s mean velocity error for earlier/later input).
Suspension/contact history is absent, so those errors are not physics certification.
An independent boost-edge check found 11 of 12 eligible press edges increased
speed gain in the following step. This supports pairing input sample `i` with
the observed state transition `i` to `i+1`, provisionally for boost input.
Slope, rotation and contact changes can confound this evidence. No definitive
phase claim is made for jump, dodge, steering or asynchronous camera callbacks.

Before full mechanics replay, record a controlled 10-15-second ground test:
idle briefly, drive straight, tap boost several times, release throttle, and stop.
Avoid jumps, turns, ball contact, resets and menus. The initial capture identifies
body ID 23; confirm its hitbox before using the optional preset argument.
Full replay also needs jump/flip timers, suspension/contact history, mutators and
camera-input/state metadata, or scenarios beginning at a known resting state.

Sources: [SDK](https://github.com/bakkesmodorg/BakkesModSDK),
[MechanicalPlugin](https://github.com/bakkesmodorg/BakkesMod2-Plugins/blob/master/MechanicalPlugin/mechanicalplugin.cpp).