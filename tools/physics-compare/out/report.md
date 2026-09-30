# Physics compare report

Generated: 2026-09-30T11:43:51.013Z

Reference: **RocketSim 2.2.1**, SOCCAR or THE_VOID as declared per scenario.
Candidate: **`carSim.js` / `rl-physics.js`**.

Regression gate: **PASS** (enforced). Budgets are regression limits, not exact-parity certification.

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
| `freefall_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_throttle_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_boost_1s` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `roll_right_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `roll_left_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `pitch_up_0_5s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `pitch_down_0_5s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `yaw_right_0_5s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `yaw_left_0_5s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `roll_then_release` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `combo_pitch_roll_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `roll_from_pitch45` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `roll_from_pitch90` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `yaw_from_roll90` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `combo_from_yaw90` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `partial_inputs_air` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `boost_and_pitch_1s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `double_jump_air` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `flip_forward_air` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `flip_side_air` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `coast_from_spin` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_rest_0_5s` | 0.000 / 0.000 | 0.001 / 0.003 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_throttle_2s` | 0.002 / 0.004 | 0.001 / 0.003 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_throttle_4s` | 0.004 / 0.008 | 0.002 / 0.003 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_boost_2s` | 0.002 / 0.007 | 0.004 / 0.008 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_steer_right_1s` | 0.032 / 0.170 | 0.089 / 0.311 | 0.000 / 0.001 | 0.003 / 0.006 | 0.000 / 0.000 |
| `ground_steer_left_1s` | 0.032 / 0.170 | 0.089 / 0.311 | 0.000 / 0.001 | 0.003 / 0.006 | 0.000 / 0.000 |
| `ground_coast_1s` | 0.006 / 0.016 | 0.003 / 0.010 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_brake_0_25s` | 0.005 / 0.012 | 0.002 / 0.004 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_powerslide_0_5s` | 0.008 / 0.113 | 0.046 / 0.474 | 0.000 / 0.001 | 0.002 / 0.018 | 0.000 / 0.000 |
| `ground_jump_full_hold` | 0.003 / 0.007 | 0.007 / 0.007 | 0.000 / 0.000 | 0.002 / 0.003 | 0.002 / 0.003 |
| `ground_jump_tap` | 0.002 / 0.003 | 0.006 / 0.074 | 0.000 / 0.001 | 0.002 / 0.003 | 0.002 / 0.003 |
| `ground_flip_forward` | 0.658 / 1.557 | 2.061 / 8.951 | 0.073 / 0.691 | 0.449 / 1.145 | 0.547 / 1.145 |
| `wall_drive_throttle_3s` | 0.034 / 0.100 | 0.045 / 0.198 | 0.000 / 0.004 | 0.001 / 0.012 | 0.001 / 0.012 |
| `ground_jump_into_wall` | 1.567 / 7.854 | 6.073 / 26.604 | 0.051 / 1.108 | 0.354 / 0.857 | 0.115 / 1.135 |

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
- Final forward RS [0.005, 0.000, 1.000] vs JS [0.005, 0.000, 1.000]

### `pitch_down_0_5s`
Hold pitch down for 0.5s from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS 0.000, 5.500, 0.000 vs JS 0.000, 5.500, 0.000
- Final forward RS [0.005, 0.000, -1.000] vs JS [0.005, 0.000, -1.000]

### `yaw_right_0_5s`
Hold yaw right for 0.5s from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS 0.000, 0.000, 4.554 vs JS 0.000, 0.000, 4.554
- Final forward RS [0.402, 0.916, 0.000] vs JS [0.402, 0.916, 0.000]

### `yaw_left_0_5s`
Hold yaw left for 0.5s from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS 0.000, 0.000, -4.554 vs JS 0.000, 0.000, -4.554
- Final forward RS [0.402, -0.916, 0.000] vs JS [0.402, -0.916, 0.000]

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
- Final ω RS -4.862, -2.439, 0.813 vs JS -4.862, -2.439, 0.813
- Final forward RS [0.768, 0.081, -0.635] vs JS [0.768, 0.081, -0.635]

### `roll_from_pitch45`
Start pitched +45°, hold air-roll right — must spin about nose

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 615.16 vs JS 0.00, 0.00, 615.16
- Final ω RS -3.889, 0.000, -3.889 vs JS -3.889, -0.000, -3.889
- Final forward RS [0.707, -0.000, 0.707] vs JS [0.707, 0.000, 0.707]

### `roll_from_pitch90`
Start pitched +90° (nose up), hold air-roll right

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 615.16 vs JS 0.00, 0.00, 615.16
- Final ω RS -0.000, -0.000, -5.500 vs JS 0.000, 0.000, -5.500
- Final forward RS [0.000, 0.000, 1.000] vs JS [-0.000, 0.000, 1.000]

### `yaw_from_roll90`
Start rolled 90°, hold yaw right — body-up yaw

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS -0.000, 4.554, -0.000 vs JS 0.000, 4.554, 0.000
- Final forward RS [0.402, -0.000, -0.916] vs JS [0.402, -0.000, -0.916]

### `combo_from_yaw90`
Start yawed 90°, pitch+roll together

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 615.16 vs JS 0.00, 0.00, 615.16
- Final ω RS 2.449, -4.851, 0.845 vs JS 2.449, -4.851, 0.845
- Final forward RS [-0.758, 0.458, -0.465] vs JS [-0.758, 0.458, -0.465]

### `partial_inputs_air`
Half pitch + half yaw + half roll for 1s

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 472.29 vs JS 0.00, 0.00, 472.29
- Final ω RS -4.795, -1.352, 2.330 vs JS -4.795, -1.352, 2.330
- Final forward RS [0.322, -0.025, -0.946] vs JS [0.322, -0.025, -0.946]

### `boost_and_pitch_1s`
Boost while pitching up for 1s

- Worst position error at tick **103** (0.000 uu)
- Final pos RS 248.54, 0.00, 688.21 vs JS 248.54, 0.00, 688.21
- Final ω RS 0.000, -5.500, 0.000 vs JS 0.000, -5.500, 0.000
- Final forward RS [-0.338, 0.000, -0.941] vs JS [-0.338, 0.000, -0.941]

### `double_jump_air`
Second jump impulse while already airborne (tap jump 3 ticks)

- Worst position error at tick **59** (0.000 uu)
- Final pos RS 0.00, 0.00, 863.23 vs JS 0.00, 0.00, 863.23
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `flip_forward_air`
Forward dodge from rest in air (pitch down + jump)

- Worst position error at tick **83** (0.001 uu)
- Final pos RS 375.00, 0.00, 778.97 vs JS 375.00, 0.00, 778.97
- Final ω RS 0.000, 4.212, 0.000 vs JS 0.000, 4.212, 0.000
- Final forward RS [0.413, 0.000, 0.911] vs JS [0.413, 0.000, 0.911]

### `flip_side_air`
Side dodge right from rest in air (yaw right + jump)

- Worst position error at tick **83** (0.001 uu)
- Final pos RS 0.00, 375.00, 778.97 vs JS 0.00, 375.00, 778.97
- Final ω RS -3.512, -0.015, 0.002 vs JS -3.512, -0.015, 0.002
- Final forward RS [1.000, 0.004, -0.001] vs JS [1.000, 0.004, -0.001]

### `coast_from_spin`
Release inputs with initial roll rate 5.5 rad/s — damping coast

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 472.29 vs JS 0.00, 0.00, 472.29
- Final ω RS -0.041, 0.000, 0.000 vs JS -0.041, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `ground_rest_0_5s`
Settled Octane on floor, no input for 0.5s

- Worst position error at tick **6** (0.000 uu)
- Final pos RS 0.16, 0.00, 17.03 vs JS 0.16, 0.00, 17.03
- Final ω RS 0.000, -0.000, 0.000 vs JS 0.000, -0.000, 0.000
- Final forward RS [1.000, 0.000, -0.010] vs JS [1.000, 0.000, -0.010]

### `ground_throttle_2s`
Full throttle on open floor facing +Y for 2s

- Worst position error at tick **239** (0.004 uu)
- Final pos RS -0.00, -2201.69, 17.03 vs JS 0.00, -2201.68, 17.03
- Final ω RS -0.000, 0.000, 0.000 vs JS -0.000, 0.000, -0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [0.000, 1.000, -0.010]

### `ground_throttle_4s`
Full throttle on open floor to drive-speed cap

- Worst position error at tick **479** (0.008 uu)
- Final pos RS -0.01, 611.80, 17.03 vs JS 0.00, 611.81, 17.03
- Final ω RS 0.000, 0.000, -0.000 vs JS -0.000, 0.000, -0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [0.000, 1.000, -0.010]

### `ground_boost_2s`
Throttle + boost on open floor for 2s

- Worst position error at tick **240** (0.007 uu)
- Final pos RS -0.01, -978.28, 17.01 vs JS 0.00, -978.28, 17.01
- Final ω RS -0.000, -0.000, -0.000 vs JS -0.000, -0.000, 0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [0.000, 1.000, -0.010]

### `ground_steer_right_1s`
Throttle 1s then throttle+steer right 1s

- Worst position error at tick **240** (0.170 uu)
- Final pos RS 1039.89, 770.49, 17.03 vs JS 1039.81, 770.64, 17.03
- Final ω RS -0.000, -0.000, 2.371 vs JS -0.000, -0.000, 2.371
- Final forward RS [-0.616, 0.788, -0.010] vs JS [-0.615, 0.788, -0.010]

### `ground_steer_left_1s`
Throttle 1s then throttle+steer left 1s

- Worst position error at tick **240** (0.170 uu)
- Final pos RS 1039.89, -770.49, 17.03 vs JS 1039.81, -770.64, 17.03
- Final ω RS 0.000, -0.000, -2.371 vs JS 0.000, -0.000, -2.371
- Final forward RS [-0.616, -0.788, -0.010] vs JS [-0.615, -0.788, -0.010]

### `ground_coast_1s`
Throttle to speed then coast 1s

- Worst position error at tick **719** (0.016 uu)
- Final pos RS -0.01, 3171.61, 17.03 vs JS 0.00, 3171.62, 17.03
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, -0.000, -0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [0.000, 1.000, -0.010]

### `ground_brake_0_25s`
Throttle to speed then reverse-brake 0.25s

- Worst position error at tick **629** (0.012 uu)
- Final pos RS -0.01, 2268.65, 17.03 vs JS 0.00, 2268.66, 17.03
- Final ω RS -0.000, -0.000, 0.000 vs JS -0.000, 0.000, 0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [0.000, 1.000, -0.010]

### `ground_powerslide_0_5s`
Throttle 2s then throttle+steer+handbrake 0.5s

- Worst position error at tick **300** (0.113 uu)
- Final pos RS 2444.46, 137.71, 17.03 vs JS 2444.41, 137.81, 17.03
- Final ω RS 0.000, -0.000, 3.243 vs JS 0.000, -0.000, 3.243
- Final forward RS [0.297, 0.955, -0.010] vs JS [0.297, 0.955, -0.010]

### `ground_jump_full_hold`
Full hold jump from settled ground

- Worst position error at tick **120** (0.007 uu)
- Final pos RS 2.48, 0.00, 225.78 vs JS 2.47, 0.00, 225.78
- Final ω RS 0.000, 0.003, 0.000 vs JS 0.000, 0.003, 0.000
- Final forward RS [1.000, 0.000, -0.018] vs JS [1.000, 0.000, -0.018]

### `ground_jump_tap`
Single-tick jump tap from settled ground

- Worst position error at tick **109** (0.003 uu)
- Final pos RS 1.11, 0.00, 15.84 vs JS 1.11, 0.00, 15.84
- Final ω RS 0.000, -0.038, 0.000 vs JS 0.000, -0.038, 0.000
- Final forward RS [1.000, 0.000, -0.010] vs JS [1.000, 0.000, -0.010]

### `ground_flip_forward`
Jump then forward flip from ground

- Worst position error at tick **120** (1.557 uu)
- Final pos RS 409.67, -12.95, 86.17 vs JS 409.36, -12.51, 87.63
- Final ω RS -0.120, 2.923, 0.086 vs JS -0.066, 2.925, 0.074
- Final forward RS [0.738, 0.010, 0.675] vs JS [0.734, -0.001, 0.680]

### `wall_drive_throttle_3s`
Drive into +X wall and climb with throttle only

- Worst position error at tick **360** (0.100 uu)
- Final pos RS 4062.91, 0.00, 1649.17 vs JS 4062.93, 0.00, 1649.07
- Final ω RS 0.000, -2.442, 0.000 vs JS -0.000, -2.441, -0.000
- Final forward RS [-0.242, 0.000, 0.970] vs JS [-0.242, 0.000, 0.970]

### `ground_jump_into_wall`
Jump + boost into +X wall curve and climb (wheels on wall)

- Worst position error at tick **180** (7.854 uu)
- Final pos RS 4078.99, -0.02, 687.74 vs JS 4078.99, 7.83, 687.90
- Final ω RS -0.000, 0.001, 0.000 vs JS 0.000, 0.001, -0.000
- Final forward RS [0.010, -0.000, 1.000] vs JS [0.010, 0.012, 1.000]

## How to re-run

```bash
npm run physics:compare
```
