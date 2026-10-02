# Physics compare report

Generated: 2026-10-01T14:06:59.169Z

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
| `flip_cancel_sustained` | 0.001 / 0.002 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `flip_cancel_partial` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_stall` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `flip_reset_jump` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `flip_window_last_tick` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `flip_window_expired` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `dominus_jump` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `plank_jump` | 0.002 / 0.004 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `breakout_jump` | 0.002 / 0.005 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `hybrid_jump` | 0.002 / 0.004 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `merc_jump` | 0.001 / 0.003 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `dominus_landing` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `plank_landing` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `breakout_landing` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `hybrid_landing` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `merc_landing` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `double_jump_early` | 0.001 / 0.002 | 0.000 / 0.006 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `flip_window_before` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `roof_recovery` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ceiling_impact` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
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
| `ground_rest_0_5s` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_throttle_2s` | 0.002 / 0.004 | 0.001 / 0.003 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_throttle_4s` | 0.004 / 0.008 | 0.002 / 0.003 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_boost_2s` | 0.002 / 0.007 | 0.004 / 0.008 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_steer_right_1s` | 0.000 / 0.001 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_steer_left_1s` | 0.000 / 0.001 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_coast_1s` | 0.006 / 0.016 | 0.003 / 0.010 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_brake_0_25s` | 0.005 / 0.011 | 0.002 / 0.004 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_powerslide_0_5s` | 0.001 / 0.002 | 0.001 / 0.002 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_jump_full_hold` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_jump_tap` | 0.000 / 0.000 | 0.000 / 0.002 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_flip_forward` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `wall_drive_throttle_3s` | 0.004 / 0.011 | 0.008 / 0.020 | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.001 |
| `ground_reverse_2s` | 0.000 / 0.002 | 0.001 / 0.002 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_reverse_steer` | 0.000 / 0.001 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_boost_depletion` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_reverse_throttle` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `flip_forward_cancel` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `flip_diagonal_air` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_powerslide_release` | 0.001 / 0.002 | 0.001 / 0.002 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_backflip` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_backflip_forward_speed` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_forwardflip_reverse_speed` | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_linear_speed_cap` | 0.000 / 0.001 | 0.001 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_angular_speed_cap` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `air_boost_one_tick` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_analog_steer` | 0.000 / 0.001 | 0.001 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_fast_steer` | 0.000 / 0.001 | 0.001 / 0.002 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `landing_wheels` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `landing_powerslide` | 0.000 / 0.000 | 0.000 / 0.001 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ceiling_fall_airroll` | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| `ground_jump_into_wall` | 1.567 / 7.854 | 6.073 / 26.670 | 0.051 / 1.112 | 0.354 / 0.868 | 0.116 / 1.140 |

## Per-scenario finals

### `flip_cancel_sustained`
Hold opposing pitch until the entire dodge torque window ends

- Worst position error at tick **119** (0.002 uu)
- Final pos RS 2297.30, 0.00, 2437.94 vs JS 2297.30, 0.00, 2437.94
- Final ω RS 0.000, 0.225, 0.000 vs JS 0.000, 0.225, 0.000
- Final forward RS [0.291, 0.000, -0.957] vs JS [0.291, 0.000, -0.957]

### `flip_cancel_partial`
Partial opposing pitch reduces rather than removes dodge torque

- Worst position error at tick **83** (0.001 uu)
- Final pos RS 375.00, 0.00, 2478.97 vs JS 375.00, 0.00, 2478.97
- Final ω RS 0.000, 4.212, 0.000 vs JS 0.000, 4.212, 0.000
- Final forward RS [-0.252, 0.000, 0.968] vs JS [-0.252, 0.000, 0.968]

### `air_stall`
Opposing yaw and roll select a flip but cancel its direction

- Worst position error at tick **83** (0.001 uu)
- Final pos RS 0.00, 0.00, 2478.97 vs JS 0.00, 0.00, 2478.97
- Final ω RS 0.008, -0.001, 0.018 vs JS 0.008, -0.001, 0.018
- Final forward RS [1.000, 0.030, 0.001] vs JS [1.000, 0.030, 0.001]

### `flip_reset_jump`
A car with a restored airborne flip uses a neutral second jump

- Worst position error at tick **64** (0.000 uu)
- Final pos RS 0.00, 0.00, 2533.91 vs JS 0.00, 0.00, 2533.91
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `flip_window_last_tick`
- Worst position error at tick **24** (0.000 uu)
- Final pos RS 125.00, 0.00, 1990.24 vs JS 125.00, 0.00, 1990.24
- Final ω RS 0.000, 5.500, 0.000 vs JS 0.000, 5.500, 0.000
- Final forward RS [-0.122, 0.000, -0.993] vs JS [-0.122, 0.000, -0.993]

### `flip_window_expired`
- Worst position error at tick **16** (0.000 uu)
- Final pos RS 0.00, 0.00, 1979.01 vs JS 0.00, 0.00, 1979.01
- Final ω RS 0.000, 0.051, 0.000 vs JS 0.000, 0.051, 0.000
- Final forward RS [1.000, 0.000, -0.019] vs JS [1.000, 0.000, -0.019]

### `dominus_jump`
- Worst position error at tick **118** (0.001 uu)
- Final pos RS -995.78, 0.00, 225.97 vs JS -995.78, 0.00, 225.97
- Final ω RS 0.000, 0.005, 0.000 vs JS 0.000, 0.005, 0.000
- Final forward RS [1.000, 0.000, -0.031] vs JS [1.000, 0.000, -0.031]

### `plank_jump`
- Worst position error at tick **120** (0.004 uu)
- Final pos RS -998.16, 0.00, 227.46 vs JS -998.16, 0.00, 227.46
- Final ω RS 0.000, 0.002, 0.000 vs JS 0.000, 0.002, 0.000
- Final forward RS [1.000, 0.000, -0.013] vs JS [1.000, 0.000, -0.013]

### `breakout_jump`
- Worst position error at tick **120** (0.005 uu)
- Final pos RS -995.44, 0.00, 227.35 vs JS -995.44, 0.00, 227.35
- Final ω RS 0.000, 0.006, 0.000 vs JS 0.000, 0.006, 0.000
- Final forward RS [0.999, 0.000, -0.033] vs JS [0.999, 0.000, -0.033]

### `hybrid_jump`
- Worst position error at tick **120** (0.004 uu)
- Final pos RS -997.76, 0.00, 225.78 vs JS -997.76, 0.00, 225.78
- Final ω RS 0.000, 0.003, 0.000 vs JS 0.000, 0.003, 0.000
- Final forward RS [1.000, 0.000, -0.017] vs JS [1.000, 0.000, -0.017]

### `merc_jump`
- Worst position error at tick **120** (0.003 uu)
- Final pos RS -1001.20, 0.00, 227.55 vs JS -1001.20, 0.00, 227.55
- Final ω RS 0.000, -0.001, 0.000 vs JS 0.000, -0.001, 0.000
- Final forward RS [1.000, 0.000, 0.009] vs JS [1.000, 0.000, 0.009]

### `dominus_landing`
- Worst position error at tick **120** (0.000 uu)
- Final pos RS -309.17, 248.70, 17.07 vs JS -309.17, 248.70, 17.07
- Final ω RS 0.000, 0.000, -0.135 vs JS 0.000, 0.000, -0.135
- Final forward RS [0.999, -0.036, -0.018] vs JS [0.999, -0.036, -0.018]

### `plank_landing`
- Worst position error at tick **120** (0.000 uu)
- Final pos RS -307.50, 248.71, 18.67 vs JS -307.50, 248.71, 18.67
- Final ω RS 0.000, 0.000, -0.135 vs JS 0.000, 0.000, -0.135
- Final forward RS [0.999, -0.042, -0.008] vs JS [0.999, -0.042, -0.008]

### `breakout_landing`
- Worst position error at tick **119** (0.000 uu)
- Final pos RS -307.46, 249.50, 18.36 vs JS -307.46, 249.50, 18.36
- Final ω RS 0.000, 0.000, -0.156 vs JS 0.000, 0.000, -0.156
- Final forward RS [0.999, -0.047, -0.018] vs JS [0.999, -0.047, -0.018]

### `hybrid_landing`
- Worst position error at tick **84** (0.000 uu)
- Final pos RS -307.57, 247.50, 17.03 vs JS -307.57, 247.50, 17.03
- Final ω RS 0.000, 0.000, -0.147 vs JS 0.000, 0.000, -0.147
- Final forward RS [0.999, -0.047, -0.010] vs JS [0.999, -0.047, -0.010]

### `merc_landing`
- Worst position error at tick **112** (0.000 uu)
- Final pos RS -307.38, 250.89, 18.81 vs JS -307.38, 250.89, 18.81
- Final ω RS -0.000, 0.000, -0.109 vs JS -0.000, 0.000, -0.109
- Final forward RS [0.999, -0.034, 0.005] vs JS [0.999, -0.034, 0.005]

### `double_jump_early`
- Worst position error at tick **63** (0.002 uu)
- Final pos RS -993.62, 0.00, 17.03 vs JS -993.62, 0.00, 17.03
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, -0.010] vs JS [1.000, 0.000, -0.010]

### `flip_window_before`
- Worst position error at tick **179** (0.000 uu)
- Final pos RS 124.64, 0.00, 131.68 vs JS 124.64, 0.00, 131.68
- Final ω RS 0.000, 5.500, 0.000 vs JS 0.000, 5.500, 0.000
- Final forward RS [-0.080, 0.000, -0.997] vs JS [-0.080, 0.000, -0.997]

### `roof_recovery`
- Worst position error at tick **175** (0.001 uu)
- Final pos RS -911.81, -21.69, 16.98 vs JS -911.81, -21.69, 16.98
- Final ω RS 0.003, 0.002, 0.000 vs JS 0.003, 0.002, 0.000
- Final forward RS [0.992, -0.124, -0.009] vs JS [0.992, -0.124, -0.009]

### `ceiling_impact`
- Worst position error at tick **42** (0.001 uu)
- Final pos RS -519.82, 1.64, 1849.16 vs JS -519.82, 1.64, 1849.16
- Final ω RS -0.047, 0.050, 0.216 vs JS -0.047, 0.050, 0.216
- Final forward RS [0.952, 0.299, -0.067] vs JS [0.952, 0.299, -0.067]

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
- Final ω RS -3.889, 0.000, -3.889 vs JS -3.889, 0.000, -3.889
- Final forward RS [0.707, -0.000, 0.707] vs JS [0.707, 0.000, 0.707]

### `roll_from_pitch90`
Start pitched +90° (nose up), hold air-roll right

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 615.16 vs JS 0.00, 0.00, 615.16
- Final ω RS -0.000, -0.000, -5.500 vs JS 0.000, 0.000, -5.500
- Final forward RS [0.000, 0.000, 1.000] vs JS [-0.000, -0.000, 1.000]

### `yaw_from_roll90`
Start rolled 90°, hold yaw right — body-up yaw

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS -0.000, 4.554, -0.000 vs JS 0.000, 4.554, -0.000
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

- Worst position error at tick **20** (0.000 uu)
- Final pos RS 0.16, 0.00, 17.03 vs JS 0.16, 0.00, 17.03
- Final ω RS 0.000, -0.000, 0.000 vs JS 0.000, -0.000, 0.000
- Final forward RS [1.000, 0.000, -0.010] vs JS [1.000, 0.000, -0.010]

### `ground_throttle_2s`
Full throttle on open floor facing +Y for 2s

- Worst position error at tick **239** (0.004 uu)
- Final pos RS -0.00, -2201.69, 17.03 vs JS -0.00, -2201.68, 17.03
- Final ω RS -0.000, 0.000, 0.000 vs JS -0.000, -0.000, 0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [-0.000, 1.000, -0.010]

### `ground_throttle_4s`
Full throttle on open floor to drive-speed cap

- Worst position error at tick **479** (0.008 uu)
- Final pos RS -0.01, 611.80, 17.03 vs JS -0.00, 611.81, 17.03
- Final ω RS 0.000, 0.000, -0.000 vs JS -0.000, -0.000, 0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [-0.000, 1.000, -0.010]

### `ground_boost_2s`
Throttle + boost on open floor for 2s

- Worst position error at tick **240** (0.007 uu)
- Final pos RS -0.01, -978.28, 17.01 vs JS -0.00, -978.28, 17.01
- Final ω RS -0.000, -0.000, -0.000 vs JS -0.000, 0.000, 0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [-0.000, 1.000, -0.010]

### `ground_steer_right_1s`
Throttle 1s then throttle+steer right 1s

- Worst position error at tick **236** (0.001 uu)
- Final pos RS 1039.89, 770.49, 17.03 vs JS 1039.89, 770.49, 17.03
- Final ω RS -0.000, -0.000, 2.371 vs JS -0.000, -0.000, 2.371
- Final forward RS [-0.616, 0.788, -0.010] vs JS [-0.616, 0.788, -0.010]

### `ground_steer_left_1s`
Throttle 1s then throttle+steer left 1s

- Worst position error at tick **208** (0.001 uu)
- Final pos RS 1039.89, -770.49, 17.03 vs JS 1039.89, -770.49, 17.03
- Final ω RS 0.000, -0.000, -2.371 vs JS 0.000, -0.000, -2.371
- Final forward RS [-0.616, -0.788, -0.010] vs JS [-0.616, -0.788, -0.010]

### `ground_coast_1s`
Throttle to speed then coast 1s

- Worst position error at tick **719** (0.016 uu)
- Final pos RS -0.01, 3171.61, 17.03 vs JS -0.00, 3171.62, 17.03
- Final ω RS 0.000, 0.000, 0.000 vs JS -0.000, -0.000, 0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [-0.000, 1.000, -0.010]

### `ground_brake_0_25s`
Throttle to speed then reverse-brake 0.25s

- Worst position error at tick **629** (0.011 uu)
- Final pos RS -0.01, 2268.65, 17.03 vs JS -0.00, 2268.66, 17.03
- Final ω RS -0.000, -0.000, 0.000 vs JS -0.000, -0.000, 0.000
- Final forward RS [-0.000, 1.000, -0.010] vs JS [-0.000, 1.000, -0.010]

### `ground_powerslide_0_5s`
Throttle 2s then throttle+steer+handbrake 0.5s

- Worst position error at tick **299** (0.002 uu)
- Final pos RS 2444.46, 137.71, 17.03 vs JS 2444.46, 137.71, 17.03
- Final ω RS 0.000, -0.000, 3.243 vs JS 0.000, -0.000, 3.243
- Final forward RS [0.297, 0.955, -0.010] vs JS [0.297, 0.955, -0.010]

### `ground_jump_full_hold`
Full hold jump from settled ground

- Worst position error at tick **120** (0.000 uu)
- Final pos RS 2.48, 0.00, 225.78 vs JS 2.48, 0.00, 225.78
- Final ω RS 0.000, 0.003, 0.000 vs JS 0.000, 0.003, 0.000
- Final forward RS [1.000, 0.000, -0.018] vs JS [1.000, 0.000, -0.018]

### `ground_jump_tap`
Single-tick jump tap from settled ground

- Worst position error at tick **109** (0.000 uu)
- Final pos RS 1.11, 0.00, 15.84 vs JS 1.11, 0.00, 15.84
- Final ω RS 0.000, -0.038, 0.000 vs JS 0.000, -0.038, 0.000
- Final forward RS [1.000, 0.000, -0.010] vs JS [1.000, 0.000, -0.010]

### `ground_flip_forward`
Jump then forward flip from ground

- Worst position error at tick **116** (0.000 uu)
- Final pos RS 409.67, -12.95, 86.17 vs JS 409.67, -12.95, 86.17
- Final ω RS -0.120, 2.923, 0.086 vs JS -0.120, 2.923, 0.086
- Final forward RS [0.738, 0.010, 0.675] vs JS [0.738, 0.010, 0.675]

### `wall_drive_throttle_3s`
Drive into +X wall and climb with throttle only

- Worst position error at tick **357** (0.011 uu)
- Final pos RS 4062.91, 0.00, 1649.17 vs JS 4062.91, -0.00, 1649.18
- Final ω RS 0.000, -2.442, 0.000 vs JS 0.000, -2.442, 0.000
- Final forward RS [-0.242, 0.000, 0.970] vs JS [-0.242, -0.000, 0.970]

### `ground_reverse_2s`
Reverse acceleration from rest on open floor

- Worst position error at tick **239** (0.002 uu)
- Final pos RS -1798.32, 0.00, 17.03 vs JS -1798.32, 0.00, 17.03
- Final ω RS 0.000, -0.000, 0.000 vs JS 0.000, -0.000, 0.000
- Final forward RS [1.000, 0.000, -0.010] vs JS [1.000, 0.000, -0.010]

### `ground_reverse_steer`
Reverse acceleration then steer while reversing

- Worst position error at tick **237** (0.001 uu)
- Final pos RS -1227.47, 709.36, 17.03 vs JS -1227.47, 709.36, 17.03
- Final ω RS -0.000, 0.000, -2.064 vs JS -0.000, 0.000, -2.064
- Final forward RS [-0.419, -0.908, -0.010] vs JS [-0.419, -0.908, -0.010]

### `air_boost_depletion`
Hold boost past depletion of a five-unit tank

- Worst position error at tick **120** (0.000 uu)
- Final pos RS 155.00, 0.00, 472.29 vs JS 155.00, 0.00, 472.29
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `air_reverse_throttle`
Reverse air throttle from rest

- Worst position error at tick **52** (0.000 uu)
- Final pos RS -33.61, 0.00, 472.29 vs JS -33.61, 0.00, 472.29
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `flip_forward_cancel`
Forward dodge followed immediately by opposite pitch cancellation

- Worst position error at tick **83** (0.001 uu)
- Final pos RS 375.00, 0.00, 778.97 vs JS 375.00, 0.00, 778.97
- Final ω RS 0.000, 4.212, 0.000 vs JS 0.000, 4.212, 0.000
- Final forward RS [-0.978, 0.000, 0.206] vs JS [-0.978, 0.000, 0.206]

### `flip_diagonal_air`
Diagonal forward-right dodge from rest

- Worst position error at tick **83** (0.001 uu)
- Final pos RS 265.17, 265.17, 778.97 vs JS 265.17, 265.17, 778.97
- Final ω RS -2.830, 2.551, 0.349 vs JS -2.830, 2.551, 0.349
- Final forward RS [0.791, -0.242, 0.561] vs JS [0.791, -0.242, 0.561]

### `ground_powerslide_release`
Accelerate, powerslide, then release handbrake while steering

- Worst position error at tick **273** (0.002 uu)
- Final pos RS 662.66, 370.06, 17.03 vs JS 662.66, 370.06, 17.03
- Final ω RS 0.000, -0.000, 2.513 vs JS 0.000, -0.000, 2.513
- Final forward RS [-0.868, -0.496, -0.010] vs JS [-0.868, -0.496, -0.010]

### `air_backflip`
Backward dodge from rest

- Worst position error at tick **89** (0.001 uu)
- Final pos RS -400.00, 0.00, 778.97 vs JS -400.00, 0.00, 778.97
- Final ω RS 0.000, -4.212, 0.000 vs JS 0.000, -4.212, 0.000
- Final forward RS [0.413, 0.000, -0.911] vs JS [0.413, 0.000, -0.911]

### `air_backflip_forward_speed`
Backward dodge while moving forward at 1800 uu/s

- Worst position error at tick **83** (0.001 uu)
- Final pos RS 480.43, 0.00, 778.97 vs JS 480.43, 0.00, 778.97
- Final ω RS 0.000, -4.212, 0.000 vs JS 0.000, -4.212, 0.000
- Final forward RS [0.413, 0.000, -0.911] vs JS [0.413, 0.000, -0.911]

### `air_forwardflip_reverse_speed`
Forward dodge while reversing at 1000 uu/s

- Worst position error at tick **83** (0.001 uu)
- Final pos RS -89.13, 0.00, 778.97 vs JS -89.13, 0.00, 778.97
- Final ω RS 0.000, 4.212, 0.000 vs JS 0.000, 4.212, 0.000
- Final forward RS [0.413, 0.000, 0.911] vs JS [0.413, 0.000, 0.911]

### `air_linear_speed_cap`
Boost with nonaxial velocity above the linear speed cap

- Worst position error at tick **43** (0.001 uu)
- Final pos RS 1095.38, 337.26, 2633.55 vs JS 1095.38, 337.26, 2633.54
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `air_angular_speed_cap`
Combined air controls from an over-cap angular velocity

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 0.00, 0.00, 717.40 vs JS 0.00, 0.00, 717.40
- Final ω RS -3.170, -3.848, 2.321 vs JS -3.170, -3.848, 2.321
- Final forward RS [0.852, 0.516, -0.093] vs JS [0.852, 0.516, -0.093]

### `air_boost_one_tick`
One-tick boost press checks minimum boost duration

- Worst position error at tick **52** (0.000 uu)
- Final pos RS 48.07, 0.00, 717.40 vs JS 48.07, 0.00, 717.40
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `ground_analog_steer`
Half throttle and quarter steering from a moving start

- Worst position error at tick **119** (0.001 uu)
- Final pos RS 68.17, 282.47, 17.03 vs JS 68.17, 282.47, 17.03
- Final ω RS -0.000, 0.000, 0.579 vs JS -0.000, 0.000, 0.579
- Final forward RS [0.853, 0.521, -0.010] vs JS [0.853, 0.521, -0.010]

### `ground_fast_steer`
Steering at near-supersonic speed

- Worst position error at tick **90** (0.001 uu)
- Final pos RS -450.27, 447.28, 17.03 vs JS -450.27, 447.28, 17.03
- Final ω RS 0.000, 0.000, 0.995 vs JS -0.000, -0.000, 0.995
- Final forward RS [0.778, 0.628, -0.010] vs JS [0.778, 0.628, -0.010]

### `landing_wheels`
Airborne downward and forward velocity landing on wheels

- Worst position error at tick **120** (0.000 uu)
- Final pos RS -268.90, 0.00, 17.03 vs JS -268.90, 0.00, 17.03
- Final ω RS 0.000, 0.000, 0.000 vs JS 0.000, 0.000, 0.000
- Final forward RS [1.000, 0.000, -0.010] vs JS [1.000, 0.000, -0.010]

### `landing_powerslide`
Sideways moving landing with powerslide held

- Worst position error at tick **117** (0.000 uu)
- Final pos RS -307.52, 248.41, 17.03 vs JS -307.52, 248.41, 17.03
- Final ω RS 0.000, 0.000, -0.128 vs JS 0.000, 0.000, -0.128
- Final forward RS [0.999, -0.041, -0.010] vs JS [0.999, -0.041, -0.010]

### `ceiling_fall_airroll`
Inverted airborne car falls from near the ceiling while rolling

- Worst position error at tick **58** (0.000 uu)
- Final pos RS 0.00, 0.00, 1621.29 vs JS 0.00, 0.00, 1621.29
- Final ω RS -5.500, 0.000, 0.000 vs JS -5.500, 0.000, 0.000
- Final forward RS [1.000, 0.000, 0.000] vs JS [1.000, 0.000, 0.000]

### `ground_jump_into_wall`
Jump + boost into +X wall curve and climb (wheels on wall)

- Worst position error at tick **180** (7.854 uu)
- Final pos RS 4078.99, -0.02, 687.74 vs JS 4078.99, 7.83, 688.00
- Final ω RS -0.000, 0.001, 0.000 vs JS 0.000, 0.001, -0.000
- Final forward RS [0.010, -0.000, 1.000] vs JS [0.010, 0.012, 1.000]

## How to re-run

```bash
npm run physics:compare
```
