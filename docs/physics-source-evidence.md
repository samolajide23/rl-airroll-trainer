# Native Vertical-Wall Contact Correction: 2026-10-02

Capture `1790894166693498`, states 755-757, separates physical contact from
the ball-only extra hit. Recorded recoil and spin already match, but applying
the extra velocity immediately causes about 379.7 uu/s ball error at state
756. Native grounded vertical-wall contacts now queue that extra velocity
until the beginning of the following coupled step, leaving physical impulses
and current-tick displacement unchanged. Extra-hit speed uses pre-wheel car
velocity on this narrow path. A two-tick recorded regression pins recoil,
spin and both ball velocities; RocketSim timing is unchanged.

Native vertical-wall friction also uses current wheel commands after
suspension, excluding boost and handbrake. A recorded throttle-rise regression
covers the change. With two preceding recorded transforms seeding replay
commands, candidate 756's continuous window has maximum ball velocity error
0.816 uu/s and position error 0.251 uu. First remaining state divergence is
tick 732: angular error 0.01030 rad/s and car velocity error 0.614 uu/s.

Curved-wall candidate 1679 first diverges at tick 1650, before ball contact:
car velocity error 10.808 uu/s and angular error 0.07145 rad/s. Recorded and
simulated wheel normals match the mesh. Pre-suspension friction, extending
current-command friction to curved support, and clearing cached pushback
do not improve that first tick; these probes were removed. The remaining
suspension/body-contact/history discrepancy is unresolved. No constants or
assertion thresholds were relaxed. All 80 focused physics/telemetry checks
pass; these measurements do not certify exact parity.

# Contact Replay State Correction: 2026-10-02

Stationary roof-contact correction: capture `1790894251326631` states 2574-2575 matches physical car velocity within 0.0053 uu/s and ball spin within 0.00010 rad/s, but ball velocity differs by 4.845 uu/s. Using pre-wheel car velocity for the ball-only extra hit reduces this one-tick error to 0.0288 uu/s, without modifying physical impulses or spin. The native-only rule requires grounded idle throttle, speed below the existing stopping threshold, and no jump, boost or handbrake input. Moving coast, accelerating, airborne and RocketSim contacts retain their previous timing. A recorded regression pins car velocity, ball velocity and ball spin.

Candidate 2575 continuous 30-tick approach improves from 4.587 to 0.357 uu/s impact error, maximum ball velocity error from 4.628 to 0.507 uu/s, and maximum ball position error from 0.397 to 0.145 uu. Candidates 756, 969, 1679 and 1941 are unchanged. All 60 focused physics tests pass; the full suite has 193 passing tests and the unchanged flick failure. Production build passes. This is a narrowly verified timing correction, not evidence that all native extra hits use pre-wheel velocity or that contact history is fully reconstructed.

Contact replay previously warmed the car with idle inputs and restored only rigid-body state. Its first accelerating tick therefore applied cached coasting brakes rather than preceding recorded throttle. Seeding wheel commands with the preceding input at restored speed removes that artificial approach error; gameplay physics is unchanged. In capture `1790894212583503`, candidate 1941 pre-impact car velocity error falls from 4.495 to 0.457 uu/s, first-impact ball error from 5.928 to 0.922 uu/s, and maximum ball position error from 2.420 to 0.248 uu. Candidate 969 is unchanged at 0.510 impact and 0.608 maximum ball velocity error. Candidate 2575 improves to 4.587 impact error, still unresolved.

Reports now expose car angular velocity/orientation, ball angular velocity, wheel/ground mismatches and first-state divergence. Regression tests cover missing angular/contact evidence and first-tick acceleration. Wheel command seeding is not exact suspension/manifold restoration; prior powerslide interpolation, contact impulse history and engine callback phase remain unverified. The curved-arena candidate 1679 still has large pre-impact car divergence and worsens after this initialization correction; it cannot be treated as a clean collision calibration case. No collision constants or parity thresholds were changed.

# Native Contact Replay: 2026-10-01

Native reverse-braking contact correction: capture `1790894212583503`, observed states 968-969, isolates a ball-only velocity error. The car already matches within 0.0062 uu/s, but the ball differs by 15.11 uu/s in a one-tick replay. Using the observed pre-wheel car velocity for the extra hit-speed calculation reduces ball error to 0.150 uu/s without changing physical contact impulses. The retained correction applies only to native grounded opposite-direction throttle without boost or handbrake. RocketSim callback timing and other native hit cases remain unchanged. This is measured timing evidence, not proof of native callback internals.

With continuous 30-tick pre-roll, candidate 969 retains the correct contact tick, first-impact ball error falls from 14.77 to 0.510 uu/s, and the complete window peaks at 0.608 uu/s velocity and 0.123 uu position error. Candidate 1941 remains at 5.928 uu/s. Applying pre-wheel timing to all native hits was rejected: it worsened that continuous neighboring contact and the unrecorded flick. A new recorded braking-touch regression requires ball error below 0.5 uu/s and car error below 0.05 uu/s. The final production build passes; the earlier CSS blocker no longer occurs. Other contact and flick mismatches remain unresolved.

Follow-up: configurable 1-30 tick pre-roll and first-car-velocity-divergence diagnostics isolate approach drift from contact error. Recorded capture `1790894212583503` sample 959 applies reverse throttle -0.109375; native velocity immediately changes from `[294.561005, -1176.25098, 0.270999968]` to `[287.480988, -1147.95093, 0.270999968]`. Recomputing friction after wheel commands only for native grounded opposite-direction throttle removes the previous-command braking delay. Candidate 969 now contacts on the recorded tick rather than tick 970; pre-impact velocity error falls from 24.94 to 0.326 uu/s and position error from 1.88 to 0.033 uu. First-impact ball velocity error remains 14.77 uu/s; subsequent contacts remain imperfect.

Broader native friction recomputation improved other grounded approaches but regressed shared-physics soft reception. That probe was removed; coasting, forward throttle, airborne contact and RocketSim-profile ordering remain unchanged. A recorded reverse-input regression and pre-roll option validation were added. The production build was blocked during this pass by an unrelated unclosed bracket in `src/menus/live.css:259`.

`compareContactCapture` in `tools/telemetry/replay.mjs` now replays 30 ticks before a nearby ball-velocity-change candidate and 30 ticks after it, continuously with earlier-sample controls and the native car profile. It excludes timing gaps, teleport-like movement, boost activity, and initial airborne/jump history. Suspension is warmed before restoring the observed initial transform and velocity; internal suspension state is not restored exactly.

Across Octane recorder 0.3.0 captures `1790894166693498`, `1790894212583503`, and `1790894251326631`, five windows qualify. Candidate 1941 in the second capture and 2575 in the third reproduce contact on the same tick, with first-impact ball velocity errors of 5.93 and 5.71 uu/s respectively. Their maximum ball position errors over the replay are 2.42 and 2.03 uu. These are diagnostic results, not parity certification.

Candidate 756 in the first capture and 969 in the second contact one tick late, but already have pre-impact car velocity errors of 10.38 and 24.94 uu/s. Candidate 1679 in the second capture reproduces the initial ball velocity change within 1.23 uu/s without a simulated car touch, suggesting an arena impact rather than an authoritative car contact. Proximity plus velocity change is not sufficient to classify a touch.

No production collision-force change is justified by these results yet. Already-active flick windows and boosted approaches remain excluded. The focused physics/telemetry suite passes 72 tests, including gap/reset/jump-history selection regressions.

# Physics source evidence

## Native jump-edge friction correction: 2026-10-01

The two contact captures below show a slightly tilted resting car. Its jump
impulse introduces horizontal velocity, but wheel friction was calculated
before that impulse. Native grounded jump edges now recalculate wheel
friction after the impulse, before applying it; reference and non-onset
paths remain unchanged. An independent tilted-onset velocity test covers
this ordering.

Across all eight continuous 120-tick jump replays, full-hold maximum
velocity error improves from 3.51 to 0.427-0.434 uu/s; eight-tick holds
improve to 0.251 uu/s. The five-tick hold improves to 3.212 uu/s, with
remaining landing-contact error. Maximum position errors are 0.265-0.274
uu for full holds, 0.360-0.361 uu for eight-tick holds, and 0.119 uu for
the five-tick hold. Contact release remains tick 7. Position drift is not
eliminated and full-hold position is not uniformly improved.

The flick test's speed improves from 768.48 to 770.17 uu/s, still below
800. Its ball contacts end at tick 2, before the tick-7 forward dodge;
there is no subsequent ball contact during that dodge. A nose-up setup
probe did not improve speed and was removed. No collision force was
fitted to this assertion: independent native ball-contact evidence is
needed to validate that response. All 71 focused tests pass.

## Native recorded jump contact correction: 2026-10-01

Recorder 0.3.0 Free Play captures `capture-1790892617426791.ndjson` and
`capture-1790892643590640.ndjson` contain 4,990 complete contact samples for
Octane body 23. `compareJumpCapture` selects eight settled, input-clean jumps,
excludes local timing gaps, and continuously replays 120 ticks using the
earlier input sample because this callback precedes physics integration.

Native wheel rays no longer subtract the 2.5 uu suspension max-raise value
from their reach. Native jumps use full hold acceleration from onset and
omit the simultaneous onset suspension impulse. Sticky downforce retains
the previous contact normal on the jump contact-loss transition; current
ray contacts still control suspension and friction. RocketSim paths retain
their prior behavior. A reach/full-force-only probe regressed position to
10.94 uu and was repaired before retaining the combined correction.

Wheel release matches recorded tick 7. The five-tick jump improves maximum
position error from 0.645 to 0.121 uu and velocity error from 16.32 to
3.51 uu/s. Eight-tick holds improve position from about 0.576 to 0.383 uu.
Full holds improve velocity from 5.72 to 3.51 uu/s, but maximum position
error increases slightly from about 0.23 to 0.26-0.28 uu. Onset vertical
velocity matches within 0.001 uu/s; residual horizontal motion and packet
rounding remain. This is not exact parity or validation of rotated,
wall-jump, or other-hitbox contacts.

All 70 focused physics/telemetry tests and the production build pass.
The full suite passes 183/184: the existing forward-flick speed assertion
still fails, with speed changing from 771.53 to 768.48 uu/s (threshold 800).
No assertion or reference hash gate was relaxed.

## Retained native free-flight throttle calibration: 2026-10-01

Two accepted retry-capture throttle repeats show 0.55 uu/s steady velocity
gain per tick, versus the reference 0.555556. Ordinary unboosted native
free-flight throttle now uses effective acceleration 66 uu/s^2. Jump/dodge
history, grounded states, preceding-tick boost contribution, and RocketSim
reference acceleration retain their existing behavior. This calibrates the
observed forward-throttle trajectory, not proven native engine internals;
reverse, fractional, and rotated native inputs need independent recordings.

Displacement rounding includes a 0.0001-cent tolerance for float32 noise at
half-cent boundaries: the recorded post-throttle coast advances 0.28 uu/tick,
while float32 integration of 33 uu/s can place 0.275 just below that boundary.
Without this stabilization, velocity improves but position regresses.

Both 180-tick throttle trajectories improve from 0.332356 to 0.001242 uu/s
maximum velocity error and from 0.070717 to 0.010010 uu position error.
All twelve neighboring accepted aerial trajectories retain identical maxima.
The local native cache preserves the failed force-only report
`batch-air-throttle-calibration.json` and retained combined report
`batch-air-throttle-rounding-calibration.json`. All 69 focused tests pass;
the full suite has only the unchanged forward-flick speed failure.

## Retained native free-flight translation calibration: 2026-10-01

Coast packets retain horizontal velocities 500.001007 and 200.001007 uu/s,
but advance by 4.17 and 1.67 uu per tick, respectively. Their accumulated
displacement therefore differs from unrounded velocity integration; this is
not fixed by changing the timestep. Native free-flight translation now rounds
displacement increments to hundredths of a Unreal unit before accumulating
the float32 Bullet-unit origin. The same native/no-jump/no-dodge/not-grounded
guard as gravity calibration applies; reference translation is unchanged.
This reproduces observed trajectories without claiming native engine internals.

Across eight original and fourteen retry trajectories, coast maximum position
error falls from 0.845023 to 0.010044 uu over 180 ticks. Axis/combined cases
improve from up to 0.034058 to approximately 0.010010 uu. Throttle position
error falls from 0.149996 to 0.070717 uu; its 0.332356 uu/s velocity error is
unchanged and remains unresolved. Native boost regression and jump-history
exclusion tests pass. Reports `batch-air-original-translation.json` and
`batch-air-retry-translation.json` are preserved in the local native cache.

## Retained native free-flight gravity calibration: 2026-10-01

Native car free-flight now uses an effective gravity contribution of 649.2
uu/s^2, matching repeated recorded gains of -5.41 uu/s per 120 Hz tick.
This is a trajectory calibration, not a claim that native world gravity is
anything other than -650. Only native cars without jump/dodge history and
not grounded use it. RocketSim, ball gravity, boost/throttle forces and
jump-history integration remain unchanged.

The retry capture's unpowered axis/combined maximum velocity error falls
from 1.201538 to 0.000732 uu/s; maximum position error falls from approximately
0.910 to 0.0341 uu. Throttle errors fall from 1.246657 to 0.332356 uu/s and
0.922001 to 0.149996 uu. Coast velocity error falls to 0.000610 uu/s, but
position error remains 0.845023 uu, so translation parity is not complete.
Original-capture replay is also retained in the native cache.

Applying this to jump histories worsened six-tick jump replay, so that broader
change was rejected. The retained calibration deliberately excludes those
unverified states. Recorded boost regressions remain passing. Reports are
`batch-air-gravity-calibration.json`,
`batch-air-original-gravity-calibration.json` and
`batch-jump-gravity-calibration.json`.

All ten accepted jump comparisons retain identical maximum position and
velocity errors to their baseline after the history guard. The original
capture's eight aerial comparisons independently show unpowered velocity
error at most 0.000732 uu/s. Sixty-seven focused tests pass and production
build succeeds. Full suite: 174/175 pass, with the existing forward-flick
speed failure unchanged at 771.528543 uu/s. The cached reference comparison
cannot run: `flip_cancel_sustained` has a scenario SHA256 mismatch. Reference
hash validation was not bypassed, so that gate remains unverified.

## Position-derived native acceleration: 2026-10-01

The aerial replayer now measures acceleration independently of packet velocity,
using three positions spaced 30 ticks apart. Every intervening input must be
free of throttle, boost and jump. One-tick second differences amplified position
rounding and were rejected as an estimator. Synthetic tests cover altered
reported velocities and rounded positions; they validate the diagnostic, not
native physics.

Across 22 accepted trajectories in the original and retry captures, unthrottled
axis/combined cases yield median vertical acceleration -649.121094 uu/s^2;
coast cases yield -649.123047 uu/s^2. These overlapping-window estimates show
that the drift also appears in displacement, but do not identify its native
implementation. The throttle cases' remaining coasting windows yield
-648.800293 uu/s^2 and must not be treated as clean coast calibration.
Reports `batch-air-original-position.json` and `batch-air-retry-position.json`
are retained in the native cache.

A separate probe truncated per-tick velocity increments, preserving accumulated
fractional velocity. It still reduced recorded steady boost acceleration from
8.82 to 8.81 uu/s per tick, so it was removed immediately. No gameplay physics
change was retained. All 65 focused physics/telemetry tests pass after removal.

## Native drift timing and rejected precision probe: 2026-10-01

Independent diagnostics infer duration from gravity gains, displacement projected
onto ending velocity, and quaternion rotation divided by ending angular speed.
Coasting gravity gains imply approximately 0.008323083 seconds, but stationary
fall displacement implies 0.00833331 to 0.00833336 seconds. Single-axis rotation
is also near 1/120 second. A shorter global timestep is therefore not supported.
Reports `batch-air-original-timing.json` and `batch-air-retry-timing.json` retain
the measurements in the native cache; capped rotations and throttled gravity
measurements are excluded from their respective estimates.

A native-only probe truncated internal velocity to hundredths of a Unreal unit
per second after force integration. Repeated contact-free aerial velocity errors
fell below 0.002 uu/s, but steady boost gains became 8.81 rather than the recorded
8.82 uu/s. Short jump position error increased from 0.814 to 0.871 uu and velocity
error from 42.050 to 42.731 uu/s. The production probe was removed rather than
loosening the recorded boost regression. Reports `batch-air-precision-probe.json`,
`batch-jump-precision-probe.json` and `mechanics-precision-probe.json` preserve
these rejected results. Sixty-four focused physics/telemetry tests pass after
restoration, including the new known-duration diagnostic test. No gameplay
physics change was retained; native force integration versus packet precision
remains unresolved.

## Continuous native aerial comparison: 2026-10-01

The same three captures below now support continuous replay of independent
pitch/yaw/roll in both directions, combined control, airborne throttle and
coasting. `batch-air-original.json`, `batch-air-retry.json` and
`batch-air-final-retry.json` remain in the local native cache. Replay accepts
23 trajectories, at least two for each of nine cases, each spanning 180 steps
(1.5 seconds). Fifteen aerial segments are rejected by completeness/continuity
guards. No new Rocket League input or recording was needed.

Following-packet inputs fit the control edges consistently better. Maximum
angular velocity error across accepted trajectories is 0.003280 rad/s;
maximum orientation error is 0.002553 rad (combined control). Single-axis
orientation error is at most 0.001640 rad. Maximum position error is
1.230549 uu (coast), and velocity error is 1.246657 uu/s (throttle).
Unthrottled vertical velocity accumulates approximately 1.2015 uu/s error:
recorded per-tick gains are about -5.410 versus simulated -5.4167 uu/s.
This alone does not identify a wrong gravity constant rather than native
integration timing or precision. No production physics constant was changed.

Replay preserves simulated state instead of resetting it at each packet,
requires complete 360-tick source segments, and stops before contacts or
jump/dodge/boost transitions. Twelve telemetry tests pass, including a
simulator-generated aerial fixture testing state retention, timing and contact
stops. That fixture is not independent native evidence. Full-batch contact
parity remains unverified.

## Clean batch coverage and jump-hold comparison: 2026-10-01

Combined native captures `capture-1790884511770340000.ndjson`,
`capture-1790885512287299100.ndjson` and
`capture-1790886255122888000.ndjson` provide at least two complete, gap-free
Active-phase segments for all 64 canonical cases. Duplicate-source hashes,
case definitions and segment continuity are checked independently. This is
sample coverage, not proof that each intended contact occurred or that the
trainer matches each trajectory.

The native mechanics replayer accepts complete jump-hold batch segments,
rejecting missing completion markers, gaps and inconsistent tick labels.
`batch-jump-baseline.json` in the native cache contains the original capture's
accepted jump comparisons. Both input timings are retained; summary output
shows later-input gains. Suspension is warmed, not reconstructed from packets.

One- and three-tick holds have identical recorded early gains: approximately
295.680 uu/s at onset, then 4.020 uu/s on each of the next two ticks. The model
predicts 299.182, -0.591 and -0.591 uu/s. Extra downward acceleration remains
in native data until tick 67, whereas simulated wheel-ray contact ends earlier.
Packet air-state flags alone do not identify per-wheel contact or suspension.

A native-only probe removed reduced hold force after onset during the minimum
hold interval. It improved ticks 62 and 63 to 4.027 uu/s, but increased the
short-hold trajectory's maximum position error from 0.814 to 7.560 uu and
velocity error from 42.050 to 106.850 uu/s. The probe was removed and the
original baseline rerun. No jump-force or wheel-geometry change was shipped.
Ten telemetry tests pass, including complete/gapped/mislabeled batch fixtures.
Landing errors are included in these trajectory maxima; they are not isolated
jump-force measurements. Full-batch replay and exact contact parity remain
unverified.

## Native boost edges and explicit vehicle capture: 2026-10-01

Isolated probes now explicitly request Octane body ID 23 and write the resolved
match configuration into the capture header. Solo capture
`capture-1790882172459527500.ndjson` completed successfully and confirms that
loadout. Its replay reproduces the previous lift-off errors, ruling out the
unspecified default body as their cause.

Native boost uses ground-strength boost thrust plus airborne throttle from the
preceding tick's boosting state. Recorded forward gains at onset, steady boost,
release and the following tick are 8.261001, 8.819999, 0.549988 and 0 uu/s.
The native profile now predicts 8.263889, 8.819447, 0.555542 and 0 uu/s.
An independent regression covers these gains. Position error in both accepted
boost trials falls from 0.943277 to 0.910174 uu; peak velocity error remains
1.201789 uu/s. Boost consumption and accumulated vertical error remain unresolved.
The separate report is `mechanics-octane-boost-profile.json` in the local cache.

A rejected jump probe used full early hold acceleration and suppressed the
takeoff suspension impulse. It matched the first five native gains closely,
but the simulated acceleration changed from approximately 4.02 to 6.73 uu/s
two ticks early (66 rather than 68). Full-jump position error increased from
0.679394 to 6.850968 uu. Both production changes were removed; evidence remains
in `mechanics-jump-probe.json`. Replay checkpoints now expose ticks 61 through
80. No arbitrary contact delay or fitted wheel geometry was introduced.

All 60 focused tests pass; the full suite has 150 passes and the unchanged
forward-flick failure at 771.528543 uu/s. The browser build passes. The original
73-scenario RocketSim gate retains its two existing failures, wall driving and
jumping into a wall. These results do not certify exact physics: the native
capture lacks per-wheel contacts, suspension state and hidden jump timers.

## Application native flip profile: 2026-10-01

Application car constructors in `carPhysics.js` now select an explicit native
profile; direct `carSim.js` constructors retain the RocketSim reference profile.
Native behavior includes same-tick dodge torque, damping during dodges, vertical
damping after tick 18, and cancellation only after five dodge ticks. Native
packets show full opposite pitch at tick 103 but angular decay beginning at
tick 106 after dodge onset at 101. A regression uses six independently recorded
angular velocities, not simulator-generated expected values.

The complete expanded capture is replayed in the separate user-local
`mechanics-native-profile.json`. Maximum orientation errors are 0.000903 radians
forward, 0.003345 diagonal, 0.000934 side, 0.000656 backward, 0.001375 sustained
cancel and 0.004525 partial cancel. Sustained cancel improves from 1.314966
radians. All six cases' velocity errors fall from approximately 89.763 to
6.060 uu/s. Jump lift-off and boost errors remain unchanged. Early grounded
flip still reaches 117.585 uu/s velocity error and is not certified.

The reference-profile gate retains its original budgets and separate outputs
in `out/native-boundary/profile-reference-js`; native recordings are not
substituted for RocketSim references. The five-tick guard alone failed three
RocketSim cancel cases, motivating the explicit profile distinction. All 59
focused tests pass. The broader suite retains the pre-existing forward-flick
failure at 771.528543 uu/s. These measured improvements do not establish exact
native parity for contacts, grounded flips or arbitrary maneuvers.

## Expanded native solo mechanics baseline: 2026-10-01

The existing solo recorder now cycles nine cases over a 75-second capture.
Capture `capture-1790881225506760100.ndjson` and the separate continuous replay
`mechanics-expanded-baseline.json` remain in the user-local AIRLAB/coconut/native
cache. Rocket League reported one player and completed at frame 8558. Original
captures and the rejected combined-probe report are preserved.

Replay accepted three boost trials, three held jumps, one forward flip, two
diagonal flips and two trials of each added case. The forward coverage is lower
than the scheduled repetitions because replay requires contiguous eligible
packets. The added controls use yaw-only side flips, positive-pitch backflips,
full and half opposite-pitch cancel commands from ticks 102 through 179, and
an early forward flip at tick 68 after a short jump from ticks 60 through 63.
The early flip starts from a grounded reset; it is not a dodge without jumping.

| Added case | Maximum velocity error (uu/s) | Maximum angular velocity error (rad/s) | Maximum orientation error (rad) |
| --- | ---: | ---: | ---: |
| Side flip | 89.763 | 2.166844 | 0.078418 |
| Backflip | 89.763 | 1.762631 | 0.055115 |
| Sustained cancel | 89.763 | 3.667725 | 1.314966 |
| Partial cancel | 89.763 | 2.617443 | 0.115761 |
| Early grounded-start flip | 244.617 | 3.477024 | 0.151413 |

Values use following-packet inputs against unchanged production physics.
Side, backward and cancel trials have no jump/dodge flag mismatches. Both cancel
commands appear in packets at tick 103, while native pitch angular velocity
initially continues through approximately 5.4669 and 5.5 rad/s. The half-pitch
command is quantized to 0.503937 in native packets. This is evidence for further
cancel-timing analysis, not proof that cancellation never occurs.

The early flip begins natively at tick 69, but each replay has 126 frames with
at least one jump/dodge flag mismatch; at onset the jump flag already differs.
Its contact and hidden jump-state differences make it unsuitable as a clean
airborne angular reference. All ground-start cases still first exceed 5 uu/s
velocity error at jump lift-off, tick 63. No production physics change or
RocketSim budget relaxation was made. Nine telemetry regressions, runtime
probe-boundary assertions and editor diagnostics pass; exact parity remains
uncertified.

## Combined native dodge probe: 2026-10-01

A shared-physics experiment enabled angular damping during active dodges and
recomputed air torque on the initiating dodge tick. Transform integration
already precedes angular-speed clamping, so that order needed no change.
The first implementation moved the whole air-torque update and broke the
roof-recovery regression. Restricting recomputation to new dodges restored
all 58 focused physics and telemetry tests while retaining the native gains.

Continuous replay of both recorded forward flips reduced maximum orientation
error from 0.055018 to 0.000903 radians and angular-velocity error from
1.762863 to 0.001129 rad/s. Both diagonal flips improved from 0.065387 to
0.003344 radians and from 1.955014 to 0.009032 rad/s. Maximum flip velocity
error remained 89.763 uu/s; jump and boost discrepancies were not resolved.
The separate user-local report is `mechanics-combined-probe.json`.

The unchanged 73-scenario RocketSim gate rejected this candidate: 14 cases
failed, versus the restored baseline's two. Twelve additional failures cover
forward/side/diagonal/backward dodges, flip windows, cancels and a grounded
flip. Sustained-cancel orientation differed by up to 32.272 degrees, and the
grounded flip differed by 148.686 uu/s. Separate candidate trajectories and
`out/native-boundary/combined-report.md` preserve that evidence.

The combined probe was removed rather than relaxing budgets or replacing
references. This establishes a measured conflict with RocketSim, not a
mergeable universal correction. Native side/backflip, sustained/partial
cancel and grounded-flip recordings are needed to distinguish a genuine
native model difference from capture or hidden-state effects before choosing
whether to introduce a separately validated native physics model.

## Native forward-dodge edge diagnostics: 2026-10-01

The same solo capture now has a separate `mechanics-edge-report.json`; the
original baseline is preserved. Input-edge windows include native and browser
velocity/angular-velocity gains and normalized orientation-step residuals.
Nine telemetry tests cover input timing, angular recurrence and pre-cap rotation.
No production movement constants or integration order were changed in this pass.

Both forward trials start the dodge at probe tick 101, with the following
packet's jump/pitch input. The native horizontal impulse is 499.999994 uu/s
versus 500.000011 uu/s in the browser. Native pitch angular velocity starts
with full dodge torque on that tick; its first three increments fit
`omega_next = omega + 224 / 120 - abs(D_PITCH) * omega / 120`
within 0.000062 rad/s. Torque alone does not fit those increments.

Orientation follows the newly accelerated angular velocity, not the previous
packet's value. At ticks 104-105, using the reported 5.5 rad/s capped velocity
leaves about 0.014 radians of step error. Integrating the damped velocity before
clamping it instead fits all five onset steps within 0.000037 radians in both
trials. Native dodge state persists through tick 179; normal angular decay and
InAir state begin at tick 180. These observations support a combined onset,
damping and pre-cap transform-order hypothesis, rather than an onset-only fix.

This is a local forward-pitch model, not full 3D or continuous trajectory
certification. Euler packet rounding, suspension and hidden state remain
limitations. Diagonal/cancel behavior and the unchanged RocketSim gates must
be checked before applying a shared physics correction. The held-jump lift-off
and flip vertical-damping differences described below remain unresolved.

## Native solo boost, jump and flip baseline: 2026-10-01

`coconut_trial.py --native --mechanics-probe --seconds 45` recorded one car
in Rocket League, cycling airborne boost, held jump, forward flip and diagonal
flip. Capture `capture-1790879931467737100.ndjson` and the replay report
`mechanics-baseline.json` are in the user-local AIRLAB/coconut/native cache.
No opponent was spawned. This is solo Soccar practice, not the Free Play menu.

The probe starts only in Active match phase, resets every 360 frames, and
begins inputs after 60 frames. Replay begins at a neutral settled frame,
preserves jump/flip/boost timers throughout the trajectory, and reports both
adjacent packet input timings. Following-packet inputs consistently fit better.
There were three boost trials, three jump trials and two trials of each flip;
all recorded jump and dodge flags match the following-input replay.

| Case | Maximum position error (uu) | Maximum velocity error (uu/s) | Notes |
| --- | ---: | ---: | --- |
| Airborne boost | 0.944 | 1.202 | Boost amount error up to 0.556 percentage points |
| Held jump | 0.680 | 6.059 | First velocity difference at lift-off, probe tick 63 |
| Forward flip | 4.455 | 89.763 | Rotation error up to 0.0551 radians |
| Diagonal flip | 4.457 | 89.763 | Rotation error up to 0.0654 radians |

The flip velocity peaks occur airborne at tick 118, height 185.18 uu. Native
vertical velocity starts damping at tick 119; this is a timing-boundary lead
to investigate, not justification to change the shared physics timer yet.
Native rotation acceleration also needs isolation from the initial jump drift.

### Rejected timing probes

Delaying vertical damping from flip tick 18 to tick 19 reduced the first
forward/diagonal native trials' peak velocity errors from 89.763 to 6.059 uu/s.
However, fresh RocketSim 2.2.1 trajectories for the current scenarios showed
flip velocity errors of 32.229 uu/s and new failures under unchanged budgets.
The delay was reverted. A contact-free regression now pins RocketSim's tick-18
boundary; it does not establish Rocket League's boundary independently.

Applying full flip torque on the initiating tick also worsened native rotation:
forward error rose from 0.0550 to 0.0855 radians and diagonal error from 0.0654
to 0.1204 radians. That probe was reverted as well. Neither experiment is a
retained movement correction. Input-edge timing, float timer behavior and
unobserved native state remain competing explanations.

The full test suite ran 147 tests with one forward-flick speed failure
(771.529 uu/s versus a minimum of 800). The same failure and value persisted
after restoring both probes, so it was not caused by these timing experiments.
Existing cached reference hashes did not match the current scenarios; fresh
references were generated separately without replacing them or changing budgets.
With the original damping restored, 71 of 73 current scenarios pass; only
`wall_drive_throttle_3s` and `ground_jump_into_wall` fail their existing budgets.
All flip scenarios return to their reference limits.

These are baseline measurements, not parity certification. The Octane hitbox
is assumed, suspension is warmed rather than captured, reset application is
asynchronous, and input timing at edges still needs independent verification.
Ground handling, ball/wall contact, double jumps, reverse/side flips and
flip-cancel combinations are not covered by this capture. The steady airborne
comparison separately excludes Countdown and Kickoff; those phases produced
large misleading errors in the previous capture.

## Wheel-contact precision audit: 2026-10-01

The native wheel collision path passed an already-native offset to
`impulseDenominator`, which converted it again. The helper now honors the
native-input flag. The inverted-roof recovery regression and all 51 focused
physics/movement tests pass.

Wheel rays now retain the selected triangle index and reconstruct its normal,
plane-crossing fraction and interpolated contact point with float32 operations.
The immutable, unseeded 79-case movement replay improves from 72/79 to 73/79:
`movement_bot_goal_roof` now passes without changing controls or tolerances.
This is not exact native raycasting: triangle selection remains the existing
algorithm and vertices are reconstructed from the rounded UU mesh export.

Remaining failures (maximum errors; first allowed-budget tick):

| Scenario | Position (uu) | Velocity (uu/s) | Omega (rad/s) | Tick |
| --- | ---: | ---: | ---: | ---: |
| wall_drive_throttle_3s | 0.000492 | 0.010617 | 0.000245 | 161 |
| ground_jump_into_wall | 6.863242 | 13.367890 | 0.784153 | 91 |
| movement_bot_straight | 10.789740 | 73.411581 | 2.145004 | 640 |
| movement_bot_slalom | 0.005915 | 0.020157 | 0.000176 | 460 |
| movement_bot_jump_dodge | 0.003814 | 0.002813 | 0.000033 | 236 |
| movement_bot_aerial | 0.002444 | 0.006211 | 0.000200 | 470 |

Float32 contact-normal averaging worsened goal-roof drift, direct mesh-unit
division worsened slalom/aerial drift, and steering quaternion direct division
introduced a powerslide failure. Those probes were removed. Bullet-style
triangle selection produced identical results and was also removed. The retained
ray reconstruction worsens wall-drive velocity/angular maxima despite improving
its position maximum; it is not a uniform precision improvement.

The 77/79 target is unmet. Next isolate native wheel/constraint intermediate
values at wall-drive ramp entry and the early grounded drift in slalom/jump
routes, rather than adjusting gates or selectively seeding reference states.

## Goal-wall finite contacts and split rotation

Pinned RocketSim/Bullet tracing shows two chassis rows at replay tick 1093:
a 1.261425 uu positive-gap triangle contact and a -7.037735 uu penetrating
contact. The browser previously retained only the deepest row. A finite
box-triangle GJK query now supplies the missing separated witness. Internal-edge
adjustment changes the normal but must not change the raw-normal margin offset
of the car-side witness. Its position matches the native trace within 0.001 uu.

Bullet `btSolverBody::writebackVelocityAndTransform` scales split turn velocity
by `m_splitImpulseTurnErp`, whose pinned default is 0.1. Applying that factor to
wall rows resolves the tick-1093 orientation discrepancy. The exact-state
regression measures velocity error 0.05832 uu/s, angular-velocity error
0.0001412 rad/s, and forward/up vector error below 0.00001.

The current 73 movement and five strict contact gates pass unchanged budgets.
The immutable bot replay still fails: maximum car position error 324.163647 uu,
velocity error 521.221890 uu/s, and ball position error 61.021485 uu. The remaining
penetrating witness is approximate; exact native float32 solver parity and the
full bot port are not established. Reference-seeded diagnostics retain JS hidden
history and are explicitly rejected by ordinary parity comparisons. These
results supersede the older roof and movement failures recorded below.

## Force-integrated friction direction

The pinned Bullet `getVelocityInLocalPointNoDelta` includes external force and
torque impulses when choosing friction direction. Restitution remains
pre-force; the friction RHS includes external linear force but excludes external
angular torque. The chassis solver now follows that distinction.

At ceiling tick 38, exact-state velocity error falls from 0.503268 to
0.00009444 uu/s and angular error to 0.000006023 rad/s. A new regression pins
that impact, and the ceiling endpoint checks are tightened. The unchanged
movement gate now passes 72 of 73 cases: ceiling passes, while roof recovery
still fails with maximum position/velocity errors 18.585278 uu / 218.182070 uu/s.
Its early physical impulses match closely, but cached split penetration
correction first diverges at tick 31. Removing roof persistence matches that
tick but worsens full recovery, so that probe was reverted.

Five strict contact cases, production build and editor checks pass. The
immutable bot replay still fails with maximum car-position error 338.338638 uu.
References, recorded controls and full-trajectory budgets remain unchanged.
The older pre-force friction-direction description below is superseded by
this source-grounded correction; exact manifold parity remains unresolved.

## Shared chassis inertia correction

The chassis now calculates inverse inertia from the same effective safe-margin
box dimensions as the deferred car-ball solver. Inverted-floor and ceiling
support points use those dimensions consistently. All six presets have a direct
inertia regression. This fixes the four failing preset landings and powerslide
release without changing reference trajectories, controls or movement budgets.

The final movement gate passes 71 of 73 cases. Roof recovery remains outside
budget (21.700 uu maximum position error, 223.105 uu/s velocity error), as does
ceiling impact (0.328 uu, 0.749 uu/s). The ceiling matches through its first
impact; divergence begins on the next contact tick. The previous ceiling unit
test asserted a JS-only snapshot; it now checks a recorded RocketSim endpoint
envelope separately from the unchanged, stricter full-trajectory gate.

All 46 focused tests, five freshly replayed strict car-ball cases, editor
diagnostics and production build pass. The immutable bot replay still fails
with maximum car-position error 338.458 uu. Roof generation-gap persistence,
partial nonmerging four-slot reduction and ceiling persistence probes did not
improve the full trajectories and were removed. The pinned RocketSim fork
disables nearby-point replacement in `getCacheEntry`; implementing that alone
without matching insertion/refresh order did not establish manifold parity.
Earlier sections below describe the preceding revision's measurements.

## Latest arena-contact validation

Mesh-local internal-edge metadata removes the goal-ramp tick-907 ball impulse
error: exact-state velocity error falls from 20.632 to 0.000976 uu/s. Three
reference-pinned seam regressions cover the ramp and goal roof. The production
compact-data transform now retains the mesh boundary export as well.

Rounded inner-core plus spherical-margin corner queries reject the false
goal-wall contact at tick 1092. Exact-state velocity error falls from 907.856
to 0.0000102 uu/s without rejecting legitimate positive-gap contacts globally.
This remains a bounded corner-query approximation, not full box-triangle GJK.

Inverted floor contacts now use signed outer-box plane support, pre-force
restitution/friction directions, retained anchors without warm starting, and
0.1 split-turn ERP. The first roof impact is within 0.034 uu/s and 0.0042 rad/s
of RocketSim. Tick-30 velocity error falls from 21.043 to 1.774 uu/s. Full roof
recovery maximum position error improves from 36.332 to 20.863 uu, but angular
and later recovery errors remain large. This does not establish plane-manifold
parity, and the existing helper's reduction differs from Bullet's algorithm.

Validation: 45 focused tests, ten ball gates, five strict car-ball gates, editor
diagnostics and production build pass. The matching 73-case movement gate still
fails seven cases: four preset landings, roof recovery, ceiling impact and
powerslide release. The immutable ten-second bot replay still fails, with
maximum car/ball position errors 338.961/61.008 uu. References, controls and
existing gate budgets were not changed. Earlier sections record prior revisions.

## Safe-margin contact correction

The pinned RocketSim Bullet fork subtracts the initial 2 uu box margin before
calling `setSafeMargin`. Its base `setMargin` is nonvirtual and only replaces
the margin; the derived box setter that preserves outer dimensions is not
called from that base helper. Thus the effective half-extents are
`nominalHalf - 2 + min(2, minimumHalf * 0.1)`. For Octane this reduces each
full dimension by 0.13409 uu. The box inertia uses those effective dimensions.
See the pinned
[box constructor](https://raw.githubusercontent.com/mtheall/RocketSim/2da51b1dac7b8127127613a5ff30e490bdd70dd8/libsrc/bullet3-3.24/BulletCollision/CollisionShapes/btBoxShape.cpp),
[base helper](https://raw.githubusercontent.com/mtheall/RocketSim/2da51b1dac7b8127127613a5ff30e490bdd70dd8/libsrc/bullet3-3.24/BulletCollision/CollisionShapes/btConvexInternalShape.h),
and [box setter](https://raw.githubusercontent.com/mtheall/RocketSim/2da51b1dac7b8127127613a5ff30e490bdd70dd8/libsrc/bullet3-3.24/BulletCollision/CollisionShapes/btBoxShape.h).

The deferred car-ball solver now uses these inner extents and inertia. All five
coupled scenarios pass unchanged contact-specific budgets, including the three
previously failing orientation cases. Maximum ball-position error is 0.000959
uu and maximum ball-velocity error is 0.002625 uu/s across these fixtures.
A first-hit angular-response regression detects the old nominal-size error.
Shared car-arena inertia remains unchanged and is not certified by this repair.

Ball-arena contact range also uses 1.905 uu rather than 2 uu, removing a
premature floor rebound at replay tick 635; the reference rebounds at 636.
With both repairs, replay ball-velocity errors at ticks 523 and 609 are
0.099850 and 0.483729 uu/s. The first remaining car-velocity gate failure is
tick 812, a grounded car-ball touch after low-speed floor-bounce drift.
Interleaving accumulated ball-arena rows with car-ball iterations further
reduces the exact-state tick-812 ball-velocity error from about 60 to 0.260
uu/s, and car-velocity error to 0.061 uu/s. A regression includes preceding
wheel state and checks this simultaneous grounded response. The low bounces
match the reference when restored from its exact tick-636 state; their earlier
full-replay mismatch is accumulated drift, not a demonstrated restitution bug.

The complete 1,201-frame replay still fails: maximum car/ball position errors
are 329.788/68.057 uu. Worst car-position error increases, so this is not a
uniform improvement.
The first car-velocity error above 0.5 uu/s moves to tick 836. Persistent
contacts, remaining simultaneous chassis constraints and floating-point
differences remain unresolved. Full-history reference-state restoration shows
ticks 836 and 900 have local velocity errors below 0.0001 uu/s: their replay
failures are accumulated drift. A short wheel warmup falsely implicated tick
1000; preserving persistent suspension pushback reduces its local car error
from 0.825 to 0.0295 uu/s.

The largest isolated chassis error is tick 1092: the corner-based arena solver
responds at 0.864 uu positive goal-wall clearance, producing 907.856 uu/s error.
Rejecting all positive chassis clearance fixes that tick but worsens roof
recovery to 74.264 uu, so that probe was removed. Revisited chassis constraint
iterations did not measurably change these trajectories and were also removed.
The largest isolated ball error is tick 907 at the goal ramp (20.632 uu/s).
These remain open contact-generation and manifold defects, not certified fixes.
Earlier measurements below
describe prior revisions, not the current contact-suite status.

## Repeated-touch boundary correction

The tick-576 extra kick was a false positive-distance contact, not an incorrect
cooldown. Pinned Bullet's dispatcher enables relative contact-breaking thresholds:
the threshold is 0.02 times the smaller shape angular-motion disc. RocketSim's
sphere bounding-radius override adds 0.08 BT (4 uu), so the Octane/ball pair uses
1.905 uu, not the previously hardcoded 2 uu. The car disc includes its box
half-diagonal and local hitbox offset. See the pinned
[dispatcher](https://raw.githubusercontent.com/mtheall/RocketSim/2da51b1dac7b8127127613a5ff30e490bdd70dd8/libsrc/bullet3-3.24/BulletCollision/CollisionDispatch/btCollisionDispatcher.cpp)
and [shape calculation](https://raw.githubusercontent.com/mtheall/RocketSim/2da51b1dac7b8127127613a5ff30e490bdd70dd8/libsrc/bullet3-3.24/BulletCollision/CollisionShapes/btCollisionShape.cpp).

Using that shape-relative range removes the spurious third-touch follow-up.
With identical recorded controls, tick-576 ball velocity error falls from
33.576817 to 0.584802 uu/s; tick-609 error falls from 100.070946 to 2.017775 uu/s.
Tests cover acceptance at 1.904 uu, rejection at 1.906 uu, and no extra impulse
at a separating 1.95 uu gap. All 39 focused tests and the production build pass.
The coupled suite retains its same three orientation failures; all five ball
trajectories meet unchanged budgets. Later full-replay divergence remains;
this correction does not establish exact overall parity.

## Second-touch callback timing correction

The separate instrumented Skybot reference now records touch-callback positions,
velocities and ball-hit telemetry. All 1,201 trajectory frames remain numerically
identical to the original reference. At tick 523 the callback sees the car after
wheel impulses and the damped ball before gravity/solver force integration.
The ball-only extra impulse now uses that phase, while physical contact still
uses force-integrated velocities. With measured callback inputs, JS extra
velocity agrees with RocketSim within 0.00002 uu/s.

The isolated second-touch fixture previously omitted prior wheel parameters.
Initializing them from the preceding reference velocity reduces its ball velocity
error to approximately 0.0043 uu/s; its unchanged 0.5 uu/s assertion now passes
without a TODO. The unchanged-control full replay improves tick-523 velocity
error from 5.672806 to 0.319131 uu/s. The third touch now occurs on reference
tick 574 rather than 575, with ball position error 0.227262 uu at that tick.
All 38 focused physics, bot, Free Play ball and contact-manifold tests pass.

Exact parity is not established. The full replay still fails strict budgets
(maximum car/ball position errors 331.828/204.935 uu), and the existing coupled
suite remains 2/5 overall because three car-orientation errors exceed 0.05
degrees. All five coupled ball trajectories still meet their existing budgets.
No geometry, physical parameters, recorded controls or comparison budgets changed.

## Dimension audit and next movement target

Re-ran the installed RocketSim reference checks: 310 assertions pass, including
all six car hitbox sizes, offsets, wheel radii and suspension configuration, and
the 91.25 uu ball collision radius. All 8,020 arena triangles are bit-identical
to hash-verified fixtures. Twelve arena/boost tests and four car-calibration
tests pass. These results are offline reference verification, not confirmation
against a running Rocket League match.

| Surface | Checked dimensions (uu) | Evidence and limits |
| --- | --- | --- |
| Octane collision box | 120.507 x 86.6994 x 38.6591; offset 13.8757, 0, 20.755 | Installed RocketSim CarConfig; all six presets checked |
| Car artwork | Wheelbase calibration, independent tire radii | Fennec/Dominus export measurements; Octane approximate; body silhouettes are not certified |
| Ball | Collision diameter 182.5; rendered model normalized to the same diameter | Installed RocketSim radius; normalization inspected, not a fresh live asset measurement |
| Standard arena | Width 8192, length 10240, ceiling 2048 | Hash-verified collision triangles and render-scale tests |
| Goals | Width 1785.51, height 642.775, depth 880 | Local constants and collision/render fixtures |
| Boost pickup | Small/big cylinder radii 144/208, height 95; locked box radii 120/160, height 64 | Pinned reference constants and pickup behavior tests, not live boundary sweeps |
| Boost layout/artwork | 28 small + 6 big; visual radii 48/84 | All locations checked; visible discs are explicitly approximate |

The [RLBot game-data schema](https://raw.githubusercontent.com/RLBot/flatbuffers-schema/main/schema/gamedata.fbs)
exposes player hitbox dimensions/offset, ball collision shape, goal width/height,
and boost locations/types. Despite its descriptive comments, BoostPad has no
pickup radius or height fields. FieldInfo has no full arena collision mesh or
rendered asset bounds. Those require collision probes or independent mesh/asset
measurements. No RocketLeague or RLBotServer process was found during this audit;
no live packets were captured. A future live check should save GamePacket and
FieldInfo for each equipped body on a standard soccar map with default mutators,
then compare those exposed fields before performing pickup/wall boundary sweeps.

The same-input Skybot replay localizes the next movement discrepancy to the
second touch, tick 523: ball position error is only 0.081469 uu, but velocity error
rises from 0.059397 to 5.672806 uu/s. By tick 573 it produces 2.355488 uu position
error and delays the third touch by one tick. Before that third touch the car
position error remains 0.039489 uu. A new regression confirms that the unchanged
solver detects the third touch from the exact RocketSim pre-contact state.
This rules out a missing contact at that reference state, but does not certify
its impulse accuracy. Next investigate the second-touch normal/friction/extra
impulse response, not larger hitboxes or a wider contact threshold. No physics
parameters or tolerance budgets were changed in this audit.

## Further offline contact probes

Bullet 3.24 convex-plane collision begins with a supporting vertex and can add
perturbed contacts to a persistent manifold. Applying only a support vertex to
the trainer's flush-floor contact grouping worsened roof-recovery up-vector
error to 171.181011 degrees. The change was removed.

The reference's inverted initial pose has a float32 residual tilt of roughly
8.742e-8. Tightening the corner depth-tie threshold from 1e-5 to 1e-7 did not
resolve that contact: roof up-vector error worsened to 163.213973 degrees.
This change was also removed. Original 66/73 movement results were restored.

Version-matched vehicle source confirms wheel extra pushback is divided by total
wheel count, not contacting wheel count, and the unilateral impulse formula
already matches the trainer. Those suspected discrepancies were ruled out.
Exact-reference-pose replay still shows the first Dominus two-wheel landing
angular response discrepancy, so accumulated pose drift alone is insufficient.

No solver improvement was retained from this pass. A support vertex, contact
margin, perturbation, manifold reduction and persistence must be validated as a
coherent contact-generation model rather than tuning these components separately.

## Offline first-divergence isolation

`node tools/physics-compare/first-divergence.mjs <scenario>` validates fixture
compatibility and reports the first tick exceeding 0.5 uu/s velocity-vector
error or 0.01 rad/s angular-velocity-vector error, with nearby frames.
These diagnostic thresholds do not replace or relax existing regression budgets.

| Scenario | First diagnostic tick | Velocity error (uu/s) | Angular velocity error (rad/s) |
| --- | ---: | ---: | ---: |
| Roof recovery | 28 | 239.362086 | 2.076086 |
| Dominus landing | 59 | 0.000525 | 0.014701 |
| Plank landing | 62 | 1.486208 | 0.005322 |
| Breakout landing | 62 | 1.267728 | 0.001513 |
| Hybrid landing | 63 | 0.583926 | 0.003156 |
| Ceiling impact | 38 | 0.475583 | 0.011812 |
| Powerslide release | 247 | 0.516746 | 0.000659 |

At roof tick 28, reference vertical velocity is -204.691895 uu/s while JS is
+34.254987 uu/s. At tick 27 both are approximately -246.25 uu/s. Divergence begins
at first chassis contact, before the recovery jump at tick 60. This localizes the
problem to contact generation/response rather than aerial torque or jump force.

Two offline probes were rejected and removed:

- Using pre-force impact velocities for all contact restitution regressed the
   previously passing floor-scrape flip to 4.914703 uu maximum position error.
- Applying Bullet's split-turn ERP of 0.1 to all contact directions regressed that
   flip to 1.927181 uu and roof recovery to 38.050335 uu. The existing contact
   approximation depends on its current correction behavior; changing scaling
   alone is not a complete Bullet manifold implementation.

After removal, the original 66/73 movement gate results were restored. This pass
adds reproducible diagnostics, not a retained solver improvement or parity claim.

## Contact probe and camera correction: 2026-09-30

A flush-floor multi-point contact probe worsened roof-recovery up-vector error
from 13.374739 to 169.356005 degrees. It was removed; rerunning all 73 movement
cases restored the original errors. A complete persistent-manifold solution
remains unresolved. No tolerances were changed.

Camera Swivel Speed no longer scales the maximum swivel angle. It scales the
approach rate while preserving the former default yaw/pitch range. Exponential
approach/return smoothing makes swivel state frame-rate independent. Tests check
equal endpoints at speed 1 and 10, faster approach at speed 10, and equivalent
state at 30 and 120 FPS. These tests establish internal consistency, not exact
Rocket League timing or limits; synchronized live-game recordings are still
needed to calibrate those values.

## Additional movement coverage check: 2026-09-30

Expanded the reference suite from 69 to 73 scenarios. Sustained forward-flip
cancellation at 1800 uu/s, partial cancellation, opposing-yaw/roll stall, and
neutral jump from an airborne flip-reset state all pass unchanged trajectory
budgets against fresh RocketSim 2.2.1 references. Overall movement is 66/73;
the existing seven contact/landing failures remain.

The older `flip_forward_cancel` scenario only holds cancellation through tick
45, then releases it while dodge torque remains active. Its final spin is not
evidence that sustained flip cancellation was tested. The new sustained case
holds opposing pitch through tick 90.

Additional gaps identified, not resolved or certified:

- Gamepad snapshots are polled per render frame, not independently at 120 Hz.
   Catch-up steps replay one snapshot; fast directional changes are not reconstructed.
- Fixed keyboard/mouse jump taps lost between render frames: Free Play now
   consumes queued press/release transitions on physics ticks, including two
   rapid taps. Blur, car reset and mode exit clear pending transitions.
   This preserves edges but does not reconstruct their original timestamps or
   the pitch/yaw state at each edge. Other modes still read held input directly.
- The controller deadzone is independently remapped on each axis, followed by
   sensitivity and clamping. Current-game diagonal deadzone behavior and whether
   dodge selection uses pre-sensitivity input have not been independently measured.
- Fixed shared camera/driving deadzone: Camera Swivel Deadzone is independently
   configurable and defaults to 0.10, matching the local INI free-look threshold.
- Acquiring a flip reset through actual wheel-ball contact is not covered by the
   new preset-state test. Chained wavedashes, speedflips, half-flip recovery,
   wall/ceiling resets, rapid boost taps and post/corner pinches need dedicated
   contact-rich fixtures and live-game recordings.
- Car-car OBB overlap tests omit the nine edge cross-product SAT axes and the
   response lacks full angular contact resolution. This does not affect the
   current single-car Free Play mode but is not complete multi-car parity.

No physics parameters were tuned to force these added scenarios to pass.

## Fresh Windows reference audit: 2026-09-30

Installed RocketSim 2.2.1 and NumPy in the isolated project `.venv`, verified all
16 hash-pinned soccar fixtures, and regenerated movement, ball and contact
references. No tolerance budgets were changed.

- Movement: 62/69 scenarios pass. Failures: Dominus, Plank, Breakout and Hybrid
   landings; roof recovery; ceiling impact; powerslide release.
- Roof recovery: maximum position error 36.332240 uu, velocity error 277.917403
   uu/s, up-vector error 13.374739 degrees. This remains unresolved.
- Ceiling impact: maximum position error 0.349082 uu and forward-vector error
   0.512466 degrees in this fresh audit. Earlier larger figures below are historical.
- Coupled contacts: 2/5 scenarios pass overall. All five ball trajectories pass;
   nose, offset and spinning-ball car orientation remain above the 0.05-degree
   budget (maximum 0.108465 degrees).
- Isolated ball: 10/10 pass. Goal-ramp maximum position error 0.155 uu and
   velocity error 3.741 uu/s; other position errors are around 0.001 uu or less.
- Orientation signs: 13/13 pass. Aerial formula/mapping checks: 18/18 pass.
- Scalar/config parity checks, including live reference values, pass.

Fixed a separate browser slowdown: the render loop formerly discarded elapsed
time beyond 50 ms, limiting physics to 90 ticks/second at 15 render FPS. It now
uses the fixed-step clock's existing 100 ms catch-up budget. A regression compares
high-speed boosted combined-axis trajectories at 15 and 120 render FPS.
Stalls beyond 100 ms still discard time; input remains sampled per render frame.

This is a bounded audit of the existing scenarios, not every possible variable,
mechanic or current-game behavior. Persistent chassis contact manifolds,
high-speed sweeps, device input processing, camera response and live-game
Free Play command values are not certified. RocketSim itself is not identical
to the proprietary current Rocket League build.

## Free Play ball controls

[Psyonix v2.06 patch notes](https://www.rocketleague.com/en/news/patch-notes-v2-06)
establish Take Possession (in front), Start Dribble (on hood), Pass Ball (toward
car), Launch Ball (Hoops-like pop), and Defend Shot (toward nearest goal).
These descriptions do not provide numerical speeds, offsets, aim prediction,
or randomness. The trainer uses deterministic placement and discrete trajectory aiming
with explicitly chosen speeds of 1500/1800/2000 uu/s for pass/pop/shot.
Passes predict the car's horizontal position at arrival; passes and shots account
for the simulation's per-tick exponential damping and gravity. A minimum flight
time prevents close passes from spiking downwards. Stationary dribble placement
includes a small nonzero vertical velocity so the ball falls into hood contact
instead of triggering the simulator's exact-zero-velocity sleep rule.
These are functional approximations, not measured exact Rocket League behavior.
RocketSim supplies subsequent physics, not these game-side Free Play commands.
Keyboard 1–5 and gamepad down/up/left/right/L1 match the local Rocket League
control-preset INI. Ball Reset is separately bindable and unbound by default.
Commands fire on press edges in Free Play only; they can share gameplay bindings.

## Browser control settings

Controller steering and aerial sensitivity are independent gains applied to the
existing deadzone-processed stick axes and clamped to [-1, 1]. They do not change
keyboard input, throttle, directional air-roll buttons, or camera swivel.
This is a frontend implementation, not certified current Rocket League input parity:
RocketSim consumes normalized controls and does not implement the game's UI,
device input processing, vibration, or mouse sensitivity.

The configured dodge threshold is passed into the existing car simulation each
Free Play physics tick. [RocketSim Car.cpp](https://github.com/ZealanL/RocketSim/blob/master/src/Sim/Car/Car.cpp)
uses `abs(yaw) + abs(pitch) + abs(roll) >= config.dodgeDeadzone`.
Unit coverage checks below-threshold, exact-threshold, negative diagonal, and
roll-only inputs. This source confirms the decision rule, not exact controller
stick processing in the proprietary game.

Mouse sensitivity, keyboard acceleration/aerial safety, vibration intensity and
rumble activation buffer are not implemented. Their precise game-side behavior
needs independent measurements; RocketSim alone cannot establish it. Trainer
modes also lack Rumble pickups and associated activation state.

Checked 2026-09-30. These are actual source/research pages, not inferred citations.
None certifies exact equivalence to the current proprietary Rocket League build.

## Executable reference and source version

- [PyPI RocketSim 2.2.1 metadata](https://pypi.org/pypi/RocketSim/2.2.1/json):
  published distribution, non-yanked version, owners `mtheall` and `VirxEC`.
  Its description explicitly says RocketSim is **not perfectly accurate**.
- [Binding release tags](https://api.github.com/repos/mtheall/RocketSim/tags):
  v2.2.1 points to `2da51b1dac7b8127127613a5ff30e490bdd70dd8`.
  Source links below use that immutable revision, not today's upstream HEAD.
- Generated references record the installed distribution version and SHA-256
  of its loaded module. The release-tag source relationship is provenance,
  not a claim of a reproducible binary build from that commit.

## Sources checked and what they establish

1. [BoostPadGrid.cpp](https://github.com/mtheall/RocketSim/blob/2da51b1dac7b8127127613a5ff30e490bdd70dd8/src/Sim/BoostPad/BoostPadGrid/BoostPadGrid.cpp)
   skips demoed/full-boost/high cars before pad contact queries.
   **Verified in the installed engine:** a car at 100 boost leaves the pad
   active; JS previously consumed it. Fix reduces wall-jump boost error from
   0.277778 to 0.000151, and removes its relaxed boost tolerance.
2. [Ball.cpp](https://github.com/mtheall/RocketSim/blob/2da51b1dac7b8127127613a5ff30e490bdd70dd8/src/Sim/Ball/Ball.cpp)
   applies extra hit velocity through a cache at the end of the physics tick;
   cooldown is tracked in the hitting car's hit information.
3. [Arena.cpp](https://github.com/mtheall/RocketSim/blob/2da51b1dac7b8127127613a5ff30e490bdd70dd8/src/Sim/Arena/Arena.cpp)
   establishes pre-tick forces → Bullet world step → car/pad post-tick updates
   → ball finalization. Existing browser car-ball contact runs *after* separate
   body integration, and does not reproduce this coupled world step.
4. [Sphere–box collision](https://github.com/mtheall/RocketSim/blob/2da51b1dac7b8127127613a5ff30e490bdd70dd8/libsrc/bullet3-3.24/BulletCollision/CollisionDispatch/btSphereBoxCollisionAlgorithm.cpp)
   uses box inner extents plus collision margin and persistent contacts.
   A plain sharp-corner OBB clamp is not identical at edges.
5. [smish: ball simulation 3](https://www.smish.dev/rocket_league/ball_simulation_3/)
   reports a collaboration with Nevercast/tarehart and examples from actual game
   data collected with BakkesMod. Supports inelastic/friction engine impulse
   plus a separate ball-only Psyonix impulse. Reported errors are approximately
   0.1–3%; explicitly **not suitable for wheel hits or pinches**.

The RLBot useful-game-values page did not return extractable content in this
check. Existing local constants were validated against the executable reference;
do not attribute new assertions to an unreadable wiki page.

## Current coupled-contact evidence

`npm run physics:contact` creates five fresh reference trajectories: nose hit,
offset hit, roof hit, spinning ball, and ground approach. It records both car
and ball states with identical inputs and strictly fails on divergence.

The suite **currently fails**; this is deliberate, not a passing certification.
The old `contact_nose` implementation changed velocity at recorded tick12;
RocketSim first responds at tick13. The coupled step now matches tick13 and
defers the ball-only extra velocity until after transform integration. It also
tracks extra-hit cooldown per car and splits penetration correction by mass.
Offset/spin/ground cases retain impulse, margin, and persistent-solver gaps.
No thresholds were enlarged to make them pass.

Measured maximum ball errors before → after the first coupled-step correction:

| Case | Position (uu) | Velocity (uu/s) |
|---|---:|---:|
| Nose | 7.03 → 2.10 | 1442 → 5.71 |
| Offset | 22.64 → 21.73 | 1308 → 54.65 |
| Roof | 6.78 → 3.86 | 1174 → 9.45 |
| Spin | 11.55 → 7.29 | 1441 → 18.25 |
| Ground | 10.65 → 3.44 | 1947 → 6.68 |

## Next implementation boundary

Second coupled-contact pass: rounded box collision uses Bullet's safe margin
`min(2 uu, 0.1 * minimum half-extent)`, not a sharp box. Normal and one fixed
pre-solve tangent are solved with ten accumulated sequential iterations.
Split position correction uses angular inertia and continues while separating
but overlapping. Extra impulse direction uses pre-correction relative position.

All five ball trajectories now meet the original strict ball limits: maximum
position error **0.1511 uu**, velocity error **0.2583 uu/s**, and angular-speed
vector error below **0.01 rad/s**. Overall `physics:contact` still fails on car
orientation residuals (approximately 0.06–0.11 degrees vs 0.05-degree target).
No target tolerances were changed. Full manifold warm-starting and simultaneous
ground/car/ball contact iteration remain incomplete.

Refactor the world step into force updates, pre-transform contact generation,
coupled impulse solve, transform integration, and deferred extra-hit finalization.
Preserve existing car-only and ball-only accuracy while adding sphere-box margin,
per-car extra-hit cooldown, and persistent friction/contact handling. Online
research narrows the model; executable comparisons verify each implemented rule.

Existing research cannot prove unchanged current-game wheel hits, pinches,
camera behavior, or device latency. Those remain unverified without independent
current-game measurements; that limitation is not removed by matching RocketSim.

## Movement and visual verification

The car reference suite now contains 69 scenarios, including reverse driving,
reverse steering, boost depletion, reverse aerial throttle, forward flip cancel,
diagonal flip, powerslide release, all six hitbox jumps, airborne landings,
speed/spin caps, minimum boost duration, double jump, and explicit eligible/
expired dodge-window states. With unchanged limits, 62 pass. Roof recovery,
ceiling impact, four non-Octane landings, and powerslide release fail. The
powerslide-release case fails: maximum position error 1.024383 uu, velocity
error 1.970244 uu/s, angular-velocity error 0.010899 rad/s, and forward-angle
error 0.133632 degrees. Reference-pose single-tick replay also shows horizontal
velocity residuals during the slide; accumulation alone does not explain it.
Float32 handbrake and curve-interpolation probes did not resolve it and were
removed. Its cause remains unresolved.

The version-matched `btVehicleRL.h` initializes lateral/longitudinal wheel
friction coefficients to zero. JS previously initialized them to one, applying
uninitialized friction on first airborne contact before `_UpdateWheels` updated
the coefficients. Matching zero defaults removes the measured Octane landing
error. Boost timer float32 accumulation removes an extra minimum-boost tick.
Both corrections have passing focused unit tests.

Roof/ceiling first-impact response remains substantially wrong: position errors
reach 36.33/120.77 uu and orientation errors 13.37/22.89 degrees. The current
corner-distance/centroid contact approximation is not Bullet triangle contact
generation with persistent manifolds. Retaining separate box-corner face
constraints worsened recovery and was removed. No tolerances were enlarged.

[Bullet transform integration](https://github.com/mtheall/RocketSim/blob/2da51b1dac7b8127127613a5ff30e490bdd70dd8/libsrc/bullet3-3.24/LinearMath/btTransformUtil.h)
and split-impulse ordering establish separate penetration and ordinary angular
integration. Arena correction now rotates the car before its ordinary angular
step. The movement and five coupled-contact gates retain the same failures;
this change is not evidence that those discrepancies are resolved.

Latest checks: 33 unit tests and 13 orientation-sign checks pass, all 10 ball
scenarios pass, all 8,020 soccar
triangles match the hash-verified reference vertices, dimension/parity assertions
pass, and production build succeeds with existing dependency/CSS/chunk warnings.
Browser inspection of the loaded Octane confirms four wheel pivots rotate with
forward travel and reverse with backward travel. Aerial drill roll direction
and procedural wheel-distance scaling have dedicated unit coverage. Other
loaded bodies, recoveries, wheel hits, and pinches still require broader checks.