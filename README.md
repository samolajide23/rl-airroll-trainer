# RL Air Roll Trainer

Browser trainer for Rocket League **directional air roll**, organized in three phases.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`).

## Curriculum

### Free Play
| Mode | What it trains |
|---|---|
| **Arena** | Drive a soccar field — ground, jump, boost, air roll, ball |

### Phase 1 — Orientation (no ball)
| Drill | What it trains |
|---|---|
| **Target Pose** | Match ghost orientation and hold (Easy / Medium / Hard) |
| **Freeze & Stop** | Full 360° roll, then freeze wheels-down or sideways |
| **DAR Sequences** | Nose up → roll left 90° → nose down → roll right 90° |
| **One Direction** | Left-only or right-only air roll until it's automatic |

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

On phones/tablets, play in **landscape**: a left stick (pitch/yaw) and right buttons (air roll, boost, jump) appear while a drill is running. Rotate to landscape if you see the rotate prompt.
