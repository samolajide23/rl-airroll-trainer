# Physics compare report

Generated: 2026-09-29T08:27:19.366Z

Ground truth: **RocketSim** (`GameMode.THE_VOID`) via Python bindings.
Candidate: **`src/shared/rl-physics.js`**.

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
| Extra impulse Z | 0.3500 | 0.3500 | 0.0000 |
| Extra impulse forward | 0.6500 | 0.6500 | 0.0000 |

RocketSim air torques are `CAR_AIR_CONTROL_* * CAR_TORQUE_SCALE` (pitch, yaw, roll packing).

## Trajectory errors

| Scenario | pos mean/max (uu) | vel mean/max | ω mean/max | fwd° mean/max | up° mean/max |
|---|---:|---:|---:|---:|---:|
| `freefall_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_throttle_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_boost_1s` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `roll_right_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 2.849 / 5.675 |
| `roll_left_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 2.849 / 5.675 |
| `pitch_up_0_5s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.755 / 1.662 | 0.755 / 1.662 |
| `pitch_down_0_5s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.755 / 1.662 | 0.755 / 1.662 |
| `yaw_right_0_5s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.544 / 1.087 | 0.000 / 0.000 |
| `yaw_left_0_5s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.544 / 1.087 | 0.000 / 0.000 |
| `roll_then_release` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 1.715 / 2.814 |
| `combo_pitch_roll_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.013 / 0.018 | 2.508 / 5.523 | 4.334 / 9.219 |
| `boost_and_pitch_1s` | 1.682 / 5.186 | 7.083 / 17.151 | 0.000 / 0.000 | 1.955 / 4.638 | 1.955 / 4.638 |

## Per-scenario finals

### `freefall_1s`
No input mid-air for 1s — gravity only

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 472.29 vs JS 0.00, 0.00, 472.29
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `air_throttle_1s`
Full forward air throttle for 1s

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 33.61, 0.00, 472.29 vs JS 33.61, 0.00, 472.29
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `air_boost_1s`
Full boost mid-air for 1s

- Worst position error at tick **102** (0.000 uu)
- Final pos RS 533.58, 0.00, 472.29 vs JS 533.58, 0.00, 472.29
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `roll_right_1s`
Hold air-roll right for 1s from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 472.29 vs JS 0.00, 0.00, 472.29
- Final ω RS -5.500, 0.000, 0.000 vs JS -5.500, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `roll_left_1s`
Hold air-roll left for 1s from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 472.29 vs JS 0.00, 0.00, 472.29
- Final ω RS 5.500, 0.000, 0.000 vs JS 5.500, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `pitch_up_0_5s`
Hold pitch up for 0.5s from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS 0.000, -5.500, 0.000 vs JS 0.000, -5.500, 0.000
- Final forward RS [0.005, 0.000, 1.000] vs JS [0.034, 0.000, 0.999]

### `pitch_down_0_5s`
Hold pitch down for 0.5s from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS 0.000, 5.500, 0.000 vs JS 0.000, 5.500, 0.000
- Final forward RS [0.005, 0.000, -1.000] vs JS [0.034, 0.000, -0.999]

### `yaw_right_0_5s`
Hold yaw right for 0.5s from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS 0.000, 0.000, 4.554 vs JS 0.000, 0.000, 4.554
- Final forward RS [0.402, 0.916, 0.000] vs JS [0.419, 0.908, 0.000]

### `yaw_left_0_5s`
Hold yaw left for 0.5s from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS 0.000, 0.000, -4.554 vs JS 0.000, 0.000, -4.554
- Final forward RS [0.402, -0.916, 0.000] vs JS [0.419, -0.908, 0.000]

### `roll_then_release`
Roll right 0.5s then release 0.5s (coast angle)

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 472.29 vs JS 0.00, 0.00, 472.29
- Final ω RS -0.477, 0.000, 0.000 vs JS -0.477, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `combo_pitch_roll_1s`
Pitch up + roll right together for 1s

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 472.29 vs JS 0.00, 0.00, 472.29
- Final ω RS -4.862, -2.439, 0.813 vs JS -4.856, -2.452, 0.809
- Final forward RS [0.768, 0.081, -0.635] vs JS [0.724, 0.159, -0.671]

### `boost_and_pitch_1s`
Boost while pitching up for 1s

- Worst position error at tick **120** (5.186 uu)
- Final pos RS 248.54, 0.00, 688.21 vs JS 253.62, 0.00, 689.27
- Final ω RS 0.000, -5.500, 0.000 vs JS 0.000, -5.500, 0.000
- Final forward RS [-0.338, 0.000, -0.941] vs JS [-0.413, 0.000, -0.911]

## How to re-run

```bash
npm run physics:compare
```
