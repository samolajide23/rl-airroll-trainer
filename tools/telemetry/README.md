# Local Free Play telemetry recorder

## Recorder Panel

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
Capture does not yet include raw device inputs, wheel normals, all hidden jump
timers, mutators, ball-command labels, or authoritative camera input/state names.

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