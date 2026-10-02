# Physics compare report

Generated: 2026-10-01T14:06:58.601Z

Reference: **RocketSim 2.2.1**, SOCCAR or THE_VOID as declared per scenario.
Candidate: **`carSim.js` / `rl-physics.js`**.

Regression gate: **FAIL** (enforced). Budgets are regression limits, not exact-parity certification.

- skybot-recording: pos_max 79.725953 > 0.2
- skybot-recording: vel_max 519.897930 > 0.5
- skybot-recording: omega_max 5.708150 > 0.01
- skybot-recording: fwd_max_deg 7.432797 > 0.05
- skybot-recording: up_max_deg 11.672407 > 0.05
## Constants (RocketSim vs rl-physics.js)

| Quantity | RocketSim | JS | Δ |
|---|---:|---:|---:|
| Gravity |Z| | 650.0000 | 650.0000 | 0.0000 |
| Max speed | 2300.0000 | 2300.0000 | 0.0000 |
| Max ang vel | 5.5000 | 5.5000 | 0.0000 |
| Boost accel air | 1058.3334 | 1058.3334 | 0.0000 |
| Air throttle | 66.6667 | 66.6667 | 0.0000 |
| T_roll (effective) | 38.3495 | 38.3495 | 0.0000 |
| T_pitch (effective) | 12.4636 | 12.4636 | 0.0000 |
| T_yaw (effective) | 9.1080 | 9.1080 | 0.0000 |
| D_roll (effective) | -4.7937 | -4.7937 | 0.0000 |
| D_pitch (effective) | -2.8762 | -2.8762 | 0.0000 |
| D_yaw (effective) | -1.9175 | -1.9175 | 0.0000 |
| Ball drag | 0.0300 | 0.0300 | 0.0000 |
| Ball restitution | 0.6000 | 0.6000 | 0.0000 |
| Extra impulse Z | 0.3500 | 0.3500 | 0.0000 |
| Extra impulse forward | 0.6500 | 0.6500 | 0.0000 |
| Jump max time | 0.2000 | 0.2000 | 0.0000 |
| Jump min time | 0.0250 | 0.0250 | 0.0000 |
| Jump reset pad | 0.0250 | 0.0250 | 0.0000 |
| CAR_TORQUE_SCALE | 0.0959 | 0.0959 | 0.0000 |
| Flip back impulse X | 1.0667 | 1.0667 | 0.0000 |
| Autoflip normZ | 0.7071 | 0.7071 | 0.0000 |
| Coasting brake | 0.1500 | 0.1500 | 0.0000 |

RocketSim air torques are `CAR_AIR_CONTROL_* * CAR_TORQUE_SCALE` (pitch, yaw, roll packing).

## Trajectory errors

| Scenario | pos mean/max (uu) | vel mean/max | ω mean/max | fwd° mean/max | up° mean/max |
|---|---:|---:|---:|---:|---:|
| `skybot-recording` | 4.207 / 79.726 | 9.804 / 519.898 | 0.072 / 5.708 | 0.663 / 7.433 | 0.975 / 11.672 |

## Coupled ball errors

| Scenario | Ball pos max (uu) | Ball vel max (uu/s) | Ball omega max (rad/s) |
|---|---:|---:|---:|
| skybot-recording | 61.012 | 1131.418 | 10.254 |

## Per-scenario finals

### `skybot-recording`
- Worst position error at tick **1197** (79.726 uu)
- Final pos RS 590.52, 5234.34, 37.57 vs JS 531.68, 5270.10, 67.34
- Final ω RS -2.246, -4.913, 1.031 vs JS -0.028, 0.046, 0.948
- Final forward RS [-0.967, 0.252, -0.045] vs JS [-0.946, 0.322, -0.041]

## How to re-run

```bash
npm run physics:compare
```
