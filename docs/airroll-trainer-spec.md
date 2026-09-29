# Air Roll Trainer: Full Setup

Goal: a browser trainer that teaches car control from ground fundamentals to air roll to air dribbles, using physics close enough to Rocket League that the skills transfer.

Status tags used throughout:
- **[V]** verified against a published source (links at the bottom)
- **[A]** approximation or from memory. Must be validated before you rely on it.
- **[D]** derived by me from verified numbers (a prediction of the model, not a published fact)

`rl-physics.js` implements everything in sections 2 to 6.

---

## 1. Principles

1. **Fixed 120 Hz physics** [V]. The game simulates at 120 ticks/s. Step the sim at exactly that rate and interpolate for rendering.
2. **Work in Unreal units (uu), 1 uu = 1 cm** [V]. Convert to render units only at the last step (`applyToCarModel`, default scale 0.01, so 1 three-unit = 1 m).
3. **Physics is the product.** If the sim is wrong, players learn wrong habits. Every constant is tagged, and section 9 lists how to validate.
4. **Z is up** in physics. Car local axes: x = front, y = left, z = up.

---

## 2. Car constants

| Quantity | Value | Tag |
|---|---|---|
| Gravity | 650 uu/s² | V |
| Max speed | 2300 uu/s | V |
| Supersonic threshold | 2200 uu/s | V |
| Max drive speed, no boost | 1410 uu/s | V |
| Max angular velocity | 5.5 rad/s | V |
| Mass (arbitrary unit) | 180 | V |
| Octane hitbox (L x W x H) | 118.0074 x 84.1994 x 36.1591 | V |
| Hitbox offset from car origin (front, left, up) | (13.876, 0, 20.755) | A |
| Resting centre height (Octane) | 17.01 | V |

### Ground movement
| Rule | Value | Tag |
|---|---|---|
| Braking (throttle opposes velocity) | 3500 uu/s² | V |
| Coasting (throttle ≈ 0) | 525 uu/s² | V |
| Throttle accel | speed dependent, 0 at 1410 | V (shape) |
| Throttle accel numbers | about 1600 at rest, falling to about 160 at 1400 | A |
| Boost on ground | +991.667 uu/s² (throttle forced to 1) | V |
| Turning | curvature is piecewise linear in speed (see `curvature()`), proportional to steer input | V |

Turning curvature (1/uu) by forward speed v:

| v range | curvature |
|---|---|
| 0–500 | 0.006900 − 5.84e-6·v |
| 500–1000 | 0.005610 − 3.26e-6·v |
| 1000–1500 | 0.004300 − 1.95e-6·v |
| 1500–1750 | 0.003025 − 1.1e-6·v |
| 1750–2500 | 0.001800 − 4e-7·v |

Simplifications in the prototype: flat floor, perfect lateral grip, no powerslide, no wall driving. Fine for air roll drills, but ground drills (powerslide turns, wavedashes) need a proper suspension/grip model later.

### Jumping
| Rule | Value | Tag |
|---|---|---|
| First-jump impulse | +292 uu/s along the roof | V |
| Hold bonus | +1460 uu/s² along the roof for up to 0.2 s (minimum 3 ticks) | V |
| Sticky force after leaving ground | 325 uu/s² down-relative, first 3 ticks | V |
| Second jump (no flip) | +292 uu/s along the roof | V |
| Second-jump window | 1.25 s after jump (+ up to 0.2 s if the first jump was held) | V |
| Flip / dodge impulses and torques | not implemented | – |

Prototype checks: tap jump peaks at about 94 uu, full-hold jump at about 242 uu (centre height).

### Air control (the core of the trainer)
RocketSim `CAR_AIR_CONTROL_{TORQUE,DAMPING} * CAR_TORQUE_SCALE` (same shape as the smish.dev fit). Local axes are **forward / right / up**. Angular acceleration:

```
a_roll  = -T_r * roll  + D_r * w_roll          // about forward; +roll = roll right
a_pitch = -T_p * pitch + D_p * (1 - |pitch|) * w_pitch  // about right; +pitch = nose up
a_yaw   = +T_y * yaw   + D_y * (1 - |yaw|)   * w_yaw    // about up; +yaw = nose right
w  ->  clamp(|w|, 5.5)
```

| Constant | Magnitude | Tag |
|---|---|---|
| T_roll | 38.35 | V (RocketSim) |
| T_pitch | 12.46 | V (RocketSim) |
| T_yaw | 9.11 | V (RocketSim) |
| D_roll | −4.79 | V (RocketSim) |
| D_pitch | −2.88 | V (RocketSim) |
| D_yaw | −1.92 | V (RocketSim) |

Key behaviors that come straight from this:
- **Roll damping is always on. Pitch and yaw damping switch off at full input.** So a full pitch or yaw input keeps accelerating up to the 5.5 cap, while roll settles.
- Time to reach 5.5 rad/s from rest at full input [D]: roll ≈ 0.26 s, pitch ≈ 0.46 s, yaw ≈ 0.62 s (the prototype matches roll and pitch).
- One full roll takes ≈ 1.2 s at the cap [D].
- **Coast angles after releasing input** [D], from 5.5 rad/s: roll ≈ 70°, pitch ≈ 113°, yaw ≈ 167°. This is why stopping a roll on target is hard: you must start counter-input or release *early*. The trainer should show this prediction.
- Angular velocity converges toward the axis of the applied torque, which acts as a natural flight assist.
- Orientation update uses the *average* angular velocity over the tick with an exponential map (implemented via quaternion axis-angle).

Sign convention in our sim: **+pitch = nose up, +yaw = nose right, +roll = roll right.** RLBot/game controller sign conventions differ, so map in the input layer.

In-air throttle still accelerates the car: +66.667 uu/s² forward, half that in reverse [V].

---

## 3. Boost

| Rule | Value | Tag |
|---|---|---|
| Max boost | 100 | V |
| Consumption | 33.3 per second (100 boost = 3 s) | V |
| Acceleration in air | 1058.333 uu/s² along the nose | V |
| Acceleration on ground | 991.667 uu/s² | V |
| Speed cap | 2300 uu/s (velocity is clamped) | V |
| Small pad | +12, respawn 4 s | V |
| Big pad | +100, respawn 10 s | V |
| Pad pickup | car centre of mass inside the pad cylinder (small: r 144, h 165; big: r 208, h 168) | V |

Drill design notes:
- Give drills a **fixed starting boost and no pads** for most stages. It isolates the skill.
- Add pads only in late air-dribble drills, using the pad layout from the RLBot wiki.
- Boost tapping is a skill: because consumption is continuous at 33.3/s, each 1/120 s tick costs 0.2775 boost. Show a boost-spent-per-touch stat.

---

## 4. Ball

| Rule | Value | Tag |
|---|---|---|
| Radius | 91.25 uu | V |
| Mass (arbitrary unit) | 30 | V |
| Max speed | 6000 uu/s | V |
| Max angular velocity | 6 rad/s | V |
| Restitution | 0.6 of the normal velocity component (loses 40%) | V |
| Drag | dv/dt = −0.030562·v (terminal ≈ 21,268 uu/s at 650 gravity) | V |
| Resting height | 93.15 | V |
| Surface friction | 0.35 | A (secondary source) |

Prototype checks: a ball dropped from z = 1000 bounces back to about z = 400.

Simplifications: box arena only (no curved wall ramps or goals), no spin-friction coupling with surfaces. Fine for free-air drills; wall carry drills need the real arena mesh.

Field dimensions [V]: side wall x = ±4096, back wall y = ±5120, ceiling z = 2048, goal height 642.775, goal half-width 892.755, goal depth 880.

---

## 5. Car–ball contact

Collision uses the **car's oriented bounding box** vs the ball sphere, not the car mesh [V]. Find the nearest point on the box to the ball centre, and touch occurs if the distance ≤ 91.25.

Two impulses per hit:

1. **Physics-engine impulse** [V model, A implementation]. Modeled as an inelastic collision with Coulomb friction. The prototype applies only the normal component with reduced mass (ball 30, car 180), and omits rotation and friction terms. Wheel hits and pinches will be wrong.
2. **Psyonix extra impulse** [V formula, A curve]. Applied to the **ball only** (momentum is not conserved):
   ```
   n = normalize(ball_pos - car_pos)      // vertical part scaled by 0.35
   n.z *= 0.35
   n  = normalize(n - 0.35 * dot(n, f) * f)
   dv = |v_ball - v_car|                  // pre-collision
   ball.vel += n * dv * s(dv)
   ```
   `s(dv)` ≈ 0.65 up to 500 uu/s, 0.55 at 2300, 0.30 at 4600 (linear between). I got this curve from a community summary, so treat it as **A** until compared against smish's plotted curve. The prototype also uses a 3-tick cooldown between extra impulses **[A]**.

Because the contact point and orientation change the outcome a lot (smish reports up to 40% speed difference from a few degrees), **the trainer must show the contact point and car angle at each touch.** It is core feedback for air dribbles.

---

## 6. Engine architecture

```
src/
  rl-physics.js     step functions (this file)
  car.js            your Octane model (createCar)
  input.js          keyboard + Gamepad API -> controls
  drills/           one module per drill
  scoring.js        metrics + thresholds + progression
  ui/               HUD, ghost car, replay
```

### Loop
```js
const acc = { t: 0 };
function frame(now) {
  advance(world, () => input.read(), (now - last) / 1000, acc);
  applyToCarModel(world.car, carGroup);        // interpolate between last two states for smoothness
  drill.update(world);                         // metrics, success/fail
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
```

### Input layer
- Use the **Gamepad API**. Controllers are what players practice on, and analog values matter. Support keyboard as a fallback (digital -1/0/1).
- Configurable deadzone, sensitivity and button bindings. Bad settings ruin air roll practice, so ship a settings check.
- Air roll modes:
  - **Toggle/hold roll left/right** sets `roll = ±1`. Pitch and yaw stay active.
  - **Directional air roll** [A]: while held, stick left/right becomes roll instead of yaw. I could not verify the exact in-game mapping, so make it a configurable remap. Do not treat it as ground truth.
- Physics reads a plain object `{throttle, steer, pitch, yaw, roll, boost, jump}`. Record it per tick, which makes replays and ghost runs trivial.

### Camera
Offer ball cam and car cam. Air roll drills often need a fixed "behind the car" camera plus an optional orientation gizmo.

### Rendering scale
Your current car model is about 3 units long. Real Octane is 118 uu, so with `scale = 0.01` the model should be about 1.18 units long. Scale the model group by about 0.4, or change the scale factor passed to `applyToCarModel`.

---

## 7. Drill framework

Each drill is a module with the same shape:

```js
export default {
  id: "target-pose-1",
  stage: 3,
  setup(world, rng) { /* place car, ball, target; return params */ },
  update(world, state) { /* returns {done, success, metrics} */ },
  tolerances: { angleDeg: 10, holdTime: 0.5, timeLimit: 6 },
  unlock: { attempts: 20, successRate: 0.8, tighten: true },
};
```

Rules:
- **Randomize** start pose, target and ball position within bounds every attempt. Repetition of one setup trains memory, not control.
- **Record every attempt**: inputs per tick, final metrics, pass/fail. Store per-drill rolling stats (last 20 attempts).
- **Adaptive difficulty**: on success above 80%, tighten tolerances by one step. Below 40%, relax.
- **Unlock** the next drill after a threshold, but keep old drills in a warm-up rotation for retention.

---

## 8. Curriculum

Angles below are starting tolerances, meant to be tuned by playtesting.

### Stage 0: Setup
- Bindings check, deadzone check.
- Orientation-recognition drill: a frozen car in the air; the player names which way the nose points.

### Stage 1: Ground control
- Powerslide turns, half-flips, wavedashes, flip cancels. **Requires the full ground and flip model** (not in the prototype).

### Stage 2: Basic air control (no ball)
- **Point at target:** nose within 10° of a marker for 0.5 s, then 5°, then 3°. Pitch and yaw only.
- **Boost to point:** reach a target sphere (radius 200 uu) by aiming and boosting.
- **Land clean:** land wheels down within 6 s of a random tumble start.

### Stage 3: Air roll control (no ball)
- **Target pose:** match a ghost car's full orientation (nose + roof direction). Tolerance 15° → 8° → 4°, hold 0.5 s.
- **Stop the roll:** roll 90/180/270° and stop within ±8°. Show the predicted coast angle (70° at full speed).
- **One-direction sets:** left only, then right only, then mixed.
- **Combined axes:** call-out sequences ("nose up, roll left 90°, nose down") with 1.5 s per step.
- **Recovery:** from a random tumble, get wheels down and nose forward as fast as possible.

### Stage 4: Ball contact
- **Static ball, chosen contact:** ball floats at rest; hit it with nose, roof or side, within ±10° of the target contact normal.
- **Roll-to-touch:** ball placement forces a roll during the approach.
- **Soft touch:** ball ends within 800 uu of the target after the touch.
- **Touch analysis screen:** contact point on the hitbox, relative speed, resulting ball vector.

### Stage 5: Ground and wall ball control
- Ground dribble and cradle, flicks, wall carry. Needs curved-wall arena and proper ground physics.

### Stage 6: Air dribbles
- **Pop and chase:** 2, then 3, then 5 touches.
- **Boost tapping:** maintain the car within ±200 uu of the ball using at most N boost.
- **Hover and hold:** keep the ball within a 1.5-ball radius of the nose for 2 s.
- **Steered dribble:** follow a curved path using directional air roll.
- **Goal finish:** full dribble into the net.

### Metrics to track
angle error (deg), time on target, roll overshoot (deg), touches per attempt, boost used per touch, contact offset from nose, success rate (last 20), and retention score (old drills re-tested after 3 days).

---

## 9. Validation plan

Do this before shipping. It is what makes the trainer trustworthy.

1. **Record ground truth** with BakkesMod (or use RocketSim) for: full-hold jump, full-hold jump + boost, 1 s of pitch/yaw/roll, ball drop from 1000 uu, and a head-on hit at 1400 uu/s.
2. **Compare tick by tick** with the sim. Community tools like the Losfeld visualizer report matching RocketSim within 0.2 uu and 0.05° in the air, which is the accuracy bar to aim for.
3. **Automated tests** (I ran a first pass, see below): pitch reaches 5.5 rad/s in ≈ 0.46 s, roll in ≈ 0.26 s, ball bounce height, jump apex.
4. Replace every **[A]** value with a verified one, or leave the drill that depends on it marked "experimental".

Prototype self-test results (`node`):

| Check | Result | Expected |
|---|---|---|
| Pitch to 5.5 rad/s | 0.458 s | ≈ 0.45 s |
| Roll to 5.5 rad/s | 0.258 s | ≈ 0.26 s |
| One full roll | 1.24 s | ≈ 1.2 s |
| Tap-jump apex | 94 uu | – |
| Full-hold jump apex | 242 uu | – |
| Ball drop 1000 → apex | ≈ 397 uu | ≈ 400 |

These test internal consistency with the published model. They do **not** prove the sim matches the real game; section 9 step 1 does.

---

## 10. Known gaps (backlog)

1. Dodges/flips (impulse, torque, cancel behavior). Needed for stage 1.
2. Real ground physics: suspension, wheel contact, powerslide, wall driving, curved ramps and goals.
3. Full rigid-body car–ball collision (rotation, Coulomb friction) and ball spin coupling.
4. Verify the hitbox offset, throttle curve, extra-impulse curve and cooldown, and the directional air roll mapping.
5. Other car hitboxes (Dominus, Plank, etc.).
6. Demolitions, boost pads, teammates, opponents.

## Sources

- RLBot wiki, Useful game values: https://wiki.rlbot.org/v4/botmaking/useful-game-values/
- RLBot wiki, The Physics of Jumping: https://wiki.rlbot.org/v4/botmaking/jumping-physics/
- smish.dev, Aerial control: https://www.smish.dev/rocket_league/aerial_control/
- smish.dev, Ground control: https://www.smish.dev/rocket_league/ground_control/
- smish.dev, Ball simulation 3 (collisions): https://www.smish.dev/rocket_league/ball_simulation_3/
- Losfeld visualizer (RocketSim-matched air roll): https://github.com/muanlartins/losfeld-visualizer
