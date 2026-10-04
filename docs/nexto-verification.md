# Nexto Browser Verification

Date: 2026-10-04. No Rocket League launch or new native capture used.

## Seeded Rendered Self-Play

The rendered harness now supports two independent Nexto workers and seeded starting scenarios. Normal player-versus-Nexto controls are unchanged. Example from the development browser console after launching the arena:

```js
const { runRenderedNextoTrial } = await import('/tools/nexto/rendered-trial.js');
await runRenderedNextoTrial({ selfPlay: true, varied: true, seed: 42, seconds: 300, scenarioSeconds: 20 });
```

The default `selfPlay: false, varied: false` retains the fixed ball-chaser performance baseline. Use `selfPlay: true, varied: false` for fixed center-kickoff self-play. Varied runs cycle through seeded kickoff, attack, defense, inverted recovery and zero-boost starts, changing after goals or after 20 simulation seconds without a goal. Off-center kickoffs use policy control, not the center-spawn scripted sequence. Timed resets are reported separately from scored goals. The seed reproduces case definitions; asynchronous inference timing and goal-triggered case changes do not guarantee identical trajectories or reset times.

A full seed-42 run completed 300.01 simulation seconds in 310.59 wall seconds at 1914 x 908, pixel ratio 1. Score was team 0 Nexto 3 : 4 team 1 Nexto. Seven goals and eleven timed resets produced nineteen starts across all five scenario types. This is a mixed-scenario workload, not an uninterrupted regulation-match strength rating. All sampled states were finite, no hidden-page frames were observed, and the match finished. A separate 15-second accelerated coverage run verified hook restoration and all five case types.

| Policy | Completed / applied | Missed boundaries | Round-trip median / p95 / max | Inference median / p95 |
| --- | --- | --- | --- | --- |
| Team 0, temporary player worker | 4509 / 4491 | 19 | 4.5 / 6.1 / 78.2 ms | 1.3 / 2.0 ms |
| Team 1, arena worker | 4527 / 4509 | 1 | 4.7 / 6.2 / 76.2 ms | 1.4 / 2.1 ms |

Misses include startup/reset intervals without a first policy reply; the player worker's request phase differs from the arena worker's phase. 44,325 frames were sampled: frame-gap median 6.9 ms, p95 7.0 ms, p99 7.1 ms and maximum 83.3 ms. Twenty gaps exceeded 50 ms. Nineteen long tasks totaled 1,373 ms. Renderer CPU submission median was 2.9 ms, p95 3.9 ms; update median was 0.6 ms, p95 1.0 ms. Concurrent arena visual changes and a different workload prevent attributing differences from the earlier single-worker benchmark to self-play or this harness.

Seeded scenario regression and production build pass. On completion the temporary worker is disposed and timing/control hooks are restored; unfinished self-play returns to a clean kickoff for human control. Simultaneous trials are rejected. Overtime, multiple-seed win rates, mobile performance and failure-path lifecycle coverage remain unverified. Nexto self-play alone does not establish competitive rank.

## Rendered Five-Minute Match

Harness: `tools/nexto/rendered-trial.js`, export `runRenderedNextoTrial`. Launch the development Nexto arena, reset the match, then run the harness. Timing hooks are restored on completion or failure. The player is replaced temporarily with a deterministic throttle/steer ball chaser. This is a performance/lifecycle test, not a competitive rating benchmark.

At 1914 x 908, renderer pixel ratio 1, the match completed 300 simulation seconds in 348.45 wall seconds, including goal pauses. Nexto won 32 : 0; 32 kickoff resets were observed. The match reached its finished state, all sampled physics states remained finite, and no hidden-page frames were observed. Overtime and human input were not tested.

| Measurement | Median | p95 | p99 | Maximum |
| --- | --- | --- | --- | --- |
| Frame gap | 7.0 ms | 14.0 ms | 20.8 ms | 340.1 ms |
| Mode update CPU | 0.5 ms | 1.2 ms | 2.0 ms | 125.8 ms |
| Physics-step wrapper CPU | 0.3 ms | 0.6 ms | 1.3 ms | 108.1 ms |
| Renderer CPU submission | 6.1 ms | 9.2 ms | 12.7 ms | 40.9 ms |
| Worker round trip | 8.3 ms | 13.5 ms | 21.1 ms | 52.3 ms |
| Worker inference | 1.3 ms | 2.3 ms | 3.2 ms | 6.1 ms |

39,068 update/render samples and 3,826 completed decisions were recorded, with 3,794 applied actions and one missed policy boundary. 80 frame gaps exceeded 33.33 ms; 38 exceeded 50 ms. The Long Tasks API reported 35 tasks totaling 3,302 ms. Hooks add measurement overhead; renderer timing measures CPU submission, not GPU execution, and physics-wrapper timing includes contact/effect/wheel work and the harness's replacement controls. Frame gaps include browser scheduling delays. These aggregate statistics cannot assign individual stalls to garbage collection, asset work, resets, or other browser activity.

The next performance investigation should capture a trace around the long tasks and inspect renderer draw calls/materials, while preserving physics and policy behavior. Typical rendering cost exceeds mode-update cost; Nexto inference is not the dominant measured CPU cost. Rare update/step spikes also require attribution before changing code. This single desktop run does not certify mobile performance or zero lag.

## Verified

- Six Node regressions pass: upstream action ordering and observations for both teams, kickoff phases/handoff, scheduler generation rejection, and nonblocking arena updates.
- Fixed reference-helper import order so pinned upstream parity actually executes.
- Added the upstream 168-tick kickoff sequence for the arena's solo kickoff taker at fixed 120 Hz.
- ONNX worker performs a finite-output warmup before reporting ready.
- Real browser ONNX decisions and RocketSim simulation execute successfully.

## Real-Time Trials

Harness: `tools/nexto/browser-trial.js`, export `runNextoTrials`.
Defaults: three 20-second matches and four five-second scenarios. Physics continues during inference; previous controls are retained. Opponent is a deterministic throttle/steer ball chaser, not a competitive benchmark. Browser menu remained open during this isolated harness run; this is not a rendered arena-frame benchmark.

| Scenario | Baseline : Nexto | Nexto contact packets | Outcome |
| --- | --- | --- | --- |
| Match 0 | 0 : 3 | 16 | Finite states |
| Match 1, offset Nexto spawn | 0 : 0 | 15 | Finite states |
| Match 2, offset opponent spawn | 0 : 1 | 16 | Finite states |
| Shooting | 0 : 1 | 2 | Scored |
| Defending | 0 : 0 | 4 | No concession in five seconds |
| Inverted airborne recovery | 0 : 0 | 2 | Grounded upright |
| Zero boost | 0 : 1 | 4 | Collected 12 boost |

870 decisions: round-trip median 6.8 ms, p95 20.7 ms, maximum 108.8 ms. Frame gaps reached 118.1 ms. Match late ticks were 267, 408, and 369 out of 2400 each. A late tick means inference is pending after the eight-tick action interval expires. Contact packets are not distinct touches. Recovery/boost outcomes are accumulated across scenario resets following goals.

## Limits

These short trials establish working inference, basic skill outcomes, and reset stability, not original Nexto rank or complete native parity. The harness is not a full five-minute match or a scoring/overtime UI lifecycle test. Browser scheduling delays still occur; no zero-lag guarantee. Upstream kickoff control phases are preserved, but upstream stochastic kickoff inference and teammate selection are not implemented for this solo 1v1 mode. Longer rendered-arena matches against stronger, repeatable opponents remain necessary for strength certification.

## Pipeline Optimization

The receipt-driven cadence above is superseded by a fixed eight-tick scheduler. Replies are buffered until the next boundary, inference starts after the first tick of the current interval, and late replies retain the previous action for another interval without blocking physics. Observation ArrayBuffers are transferred to the worker instead of cloned. Only one request and one buffered reply are allowed per generation.

All six regressions and the production build pass. Scheduler coverage includes early replies, late replies, stale generations, and worker disposal. A new 80-second browser run used the same three matches and four skill scenarios:

| Scenario | Baseline : Nexto | Applied decisions | Missed boundaries |
| --- | --- | --- | --- |
| Match 0 | 0 : 2 | 236 | 0 |
| Match 1 | 0 : 1 | 257 | 0 |
| Match 2 | 0 : 3 | 214 | 0 |
| Shooting | 0 : 1 | 72 | 1 |
| Defending | 0 : 0 | 73 | 1 |
| Recovery | 0 : 0 | 73 | 1 |
| Zero boost | 0 : 1 | 72 | 2 |

All states remained finite; recovery grounded upright and zero-boost collected 12 boost. 1,011 completed decisions measured 1.5 ms median round trip, 2.9 ms p95, and 23.3 ms maximum. Maximum frame gap was 83.3 ms. These are single-run measurements, not a controlled attribution of latency improvements. Missed boundaries include the initial policy interval when no first reply is ready. `pendingTicks` counts ordinary inference-in-flight ticks, not missed deadlines, and is not comparable to the old `lateTicks` metric. Goals/reset kickoffs reduce policy-active time in match decision totals.