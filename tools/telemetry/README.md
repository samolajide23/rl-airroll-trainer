# Local Free Play telemetry recorder

## Contact Replay

Replay recorder 0.3.0 Octane captures with continuous coupled car-ball physics:

```text
node tools/telemetry/replay.mjs capture.ndjson contact-report.json --contact --pre-roll 30
node tools/telemetry/replay.mjs capture.ndjson short-report.json --contact --pre-roll 1
```

Pre-roll must be an integer from 1 to 30. Compare the continuous 30-tick
approach with the one-tick recorded-state diagnostic to distinguish approach
drift from collision response. Reports include first simulated contact,
pre-impact errors, car orientation and angular velocity, ball angular velocity,
wheel/ground contact mismatches and the first state divergence. The first-state
thresholds are diagnostic: 1 uu/s car velocity, 0.01 rad/s angular velocity,
0.001 rad orientation or any wheel/ground mismatch, not parity gates.
Two preceding recorded transforms and inputs seed cached wheel commands and
steering geometry before restoring the starting rigid state, avoiding
artificial first-tick idle braking. This does not restore hidden contact
impulses or complete powerslide history. Candidate impulses
are not confirmed touches; warmed suspension is not recorded internal state.
Boosted windows, discontinuities and already-active jump histories are excluded.
Shorter histories may admit additional candidates and do not prove continuous
parity. Neither report certifies exact native physics. The original straight
replay positional command remains unchanged.

## Comprehensive Native Batch

The VS Code task **Native comprehensive parity batch** runs a single Octane
(body ID 23) in an unlimited-length, state-setting-enabled solo Soccar match.
It records two passes of 64 cases: boost taps/holds/exhaustion and mixed
throttle; jump hold lengths, re-press and delayed double jumps; directional
flips and cancellation delays/strengths; independent and combined aerial
inputs; ground throttle/braking/steering/powerslide; wall/ceiling impacts and
inverted landing; ball bounces/spin and car-ball approaches/flick setup.

Each case lasts 360 physics ticks, with scripted controls starting at tick 60
where applicable. A complete two-pass sequence requires 384 game seconds;
the task allows 450 wall-clock seconds for startup. No opponent is spawned.
The batch changes match length only, not gravity or physics speed.

```text
python tools/physics-compare/coconut_trial.py --check-batch
python tools/physics-compare/coconut_trial.py --native --batch-probe --seconds 450
python tools/physics-compare/coconut_trial.py --audit-batch path/to/capture.ndjson
```

Use the configured Coconut native Python environment. Captures remain in the
local AIRLAB Coconut cache, not the repository. The header includes resolved
match configuration and full case definitions. Every packet records case/pass
index, relative tick, reset marker, observed inputs and commands sent after
that packet. Native packets also contain actual hitbox/offset, dodge elapsed
time/direction and latest touch metadata; retain those for later comparisons.

Scripted probes bypass RLBot's normal latest-packet coalescing and process every
received packet. Coconut policy matches keep the SDK's usual loop. Packet writes
are buffered, with flushes at headers, resets and batch completion, and the file
is closed on normal agent retirement. This removes known client-side packet loss;
it does not guarantee that Rocket League or RLBotServer delivered every frame.

The adjacent `.coverage.json` report requires a completion marker and two full,
gap-free Active-phase segments per case, standard gravity/speed and the sole
recorded player. It reports observed jumps/dodges, boost and height ranges,
speed, hitbox and touch metadata changes, excluding the pre-reset packet from
outcomes. Rejections include exact frame/time gaps. Missing frames, incorrect
case/tick labels, absent reset markers or incomplete passes fail rather than
silently reducing the required coverage. The self-check tests packet dispatch,
complete synthetic segments, and rejection of gaps, missing footer/reset markers,
non-Active phases and nonstandard gravity/speed.

If a completed canonical batch lacks clean segments, retry only its missing
cases, then combine the original and retry captures:

```text
python tools/physics-compare/coconut_trial.py --check-batch --retry-batch original.coverage.json
python tools/physics-compare/coconut_trial.py --native --retry-batch original.coverage.json --seconds 195
python tools/physics-compare/coconut_trial.py --merge-batches original.ndjson retry.ndjson
```

Prefer short retries, with at most six cases per capture:

```text
python tools/physics-compare/coconut_trial.py --check-batch --retry-batch original.coverage.json --case-limit 6
python tools/physics-compare/coconut_trial.py --native --retry-batch original.coverage.json --case-limit 6 --seconds 180
```

Use `--case-offset 6`, then 12, etc. to select subsequent groups from the same
report. Bounds apply after missing-case filtering; using an updated combined
report instead selects only the remaining cases. Never run native captures
concurrently. Six cases require 36 game seconds for both passes. Allow extra
wall time: observed game progression can be slower than real time, and a
195-second allowance did not finish the 156-game-second retry in this session.
Short batches reduce wasted retries, not server packet-loss risk; retain the
strict gap checks. Retry case definitions stay canonical.
The combined report retains source paths and SHA256 hashes, rejects
duplicate paths/content or changed definitions, reruns strict per-segment audits and
requires two accepted segments for every original case. It does not join across
packet gaps or turn rejected segments into accepted ones.

Sample coverage is not event certification. Confirm that intended impacts,
touches and successful carries actually occurred from packet trajectories and
touch metadata before using a case to tune physics. Settling can change the
requested initial state, so replay starts must use observed packets, not the
reset request. The native mechanics replayer supports its original isolated
cases and strictly complete jump-hold or unboosted aerial batch segments:

```text
node tools/telemetry/native-air-replay.mjs path/to/batch.ndjson jump-report.json --summary
node tools/telemetry/native-air-replay.mjs path/to/batch.ndjson air-report.json --air-batch --summary
```

Jump replay warms rather than observes suspension. Aerial replay retains state
for up to 180 steps, excludes jump/dodge/boost transitions and stops before
nearby arena, ball or car contact. Both packet input timings are reported.
Complete-segment guards reject gaps, incorrect case/tick labels and extra resets;
this does not replace the canonical source-hash coverage audit. Simulator-generated
fixtures test replay consistency, not independent native parity.

Three cached captures yielded 23 accepted aerial trajectories across all nine
cases, with at least two per case. Following-packet inputs fit rotation better:
peak angular velocity error is 0.003280 rad/s and orientation error is
0.002553 rad. Peak position and velocity errors are 1.230549 uu and
1.246657 uu/s over 180 steps. These are measured residuals, not exact parity.
Other batch families remain excluded; do not label the full batch certified.

Remaining measurements include per-wheel suspension/contact normals and hidden
jump timers, other car hitboxes, car-car collisions and camera behavior. RLBot
packets do not expose suspension internals. The separate BakkesMod recorder
below exposes wheel-contact counts but is limited to local Free Play; it is not
automatically synchronized with this solo Soccar batch. Neither recording
format certifies exact parity.

## Recorder Panel

Version 0.3.0 adds read-only per-wheel contact flags, change timestamps,
contact locations/normals, suspension distance and configured geometry/damping.
It also records ground normal, time on/off ground, sticky-force settings and
jump-component active state, activity timestamps and force settings. These
accessors compile and link against the installed SDK, but their runtime units,
stale no-contact values and callback phase still require a real capture.
No gameplay setters or contact-delay constants were added.

For the takeoff investigation, reload the plugin in local Free Play, start a
capture, let the stationary Octane settle, then perform three short jump taps
and three full jump holds. Allow each landing to settle; do not boost, steer,
double jump or reset during the capture. Stop and save after about 20 seconds.
Validate the resulting file with the command below before comparing takeoff
gains to wheel release and jump activity. `contact_samples` counts samples with
all four wheels and a jump component; `unavailable_contact_samples` reports
missing wrappers. Neither count certifies tick alignment or physics parity.

Version 0.2.0 adds **F2 > Plugins > Airroll Recorder** with Start Recording,
Stop & Save, elapsed time, input/camera counts, capture size and Copy File Path.
The updated DLL has been compiled and installed; panel rendering still needs an
in-game smoke test. Reload the plugin in the F6 console before opening the panel:

```text
plugin unload airroll_recorder
plugin load airroll_recorder
```

Stop any active capture before reloading. Closing the panel does not stop capture.
Start/stop actions dispatch to the game thread; UI status reads use a locked
snapshot and do not read game wrappers directly from the settings-render thread.
Console start/stop commands remain available.

Status: compiled successfully with MSVC x64 against the locally installed SDK
and copied to the local BakkesMod plugins folder on 2026-09-30. Required plugin
exports and x64 architecture were checked. Not tested in Rocket League yet.
Do not treat this as a verified 120 Hz recorder until the first capture is checked.

## Build

Install Visual Studio Build Tools with **Desktop development with C++**, including
the MSVC x64 compiler and Windows SDK. Open **x64 Native Tools Command Prompt**:

```powershell
powershell -ExecutionPolicy Bypass -File tools\telemetry\build.ps1
```

The script builds `tools/telemetry/build/airroll_recorder.dll`; it does not install
or load it. Build for x64, not Win32. Use an SDK matching your BakkesMod version.

After compilation and review, place the DLL in
`%APPDATA%\bakkesmod\bakkesmod\plugins`. In BakkesMod's F6 console:

```text
plugin load airroll_recorder
airroll_record_start
airroll_record_stop
plugin unload airroll_recorder
```

Start only in local Free Play. Record 10-15 seconds for each isolated test and
stop before opening menus or resetting the car. Start OBS/NVIDIA video separately.
The recorder stops outside Free Play, after 60 wall-clock seconds, or around
32 MiB of buffered records. It pauses sampling while the game is paused.

Output: BakkesMod's data folder, subfolder `airroll-telemetry`, as NDJSON.
No account names/IDs, chat, audio, network uploads, or gameplay setters are used.
The initial release buffers records in memory and writes at stop to avoid
per-sample disk writes. Serialization overhead still needs in-game measurement.

## Fields And Timing

- Input/state records: throttle, steering, pitch/yaw/roll, separate dodge axes,
  both boost flags, jump, handbrake; car and ball RB state; physics time, grounded,
  jumped/double-jumped/flip availability, supersonic, wheel contact counts, raw boost.
- Camera records: location, Unreal rotator, FOV, current swivel, viewport, profile
  camera settings and camera shake. Recorded from the drawable callback.
- Header: schema/recorder/BakkesMod version, body ID and coordinate/phase metadata.
- Footer: sample counts and stop reason. Empty/incomplete captures must fail validation.

Positions are Unreal units, Z-up. Quaternions are `[W,X,Y,Z]`. Rotators are raw
Unreal units (65536 units per revolution); retain raw values before conversion.
Raw boost scale, RB-state timestamps and callback ordering require measurement.

The official MechanicalPlugin example uses `Car_TA.SetVehicleInput` with a
`ControllerInput` parameter. This recorder observes the **post-input** hook and
reads the local car without altering params. This is **not a post-physics tick**.
Calls may repeat a physics timestamp; camera samples use their own sequence and
steady-clock elapsed time. Do not align streams by array index or assume 120 Hz.
Capture does not yet include raw device inputs, all hidden jump timers,
mutators, ball-command labels, or authoritative camera input/state names.
Version 0.3.0 includes wheel normals and jump-component activity observations,
not a guaranteed post-physics suspension history.

The first capture must establish which records precede/follow physics integration,
then a dedicated post-physics hook can be validated against it. Hook existence
and runtime behavior cannot be proved by SDK headers alone.

## Validate

```text
node tools/telemetry/validate.mjs "path/to/capture.ndjson"
```

Validation checks structure, finite values, sequence/timing, footer counts and
reports observed sampling intervals. It does not certify game parity. A trainer
replay importer is deliberately deferred until real capture timing is established.

## First Capture Alignment

## Bounded Movement Replay

```text
node tools/telemetry/replay.mjs "path/to/capture.ndjson" report.json octane
```

The tool selects a grounded resting start clear of the ball, warms suspension,
then retains simulation state while replaying up to six seconds. Both earlier
and later input alignments are measured. Sampling gaps, steering, jumps,
handbrake, ball proximity and non-ground movement terminate the section.
This is deliberately not a full-mechanics importer; hidden timers, mutators,
hitbox identification and camera-input phase remain unresolved.

The second real capture selected elapsed 10.4719-16.4724 seconds (720 ticks).
This section contains reverse throttle/coasting, no boost presses. Earlier-input
position error: mean 1.0723 uu, max 3.1921 uu, final 1.2226 uu. Later-input:
mean 2.4092 uu, max/final 8.7318 uu. Earlier-input max velocity error is
6.4874 uu/s versus 2.9988 uu/s for later input, so the metrics do not establish
one uniformly superior alignment. Orientation errors remain below 0.005 degrees
and neither replay has grounded-state mismatches.

The first velocity error above 1 uu/s occurs during reverse-throttle ramp-up at
elapsed 12.6070 seconds. Reconstruction assumes Octane hitbox for recorded body
ID 23, unlimited boost and warmed rather than recorded suspension history.
No physics parameters were changed from this diagnostic. Camera comparison is
not yet implemented: recorded camera state lacks explicit ball-cam and swivel
input metadata, and phase alignment needs separate verification.

Capture `capture-1790800870507432.ndjson` passed validation: 6,298 input/state
samples and 12,475 camera samples over 54.2587 wall-clock seconds. Physics
timestamps advance approximately 1/120 second. A 1.44-second wall-clock gap
advances physics only one tick; do not replay that gap as continuous simulation.

```text
node tools/telemetry/alignment.mjs "path/to/capture.ndjson" octane
```

The one-step reconstructed grounded comparison was inconclusive (301 transitions;
approximately 11.75 versus 11.81 uu/s mean velocity error for earlier/later input).
Suspension/contact history is absent, so those errors are not physics certification.
An independent boost-edge check found 11 of 12 eligible press edges increased
speed gain in the following step. This supports pairing input sample `i` with
the observed state transition `i` to `i+1`, provisionally for boost input.
Slope, rotation and contact changes can confound this evidence. No definitive
phase claim is made for jump, dodge, steering or asynchronous camera callbacks.

Before full mechanics replay, record a controlled 10-15-second ground test:
idle briefly, drive straight, tap boost several times, release throttle, and stop.
Avoid jumps, turns, ball contact, resets and menus. The initial capture identifies
body ID 23; confirm its hitbox before using the optional preset argument.
Full replay also needs jump/flip timers, suspension/contact history, mutators and
camera-input/state metadata, or scenarios beginning at a known resting state.

Sources: [SDK](https://github.com/bakkesmodorg/BakkesModSDK),
[MechanicalPlugin](https://github.com/bakkesmodorg/BakkesMod2-Plugins/blob/master/MechanicalPlugin/mechanicalplugin.cpp).