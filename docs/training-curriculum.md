# Training Garage

Play opens ten ordered categories. Each category opens a mechanic list;
each mechanic opens its ordered training steps. Back returns one level.

Existing drills retain their launchers and difficulty selection. Recent attempt
results are displayed where recorded. Continue Training resumes the last
successfully launched drill; this is not a mastery or lesson-completion score.

Planned mechanics expose their curriculum and a Free Play action, not a simulated
lesson. Half flips, wavedashes, pinches, resets and match scenarios still need
dedicated setups, detectors, feedback and progression gates. The displayed steps
are learning objectives, not separately playable stages yet.

Categories: Car Fundamentals, Recoveries & Movement, Ball Fundamentals, Ground
Control, Aerial Control, Wall & Ceiling Play, Air Dribbles, Pinches, Flip Resets,
and Match Skills. Individual levels describe difficulty; category order is a
recommended path rather than a prerequisite lock.

## Shared Simulation Drills
### Live Stage Guide

All thirty Foundations stages now have a stage-aware guide at the top of the
gameplay HUD. Full shows the objective or measured correction, explanation and
relevant control bindings; Minimal shows the correction only; Off hides the
message. The choice is saved separately from physics settings.

Rules measure steering direction, lane offset, approach speed, jump hold,
neutral second-jump input, roll near upright alignment, descent tilt,
momentum alignment, ball separation, reception height and follow-through.
Warnings require 0.18 seconds of evidence and clear after 0.5 seconds without
the fault. Only one correction is shown. Misses use specific detector labels
and available measured values; repeated scored misses in the current session
provide an opening focus cue. The guide does not modify controls, physics,
scoring, attempt history or mastery. Braking advice uses a conservative
distance heuristic, not a guaranteed stopping prediction.

This first implementation uses existing in-world targets and adds the live
HUD guide; dedicated alignment arrows and world-space coaching overlays are
not yet implemented. Thresholds and message timing still need human playtesting.

### Driving & Boost

Five distinct car-only stages, all requiring wheels-down entry:

- Precision Straight: a 2,200 uu throttle-only run within 100 uu of the centre
	line, entering a 100 uu target at 35 km/h or faster.
- Controlled Corner: three 120 uu checkpoints with deliberate steering,
	throttle only and no arrival-facing restriction.
- Boosted Sprint: a 3,000 uu run within 140 uu of the centre line, using at
	least 0.8 seconds of boost and entering a 120 uu target at 80 km/h or faster.
- High-Speed Stop: start at 50 km/h toward a target 1,800 uu away. Brake and
	remain inside its 100 uu radius below 5 km/h for 0.5 continuous seconds.
	Passing more than 350 uu beyond the target fails. Boost is forbidden.
- Slalom at Pace: three opposing-turn checkpoints with 120 uu radii, entered
	in order at 25 km/h or faster without boost.

Jumping fails every stage. Reaching a later checkpoint before the active one
fails. Visible circles and lane boundaries match scoring dimensions. Varied
runs change distances by up to 300 uu, mirror corners and alternate six slalom
routes. Revised driving mastery uses a new history key; old completions remain
stored but do not qualify for the harder stages.

### Jumps & Dodges

Five playable car-only stages: Single Jump, Control Jump Height, Double Jump,
Forward Dodge and Directional Dodges. Height is measured above the initial
physics origin. Single Jump needs 60 uu of height; Control Jump Height needs
180 uu and at least 0.18 seconds of jump hold; Double Jump needs a neutral
second jump and 250 uu. The first two reject second jumps and all three reject
dodges. Every jump stage rejects boost.

Forward Dodge requires a measured dodge impulse within 30 degrees of forward
and at least 400 uu forward displacement. Directional Dodges uses the same
direction test with 300 uu displacement: fixed requests right, varied cycles
backward, left and right. Starts are stationary and wheels-down; varied heading
changes by up to 15 degrees. Completion requires upright ground contact
(up-axis Z at least 0.92), angular speed below 0.6 radians/s and a continuous
0.25-second stable hold. Landing instability resets that hold.

Both drills use ordinary shared car physics, finite boost and no assistance or
ball. Attempts have a 15-second cap. Each stage and fixed/varied option keeps
separate ten-attempt sets; mastery is at least 8/10 in two consecutive complete
sets without skips. Same-setup retries are unscored and preserve the original
miss; leaving or skipping an active attempt records a skip. Partial sets cannot
qualify for mastery. Briefings include stage selection, objective, coaching,
history, variation and animated car-only previews. Scripted shared-physics tests
complete all ten stages with fixed and bounded varied starts, including all
three directional requests. Thresholds remain initial tuning pending the
full Foundations playtest.

### First Touch: Stationary Ball

The Static Ball briefing now uses mastery steps rather than generic difficulty:
Find Contact, Square the Nose, Place the Touch, Add Pace, and Stay in the Play.
Each step adds one demand: contact, front contact, direction, controlled power,
then a controlled follow-through. Ground touches come first; aerial orientation
and sustained possession remain the focus of other drills.

All five steps are playable using shared car-ball physics. The briefing selects
the step and fixed or varied setup; Continue Training restores that selection.
Progress stores separate local histories for each step and variation setting.
The mastery milestone is 8/10 successes in two consecutive complete sets, without
locking access. Partial sets and sets containing skips do not qualify.

Vary Setup is enabled by default and persists the selected setting. It introduces
bounded distance, lateral-position and heading variation per scored attempt.
Later steps cycle straight, left and right target directions. Off repeats the
fixed setup. Retry Same Setup repeats the saved missed setup as unscored practice
without replacing its original result. Resetting or exiting an unfinished scored
attempt records a skip. Returning to the briefing closes the current partial set.

### Soft Touches: Controlled Receptions

The approved progression distinguishes reception from First Touch placement:
First Touch places the ball; Soft Touches keeps it available. Use incoming ground
balls, not a stationary ball with a lower power limit. Bounces and aerial catches
remain outside this progression.

1. **Take the Sting Out:** cushion a slow incoming ball and reduce its speed.
2. **Keep It Close:** leave the cushioned ball within playable reach.
3. **Choose the Exit:** receive into a nearby requested left or right area.
4. **Match the Approach:** adapt to varied incoming speeds and angles.
5. **Make the Next Touch:** follow a controlled reception with a distinct second contact.

All five stages are implemented with shared physics, selectable briefing steps,
coaching, illustrative previews, saved selection and separate fixed/varied history.
They replace the legacy stationary-ball speed cap. Initial thresholds await the
planned full-Foundations playtest.

- Every stage requires horizontal speed at most 60% of the incoming speed,
	sampled 0.1 seconds after first contact. Incoming speed is sampled on the last
	physics tick before contact, not at spawn. Ball centre must stay below 200 uu.
- Steps 2-5 require car-to-ball centre distance at most 450 uu continuously for
	0.5 seconds after contact. Leaving that range fails the reception.
- Choose the Exit additionally requires ball centre 150-450 uu toward the
	requested side of its first-contact position, and within +/-450 uu along the
	incoming line. Both close control and the exit must complete within 3 seconds.
	The cyan marker centres the requested 300 uu lateral exit.
- Make the Next Touch requires a distinct second contact after the close-control
	window and within 3 seconds of first contact, still close and below 200 uu.
	Earlier additional contacts fail; sustained manifold contact counts once.
- Fixed setups use a 500 uu/s straight arrival from 1,200 uu and a right exit.
	Varied setups use 1,000-1,400 uu distance, car lateral offset +/-80 uu, alternating
	exit sides, and (steps 4-5) 400-800 uu/s arrivals at 0 or +/-20 degrees.
	The car initially moves with the arrival at 180 uu/s; no later impulses are added.
- Attempts cap at 15 seconds. Ten scored attempts form a set; two complete,
	consecutive 8/10 sets without skips reach the milestone. Steps stay unlocked.
	Retries preserve the full last miss, including velocities, as unscored practice.
	Reset/Skip and leaving unfinished attempts record skips; partial sets cannot qualify.

Soft Touch history uses its own storage, separate from First Touch, and is split
by step and variation. Progress shows recent sets and common misses; HUD feedback
includes sampled incoming and received speeds. A low outgoing speed alone does
not qualify for the later stages if the ball is no longer reachable.

### First Touch Scoring Contract

The five-step design below is implemented. Numeric thresholds are initial tuning
values and still require skilled-player playtesting for difficulty calibration.

| Step | Success | Varied setup bounds | Attempt feedback |
| --- | --- | --- | --- |
| Find Contact | Any contact within 15 seconds | Distance 700-1,100 uu; lateral offset +/-150 uu; heading offset +/-10 degrees | Contact/no contact and first-touch time |
| Square the Nose | First touch is front contact; no outgoing-direction test | Distance 800-1,200 uu; lateral +/-200 uu; heading +/-15 degrees | Front/side/rear/roof contact or no contact |
| Place the Touch | First touch is front contact; ball crosses the target gate | Distance 900-1,300 uu; lateral +/-250 uu; heading +/-20 degrees; gate direction straight or +/-20 degrees | Hit, left/right miss, too high, wrong contact or no contact |
| Add Pace | Place the Touch plus horizontal ball speed 800-1,200 uu/s at gate crossing | Same bounds as Place the Touch; one initial speed band | Gate accuracy and measured pace; too soft/too hard |
| Stay in the Play | Front contact and gate hit, then follow within 600 uu for 0.5 continuous seconds, grounded and facing within 30 degrees of the ball | Same bounds as Place the Touch; follow must complete within 3 seconds after gate crossing | Gate accuracy then follow-through; too far, facing away or not wheels-down |

Target gates are 600 uu wide, centred 1,400 uu from the ball along the target
direction. Score a forward swept crossing within the posts with ball centre no
higher than 200 uu; do not require the whole ball inside the gate. Evaluate the
first crossing only. Steps 3-5 permit one distinct touch: another touch before
the target crossing is a miss, not a correction. Step 5 permits subsequent
touches after the target hit, but does not require possession or a second touch.
It deliberately drops the pace band so follow-through is the new learning goal.

Front contact means the first contact manifold identifies the selected hitbox's
front face, with the normal within 30 degrees of its forward axis. Use the shared
physics contact convention and hitbox, not the visible model or ball exit angle.
Contact classification uses the hitbox manifold normal, not its pre-solve contact
point compared with the post-solve car position. Focused tests cover a real nose
touch and side-biased corners; the accepted cone is an initial tuning value. Ground approaches are
the intended route; jumps/dodges are not prerequisites or separate bonuses.

All distances and speeds use simulation uu, not menu-preview scale. Generate
starts relative to the ball/target line, with heading offset relative to the
car-to-ball bearing. Keep ball and target clear of walls and spawns nonoverlapping.
Ball starts stationary on the ground and then follows normal physics. With
variation off, use 900 uu distance for step 1 and 1,000 uu for the other steps,
zero lateral/heading offset and a straight target. Variation is on by default;
distance/offset/heading vary inside the stated bounds, while gate direction is
balanced across straight, left and right over successive sets.

Each attempt has a 15-second cap including follow-through. Report one primary
miss: no contact, wrong contact, extra touch, target miss/timeout, pace, then
follow-through, in that order. Pace failure applies only after a target hit;
follow-through failure applies only after the step-5 target hit. A timeout after
contact is distinct from no contact. Do not change success thresholds per attempt.

Sets contain 10 scored attempts; 8/10 in two consecutive sets recommends moving
on without locking steps. Separate each step and fixed/varied histories. Show
set success, recent-set trend and the most common miss; gate accuracy and speed
are supporting metrics only where relevant. Retry Same Setup preserves the
complete last setup and is unscored practice; the original miss remains recorded.
Skipping/resetting a scored attempt records a skip and breaks the qualifying-set
streak rather than silently improving its success rate. Completing a same-setup
practice retry does not count toward the milestone. Changing step or variation
starts a fresh set; partial sets never qualify.

Ball Contact (four variants), Air Dribble (five variants), and Rings now inherit
the Free Play simulation through `src/shared/arenaDrill.js`. The inherited path
owns fixed 120 Hz coupled car-ball physics, arena collisions, selected car and
hitbox, calibrated visuals and wheels, boost pads, controls, and profile camera
settings including ball-cam. Physics and settings changes propagate to these
drills without separate implementations. No drill applies artificial touch
impulses or freezes a ball. The same currently approximate simulation is used;
this is not a claim of exact live-game parity.

Drills own only physical initial states, targets, and tick-based detectors.
Each round starts with 100 finite boost; arena pads replenish it normally.
Reset / Skip restarts the setup, and Free Play ball manipulation is disabled
during scored rounds. Ball rounds time out after 15 seconds, Rings after 60.
Results remain visible for 1.2 seconds before the next setup. Consecutive contact
ticks count as one touch. Attempts record once with duration and touch count.

Static Contact is a ground approach; Soft Touch uses the reception contract above.
Roll-to-Touch and Recovery use the progressions below. Pop & Chase requires two
aerial touches. Boost Tapping limits actual boost use to 1.35 seconds. Hover
requires a touch followed by three uninterrupted seconds within 300 uu and
500 uu/s relative speed. Side-Steer adds 250 uu lateral displacement. Wall-to-Air
uses the physical arena side wall and requires an airborne touch away from it.
Rings uses seven forward swept hoop crossings over the standard arena, rather
than its old ocean map and custom platform/flight solver.

Target Pose and DAR Sequences remain explicitly pinned orientation exercises
using the existing shared aerial torque adapter and profile chase camera. They
are not full car/ball arena drills. Advanced drill difficulty and progression
gates remain future work outside First Touch, Soft Touches, Roll-to-Touch and Recovery.
Skilled-player completion tuning is pending the planned full-page playtest.

### Roll-to-Touch: Airborne Approach

This is air roll into a touch, not a rolling-ball reception. Five playable stages:
Roll Into Contact, Present the Wheels, Present the Nose, Control the Release,
and Touch and Recover. All require an airborne first contact after at least
0.05 seconds of full-strength-equivalent roll input and 0.15 radians of actual
axial rotation before contact. Stage two adds an upright up-axis dot product
of at least 0.92; stage three adds a front contact normal within 30 degrees.
Stage four adds total ball speed of 300-900 uu/s sampled 0.1 seconds after
contact. Stage five adds an upright grounded landing with angular speed below
0.6 rad/s, sustained for 0.35 seconds within three seconds of first contact.
Extra distinct contacts before completion fail the attempt.

Fixed starts: 400 uu separation, 600 uu height, 450 uu/s car approach and a
stationary airborne ball. The car starts at 45 degrees of roll in stage one,
90 degrees thereafter. Varied starts: 350-450 uu separation, 550-650 uu height,
400-500 uu/s approach, alternating roll sides and later headings of 0 or
plus/minus 15 degrees. Both bodies fall under shared physics, with no hover or
alignment assistance. These are initial tuning bounds, pending playtesting.

Ten scored attempts form a set. Mastery requires at least eight successes in
each of two consecutive complete sets without skips. Reset/Skip records a skip;
unfinished sets are retained as partial. Retry Same Setup restores the entire
last missed setup as unscored practice without erasing the original miss.
History is independent of the other drills and split by stage and variation.
The selected stage and variation persist for launch and Continue.

### Recovery: Land Ready

Five playable stages: Land Wheels Down, Land With Momentum, Drive Out,
Touch and Land, and Ready for the Next Play. Stable landing means grounded,
up-axis dot product at least 0.92 and angular speed below 0.6 rad/s for
0.35 uninterrupted seconds. The first three stages allow four seconds from
launch; the last two require one airborne touch and allow three seconds from
contact. Grounded or extra distinct contacts fail the touch stages.

Stages two, three and five add horizontal speed of at least 300 uu/s and
forward alignment within 30 degrees of velocity. Stages three and five then
require 150 uu forward displacement from the settled landing within
1.5 seconds, finishing grounded, stable and aligned. Losing stability during
the landing hold resets it. Late landings or exits fail.

Fixed setup: 600 uu height, 450 uu/s travel, 400 uu approach distance and
90-degree roll. Variation uses 550-650 uu height, 400-500 uu/s travel,
350-450 uu distance, alternating roll sides and headings of 0 or plus/minus
15 degrees. Stages one through three isolate floor landing; stages four and
five add the airborne ball. Shared physics and settings remain unchanged.
No landing or orientation assistance is applied. Tuning awaits playtesting.

Ten-attempt sets, two consecutive skip-free 8/10 mastery sets, partial-set
retention and unscored same-setup retries match the other Foundations drills.
Recovery history is isolated by stage and variation. Selection and variation
persist for launch and Continue. Tests cover physical completion of all five
fixed stages, hold resets, contact failures, deadlines, retries and history.

Validation: `node --test tools/physics-compare/drills.test.mjs` and
`node --test tools/physics-compare/catalog.test.mjs`.