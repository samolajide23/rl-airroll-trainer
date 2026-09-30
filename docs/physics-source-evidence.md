# Physics source evidence

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