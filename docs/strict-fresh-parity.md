# Fresh Strict RocketSim Baseline

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