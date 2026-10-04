# Ball Types

Locker includes a persisted Ball type selector: Standard or Souly Blossom. New
game sessions use the equipped skin. Souly Blossom uses the supplied diffuse
and normal textures on the existing community ball mesh. Its blossom atlas
island is remapped to that mesh's UVs; this is not an exact native cosmetic render.

Both skins have the same measured visual diameter: 1.825 metres on each axis,
matching the simulator's 91.25 Unreal-unit collision radius at 0.01 metres per
unit. The supplied JSON contains texture references, not geometry or dimensions,
so it cannot establish native Rocket League's visible mesh diameter. Physics size
is unchanged.

# RL Air Roll Trainer

Browser trainer for Rocket League mechanics, including **directional air roll**, organized into eleven training categories.

The final Volt menu uses vibrant neon green (`#39ff14`): the selected Home layout,
Esports training categories on the left with drill cards on the right, Trading
Cards drill details, and Master Detail settings (option 6). These pages use the real drill
catalogue, saved last drill, equipped car, camera settings and control bindings.
Unavailable mechanic cards are disabled, with an unavailable stamp and red hover glow.
Temporary design-study pages have been removed; the approved presentation lives
in `src/menus/` and its styles are isolated from gameplay.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`).

Gameplay requires the locally built RocketSim WASM module and hashed SOCCAR
meshes. See [the native runtime setup](tools/rocketsim-wasm/README.md) for build
prerequisites, validation and asset distribution restrictions. Physics runs in
RocketSim at 120 Hz; input, drills and presentation remain JavaScript.

## Nexto 1v1

Open **Arena > Classic > Soccar > 1v1 > Play Nexto** for a five-minute match
with sudden-death overtime. Reset starts a new match; goals preserve the score
and clock while resetting both cars and the ball. Both cars share one native
RocketSim world, including bumps, ball contacts and boost pickups.

The opponent uses the real [Nexto policy by Rolv-Arild and the Necto contributors](https://github.com/Rolv-Arild/Necto),
pinned to revision `2e6ed7d6ed2b352e8ff529d4a12a0c9c70c28cca`, converted from
TorchScript to ONNX. The model and adapted upstream behavior are licensed
**CC BY-NC-SA 4.0**: noncommercial use, attribution and share-alike obligations
apply. See [the included license](public/bots/nexto/LICENSE) and
[model provenance](public/bots/nexto/manifest.json). This is a modified browser
port, not an endorsement by its original authors.

ONNX Runtime Web 1.24.3 loads from jsDelivr, so a network connection is required.
The local model is SHA-256 checked before inference. The worker selects the
highest-logit action every eight simulated ticks; physics pauses while a
decision is pending. This differs from native RLBot timing. Hardcoded kickoff
scripts and kickoff randomness are not ported. Match expiry is simplified:
the leading player wins at five minutes without native zero-second ball-ground
continuation. Jump/flip availability is mapped from RocketSim state, not an
RLBot packet. Native Nexto strength/parity is therefore not claimed.

To reproduce the model export, run `tools/nexto/export_nexto.py` in a Python
environment with `torch`, `numpy`, `onnx` and `onnxruntime`. Its 32-sample
CPU comparison verifies logits and exact selected actions. Run
`node --test tools/nexto/nexto.test.mjs` for the observation/action and scheduler
tests; the upstream observation comparison requires Python with NumPy/Torch
and the pinned sources downloaded by the exporter.

## Replay Studio

Open `/replay.html` to import a Rocket League `.replay` locally, preview the
recorded cars and ball, choose an overview, fixed close-up, ball-follow or player camera, and
render the full replay to a downloadable H.264 MP4 at 720p or 1080p,
30, 60 or 120 fps. The added replay is available through **Open added replay**.
Fixed close-up anchors near the ball when selected and retains that framing during
playback and export. Orbit adjustments are included in the export framing.
Playback and MP4 exports automatically skip detected post-goal dead time after
a two-second celebration. Every detected kickoff, including the opening kickoff,
gets a three-second 3, 2, 1 countdown over its recorded reset pose before action
resumes. These countdowns are inserted visuals, not recovered native countdown
telemetry; replay audio is silent during them and follows the same timeline cuts.
Seek and clip inputs retain original replay timestamps. Pauses without a detectable
centered-ball kickoff reset are left untouched.

**Goal Director** follows the selected player's camera between goals, transitions
to a field-side shot during the three seconds before a score, and holds through
the explosion before returning over the next three seconds. The shot fits the ball
and both goalposts to the viewport. Preview, seeking and MP4 export use the same
deterministic framing. This is an edited view, not Rocket League's native camera.

**Follow player** selects Player POV and applies that player's recorded FOV,
distance, height, angle, stiffness, swivel speed and transition speed. Recorded
look values, rear view and ball-cam on/off toggles are replayed automatically in Player POV,
both in the preview and exported MP4. Camera values are applied without showing
technical controls. Look values interpolate between continuous observations rather
than stepping at network cadence; camera-mode toggles retain recorded timestamps.
FOV retains the shared camera's speed expansion and native 16:9 reference through
preview, export and seeking. Floor and wall state is inferred conservatively from
calibrated wheel rays against the arena, not recovered from native contact telemetry.
The yaw/pitch byte scale remains an approximation, not verified native camera input semantics.
Missing toggle data defaults to ball-follow; missing profiles
use defaults. Camera shake preference is unavailable. Camera smoothing is an
approximation, not a pixel-identical recreation of Rocket League's camera.

Recorded team scores and the match clock appear in every camera view, including
overtime with a `+` clock. The clock follows recorded state, including pauses.
Player POV also shows the player's name, boost amount and camera mode. Boost
flames and trails use replay time, so seeking is repeatable. These overlays and
effects are included in the exported MP4; unavailable scores or clock show `--`.
Wheel rotation is reconstructed from recorded forward velocity, with recorded
steering applied to the front tires. Wheel distance follows reconstructed pose
timing; steering retains its original recorded timing. Powerslides produce deterministic rear-tire
smoke near the floor. Replay tires receive a bounded, deterministic surface-support
adjustment (up to 8 cm) along car-down, including walls, without moving the recorded
body pose. Airborne tires return to their neutral positions. Soft shadows ground
cars and the ball visually. Suspension travel is cosmetic, not reconstructed telemetry.
Wheel spin and the steering angle are visual approximations, not native telemetry.

Live play and Replay Studio share depth-netted goals, rounded team trim,
instanced spectators, arena signs and segmented floodlight fixtures. Car finishes
separate coated paint, glass, rubber and metal. Boost has a bright core and a soft
plume whose length follows speed (recorded velocity in replays). Arena reflections
are a static, once-baked approximation of turf, team ends and floodlights, not
per-object live reflections. These details do not change collision geometry.

Recorded demolition events, ball hit-team changes and score increases drive
repeatable procedural bursts. Missing/demolished car frames remain hidden until
the recorded car track returns; respawns are not simulated. Supported body IDs
select Octane, Fennec or Dominus, with Classic used for unsupported bodies.
Team colours are approximations, not recorded decals or paint palettes.
All 34 standard Soccar boost pads render, including permanent depleted bases.
Recorded pickup/return events update pads when their coordinates identify a location.
When fixed-object coordinates are omitted, repeated pickups by an identified car
can resolve the object's location against the standard pad layout. Initial actor
snapshots are excluded from location evidence because they can describe historical
pickups, but their recorded active/depleted states are retained. Both supplied
multiplayer replays resolve all 34 locations and every pad event. This is a
location reconstruction from recorded evidence. A small-pad boost gain can also
corroborate a single pickup using car samples within 50 ms; this resolves all 33
observed pad identities in the supplied 1v1 replay. The remaining standard pad
has no recorded identity or state changes in that file. This remains a
conservative location inference, not recovered map data: sparse, conflicting or
colliding identities remain unresolved and their pads stay lit. Pickup and return
times remain recorded, not simulated cooldowns. The supplied 1v1, 2v2 and 3v3
replays exercise this path. Hit-team changes do not identify every same-team touch.

Rendering uses this trainer's standard stadium and available car/ball models, not
Rocket League's original renderer, map, cosmetics, effects or audio. Network
poses are interpolated with bounded per-object timing reconstruction in consistent
free-flight segments. Contact discontinuities remain anchored to recorded samples;
ball velocity changes above 100 uu/s conservatively mark candidate contact intervals
that retain original timing and use straight interpolation. This can also exclude
non-contact velocity changes; exact impact time between observations is unavailable.
this is not recovered native per-object timing or trainer physics simulation.
Replay files do not contain video or game audio.
Engine, boost, skid, hit, demolition and goal sounds are synthesized from replay
state, not original audio. Preview playback and MP4 use the same synthesis.
MP4 export requires browser H.264 and AAC WebCodecs support (current Chrome/Edge on
localhost or HTTPS). Exports include AAC audio and are held in memory; long 1080p replays
can use substantial memory. No replay is uploaded to a server.

## Validation

```bash
npm test
npm run build
```

Drill implementations load on demand. Production builds encode arena coordinates
losslessly as Float32 data and split Three.js into a separately cached chunk.
Saved metrics and settings tolerate unavailable browser storage; malformed stored
values are discarded or fall back to defaults. Unavailable storage cannot persist
changes across reloads.

## Curriculum

Training categories cover Foundations, Movement & Recoveries, Ground Control &
Flicks, Shooting & Finishing, Aerial Control, Air Dribbles, Wall & Ceiling Play,
Defense & Challenges, Kickoffs & 50/50s, Flip Resets and Pinches. The library
contains 89 mechanics, including 12 playable training drills plus Free Play.
Existing playable names and IDs are preserved; the implementations below are
grouped by their original training progression.

Each mechanic has ordered learning goals and multiple tags. Training supports
combined availability and tag filters within the selected category. Specialist
variations and team scenarios live in expandable sections. Flip cancels are
taught as a foundation for half flips and speed flips; minor variations such as
shot placement targets stay within the mechanic's progression. Catalog goals
describe the curriculum, not additional implemented gameplay stages.

### Free Play
Free Play includes a toggleable Skybot-derived driving diagnostic, independent
ball prediction overlays, contact telemetry and RocketSim replay export.
The selector also runs original pinned Kamael Python in a Pyodide worker,
including its Wyrm dribbler personality. This requires a CDN download on first
load. Physics runs at fixed 120 Hz independently of worker decisions, holding
the latest controls between replies. A bounded native-input decision replay
passed, but exact Rocket League movement and decision-latency parity are not established.
See [Skybot diagnostic](docs/skybot-diagnostic.md) for scope, licensing and replay commands.

| Mode | What it trains |
|---|---|
| **Arena** | Drive a soccar field — ground, jump, boost, air roll, ball |

### Phase 1 — Orientation (no ball)
| Drill | What it trains |
|---|---|
| **Target Pose** | Match ghost orientation and hold (Easy / Medium / Hard) |
| **DAR Sequences** | Nose up → roll left 90° → nose down → roll right 90° |
| **Rings** | Boost and air roll through a hoop course |

### Phase 2 — Ball contact
| Drill | What it trains |
|---|---|
| **Static Ball Contact** | Hit a mid-air ball with nose / roof / side |
| **Roll-to-Touch** | Roll on approach to present the right contact |
| **Soft Touches** | Light nudges — power fails the attempt |
| **Recovery** | Touch, then get wheels-down again |

### Phase 3 — Air dribble bridge
| Drill | What it trains |
|---|---|
| **Pop & Chase** | 2–3 touches after a pop (Shift / A = boost) |
| **Boost Tapping** | Pulse boost — holding too long fails |
| **Hover & Hold** | Keep the ball near the nose |
| **Wall-to-Air** | Pop off a wall and follow |
| **Side-Steer Dribble** | Carry on nose while steering with DAR |

## Metrics (HUD “Last 20”)
Success rate over your last 20 attempts per drill (stored in the browser). Modes also track angle error / time on target / touches where relevant.

## Controls
See **Settings** for keyboard + controller remapping. In Phase 3, **Shift** or gamepad **A** is boost.

On phones/tablets, on-screen controls appear while a drill is running (left stick for pitch/yaw, right buttons for air roll / boost / jump). In portrait, the play view is CSS-rotated into landscape so you don’t need to turn the phone.
