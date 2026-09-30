# Physics source evidence

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