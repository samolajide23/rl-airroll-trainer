# Rocket League recording audit

## Recording and method

Source: `E:/UserData/Videos/NVIDIA/Rocket League/Rocket League 2026.09.30 - 20.41.38.02.mp4`.
Duration: 107.3519 seconds. Decoded dimensions: 1920 x 1080.
Inspected timestamped samples across the recording, enlarged settings/binding
panels, and sampled 54-60 seconds at 0.75-second intervals.

This is a visual/configuration audit, not a frame-by-frame telemetry comparison.
There is no synchronized input stream, world-space state, camera transform or
independently verified frame-rate metadata. Spaced samples can miss transitions.
No acceleration, angular-rate, collision-error or latency measurements are
claimed from these images. The video stayed on the local machine.

## Recorded camera configuration

Read from the panel at approximately 12.1 seconds:

| Setting | Recording | Trainer screenshot preset |
| --- | ---: | ---: |
| FOV | 108 | 110 |
| Distance | 270 | 270 |
| Height | 80 | 90 |
| Angle | -3 | -5 |
| Stiffness | 1.00 | 0.35 |
| Swivel speed | 7.70 | 10.00 |
| Transition speed | 1.80 | 1.60 |
| Camera shake | Off | Off |
| Ball camera mode | Toggle | Not specified by the earlier preset |

Additional visible settings: demo transition 0.00; keyboard/mouse and controller
swivel inversion unchecked; preview spawn transition 0.25; preview-spawn-changed
transition 0.10; keyboard/mouse free-look-camera checkbox unchecked.

These values differ from the earlier supplied screenshots. The trainer preset
was not overwritten during the audit. Live browser settings may differ from the
source preset and were not checked here.

Stiffness 1.00 versus 0.35 is a major comparison confound: the trainer's configured
follow lag and speed-related pullback differ intentionally between those values.
FOV, height and angle also change apparent car size, framing and speed.

## Recorded control configuration

Read from approximately 16.1 seconds:

| Setting | Recording | Earlier supplied controls |
| --- | ---: | ---: |
| Steering sensitivity | 1.00 | 1.80 |
| Aerial sensitivity | 1.00 | 1.80 |
| Controller deadzone | 0.00 | 0.09 |
| Free look deadzone | 0.10 | Not shown |
| Dodge deadzone | 0.80 | 0.96 |
| Vibration | Disabled | Disabled |
| Vibration intensity | 0.00 | 0.00 |
| Mouse sensitivity | 1.00 | 100.00 in older UI |
| Keyboard acceleration time | 0.00 | 0.00 |
| Rumble activation buffer | 0.00 | 0.00 |
| Keyboard aerial safety | Enabled | Disabled |

The current game's mouse sensitivity display differs from the older screenshot;
their numerical scales must not be assumed interchangeable. Controller deadzone
appears as 0.00 in this recording; the trainer currently clamps that setting to
at least 0.05 and therefore cannot reproduce the shown value. Sensitivity and
dodge threshold differences invalidate a like-for-like movement comparison until
the configurations are aligned. Keyboard aerial safety is not implemented.

## Recorded bindings

Read from approximately 20.1 and 22.1 seconds:

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Drive forward/backwards | W / S | R2 / L2 |
| Steer right/left | D / A | Left stick |
| Jump | J | Cross |
| Alternative jump | Unbound | Unbound |
| Boost | K | D-pad Right |
| Powerslide | L | Square |
| Free air roll | Unbound | Unbound |
| Focus on ball | U | Triangle |
| Rear view | I | R3 |
| Air steer right/left | D / A | Left stick |
| Air pitch up/down | S / W | Left stick |
| Air roll right/left | E / Q | R1 / L1 |
| Toggle score view | Space | Triangle |

Other sampled rows include mouse-axis free look, right-stick camera swivel,
scoreboard, music skip and post-match actions. Those rows do not establish their
runtime behavior or prove every binding was visible. Ball-control bindings were
not individually readable from the inspected settings frames.

Trainer defaults differ in jump, boost, powerslide, free air roll, ball-camera
and rear-view bindings. In particular, leaving trainer free air roll bound to
the powerslide button while the recording has it unbound changes airborne yaw
into roll when that button is held. The previously observed trainer D-pad Right
Boost/Launch Ball conflict must also be checked in the current browser profile.

## Timeline observations

| Time | Visible activity | What it can establish |
| --- | --- | --- |
| 0-10 s | NVIDIA overlay and game menus/settings | Capture works; not a movement test |
| ~12 s | Camera settings | Numeric camera configuration above |
| ~16 s | Controls settings | Sensitivity/deadzone/safety values above |
| ~20-24 s | Binding table scrolling | Custom bindings above, not every row |
| ~28-36 s | Other settings and menu navigation | Additional UI exists; not audited as trainer functionality |
| ~40-44 s | Training selection and Neon Tokyo loading | Arena context differs from trainer artwork |
| ~48-52 s | Ground and wall approach with ball cam | Combined car/ball/camera motion, no isolated input |
| 54-56.25 s | Car rotates near ball in air and recovers | Visible contact sequence; force/spin cannot be quantified |
| ~57 s | Ground driving away from ball | Camera and movement are coupled |
| ~57.75-60 s | Ball close above/in front of car, then separates | Dribble-like setup; exact command press not identifiable |
| ~64 s | Wall/car/ball interaction | Contact-rich scenario missing from current reference fixtures |
| ~68-78 s | Driving, wall ascent and airborne rotation | Wall transition and recovery need matched inputs |
| ~82-100 s | Repeated boost, wall launches and aerial rotations | Useful qualitative reference, not isolated mechanics |
| ~106 s | NVIDIA overlay over gameplay | Overlay interrupts unobstructed reference view |

Boost displays 100 at inspected gameplay timestamps. This is consistent with
unlimited boost or replenishment; samples alone do not prove which option is
active. Trainer Free Play uses finite boost, so boost behavior must be matched
before comparing repeated aerial sequences. Ball cam is indicated in multiple
frames, not necessarily throughout the entire clip.

## Movement, contact and camera assessment

- This recording does not establish a new numerical physics mismatch. Existing
  RocketSim failures remain roof recovery, ceiling contact, four hitbox landings,
  powerslide release and three coupled car-orientation cases.
- Wall/ball/ground combined contacts in this footage exceed the existing small
  isolated contact suite's coverage. Pinches, acquired wheel-ball resets and
  chained recoveries cannot be certified from it.
- The car model/loadout differs visually from the trainer Octane. Confirm the
  selected chassis and corresponding physics hitbox before replay comparison;
  cosmetic appearance alone does not identify every physics parameter.
- Neon Tokyo lighting, textures, boost effects, ball artwork and floor markers
  affect visual perception but are not evidence of different force constants.
- Camera frame comparisons need matching FOV/aspect, height, angle, stiffness,
  ball-cam state and swivel input. Multiple car/ball motions are present together.
- Smoothing, ball-cam transition duration, wall orientation, clipping and swivel
  return timing cannot be measured accurately without camera/input telemetry.
- Preview-spawn transition and demo transition are visible game settings but
  trainer equivalents are not implemented; they are not the same as ball-cam
  transition speed.
- Mouse look/sensitivity, keyboard aerial safety, alternate jump binding,
  unlimited boost configuration, and full-range deadzone support are concrete
  settings/feature gaps to prioritize before attributing feel differences to
  chassis dynamics.

## Next discriminating checks

1. Store the recorded values as a separate reference profile; preserve the
   earlier personal preset and current custom bindings.
2. Allow the observed deadzone range and expose Free Play unlimited boost, with
   focused migration and runtime tests rather than changing defaults silently.
3. Record processed controls, timestamps, car/ball transforms and camera state
   in local Free Play using a verified BakkesMod recorder. It has not been built.
4. Capture isolated straight acceleration, high-speed turn, wall transition,
   ball-cam toggle, swivel hold/release and one ball command per clip.
5. Use the same initial conditions and captured inputs in the trainer, then
   compare error at the first divergent tick without loosening budgets.

Exact current Rocket League parity is not established by this audit, and neither
sampled images nor RocketSim alone can provide it.