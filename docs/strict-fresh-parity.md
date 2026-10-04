# Fresh Strict RocketSim Baseline

## Rejected Speed-Cap Probe

A RocketSim-only probe capped the preserved Bullet-unit velocity using float32
normalization rather than normalizing published game-unit velocity in double
precision. With the unchanged strict defaults, it recovered all 12 failing
boost cases and produced 306/346 trajectory passes, but lost the previously
passing `sweep_merc_contact_speed_2300_offset_neg60` case. The probe was removed;
the retained implementation remains at the 295/346 baseline below.

Candidate recordings remain separate in `out/expanded-audit-v1/js-speed-cap`.
They are rejected experimental output, not recordings of the retained code.
All 24 boost trajectories had exact position and velocity agreement. Merc
pre-contact velocity also matched exactly through tick 6, but tiny differences
started at the tick-7 ball collision; orientation first exceeded strict limits
at tick 85. Contact precision needs investigation before retaining this cap
correction. No tolerance, immutable reference or native-profile change was kept.
All 22 neighboring regression tests pass after restoring the original cap.

Two follow-up contact probes were also rejected at unchanged strict limits:

| Probe | Trajectory passes | Gained passes | Lost passes |
|---|---:|---:|---:|
| Float32 publication after each deferred impulse | 286/346 | 1 | 10 |
| Float32 Bullet-unit extents for airborne inertia | 291/346 | 0 | 4 |

Separate candidates are retained in `out/expanded-audit-v1/js-contact-rounding`
and `out/expanded-audit-v1/js-contact-extents`. Both production changes were
removed and all 22 neighboring tests passed again. The existing ball-only
float32 solver uses fixed row coefficients and separately accumulated velocity
deltas; rounding published bodies inside the current car-ball solver does not
replicate that calculation. The next discriminating check is a native Merc
tick-7 contact-row trace, including effective mass, RHS and accumulated impulses.
The local `out/native/RocketSim` directory was empty during this investigation,
so rebuilding the existing tracer requires restoring its matching pinned sources.

## Expanded Parameter Audit (2026-10-02)

An opt-in suite now preserves the original 100 scenario definitions and adds
246 deterministic parameter cases. Fresh independent RocketSim and JS recordings
in `tools/physics-compare/out/expanded-audit-v1` yield **295/346 trajectory passes**
across **58,636 paired frames**. The baseline subset remains **91/100**; added
cases pass **204/246**. Strict defaults are unchanged and scenario exceptions
are not applied. No gameplay physics was changed for this expansion.

| Added coverage | Parameters | Strict passes |
|---|---|---:|
| Ground steering | Six hitboxes; speeds -1200, 0, 900, 1409, 2300 UU/s; steer -1, 0, 1 | 89/90 |
| Rotated aerial controls | Six hitboxes; pitch/yaw/roll inputs -0.5, 0.5; initial pitch/roll 45 degrees | 33/36 |
| Air boost | Six hitboxes; initial boost 0, 1, 33, 100; initial speed 1400 UU/s | 12/24 |
| Jump hold | Six hitboxes; hold 1, 3, 12, 24 ticks; 240-tick trajectories | 24/24 |
| Airborne car-ball contact | Six hitboxes; speeds 500, 1400, 2300 UU/s; lateral offsets -60, 0, 60 UU | 29/54 |
| Ball surface impacts | Floor/wall/ceiling; speeds 500, 1500, 3000 UU/s; spin 0, 4 rad/s | 17/18 |

The 42 added failures are 25 contact, 12 boost, three aerial-control, one ground
steering and one ball-impact case. Boost failures first diverge at tick 117;
this is a diagnostic lead, not a proven root cause. Per-case first failure,
exceeded metrics, state coverage and tick errors are retained in the output.
All 22 neighboring audit/physics regression tests pass.

Run from the project root with a Python environment containing RocketSim 2.2.1
and installed collision meshes (`PYTHON` can select the executable):

```sh
node tools/physics-compare/movement-bot.mjs --audit --expanded
```

The default expanded output is separate from the original recordings. Use
`--out <new-directory>` after changing scenario definitions; existing references
must not be overwritten. `--prepare` only writes the manifest; `--report` grades
existing paired recordings. The command exits nonzero while full-state coverage
fails, even when trajectory comparisons finish successfully.

**Full-state passes remain 0/346**, including unavailable audited fields and
other state/setup mismatches. These bounded sweeps are not an exhaustive Cartesian
product, long-run certification or native Rocket League validation. Multi-car
collisions/demos, special modes, mutator combinations, input-device processing
and broader simultaneous/contact histories remain outside this suite. Ground
trajectories can reach arena surfaces; they are not guaranteed contact-free.

## Ceiling Restitution Precision Correction

The complete ceiling trajectory now passes at unchanged strict limits.
RocketSim restitution was reconstructing Bullet-unit velocity from the
published game-unit velocity. That float32 round trip loses information.
The retained correction uses `external.base`, the preserved native velocity
before external forces, for the RocketSim contact row's restitution calculation.
The calibrated native profile keeps its existing calculation.

First-impact native row tracing isolated the error: contact geometry, effective
mass, angular response and friction RHS matched, but the normal RHS was
368.788330078125 in JS versus 368.7883605957031 in native Bullet. Using the
preserved velocity makes all 120 subsequent JS position, velocity and angular
velocity frames bit-identical to this native diagnostic. The diagnostic itself
still differs slightly from the immutable recording; it is not replacement
truth or evidence of bit-identical Rocket League physics.

| Ceiling metric | Before | After | Unchanged strict limit |
|---|---:|---:|---:|
| First failing tick | 71 | None | No failing ticks |
| Maximum position error (UU) | 0.000244249 | 0.000061065 | 0.0002 |
| Mean position error (UU) | 0.000083101 | 0.000029501 | - |
| Maximum velocity error (UU/s) | 0.000092295 | 0.000076491 | 0.0005 |
| Maximum angular velocity error (rad/s) | 0.000002458 | 0.000001937 | 0.00001 |
| Maximum forward-axis error (degrees) | 0.000006723 | 0.000013282 | 0.00005 |
| Maximum right-axis error (degrees) | 0.000015789 | 0.000004598 | 0.00005 |
| Maximum up-axis error (degrees) | 0.000015510 | 0.000013309 | 0.00005 |

The immutable audit now has **91/100 trajectory passes**, up from 90, with
no lost passes across 16,810 paired frames. Results are separate in
`out/ceiling-precision-followup/native-restitution`. The other 98 trajectories
have identical metrics; jump-into-wall's velocity maximum improves from
0.016000474 to 0.015999507 UU/s and its mean also improves slightly, but it
still fails. Ceiling forward-axis maximum and mean, up-axis mean, and mean
angular velocity error increase while remaining within every applicable limit.

The ceiling-only `roof_trace.cpp` diagnostic logs raw contact data and wraps
the existing solver callbacks for the first impact's 20 normal/friction rows.
From `tools/physics-compare`, run the compiled diagnostic with
`out/native/ceiling_row_trace.exe collision_meshes ceiling`.
Additional JSON records have `stage: "ceilingRow"`; filter by `tick` for
trajectory frames. Saved evidence is in
`out/ceiling-precision-followup/{native-trace,native-rows,js-rows}.json`.
The saved JS rows show the pre-fix discrepancy. Adding tracing leaves every
previous native ceiling trajectory frame and the ground-flip output unchanged.
Row-speed, denominator-grouping and upper-bound-equality probes did not fix
the ceiling and were removed. Bullet vector dot products use `(x+y)+z`, while
its solver SIMD dot uses `x+(y+z)`; that difference is intentional here.

The existing coupled regression adds immutable ticks 71 and 119. It passes
with the fix; a process-only old-restitution negative control fails position
at tick 71. All 266 repository tests, native diagnostic compilation, production
build, editor diagnostics and scoped whitespace checks pass. The build still
reports Browserslist age, Tailwind content and bundle-size warnings. All 103
original input hashes are unchanged, and all 101 copied audit inputs are
byte-identical to the originals. No recordings or tolerances were changed.

Nine trajectory failures remain. Full-state passes remain **0/100** because
required fields are unavailable. This is a strict ceiling trajectory pass,
not complete RocketSim parity or native Rocket League certification. Sections
below are historical snapshots, including the now-resolved ceiling failure.

## Ceiling Split-Integration Correction

The first ceiling-impact position mismatch is corrected, but the complete
ceiling trajectory still fails. Bullet's `btSolverBody::writebackVelocityAndTransform`
applies split-push translation before ordinary velocity integration. Combining
both velocities before float32 integration, as the JS car path did, loses a
rounding step. Separating these operations restores the ceiling impact height
at tick 37 and reduces the subsequent orientation error.

The retained change enables split-first position integration only for
RocketSim upper-plane contacts identified by their native plane normals.
Other surfaces and the calibrated native profile keep their existing path.
This boundary reflects the portion verified here, not a claim that Bullet
uses a different integration order on other surfaces. Extending the change to
all contacts regressed the forward flip; excluding simultaneous car-ball
contacts did not recover it. Both broad variants were rejected. An SSE
angular-normalization experiment additionally regressed the diagonal flip
and was removed. A plane-distance arithmetic probe did not fix the ceiling.

| Ceiling metric | Before | After | Unchanged strict limit |
|---|---:|---:|---:|
| First failing tick | 37 | 71 | No failing ticks |
| Maximum position error (UU) | 0.000371263 | 0.000244249 | 0.0002 |
| Mean position error (UU) | 0.000153912 | 0.000083101 | - |
| Maximum velocity error (UU/s) | 0.000086343 | 0.000092295 | 0.0005 |
| Maximum angular velocity error (rad/s) | 0.000001836 | 0.000002458 | 0.00001 |
| Maximum forward-axis error (degrees) | 0.000042569 | 0.000006723 | 0.00005 |
| Maximum right-axis error (degrees) | 0.000113388 | 0.000015789 | 0.00005 |
| Maximum up-axis error (degrees) | 0.000107195 | 0.000015510 | 0.00005 |

The immutable audit remains **90/100 trajectory passes**, with no lost passes
and identical metrics for all other 99 trajectories across 16,810 paired
frames. Results are in `out/ceiling-followup/upper-plane`. All 103 original
input hashes are unchanged. Neither recordings nor tolerances were modified.
The remaining ceiling failure is position, not an orientation pass being
counted as a complete trajectory pass. Velocity and spin maxima increased
slightly while remaining below their unchanged limits.

The existing native tracer now accepts `ceiling`, reproducing the recording's
airborne warmup/reset, live ball and 120 neutral-input ticks. Its maximum
position/velocity/spin differences from the immutable recording are
0.000061065 UU, 0.000076491 UU/s and 0.000001937 rad/s. It is diagnostic evidence,
not bit-identical replacement truth. Its output is retained separately as
`out/ceiling-followup/upper-plane/native-trace.json`; the previous native
ground-flip trace is unchanged. Run the compiled diagnostic with
`out/native/ceiling_trace.exe collision_meshes ceiling` from this tools folder.

The existing coupled regression now includes continuous ceiling checkpoints
at ticks 37, 38, 40, 70 and 120, plus the final up axis. These selected checks
do not assert that every ceiling frame passes. A process-only old-integration
negative control fails at tick 37's position. All 265 repository tests, the
native diagnostic compile, production build and editor checks pass.

Ten trajectory failures remain; full-state passes remain **0/100** because
required fields are unavailable. The residual ceiling velocity differences
and later float32 position drift still require investigation. This correction
does not establish full RocketSim parity or native Rocket League certification.

## Jump-Launch Contact Correction

The forward flip now passes the complete strict trajectory gate. The residual
orientation error traced back to its first car-ball contact, not an identified
rotation-integrator defect. Wheel contacts are sampled before the jump update;
the sphere/box witness gate excluded the Bullet-compatible calculation while
those wheel flags remained set during launch. The RocketSim deferred-contact
path now uses that calculation when `car.jumping` is true as well as when no
wheels touch. Other wheel-supported contacts and the native profile retain
their existing paths. This is a scoped correction, not a complete port of the
coupled Bullet solver.

Enabling the witness for every grounded contact was tested and rejected: it
fixed the flip but lost both powerslide cases and `contact_ground_approach`.
The retained jump-state gate has **90/100 strict trajectory passes**, up from
89, with **zero lost passes** across all 16,810 paired frames. Four trajectories
change: forward flip, flip-window-before, jump-tap and jump-full-hold. Some
velocity/spin errors increase, but all four pass every strict trajectory limit.

| Forward flip maximum | Before | After | Unchanged limit |
|---|---:|---:|---:|
| Position (UU) | 0.000049774 | 0.000030518 | 0.0002 |
| Velocity (UU/s) | 0.000082172 | 0.000209012 | 0.0005 |
| Angular velocity (rad/s) | 0.000002661 | 0.000005182 | 0.00001 |
| Forward-axis angle (degrees) | 0.000054139 | 0.000025212 | 0.00005 |
| Up-axis angle (degrees) | 0.000054675 | 0.000025798 | 0.00005 |

Results are separate from immutable inputs in
`out/flip-orientation-followup/launch`; the rejected broad experiment is in
`out/flip-orientation-followup/witness`. The added native `ground-flip` axis
logging leaves all 120 previous native output frames unchanged. Its orientation
trace is diagnostic evidence, not replacement recording truth.

The coupled regression now checks immutable forward/right/up axes at ticks
107, 110 and 120 using the audit's atan2 angle calculation. It passes with the
fix and fails at tick 107's up axis when a process-only negative control restores
the old witness gate. All 265 repository tests, the native diagnostic compile,
and the production build pass. All 103 original input hashes and all original
79 trajectory passes are preserved; neither recordings nor limits changed.

Ten strict trajectory failures remain. Full-state passes remain **0/100**
because required fields are unavailable. This is not full physics parity or
certification against native Rocket League telemetry. The sections below
record earlier snapshots, including the now-resolved flip orientation failure.

## Flip Damping Cutoff Correction

The two large flip errors identified below shared a timer-boundary bug, not a
floor-contact manifold bug. RocketSim accumulates `flipTime` in float32. On the
twenty-fifth flip tick it remains below `FLIP_Z_DAMP_END`, so upward vertical
velocity is still damped. JS rounded the timer to ticks and stopped one tick
early. The RocketSim profile now accumulates float32 time and compares the
upward-damping endpoint directly; the calibrated native profile is unchanged.

The pinned native source and `roof_trace.cpp`'s `ground-flip` mode establish the
cause. Its 120-tick trace stays within the immutable reference's strict rigid
vector limits (maximum position 0.00001630 UU, velocity 0.00006248 UU/s,
spin 0.000001265 rad/s); it is not bit-exact replacement truth. At tick 40 there
is one fresh floor contact. Native pre-solver vertical velocity is 121.408 UU/s,
while old JS skipped damping of 186.782 UU/s. The pre-solver diagnostic leaves
all 120 native output frames unchanged. A car-only probe is insufficient here:
the audited scenario has a live ball affecting the launch.

| Scenario | Old maximum position error (UU) | Corrected maximum (UU) | Strict result |
|---|---:|---:|---|
| `movement_ground_flip_forward` | 16.736309 | 0.000049774 | Orientation failure at tick 107 |
| `movement_flip_window_before` | 0.781330 | 0.000011445 | Pass |

Corrected forward-flip velocity/spin maxima are 0.00008218 UU/s and
0.000002661 rad/s. Its tick-107 up-axis error is 0.0000504513 degrees against
the unchanged 0.00005-degree limit. This residual has not been fixed or waived.

The separate `out/flip-followup/audit` run grades all 16,810 paired frames:
**89/100 trajectory passes, zero lost passes, 0/100 full-state passes**.
Only the two flip trajectories changed; all original 79 passes and all 103
original input hashes remain intact. Official thresholds and recordings were
not modified. Regressions cover natural timer accumulation at ticks 25/26 and
unseeded coupled checkpoints at the former failure ticks and route endpoints.
The repository's 261-test suite and production build passed before the added
coupled regression, which also passed independently. Full-state coverage and
the remaining strict trajectory failures are still unresolved.

## Threshold Sensitivity Experiment

Run `node tools/physics-compare/threshold-sensitivity.mjs` to recompute all
16,810 paired frames in the saved 100-case scoped audit. This read-only diagnostic
reproduces every strict first-failure tick and the 88/100 baseline before grading
alternative limits. All 204 consumed inputs were hash-checked unchanged during
the run. It uses the audit's uniform defaults, not the scenario exceptions used
by other comparison commands. Angles use the audit's atan2-based calculation.

| Physics limit multiplier | Trajectory passes |
|---|---:|
| 1x (official) | 88/100 |
| 2x | 89/100 |
| 5x | 94/100 |
| 10x | 95/100 |
| 20x | 96/100 |
| 50x | 97/100 |
| 100x | 98/100 |
| 1000x | 98/100 |

Only car/ball position, velocity, angular velocity and orientation limits are
scaled. Boost, air-time and zero ground-state mismatch requirements stay fixed.
At 100x, the limits are 0.02 UU (0.2 mm) position, 0.05 UU/s velocity,
0.001 rad/s angular velocity and 0.005 degrees orientation. A separately stated
candidate practical profile (0.1 UU, 0.1 UU/s, 0.001 rad/s, 0.01 degrees) also
passes 98/100. Neither profile is an approved replacement gate or a measured
human-perception threshold.

The remaining failures are `movement_flip_window_before` (maximum velocity
47.3137 UU/s, spin 0.82328 rad/s, position 0.78133 UU) and
`movement_ground_flip_forward` (47.4158 UU/s, 1.09754 rad/s, 16.73631 UU).
These are substantial discrepancies, not near-threshold failures. The straight
movement bot's ball drift of 0.014978 UU requires about 74.9x the position
limit; the wall jump requires about 32x the velocity limit. Both remain useful
diagnostics even when a practical accuracy gate accepts them.

The official 0.0002 UU position limit is 2 micrometres, smaller than a float32
coordinate step of 0.00048828125 UU at +4096 UU. That makes it sensitive to
rounding-level differences but does not prove those differences unavoidable.
In particular, the independent native jump-wall control has zero position/spin
error and only 0.000001907349 UU/s velocity error, already below the official
velocity limit. The known JS contact-normal mismatch is real, not explained
away by the threshold experiment.

Conclusion: the current limits are overly restrictive as a sole practical
trainer-accuracy gate, but remain valuable for numerical regression and parity
diagnosis. Keep the strict result separate from a provisional practical grade;
prioritize the two large flip errors. Longer routes and gameplay outcome tests
are still needed before adopting a practical gate: these recorded scenarios
do not establish long-run stability or perceptual equivalence. All 100 cases
also have unavailable full-state fields; relaxing trajectory thresholds does
not repair that coverage or turn 0/100 full-state passes into certification.
No physics code, official tolerance, recording or saved audit was changed.

## Independent Jump-Wall Contact Trace

The `jump-wall` mode in `roof_trace.cpp` now reproduces the immutable scenario's
240-tick settle, one idle refresh, reset, and 180-tick control schedule. The
rebuilt Zig 0.14.1 SIMD executable matches recorded position and angular velocity
exactly over all 180 ticks; maximum velocity difference is
0.000001907349 UU/s. Reset and ticks 1-90 match all three rigid vectors exactly.
This small compiler residual is reported, not substituted into the reference.

Run `node tools/physics-compare/jump-wall-trace.mjs` after building the tracer as
`tools/physics-compare/out/native/jump_wall_trace.exe`. See the native build flags
below. Options `--exe`, `--root`, `--meshes`, and `--out` select existing inputs
and a separate diagnostic output directory. The script checks the scenario and
native pre-impact fidelity, requires a one-to-one witness pairing, and verifies
that every JS probe remains identical to the recording through tick 90. It
refuses output within the immutable input directory.

Six separate Node processes test tick-91 witness substitutions through an
in-memory module load hook. No production source is patched and no recorded
rigid state is injected into the running car. The substitutions use native
contact data, so their results are diagnostic only, never parity passes.

| Tick-91 substitution | Velocity error (UU/s) | Angular velocity error (rad/s) |
|---|---:|---:|
| None | 0.016000473904 | 0.000006781565 |
| Normal only | 0.000419239404 | 0.000000156531 |
| Point only | 0.016664507712 | 0.000007049561 |
| Depth only | 0.016000473904 | 0.000006781565 |
| Normal, point, depth | 0.000300660126 | 0.000000134176 |
| All, in native contact order | 0.000300660126 | 0.000000141931 |

The loaded native contact normal is
`[-0.6365377306938171, 0.0005081333802081645, 0.7712453603744507]`, versus JS
`[-0.6365086107705719, 0.000507610608450549, 0.7712694281160036]`.
Replacing only the normal removes about 97.4% of the velocity discrepancy.
Thus normal generation is the dominant measured cause at this impact. Point
replacement alone worsens the result. Even complete witness replacement leaves
velocity and split-position differences, so it does not prove the solver exact
or establish that float32 conversion alone will fix the normal.

The next production target is Bullet-compatible curved box-triangle normal
generation, followed by the remaining contact/split-impulse arithmetic. Do not
hardcode these measured normals. Results and executable/reference SHA-256 hashes
are saved under `out/jump-wall-followup/contact-diagnostic/` in
`witness-report.json` and `native-trace.json`. All 103 immutable input hashes were
rechecked unchanged. This investigation changes no production physics or audit
tolerances and claims no new trajectory passes; the last full gate remains
88/100 trajectories and 0/100 full-state passes.

## Jump-Wall Solver Follow-Up

The RocketSim profile now uses the existing float32 native-unit contact rows
when every chassis-arena contact is penetrating, in addition to the existing
horizontal-plane path. The calibrated native profile is unchanged. Extending
the rows to all curved contacts failed the positive-gap goal-wall angular
regression, so that broader candidate was rejected. Positive-gap curved contacts
retain their existing solver; this is a bounded correction, not a complete
Bullet contact implementation.

The immutable jump-into-wall recording matches car position, velocity, and spin
exactly through tick 90. The first rigid-state discrepancy remains tick 91.

| Full-route maximum error | Before | After |
|---|---:|---:|
| Position (UU) | 0.011111657559 | 0.004536556288 |
| Velocity (UU/s) | 0.062408525110 | 0.016000473904 |
| Angular velocity (rad/s) | 0.000274842289 | 0.000163165196 |

The final separate audit is
`tools/physics-compare/out/jump-wall-followup/scoped-audit/audit-report.json`;
`metric-changes.json` records the before/after comparison. All **88/100** existing
trajectory passes, including all original 79 passes, are preserved. Only the
jump-wall trajectory metrics change, with no increased tracked maximum or mean.
There are **0/100 full-state passes** across 16,810 paired frames. All 103 input
hashes match the saved manifest; recordings, controls, and audit tolerances were
not changed. The existing tick-91 regression now has tighter bounds that reject
the previous error. All 98 physics, movement, and calibration tests pass.

The wall case still fails its strict gate at tick 91. The curved contact witness
uses a double-precision triangle query, unlike the native-unit float32 plane
witness. This was a residual hypothesis at this stage; the subsequent independent
trace above identifies the normal as the dominant error at tick 91. Remaining
contact geometry, positive-gap solving, and unavailable audited state still
prevent full parity; RocketSim agreement would not certify native Rocket League.

## Developer Talk Transcript Check

The supplied transcript of *It IS Rocket Science! The Physics of Rocket League*
is useful architectural evidence, not a complete numerical specification of the
current game. This check used the supplied text; its networking demonstrations
and native-game behavior were not independently reproduced.

| Claim | Evidence and result |
|---|---|
| Lateral grip uses absolute sideways speed divided by sideways plus forward speed | New public `stepCar` regression passes in both profiles: forward/reverse grip 1, sideways grip 0.2, diagonal grip 0.6, and stationary grip 1. Both signs are covered. The implementation also has a 5 UU/s lateral deadband. |
| Apply tire friction at center-of-mass height | Source inspection: `applyFrictionImpulses` removes the contact offset's car-up component before applying the impulse. Suspension impulses remain separate. This was not an isolated torque measurement. |
| Direct acceleration curve rather than transmission or longitudinal tire-spin dynamics | Source inspection: `updateWheels` selects speed-dependent drive torque and sets engine/brake force directly; normal driving uses longitudinal friction 1. The new wheel test checks that coefficient, not a complete acceleration curve. |
| Surface orientation affects grip | Source inspection: the non-sticky curve scales friction by contact-normal Z when throttle is zero. Sloped-surface behavior was not separately measured in this check. |
| Fixed 120 Hz and visuals separate from physical wheel configuration | Existing render-rate trajectory and wheel calibration/suspension tests pass. This does not establish cross-platform bit-exactness or certify all art assets. |

Recovery has concrete differences from the transcript's roll-only, no-body-only
downforce, and disable-at-three-wheels description. Our `stepCar` calls
`updateAutoRoll` when throttle is nonzero and either 1-3 wheels touch or a prior
body contact exists. The helper includes pitch and roll torque and applies a
downward force even with zero wheel contacts. The local RocketSim source agrees:
`tools/physics-compare/out/native/RocketSim/src/Sim/Car/Car.cpp`, call at line 137
and helper at line 837. This is source corroboration, not native-game proof.

A new isolated test supplies a previous body-contact normal to a pitched car
away from geometry. Both profiles produce pitch correction and an additional
downward velocity of approximately `100 / 120` UU/s with throttle. Without
throttle, the supplied contact has no effect on velocity or spin. This tests the
recovery branch, not natural contact generation; the three-wheel activation
condition was inspected, not separately exercised. No recovery constants or
gates were changed based solely on the transcript.

Server authority, input buffering, whole-scene prediction/rollback, input decay,
event deduplication and matched state quantization are networking references.
These local tests do not validate packet loss, latency, reconciliation, remote
clients, cross-platform determinism, or collision-order fixes. No multiplayer
implementation or new quantization was introduced.

Validation: **98/98 tests passed** across `physics.test.mjs`,
`movement-bot.test.mjs`, and `car-calibration.test.mjs`. Two regression tests were
added; production physics, reference recordings, scenarios and tolerances were
not edited. The full 100-scenario audit was not rerun and no additional parity
passes are claimed. The recovery discrepancy needs independent native-game
measurements before it can justify a change to the RocketSim parity target.

## Sim-to-Sim Transfer Paper Check

[Pleines et al., arXiv:2205.05061v2](https://arxiv.org/html/2205.05061v2)
studies transferring PPO policies from an approximate Unity simulation to Rocket
League. Its nearly 100% goalie saves and roughly 75% striker success concern
isolated tasks, not complete matches or exact physics. Its physics comparison
uses interpolated position traces; that is not our tick-aligned full-state gate.

Table I increases the Unity dodge angular limit from 5.5 to 7.3 rad/s. We tested
that particular substitution using four existing immutable audited scenarios.
Two separate Node processes ran the unchanged runner and a process-local
`RL.MAX_ANG_VEL = Math.fround(7.3)` override. Source files, controls, scenario
inputs and reference recordings were not changed. Both generated complete
90-tick trajectories; the measurements below cover ticks 0 through 60 (the
first half-second). The override applied throughout the candidate run, not only
during dodges; this is a cap sensitivity test, not a port of Unity's full dodge
implementation. The existing `validatePair` checked metadata and controls.

| Flip | Current max spin error (rad/s) | Raised-cap max spin error (rad/s) | Raised-cap max basis-vector error |
|---|---:|---:|---:|
| Forward | 0 | 1.800001 | 0.803357 |
| Side | 0.000000954 | 1.800011 | 0.809430 |
| Diagonal | 0.000001923 | 1.800028 | 0.806645 |
| Backward | 0 | 1.800001 | 0.803357 |

All four reference peak spin magnitudes are approximately 5.5 rad/s; candidates
reach approximately 7.3. Position error is zero for both variants over this
interval, despite the candidate's incorrect orientation. All three orientation
axes were measured. This rejects adopting the raised cap for RocketSim parity.
Local outputs are in `tools/physics-compare/out/paper-2205-cap-baseline` and
`tools/physics-compare/out/paper-2205-cap-candidate`.

Other relevant distinctions:

- The paper uses 93.15 UU for its Unity ball size but 91.25 UU in bounce
	computation. Our 91.25 UU collision radius already agrees with the latter;
	our 93.15 UU resting height is a separate quantity, not the collision radius.
- The physical-plus-Psyonix impulse concept is already implemented; the prior
	Smish experiment below tested a related solver replacement independently.
- The paper's damping, sticky forces and suspension values are Unity-specific
	adjustments. They were reviewed, not substituted or validated in this check.
- Its ablation and held-out-shot methodology is useful for future bot evaluation.
	Task success must remain separate from physics parity. Its PPO training and
	native-game transfer results were not reproduced here.

The existing physics and movement suites passed **91/91 tests** during this
check. No production physics changes were made, and no additional full-suite
trajectory passes or native Rocket League certification are claimed.

## Smish Car-Ball Impulse Experiment

The [Smish collision article](https://www.smish.dev/rocket_league/ball_simulation_3/)
was tested as a possible improvement, not adopted on the strength of its equations
alone. A temporary isolated-airborne branch replaced the ten normal/friction
iterations with a coupled 3x3 effective-mass solve followed by a Coulomb clamp.
Contact detection, witnesses, penetration correction and the extra Psyonix
impulse were unchanged. Grounded and simultaneous arena contacts were excluded.
This tests the physical solver substitution, not a complete recreation of the
article's collision pipeline.

Four continuous 60-tick runs were compared with the existing immutable RocketSim
recordings. Car and ball position, velocity and spin, all three car orientation
axes, actual initial rigid vectors, declared setup, controls and tick alignment
were checked. Signed zero is numerically equivalent; timestep metadata uses the
existing validator's float32-compatible bounds. No recording was reseeded.

| Airborne contact | Current ball velocity max error (UU/s) | Article-solver candidate |
|---|---:|---:|
| Nose | 0.000130371 | 0.002378041 |
| Side offset | 0.000137329 | 60.049687833 |
| Roof | 0.000123020 | 12.109880111 |
| Spinning ball | 0.000126058 | 16.895043642 |

The existing offset first-hit regression failed. The candidate was removed and
both recorded nose/offset checks passed again. **No production physics change
is retained from this experiment.** These results are against RocketSim, not
new native Rocket League measurements. They do not establish that the article
is generally inaccurate or resolve wheel hits and pinches, which it excludes.

Useful article concepts are retained as two regression tests in
`tools/physics-compare/physics.test.mjs`, covering both `native` and `rocketsim`:

- Physical contact impulses conserve linear momentum and satisfy the Coulomb
	bound while changing both bodies' spin on an off-centre spinning hit.
- Enabling the Psyonix extra impulse leaves the physical car/ball response
	unchanged and queues only ball linear velocity, with the article's biased
	direction and the existing speed curve. It adds no car recoil or ball spin.

All **91 physics and movement tests pass**. All **103 immutable input hashes**
remain unchanged. Stored baseline/candidate outputs are under
`tools/physics-compare/out/smish-impulse-before` and `smish-impulse-candidate`.
To compare those local artifacts again, run:

```sh
node tools/physics-compare/compare-smish-experiment.mjs
```

This diagnostic reports car/ball vector and orientation errors plus reference
hashes; it does not generate recordings or certify full-state parity. Its saved
candidate artifacts are required because the rejected solver is not shipped.

## Inertia, Steering And Full Roof Correction

This result supersedes the historical wheel-normal section below. The verified
inertia correction is now retained together with its dependent arithmetic fixes.
The full 360-tick goal-roof trajectory passes the unchanged strict tolerances.
The immutable audit improves **79 -> 88/100 trajectory passes**, preserving every
original pass across **16,810 paired frames**. All **103** input SHA256 hashes
match the saved manifest in `out/inertia-followup/input-hashes.json`.
References, scenarios and tolerances were not regenerated or relaxed.

Retained RocketSim-profile corrections:

- Round source hitbox dimensions to float32 before native-unit inertia and
	plane-support calculations.
- Reproduce Bullet static-plane wheel-ray triangles, use original Bullet-unit
	mesh vertices, and preserve native steering-quaternion and curve operation order.
- Use row-vector multiplication for external torque and the rigid-body impulse
	denominator, while retaining column-vector constraint angular components.
- Match native SSE angular-speed normalization.
- Refresh plane witnesses through body-local coordinates with the native normal.
- Write back contact deltas before external-force impulses; queued bump impulses
	remain in the pre-force base velocity.
- Reset grounded replay positions through the native transform, including resets
	to an unchanged displayed position. Audit rotation uses the actual physics basis,
	not a basis reconstructed from the rendering quaternion.

Calibrated native-profile arithmetic is preserved. Diagnostic native traces are
not replacement recordings: roof position, velocity and spin match the immutable
reference through tick 248, but compiled native spin first differs at tick 249.

| Full roof vector error | Before | Retained |
|---|---:|---:|
| Position maximum (UU) | 0.00109183673 | 0 |
| Velocity maximum (UU/s) | 0.00253222362 | 0.000086742433 |
| Spin maximum (rad/s) | 0.0000361359642 | 0.000002150935 |

Analog steering, fast steering and yaw-90 combined aerial control match every
recorded car position, velocity and spin vector exactly. Regression digests are
derived from the immutable recordings, not candidate output. Roof regression
coverage locks every rigid vector through tick 248 and checks original native
checkpoints through landing and tick 360, with explicit spawn, ball, preparation,
controls and ground-state assertions. The full audit checks all 361 roof frames,
including ball vectors and all three orientation axes, without reseeding.

The nine new passes are roof recovery, combined pitch/roll, partial aerial input,
side flip, diagonal flip, powerslide release, powerslide bot, goal-roof bot, and
grounded car-ball approach.

This is not a uniform reduction in every error. All increased maxima and means
across **31 cases** are saved in
`out/edge-audit-20261002-v1/inertia-followup-metric-changes.json`, relative to
`audit-report-before-plane-inertia.json`. Neither baseline is overwritten.
Notable retained tradeoffs include:

| Case / metric | Before | Retained | Trajectory |
|---|---:|---:|---|
| Right steer car velocity maximum | 0.0000852998 | 0.0004300330 | Pass |
| Left steer car position maximum | 0.0000611542 | 0.0001831055 | Pass |
| Left steer car velocity maximum | 0.0001934755 | 0.0004404359 | Pass |
| Ground rest ball position maximum | 0.0000467233 | 0.0001681243 | Pass |
| Coast/brake ball position maximum | 0.0005117837 | 0.0005330428 | Still fails |
| Jump into wall car position maximum | 0.0103762072 | 0.0111116576 | Still fails |
| Jump into wall car velocity maximum | 0.0617909498 | 0.0624085251 | Still fails |
| Straight bot ball velocity maximum | 0.0005762260 | 0.0010845872 | Still fails |
| Straight bot ball spin maximum | 0.0000051611 | 0.0000214898 | Still fails |

Verification: **89 focused tests**, **251 repository tests**, production build,
and touched-code editor diagnostics pass. Existing Browserslist, Tailwind and
bundle-size warnings remain. The full-state audit still fails **0/100** because
unavailable state is not treated as verified. Twelve trajectories still fail.
This completes the inertia/steering/full-roof target, not complete RocketSim
parity or native Rocket League certification.

## Goal-Roof Wheel-Normal Follow-Up

Retained: RocketSim wheel-contact normals are accumulated and normalized with
float32 scalar arithmetic, matching `btVehicleRL::getUpwardsDirFromWheelContacts`.
The calibrated native profile retains its previous arithmetic. Temporary impulse
and inertia tracing hooks have been removed. Raw native wheel pushback/friction
fields and 17-digit diagnostic output remain; the rebuilt 36-tick native tracer
matches immutable reference position, velocity and spin exactly.

The original tick-32 failure is fixed within the existing budgets, but the full
roof trajectory still fails at **tick 123**. All **79/100** prior trajectory passes
are preserved with identical pass membership over **16,810 paired frames**.
All **103** scenario/reference input hashes are unchanged. Full-state passes
remain **0/100**, because unavailable state is a failure.

| Roof error | Before | Retained |
|---|---:|---:|
| Position maximum (UU) | 0.00157805063 | 0.00109183673 |
| Position mean (UU) | 0.000608264116 | 0.000322114634 |
| Velocity maximum (UU/s) | 0.00475378328 | 0.00253222362 |
| Velocity mean (UU/s) | 0.000728626761 | 0.000586562860 |
| Spin maximum (rad/s) | 0.0000855078904 | 0.0000361359642 |
| Spin mean (rad/s) | 0.00000577509998 | 0.00000280310491 |

This is not a uniform improvement. Every increased maximum/mean is listed below;
all affected cases were already failing. The complete metric comparison is
`tools/physics-compare/out/edge-audit-20261002-v1/wheel-normal-metric-changes.json`.

| Case / metric | Before | Retained |
|---|---:|---:|
| Wall drive velocity mean | 0.000837092313 | 0.000837113258 |
| Wall drive velocity maximum | 0.00956157960 | 0.00956725485 |
| Wall drive spin mean | 0.0000147481799 | 0.0000147486339 |
| Jump into wall velocity maximum | 0.0617847167 | 0.0617909498 |
| Jump into wall spin mean | 0.0000410112969 | 0.0000433590349 |
| Jump into wall spin maximum | 0.000317079571 | 0.000349889263 |
| Jump into wall forward maximum (degrees) | 0.00129160970 | 0.00130097624 |
| Jump into wall right mean (degrees) | 0.0000303886115 | 0.0000316507704 |
| Jump into wall right maximum (degrees) | 0.000146237245 | 0.000160086543 |
| Jump into wall up mean (degrees) | 0.000209571129 | 0.000211467213 |
| Jump into wall up maximum (degrees) | 0.00129203910 | 0.00130100873 |
| Straight bot position maximum | 0.00169935328 | 0.00169977149 |
| Straight bot velocity mean | 0.00110565970 | 0.00114997382 |
| Straight bot spin mean | 0.0000159845041 | 0.0000161730062 |
| Straight bot forward mean (degrees) | 0.0000464626290 | 0.0000467816934 |
| Straight bot forward maximum (degrees) | 0.000466316753 | 0.000485485755 |
| Straight bot right maximum (degrees) | 0.000340399885 | 0.000348726561 |
| Roof forward mean (degrees) | 0.0000599720201 | 0.0000630511073 |
| Roof right mean (degrees) | 0.0000289997338 | 0.0000611388716 |
| Roof right maximum (degrees) | 0.000100940456 | 0.000209667061 |

The continuous regression checks original spawn, ball initialization, preparation,
controls, frame count, boost, ground state and native car vector checkpoints at
ticks 0, 1, 32, 64, 96 and 122. It does not certify later frames or missing state.
Reference SHA256:
`589cf5847c3e82419a4179744be820e273a6d30e37f3795326b55db6908f142f`.
Verification: **87 focused tests**, **246 repository tests**, production build,
native tracer rebuild/fidelity and touched-code editor diagnostics pass.
Existing build warnings remain.

Separately verified dimension float32 rounding made the first 36 roof ticks
nearly exact, but lost existing steering/ceiling-roll passes (79 -> 77), so that
shared inertia change was removed. An angular-cap probe lost an aerial pass;
a row-vector impulse-denominator probe worsened slalom. Both were removed.
These remain unresolved arithmetic dependencies, not retained corrections.
The baseline is `audit-report-before-wheel-inertia.json`; do not overwrite it.
No recordings, tolerances, constants or scenario inputs were tuned. This is
partial RocketSim agreement, not full parity or native Rocket League certification.

## Airborne Nose Contact Follow-Up

The earliest remaining trajectory failure, nose impact at tick 13, now passes.
The analytic sphere-box closest point erased the small lateral normal and witness
offset present in Bullet's float32 GJK result. `bulletContact.js` now computes
that witness using native units, retained body transforms, and the safe box
margin; the coupled solver uses the actual sphere witness as its torque arm.
The measured native normal is
`[-1,-7.029967274974069e-9,5.6448815399789964e-8]`.

This correction applies only to deferred RocketSim contacts without wheel
support. Applying it to supported contacts lost the right-steering pass, so
those contacts retain their existing path. Degenerate or tetrahedral simplex
cases fall back to the analytic witness; this is not a complete GJK/EPA port.
The calibrated native profile is unchanged. The native nose trace is diagnostic
evidence, not a bit-exact replacement for the immutable Python recording.

The unchanged 100-case audit improves **78 -> 79 trajectory passes**, with no
lost passes across **16,810 paired frames**. All 103 scenario/reference input
hashes are unchanged. Full-state passes remain **0/100**: missing state fails.
The nose reference SHA256 is
`7913e3af0d785ed33b0e018a166efb0cc91a3fe01556da13100ad97d13745744`.

| Nose vector norm maximum | Before | After |
|---|---:|---:|
| Car position (UU) | 0.000166723128 | 0.0000610351564 |
| Car velocity (UU/s) | 0.000414628709 | 0.000122308499 |
| Car spin (rad/s) | 0.0000195803458 | 0.00000192859921 |
| Ball position (UU) | 0.000945056381 | 0.0000610351597 |
| Ball velocity (UU/s) | 0.00238049614 | 0.000130371163 |
| Ball spin (rad/s) | 0.0000649733704 | 0.00000119209382 |

All nose maxima and means improve or remain unchanged. Comparing every other
case's maxima and means reveals these increases; no other case increases:

| Case and metric | Before | After |
|---|---:|---:|
| Side-offset ball position maximum (UU) | 0.0000152587891 | 0.000126058286 |
| Side-offset ball position mean (UU) | 0.00000575331391 | 0.0000770707518 |
| Spinning-ball car velocity maximum (UU/s) | 0.00000475335463 | 0.00000565128555 |
| Spinning-ball car spin maximum (rad/s) | 0.00000119880282 | 0.00000120454682 |
| Spinning-ball forward angle mean (degrees) | 0.00000616201510 | 0.00000618740440 |
| Spinning-ball ball velocity maximum (UU/s) | 0.000122679739 | 0.000126058286 |
| Spinning-ball ball velocity mean (UU/s) | 0.0000777928402 | 0.0000805537998 |

The nose regression starts at the original spawn and runs all 60 ticks without
reseeding, checking car and ball position, velocity and spin at ticks 0, 12, 13
and 60, plus first-contact tick 13. Steering coverage now checks car vectors too.
Verification: **86/86** focused physics/movement tests, **244/244** repository
tests, production build and touched-code editor diagnostics pass. Existing build
warnings remain. No budgets, constants, controls or recordings were adjusted.

At that stage, the next failure was goal-roof angular velocity at tick 32. A native wheel
trace passes its reference-fidelity guard; wheel 0 suspension length differs on
that tick after smaller earlier state errors. A scalar-dot pushback probe did
not improve the failure and was removed. Its root cause is not yet established.
This is improved RocketSim agreement, not full parity or native Rocket League
certification. Earlier sections below describe prior retained corrections.

## Coupled Independent Ball-World Follow-Up

Coupled RocketSim ticks now reuse the standalone native-unit world-contact
solver when the actual car-ball contact detector returns no contact. This also
preserves native split-position-before-velocity integration order. Simultaneous
car-ball/world impulse ordering and the calibrated native profile are unchanged.

The immutable 100-case audit improves from **73 to 78 trajectory passes**, with
no lost passes across **16,810 paired frames**. Steering left/right, powerslide,
reverse, and reverse-steer now pass. Scenario and reference hashes are unchanged;
no budgets, spawns, recordings, or physics constants were adjusted. The full-state
gate remains **0/100**, so the overall audit still fails.

The steering floor rebound at tick 174 previously introduced excessive horizontal
friction and spin despite the car being over 1,000 UU away. Its full-trajectory
ball position/velocity/spin error maxima now measure `0.00003478458260339076` UU,
`0.00005516800293225837` UU/s, and `2.384185791015625e-7` rad/s.
The immutable steering reference SHA256 is
`b3e3bd440b59a0dbca134f50c089b5c3f75b9ee346dccecce3cfceb863a4f604`.
Regression coverage runs continuously from the original spawn through 240 ticks,
checking every ball-vector component at ticks 0, 173, 174 and 240 without reseeding.
Additional tests require exact coupled/standalone ball vectors on every tick of
independent wall, goal and floor trajectories.

Comparing numeric error maxima and means also exposes small tradeoffs:

| Case and metric | Before | After |
|---|---:|---:|
| Powerslide-release ball velocity maximum (UU/s) | 0.0001220703125 | 0.000152587890625 |
| Powerslide-release ball velocity mean (UU/s) | 0.00005347973091780644 | 0.000059669597024823074 |
| Straight-route ball position maximum (UU) | 0.014910376054191309 | 0.014928065106229925 |
| Straight-route ball position mean (UU) | 0.00383933738525874 | 0.004831103418130764 |

Neither case loses a trajectory pass: both already failed other fields, and these
maxima remain within their respective limits. Straight-route maximum ball velocity
error improves from `0.005938985964096481` to `0.0005762259815798352` UU/s but still
fails. The shared tick-474 position failures occur in free flight with velocity
error already present beforehand; the earlier car-ball impact remains unresolved.

Verification: **17/17** movement-bot tests, **241/241** repository tests, production
build, touched-code editor diagnostics, and whitespace checks pass. Existing build
warnings remain for Browserslist data, Tailwind content configuration and bundle
size. This is improved RocketSim agreement, not complete parity or native Rocket
League certification. The sections below record earlier stages of the work.

## Shared Ball-World Contact Follow-Up

The standalone RocketSim ball path now reproduces the native averaged contact
constraint, four-point per-mesh reduction and query order, float32 triangle
witnesses, and iterative split-penetration correction before velocity integration.
The averaged normal is intentionally not renormalized. Contact lever lengths
come from native witness points, not an assumed sphere radius. The existing
calibrated native and deferred coupled car-ball paths are unchanged.

The immutable goal recording SHA256 is
`1be7dbbe6ffa46f0e448e45dd11a5c2d298d80121b0345cdbc1a211ef9d07a35`.
The ball starts once at `[0,4800,300]`, velocity `[0,1500,0]`, zero spin,
and runs 90 ticks at 120 Hz without reseeding. All 91 frames meet the unchanged
position `0.0002` UU, velocity `0.0005` UU/s and spin `0.00001` rad/s limits.

| Audited vector norm maximum | Before | After |
|---|---:|---:|
| Position (UU) | 26.74199973698278 | 2.0061012313138393e-12 |
| Velocity (UU/s) | 642.1461117501838 | 0.0001549067726459347 |
| Spin (rad/s) | 2.8987185955047607 | 3.155179177396726e-13 |

The earlier wall correction improved pass counts but worsened this already-failing
goal case. This rerun compared error magnitudes too: the goal is the only case
whose tracked trajectory maxima changed among all 100 cases. Reference hashes
are unchanged. The audit now passes **73/100 trajectories**, up from 72, with
**16,810 paired frames** and still **0/100 full-state passes**. Missing audited
state remains a failure, not an inferred match.
The separately rerun isolated car gate remains **61/79**, unchanged. Both formal
gates still fail overall. All 72,180 existing UU mesh coordinates match the
previous checked-in geometry exactly.

`movement-bot.test.mjs` locks checkpoints 85, 86, 87 and 90, impact tick 86,
the eight surviving triangle identities, and a measured normal, witness arm
and refreshed separation. All **15/15** focused tests and **235/235** repository
tests pass. Production bundling preserves every original and native float32
vertex, query index and mesh boundary; the build passes.

The native tracer's `ball-goal` mode matches the immutable recording within
`5.421010862427522e-19` UU position, `0.0001220703125` UU/s velocity and zero spin
error. Its `mesh-order` mode exports all 8,020 triangles from pinned RocketSim
`2da51b1dac7b8127127613a5ff30e490bdd70dd8`; the generator requires a bijective
match with the source meshes. Original UU geometry is retained, with original
Bullet-unit vertices stored separately. No physics constants or budgets changed.

Remaining limitations include nonpersistent ball manifolds, double-precision
candidate filtering and reduction-area comparisons, incomplete internal-edge
handling, other trajectory failures, and missing full-state fields. The measured
SSE reciprocal-square-root behavior is CPU-specific. This is a strict-budget
RocketSim improvement, not bit-exact or native Rocket League certification.

## Wall Contact Follow-Up

The immutable `out/edge-audit-20261002-v1/rocketsim/ball_ball_wall.json`
recording (SHA256
`0f9192e54b17667bc64fec07fb8f33c78f453ff97d9281a5fc0c5e9b460a7f0f`)
now has checkpoints at ticks 9, 10, 88 and 120 in `movement-bot.test.mjs`.
The test runs continuously from the requested spawn without reference reseeding
and checks all position, velocity and spin components at unchanged strict limits.
It now passes normally; its known-failure TODO marker has been removed.

The retained standalone RocketSim ball solver uses Bullet-unit float32 normal
and friction rows, separate accumulated velocity/spin deltas, and ten solver
iterations. Static-plane normals reproduce the measured SSE normalization.
The calibrated native profile and deferred coupled car-ball solver are unchanged.
No restitution, mass, radius, trajectory inputs, references or budgets were tuned.

The native `roof_trace.cpp` executable's `ball-wall` mode initializes the ball
once at `[3900, 0, 1000]`, velocity `[1500, 200, 0]`, zero spin, without a car,
warmup or trajectory reseeding. Against the immutable reference, all 121 native
positions and velocities match exactly; maximum spin error is
`2.9802322387695312e-8` rad/s. At tick 10 the measured contact normal is
`[-0.9999999403953552, 0, 0]`, inverse mass is `0.03333333507180214`,
restitution is `0.6000000238418579`, and friction is `0.3499999940395355`.
Cached manifold impulses print zero and are not evidence of zero solver impulse.

`btStaticPlaneShape` normalizes its supplied normal. The earlier native
`normalize-stages`/`rsqrt-table` witnesses establish a 10-bit input bin and the
rounded reciprocal-square-root estimate for squared length one:
`round(8192 / sqrt(1 + 0.5 / 1024)) / 8192 = 0.999755859375`.
Float32 Newton refinement produces `0.9999999403953552`. This is a measured
CPU-specific SSE estimate, not a universally guaranteed hardware value or a
fitted wall coefficient. The JS plane contacts are axis-aligned unit vectors;
triangle normals are not assigned this plane scale.

Before this correction, tick-88 wall X position exceeded the position limit by
producing a `0.00048828125` UU error. After the correction, comparison of every
component in all 121 continuously simulated frames gives:

| Quantity | Maximum absolute component error | Unchanged limit |
|---|---:|---:|
| Position (UU) | 0.0001220703125 | 0.0002 |
| Velocity (UU/s) | 0.000152587890625 | 0.0005 |
| Spin (rad/s) | 0.0000011920928955078125 | 0.00001 |

Validation: **14/14** movement/audit tests and **234/234** repository tests pass.
Both complete immutable gates were rerun: **72/100 audited trajectories**
(previously 71), **61/79 isolated trajectories** (unchanged), **16,810 paired
frames**, and **0/100 full-state passes**. The ball-wall case now passes; the
ball-goal case still first fails at tick 86. Both formal gates still exit 1.
Passing these budgets is not bit-exact agreement or native Rocket League
certification. Contact geometry, multi-contact response, and missing audited
state remain unresolved. The wall reference SHA256 above was rechecked unchanged.

To reproduce the native witness, build `roof_trace.cpp` with the pinned native
RocketSim source and run:

```powershell
tools/physics-compare/out/native/ball_wall_trace.exe tools/physics-compare/collision_meshes ball-wall
```

The successful Windows Zig 0.14.1 build uses C++20, `-O2`,
`-D_USE_MATH_DEFINES`, `-ffp-contract=off`, `-DBT_NO_SIMD_OPERATOR_OVERLOADS`,
`-DBT_USE_SSE`, `-DBT_USE_SSE_IN_API`, `-DBT_USE_SIMD_VECTOR3`, and
`-include emmintrin.h`. Compile the tracer together with all `.cpp` files under
the native source's `src` and `libsrc/bullet3-3.24`. Supply both directories with
`-iquote`, not `-I`: Bullet's extensionless `version` file otherwise shadows the
C++ standard header. `RocketSim.h` is under `src`, not the checkout root.

## Previous Verification: 2026-10-02

The preceding immutable-reference rerun passed **61/79 isolated trajectories**
and **71/100 audited trajectories**. The 100-case audit compares **16,810 paired
frames** and has **0/100 full-state passes**. Full RocketSim parity remains
incomplete, and RocketSim agreement would not certify native Rocket League.
The sections below preserve earlier investigations and their historical results.

This verification pass corrected requested jump-history initialization and
RocketSim-profile timer increments to native float32 arithmetic. The calibrated
native profile's runtime timer arithmetic is unchanged. Every audited
`air_time_since_jump` sample now matches exactly, without changing its zero-error
audit threshold. The wheel configuration audit now reads the actual solver
connection points, radii and float32 suspension inputs, not unrounded preset
values. The suspension calculation itself is unchanged.

Both recordings are checked against the requested initial metadata and an
independent requested-orientation calculation, not only against each other.
Current requested-spawn and wheel-configuration checks have no failures. Raw
position and restored velocity/spin are checked; settled position remains a
comparison of prepared engine states, not independent proof of the preparation
procedure. Empty audit manifests are rejected. The formal comparison and movement
tick reports now enforce the right axis using the forward-axis budget unless an
explicit right-axis budget is supplied.

Remaining trajectory failures include ball-wall contact (first threshold crossing
at tick 88) and ball-goal contact (tick 86), car contacts, flips, and long routes.
The ball-goal Y velocity already differs by about 3.132 uu/s at tick 86. Missing
ball orientation, hit metadata, update counters, boost-pad lock ownership, and
unsupported mutator state still fail full-state coverage. Unsafe large integer
serialization and complete native preparation validation also remain unaudited.
No reference recordings or tolerance files were changed in this verification.

The focused physics/audit suite passes **80/80** and orientation-sign checks pass
**13/13**. These regression results do not supersede the failing parity gates.
To rerun against the existing recordings without regenerating them:

```powershell
node tools/physics-compare/movement-bot.mjs --audit --out tools/physics-compare/out/edge-audit-20261002-v1
node tools/physics-compare/movement-bot.mjs --out tools/physics-compare/out/strict-fresh-20261002
```

Both commands currently exit nonzero because parity is incomplete.

## Original Baseline

2026-10-02: Generated fresh RocketSim 2.2.1 and JavaScript trajectories from the
same 79-scenario movement file. Scenario integrity checks remain enforced;
neither engine is reseeded from reference frames.

Numeric defaults and car-specific exceptions in `tools/physics-compare/tolerances.json`
were tightened tenfold. Default position is 0.0002 uu, velocity 0.0005 uu/s,
angular velocity 0.00001 rad/s, orientation 0.00005 degrees. Ground-state
mismatches remain disallowed. Separate ball/contact budgets are unchanged.

Result: **61 passed, 18 failed**. This is a RocketSim regression comparison,
not native Rocket League certification. Several budgets are below the spacing
between adjacent float32 positions at arena-scale coordinates, so a failure
alone does not establish an incorrect physical constant.

Earliest failure: `movement_bot_goal_roof`, tick 32 (0.266667 seconds).

| Tick | Position error (uu) | Velocity error (uu/s) | Angular velocity error (rad/s) |
| --- | --- | --- | --- |
| 30 | 0 | 0.000081905 | 0.000003270 |
| 31 | 0 | 0.000062566 | 0.000002499 |
| 32 | 0 | 0.000359007 | 0.000023743 |
| 33 | 0 | 0.000159956 | 0.000008898 |

At tick 32 both cars are grounded and their positions match exactly. The
angular-velocity difference exceeds the strict budget, then falls below it at
tick 33. This local contact-response witness does not yet identify a causal
solver operation; no physics constants were tuned for this baseline.

## Curved-Wall Contact Correction

The finite box-triangle query previously excluded steep curved faces and
negative margin distances. At `ground_jump_into_wall` tick 91, this fell back
to a sampled corner about 38 uu off the centerline and invented sideways spin.
The chassis now uses finite triangle witnesses for shallow rounded-box margin
penetration on non-horizontal faces, replacing matching sampled contacts.
Core overlap still uses the existing fallback.

Against the unchanged 79 references and budgets, maximum position error for
this route fell from 6.863255 to 0.011110 uu, velocity error from 13.367699 to
0.061785 uu/s, and angular-velocity error from 0.784154 to 0.000317 rad/s.
The gate remains **61 passed, 18 failed**: this route still exceeds its strict
position/velocity budgets. The focused tick-91 test prevents the large corner
impulse from returning; it is not a replacement for the strict trajectory gate.

## Reproduce

Choose a new output directory to generate independent references:

```powershell
$env:PYTHON = (Resolve-Path '.venv\Scripts\python.exe').Path
node tools/physics-compare/movement-bot.mjs --out tools/physics-compare/out/strict-fresh-20261002
```

That recorded run contains `scenarios.json`, `rocketsim/`, `js/`, `report.md`,
`tick-report.md`, and `tick-errors.json`. Each `ticks/<scenario-id>.json` records
every compared tick, errors, reference/candidate state, limits, and the first
failing tick. These generated files live under ignored `out/`; they are not
committed source fixtures. Reusing the directory intentionally reuses its
reference trajectories, while scenario hash mismatches remain rejected.

The enforced comparison exits nonzero while any scenario fails. Do not relax
budgets or regenerate references to disguise a candidate regression.

## Native Wheel Investigation

The `roof_trace.cpp` diagnostic now accepts `goal-roof`. It reproduces the
scenario's idle airborne warmup, 100 boost, parked ball, starting state, and
throttle 1 / steer 0.3 controls. It prints 36 ticks with wheel lengths, forces,
cached pushback, raw Bullet-unit hit/hard points, normals, and chassis contacts.
The standalone Zig 0.14.1 SSE build matches the pinned reference through tick
36 within printed precision (position below 0.000000004 uu, velocity below
0.000000001 uu/s, angular velocity below 0.000000000001 rad/s at ticks 30-36).
Its output is saved as `native-goal-roof.json` in the recorded run directory.

There are **no chassis manifold contacts at tick 32**. The wheel path accounts
for the local discrepancy; this is not evidence of a chassis impulse defect.
Wheel 0 suspension length is 24.214589596 uu in JS versus 24.214754105 uu
native; suspension force is 65932.006836 versus 65929.007813 uu, and cached
pushback is 279.878497 versus 279.833282 uu. Exported contact positions conceal
raw-coordinate differences, including one float32 step in native Y.

The distance equations agree. One confirmed implementation difference is
triangle-normal normalization: Bullet's SSE `btVector3::normalize` uses
`_mm_rsqrt_ss` and a float32 Newton refinement, whereas JS uses a rounded square
root and reciprocal. Native normal Y/Z are 0.304571628571/0.952489376068 versus
JS 0.304571658373/0.952489435673. Starting the Newton refinement from the exact
reciprocal square root does not reproduce these native values. Incoming hard
points also differ, so normalization alone has not been established as the
complete cause. No production arithmetic or constants were changed.

A justified next correction requires tracing the earliest raw wheel mismatch
from tick 1 and reproducing the active SSE normalization semantics, rather than
subtracting an arbitrary epsilon from normals or tuning suspension forces.

The completed raw scan finds normal differences on wheels 1 and 3 already at
tick 1: normal-vector error 0.000000066640, with contact-point differences below
0.0000000004 Bullet units at printed precision. Wheel 3 force differs by about
0.021484 uu. Thus tick 32 is the first strict-budget crossing, not the first
arithmetic difference. Across all 36 native states, maximum printed-reference
errors are 0.000000005026 uu position, 0.000000000550 uu/s velocity, and
0.000000000004820 rad/s angular velocity.

## Double-Normalization Probe

Further source inspection found that `btDefaultVehicleRaycaster::castRay`
normalizes the normal again after `btTriangleRaycastCallback::processTriangle`.
The tracer's `normals` mode now accepts flattened triangle coordinates in raw
Bullet units on stdin and outputs JSON normals after both SSE normalizations:

```text
goal_roof_trace.exe normals < triangles-bullet-units.txt
```

For the examined roof triangle, this produces exactly the traced native normal:
`[4.179651398317219e-7, 0.30457162857055664, -0.9524893760681152]`
(winding sign is adjusted for the ray). This resolves the normal discrepancy,
but does not establish it as the cause of the trajectory mismatch.

Three immutable-reference probes were rejected: original fixture vertices with
one SSE normalization; original vertices with both normalizations; and the
existing reconstructed vertices with precomputed twice-normalized normals.
Each reported 60/79, below the earlier recorded 61/79. The normals-only probe
still crossed the goal-roof budget at tick 32, with maximum position error
0.001298 uu, velocity 0.003082 uu/s, and omega 0.000105 rad/s. Production code
and generated data were restored; only the native diagnostic is retained.

The post-removal rerun also reports 60/79, not the earlier recorded 61/79.
The production diff contains no retained wheel-ray changes, and the mesh
exporter has no remaining diff. Therefore the earlier count is not a verified
current baseline and the count alone cannot establish probe regression. The
unchanged tick-32 crossing and worse goal-roof trajectory remain reasons to
reject the normals-only probe. Final focused tests pass 66/66, editor diagnostics
are clear, and the production build passes with existing dependency/chunk warnings.

The static-normal lookup is therefore not a validated production correction.
The next investigation must compare complete tick-1 ray/hardpoint/force state,
including the airborne warmup, rather than assume matching one intermediate
value guarantees matching the solver history. The raw fixture-coordinate
round trip also changes the ray plane, so it cannot be combined casually with
an isolated normal correction.

## Warmup Solver Timestep

The repeatable `wheel-trace.mjs` diagnostic now compares warmup, reset, and
36 controlled ticks, rejecting a native trace that differs from the pinned
reference. Run `node tools/physics-compare/wheel-trace.mjs`; full states and
field errors are saved in the recorded directory as `wheel-trace.json`.
Unavailable missed-ray coordinates and native tick contact flags are explicitly
marked rather than serialized as misleading non-finite numeric errors.

A source-backed warmup defect was found: Bullet's `btContactSolverInfo` starts
with `m_timeStep = 1/60`. RocketSim calls car pre-tick wheel raycasts before
`stepSimulation` updates that solver timestep to 1/120. Wheel pushback therefore
uses the initial default on warmup and the previous world timestep thereafter.
The JS RocketSim profile now tracks that timestep per isolated car; the
calibrated native profile is unchanged. This per-car representation does not
model adding a new car to an already-stepped shared Bullet world.

Warmup velocity error fell from 10.883160 uu/s to 0.000000477 uu/s, position
error from 0.090739 uu to below 0.000000000001 uu, and omega error from
0.345404 to 0.000000064 rad/s. Reset restores identical pose and velocity while
preserving the small remaining wheel arithmetic differences. Tick 1 still has
normal error about 0.000000066640 and wheel-3 force error about 0.021484 uu.
The large warmup error was causal, but fixing it does not resolve SSE arithmetic.

The unchanged 79-reference gate now passes **61/79**, versus the reproduced
60/79 baseline. Goal-roof maximum errors improve to position 0.001060 uu,
velocity 0.002780 uu/s, and omega 0.000081 rad/s, but its first allowed-budget
failure remains tick 32. No references, controls, or tolerances changed.
Focused physics/movement tests pass **67/67**, including the initial timestep
and its transition after pose reset. The wheel diagnostic fidelity guard passes
and touched JavaScript files have no editor diagnostics. Exact parity remains
incomplete.

## Raw Suspension Force Witness

### SSE Normalization Correction

The subsequent operation trace identified the missing SSE estimate/refinement,
not merely a second scalar normalization. The native diagnostic's
`rsqrt-table` mode exhaustively checked all mantissas at both exponent parities:
the target CPU's estimate uses 10 input mantissa bits (2,048 bins). A reciprocal
root at each bin midpoint, rounded to 12 output mantissa bits, matches every
native bin exactly. This CPU-specific model is arithmetic only: no stored
trajectory, normal lookup, force offset, or reference input enters production.
The match is established for this target CPU, not guaranteed for every SSE CPU.

RocketSim wheel ray normals now use that estimate and Bullet's separately
float32-rounded Newton products for both normalization passes. Native-profile
physics is unchanged. Wheel 3 warmup normal, inverse contact projection, and
raw force now match exactly; tick-1 raw force is exactly `872.3978881835938`.
An exact regression covers both stages. Published force differences can remain
from native float32 versus JS double unit conversion.

Applying the SSE operation to friction directions was rejected: RocketSim uses
`safeNormalized()`, which divides by square root instead. That probe reduced
the strict gate to 60/79 and was removed. The contact-normal-only correction
passes 68 focused tests and retains 61/79 overall, but goal-roof errors increase
to position `0.001578`, velocity `0.004754`, angular velocity `0.000086`, with
the first budget failure still tick 32. It fixes the local arithmetic defect,
not the full trajectory. Residual early pushback and subsequent velocity history
still differ; exact parity remains incomplete. References and budgets are
unchanged. The following witness notes describe the pre-correction state.

The native tracer and JS diagnostic now expose raw Bullet-unit rest length,
suspension length, inverse contact projection, relative velocity, stiffness,
damping, force scale, and each spring/damping arithmetic intermediate. JS
reconstruction must equal its actual cached suspension force or the diagnostic
fails. These raw terms avoid confusing float32 native output conversion with
double-precision JS publication.

At wheel 3, tick 1, rest length, suspension length, compression, stiffness
product, relative velocity, damping product, and scale agree to native print
precision. The first differing input is inverse contact projection:
native `1.0498805046081543`, JS `1.0498803853988647`. Spring differs by
`0.00000762939453125` Bullet units; raw force is native
`872.3978881835938` versus JS `872.3974609375`.

Substituting only the native inverse projection into the diagnostic JS
expression reproduces native force exactly, with zero float32 error. This is
a causal arithmetic witness for the first-tick force difference, not a seeded
simulation or a fix for the entire trajectory. No substituted value is passed
to production physics. Warmup exhibits the same projection discrepancy.

A dynamic second normalization using JS rounded square root/reciprocal was
tested and removed: the projection and force witness did not improve. Thus
adding the missing normalization call alone does not reproduce the active SSE
reciprocal-square-root refinement. No new production normalization correction
is retained. The unchanged full gate remains **61/79**, goal-roof still fails
first at tick 32, all **67 focused tests pass**, and native fidelity and editor
checks pass. The next justified implementation needs reproducible native SSE
normalization semantics, not force tuning or a normal-component epsilon.