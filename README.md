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
