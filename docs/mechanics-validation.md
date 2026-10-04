# Mechanics validation ledger

Verified locally on 2026-10-03 against cached native RocketSim 2.2.1 recordings,
using the production SSE-compatible WASM build. These are finite regression
fixtures, not an exhaustive mechanic percentage or proof of exact Rocket League
physics. The vendor engine and cached references were not changed.

## Current practical parity limits

On 2026-10-03, the user authorized relaxing numerical trajectory thresholds.
The runtime parity suite now shares these tenfold-relaxed absolute limits:

| Quantity | Previous limit | Current limit |
| --- | ---: | ---: |
| Position vector distance | 0.05 UU | 0.5 UU |
| Velocity vector distance | 0.05 UU/s | 0.5 UU/s |
| Angular velocity vector distance | 0.0001 rad/s | 0.001 rad/s |
| Orientation basis vector distance | 0.0001 | 0.001 |
| Boost | 0.001 | 0.01 |
| Compared timers | 0.00003 s | 0.0003 s |

This is a practical regression budget, not a statistically calibrated accuracy
guarantee. Timer tolerance remains below one 120 Hz tick. Boolean flags, wheel
contacts, state-seeding counts, and maneuver-success requirements remain exact
or retain their existing behavioral thresholds. Native references and physics
implementation are unchanged; first float differences and maximum errors are
still reported. Historical sections below describe the older strict gates.

At the 60-second horizon, the Octane gate passes 33/33 trajectories over
237,600 ticks. Maximum car errors remain 0.00805819 UU position,
0.00453916 UU/s velocity and 0.000117043 rad/s angular velocity. The previously
failing wall trajectory has not become numerically identical: its first basis
difference is still tick 5926. Octane lifecycle parity passes 19/19 fixtures
over 14,400 ticks, and all five cached coupled-contact fixtures pass.

## Two-minute Octane audit: unresolved failures

On 2026-10-04, the production WASM was compared with fresh native MSVC SSE
output over 33 Octane trajectories of 14,400 ticks each (475,200 total ticks).
Only 30/33 trajectories pass the same practical limits. No thresholds were
raised further and neither body was reseeded after initialization.

| Seed | Scenario | First basis difference | First limit failure |
| ---: | --- | ---: | ---: |
| 12345 | 12: wall | 5926 | 7984 |
| 987654321 | 6: aerial | 8861 | 10266 |
| 987654321 | 36: descending wall | 9698 | 10867 |

The wall trajectory also fails the newly added world-contact-normal check at
tick 7984. Maximum car divergence across the complete runs reaches 5714.6445 UU
position, 1666.0214 UU/s velocity and 10.9567 rad/s angular velocity; discrete
state and boost also diverge later. Ball position error remains below 0.000008 UU.
These results cannot be described as universal parity or harmless rounding.
The cause of the initial orientation difference remains unresolved.

Fresh stress comparisons now additionally check jumping, total airtime,
flip-relative torque, boosting state/time, supersonic state/time, handbrake,
auto-flip state/timer/torque, previous jump, world contact/normal, demolition
state/timer, and current-tick ball-hit events against native output.
Discrete flags and events remain exact. This is expanded exposed-state coverage,
not every internal Bullet solver value.

A deterministic 65,536-sample off-grid native cosine regression passes with
zero differences against the compatibility formula. The existing 8,193-sample
sine regression also passes. Neither check establishes the cause of long-run
trajectory divergence; no speculative math shim was added.

The discover-all task runs 23 test files under tools. The final repository audit
reports 272/274 passing, including the Octane-filtered production runtime suite.
The two separate non-parity failures are the curriculum count assertion
(17 actual versus 15 expected) and the drill test's unsupported Node CSS import.
Those unrelated implementations were not changed. Production Vite build passes
with its existing large-chunk warning. Actual Rocket League fidelity remains
uncertified by these native-versus-WASM tests.

## Recording coverage

| Gate | Recordings | Evidence |
| --- | ---: | --- |
| Isolated car mechanics | 73 | Per-tick motion, orientation, grounding, boost and airtime |
| Longer movement sequences | 6 | Straight boost/brake, slalom, powerslide/reverse, jump/dodge, aerial/landing and goal-roof recovery |
| Original ball cases | 10 | Per-tick position, velocity and spin |
| Coupled contact cases | 5 | Nose, side offset, roof, spinning ball and grounded approach; both bodies, car orientation, grounding, boost and airtime |
| Car parameter sweeps | 228 | Six hitboxes; steering at five speeds, signed partial aerial inputs, four boost amounts, four jump-hold durations, and three contact speeds at three offsets |
| Ball surface sweeps | 18 | Floor, wall and ceiling impacts at three speeds, with and without spin |
| Total | 340 | All recording gates passed |

The car sweeps compare 39,420 ticks; ball surface sweeps compare 2,160 ticks.
Published car flags, jump/flip/airtime/boost/recovery timers and all four wheel
contact booleans are checked in the car sweeps. Ordinary ticks must not invoke
the native car state setter after the initial recorded tick in car trajectory,
coupled-contact and car-sweep gates.

At the time of this historical recording gate, position and velocity limits
were 0.05 UU and 0.05 UU/s. Angular velocity and orientation-basis distance
limits were 0.0001. Boost used 0.001; airtime and compared timers used
0.00003 seconds. Boolean states matched exactly.
Maximum errors across the 79 movement recordings were zero for position,
velocity and angular velocity, and 0.000000302 basis distance after published
quaternion conversion. Boost and airtime matched exactly. These maxima do not describe
the separate contact or parameter-sweep gates.

## Runtime checks

### Deterministic native/WASM stress comparison

On 2026-10-03, `Verify deterministic native WASM parity` compared 18 fresh
native MSVC SSE scenarios with production WASM: all six hitboxes, each starting
on the ground, airborne, or near a wall. A shared integer PRNG supplies identical
quarter-step analog inputs and jump/boost/handbrake transitions every 12 ticks.
Each scenario runs 600 ticks without car or ball reseeding after initialization.
All 10,800 ticks were visited. Motion, orientation, boost, wheel contacts,
jump/flip flags and three timers are compared under the unchanged limits.

All 18 scenarios now pass. The initial run passed six and failed twelve;
two verified numerical differences explained the failures:

- Native Bullet selected its SSE4.1/FMA3 constraint solver, while WASM selected
  SSE2. The WASM compatibility header now enables the same existing solver path
  and supplies fused float multiply-add semantics. Native dispatch is unchanged.
- Native UCRT `cosf` uses float intermediate rounding for tiny angles, unlike
  WASM libm. At angle 0.00653732940555, native returned 0.999978601933 and WASM
  returned 0.999978661537. This first affected Plank orientation at tick 247,
  later exceeding the angular-velocity limit at tick 425. Below absolute angle
  1/128, the compatibility shim evaluates float-rounded `1 - x*x/2`; larger
  angles explicitly evaluate double cosine and cast to float. The native cosine
  regression checks all 8,193 nonnegative samples from zero through 1/64.

Raw engine basis and published orientation are both checked. The full runtime
suite passes 18 of 18 tests, including all 340 cached recordings, and the
production app builds successfully. Temporary engine diagnostic logging was
removed. No native baseline, vendor code, tolerance or state-reseeding policy
was changed. This is finite native-build parity evidence, not universal bitwise
identity or proof of Rocket League fidelity. SSE dispatch and reciprocal-square-
root estimates remain specific to the measured native CPU/build. Rebuild the
probe with `Build native flip reset probe` before running this task.

### Extended stress gate: all trajectories passing

`Extended native WASM parity` runs 42 contact starts across three seeds for
1,800 ticks each: 126 trajectories and 226,800 compared ticks. Starts cover all
six hitboxes on ground, airborne, near walls, corners, goal posts, ceilings and
wall-floor transitions. Results include per-field maxima and first float
differences, without relaxing limits or repeatedly resetting either body.

The measured result is 126/126 passing. Four initial contact failures were
resolved by matching native `atan2f` rounding through double `atan2` followed by
a float cast. Mesh-edge contact normals had differed by one float step before
the fix. Native dispatch, vendor code and references remain unchanged.

The formerly failing Plank airborne trajectory (seed 987654321, scenario 8) first
differs in raw orientation at zero-based tick 541. At angle 0.00903323385864,
native cosine is 0.999959170818 versus WASM 0.999959230423; sine matches.
Angular-velocity error reaches 0.0001619849142 rad/s, exceeding the unchanged
0.0001 limit at tick 1645. Three polynomial experiments did not match native
samples and were discarded; the validated below-1/128 branch is unchanged.
An explicit double cosine overload followed by a float cast above the cutoff
resolves this mismatch. All 8,193 native cosine samples and the extended gate
pass. Maximum extended car position error is 0.000008391 UU; angular velocity
error is 0.000000008495 rad/s. Neither tolerances nor native behavior changed.

### Fresh multi-car and control-sequence gate

### Octane long-run gate: one numerical failure

`Octane long randomized parity` now selects eleven Octane starts across three
seeds for 7,200 ticks each (60 seconds): 33 trajectories and 237,600 compared
ticks. The latest result is **32/33 passing**, not complete parity. Seed 12345,
scenario 12 (wall approach), first differs in raw orientation at tick 5926 and
first exceeds the angular-velocity limit at tick 6394. The error there is
0.0001065411 rad/s against the unchanged 0.0001 limit; maximum angular error
is 0.0001170434 rad/s. Maximum position and velocity errors are 0.0080582 UU
and 0.0045392 UU/s, within their limits. Flags and wheel contacts match.

`Octane wall long parity reproducer` runs that single seed/start for 7,200
ticks and reproduces the same failure. Its numerical root cause remains open;
no production engine code, native baseline or tolerance was changed.

New starts exercise 2299/2301 UU/s, 0.01/0 boost, a grazing ball offset and an
already-airborne expired dodge. Speed-cap and first-tick boost-depletion
assertions pass; the press after expiry does not dodge. Grazing-contact parity
passes but contact occurrence is not yet asserted. These do not cover every
jump-window boundary, demolition threshold or arena seam.

### Earlier multi-car evidence

`Verify native lifecycle parity` generates 60 fresh native trajectories:
ten cases for each of the six hitboxes, totaling 47,520 world ticks. All pass.
Cases cover physical bumps, opponent supersonic demolition, seeded demolition
countdown, small and large boost-pad collection/reactivation, forward dodge to
landing, diagonal dodge/cancel to landing, backflip/cancel/roll to landing,
airborne boost to landing, and same-team supersonic contact without demolition.

Both cars' raw motion/basis, boost, grounding, wheel contacts, jump/flip flags
and timers are compared each tick. Ball motion and spin are also compared.
Inputs come directly from the fresh native trace. Each car is seeded exactly
once. Bump cases must accelerate the target, maneuver cases must become airborne
and land (and dodge when commanded), and pad cases must collect and reactivate.
These cancel traces do not establish a correctly executed speedflip or half-flip.

Demolition flags and countdowns match exactly within timer limits. At respawn,
both engines independently satisfy the allowed orange-team spawn set, height,
orientation and spawn boost. Automatic respawn uses independent random choices;
the respawned car's motion comparison stops there rather than pretending the
random spawn positions are paired. Other bodies continue to be compared.

Actual wheel-on-ball reset acquisition is now gated with two fresh same-source
MSVC SSE native probe trajectories, 90 ticks each. An upside-down car begins
with its jump/flip spent and its flip window expired. All four wheels contact
the airborne ball, restoring availability; a jump from the ball, release, and
later directional press produce an airborne dodge. The no-ball control neither
acquires availability nor dodges. Car/ball motion, orientation, wheel contacts
and jump/flip flags match production WASM under the existing limits, without
reseeding after the first tick. This establishes that reset acquisition works;
it is not a complete aerial approach/reset/immediate-dodge maneuver.

Build the native probe with `Build native flip reset probe`, then run
`Verify actual flip reset acquisition`. This gate requires the local Windows
MSVC SSE executable in addition to the WASM artifacts. It generates its native
reference afresh, rather than adding to the 340 cached-recording count.

The same runtime test file also exercises shared two-car stepping and bumps,
rendered aerial orientation, held-jump continuity, six hitbox presets, world
isolation, external resets, repeated coupled resets, prediction-world disposal,
ball detachment/reattachment and boost pickup. These are behavioral checks, not
additional native trajectory recordings.

The broader repository audit before the expanded gates passed 293 of 294 tests.
The remaining failure was the existing catalog expectation of 15 entries versus
17 actual entries. Tests using the unconfigured legacy JavaScript simulator do
not establish production WASM parity.

## Not Yet Established

### Advanced maneuver expansion in progress

Current validation scope is Octane only. `Verify native lifecycle parity`
sets `ROCKETSIM_MANEUVER_HITBOX=octane` and clears the single-case filter.
The focused gate passes all 19 Octane scenarios (14,400 compared ticks),
including the ten lifecycle cases and all nine advanced fixtures, under
unchanged native/WASM limits. Other hitboxes remain available in the probe
but are deferred; this selection does not change gameplay hitboxes.

Stronger Octane checks now also pass: half-flip cancel/roll/drive-away;
ceiling four-wheel restoration at tick 34, separation at 64 and dodge at 121;
35 pre-dodge flick carry ticks and a 743.7687 UU/s upward contact;
at least 60 nearby airborne ticks in the first 240 ticks of air-dribble with
contacts separated by at least 24 ticks; and a goal-backboard rebound followed
by a second airborne touch. This establishes a backboard touch sequence, not
a guaranteed scored goal.

The old pinch criterion was a false positive: its maximum speed occurred
inward before the wall rebound; outward speed was only 1848.5 UU/s. Octane's
repaired angled wall approach now yields 2510.1433 UU/s outward within 40 ticks
of near-wall contact, passing the unchanged 2000 UU/s success threshold.
Other hitbox pinch fixtures retain their previous setup.

The lifecycle probe now defines nine additional maneuver fixtures for each
hitbox (54 proposed cases, 114 total). This expanded gate is not passing yet;
the 18/18 runtime result above describes the earlier 60-case version.

Individual Octane checks passed for half-flip, speedflip, wavedash, ceiling
reset, dribble, air-dribble, goal-backboard double-tap and pinch under the unchanged
native/WASM limits. Half-flip and speedflip require 18 consecutive upright,
aligned ground ticks while driving in the intended direction. Ball-contact
timestamps use the verified zero-based native tick convention; double-tap
requires an airborne second touch after a wall rebound.

The state-driven flick fixture now passes for all six hitboxes (4,320 compared
ticks). It starts a jump after 30 consecutive valid carry ticks, releases jump,
and triggers a backflip while the airborne ball remains within reach. The
contact measurement window follows the actual dodge transition rather than a
fixed tick. Upward ball-contact velocities range from 743.366 to 866.297 UU/s,
above the unchanged 400 UU/s success threshold. Each car is seeded once.

The full expanded run passes cases 0 through 93, then fails case 94: Breakout's
side-wall double-tap does not obtain its required second airborne touch.
This is a fixture outcome failure, not an observed native/WASM mismatch.
All-six-hitbox success for every maneuver is not established.
Further causal checks are still needed for speedflip gain against a boost-only
counterfactual and complete aerial ball-reset approach. Deferred hitboxes still
use the side-wall double-tap fixture. Passing these checks alone does not
establish every complete maneuver.

Actual Rocket League fidelity remains unverified. The existing straight-drive
capture report is explicitly uncertified and includes sampling gaps around
312 ms; older airborne comparison tools use handwritten JavaScript physics,
not production WASM. No fresh native-game physics capture was performed during
the concurrent camera capture workflow.

- Complete aerial flip-reset approach and immediate airborne dodge after
  separation. The new acquisition gate jumps from wheel contact before dodging;
  the older `flip_reset_jump` fixture only starts with restored availability.
- Dedicated complete wavedash, speedflip, half-flip, ceiling-reset, dribble,
  flick, air-dribble, double-tap and pinch trajectories. Component motions or
  trainer behavior are not equivalent to native evidence for those sequences.
- Exact demolition threshold boundaries, alternate team/demo mutators and all
  multi-car collision edge cases. Standard opponent demos, same-team non-demos,
  respawn countdowns/spawn validity and both pad cooldowns now have fresh gates.
- Every arena seam, corner, goal contact, mutator, timestep or map. Current
  recordings use standard SOCCAR/THE_VOID at 120 Hz.
- Complete internal-state serialization: ball-hit metadata, contact IDs, engine
  counters and other unpublished state are outside these gates.
- Every drill/bot lifecycle, sustained rendering performance on other hardware,
  and live Rocket League parity. Those require separate workflow, performance
  and native-game captures.

## Reproduce

Run the VS Code task `RocketSim production runtime verification`, or:

```sh
node --test tools/rocketsim-wasm/runtime.test.mjs
```

Focused tasks are `RocketSim coupled mechanics verification` and
`RocketSim all expanded mechanics verification`. The pinned WASM build, 16
hashed local meshes, and cached reference directories under
`tools/physics-compare/out/` must exist; these assets are ignored and are not
provided by `npm install`. Missing references fail the gates rather than skip
coverage. Ground preparation mirrors recorded suspension settling; VOID/SOCCAR
selection must survive fresh-state restoration.

The reciprocal-square-root compatibility table matches the reference CPU's
estimates, not every possible native CPU. Mesh redistribution permission remains
unresolved; do not publish the local production assets without resolving it.