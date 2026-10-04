# RocketSim WebAssembly gameplay runtime

This target compiles the actual RocketSim engine and bundled Bullet. Browser
gameplay initializes this runtime before starting a mode and routes canonical
car, ball and coupled stepping through it at 120 Hz. JavaScript still owns input,
training rules, rendering and cameras. The handwritten simulator remains a
reference for Node tests, not the browser gameplay fallback.

## Pins

- RocketSim v2.2.1: `f80f9d90f922315c5877a81987845d3242ff1780`
- Emscripten 4.0.15
- Portable CMake 3.31.6 and Ninja 1.12.1

Source, compiler downloads and build output stay in ignored `vendor/` and
`build/` directories. The build task is `RocketSim WASM build`.

After building, run `node tools/rocketsim-wasm/smoke.mjs`, or open
`http://127.0.0.1:5173/tools/rocketsim-wasm/probe.html` with Vite running.

The gameplay bridge owns independent persistent THE_VOID or SOCCAR worlds and
supports Octane, Dominus, Plank, Breakout, Hybrid and Merc collision presets.
All stepping, gravity, boost, velocity limits and contacts are executed by
RocketSim. SOCCAR loads the 16 local meshes from the physics comparison suite
after checking their SHA-256 hashes. Initialize a separate module for each
mesh configuration: RocketSim initialization is once per module.

The adapter publishes orientation, kinematics, jump/flip timers, wheel contacts,
boost and pad state. External JavaScript mutations are transferred back to the
engine; ordinary ticks preserve native continuity. This is not a serialization
of every internal engine field. The production build uses Bullet SSE via WASM
SIMD and native WASM exceptions. It requires browser support for both features.
The `-Scalar` build option retains the older arithmetic path for diagnostics.

The generated module, WASM, notices and local hashed meshes are served under
`/physics/` by Vite and emitted there by `npm run build`. Build the native target
and provide the local meshes before starting Vite or building the app. Downloads,
generated artifacts and collision meshes are not committed, so `npm install`
alone is not sufficient on a fresh checkout.

Run the `RocketSim gameplay regressions` task to exercise native orientation,
world isolation, external resets, jump continuity, all six hitboxes, car-ball
contacts and boost pickups alongside existing drill and movement regressions.

## Verified result

The mechanics gates now cover 340 cached native recordings: 79 car movement
cases, ten original ball cases, five coupled contacts, 228 car parameter sweeps
and 18 ball surface/spin sweeps. All pass unchanged motion limits. Car sweeps
also compare published timers, flags and wheel contacts across 39,420 ticks.
See [the mechanics validation ledger](../../docs/mechanics-validation.md) for
the current evidence, commands and unverified named-mechanic gaps. The older
73-case results below remain a historical subset, not the latest coverage total.

The pinned engine compiled successfully without RocketSim or Bullet source
changes. Node 20 and the integrated browser passed gravity, boost consumption,
floor and wall rebounds, wheel grounding, jumping, car-to-ball impact and exact
arena-recreation checks. Both runtimes returned identical contact checkpoints.

The Node smoke script also compares every tick of the ten existing ball cases
against cached native RocketSim 2.2.1 references, verifying the scenario-file
hash and initial conditions first. Six cases matched exactly. Maximum errors
across all cases were 0.000984 UU position, 0.000341 UU/s velocity and
0.00000642 rad/s angular velocity. The smoke script now enforces limits of
0.05 UU position, 0.05 UU/s velocity and 0.0001 rad/s angular velocity.
All ten cases also pass through the gameplay ball adapter under those limits.
This is not proof of exact Rocket League behavior. The cached suite
must exist under `tools/physics-compare/out/ball/rocketsim/` to run this check.

Contact-check timings include arena recreation and are not a full-arena
performance benchmark. Comprehensive state-transfer coverage remains outstanding.
The runtime tests now enforce per-tick limits for all 73 cached native RocketSim
2.2.1 car recordings listed in the native index, including dodge, flip-cancel,
flip-window, landing, recovery, wall and hitbox cases. Limits are 0.05 UU position,
0.05 UU/s velocity, 0.0001 rad/s angular velocity, 0.0001 basis-vector distance
and 0.001 boost. Ground cases mirror the reference generator's 240-tick
suspension settling and kinematic resets. These gates cover selected recordings,
not every mechanic or exact Rocket League behavior.
On 2026-10-02, the SSE-compatible WASM build passed all 73 recordings without
changing limits. Overall maxima were 0.000061065 UU position, 0.000076491 UU/s
velocity, 0.000001937 rad/s angular velocity and 0.000001491 basis-vector
distance; boost matched exactly. Both previously failing wall cases now have
zero angular-velocity error. All ten runtime tests, including the ten ball
recordings and lifecycle/contact checks, pass in this configuration.
An instrumented run confirmed there are no
native car state resets after the first recorded tick in any of the 73 cases;
this rules out repeated adapter reseeding, not all initialization differences.
All six hitboxes' tested jumps and landings pass.
The lifecycle regression also repeats 30 coupled resets, checks that each first
tick matches fresh state, and creates/releases isolated ball-prediction worlds.
A live browser check on 2026-10-02 completed 20 Half Flip Lab resets and eight
transitions between Half Flip Lab and Free Play. Each stepped mode retained one
world with finite car state; returning to the menu left zero worlds. This does
not yet cover every drill, respawn path or the full Kamael worker lifecycle.
Live Free Play's coupled stepping completed 240 ticks in 135 ms in the integrated
browser; that excludes normal frame rendering and is not a sustained frame-rate
benchmark.

A visible integrated-browser driving sample on 2026-10-02 recorded 600 frame
intervals at approximately 144 FPS, with 7.0 ms p95, 7.1 ms maximum and no frames
over 16.7 ms. Native physics advanced 500 ticks during the sample. This short
measurement is specific to the local machine, scene and display. It does not
establish sustained performance on other hardware or explain the earlier
93 ms outlier observed in a synchronous physics-only benchmark.

The complete repository test run on 2026-10-02 finished with two failing tests:
the native car trajectory gate above and an unrelated catalog assertion expecting
15 entries while the current catalog contained 17. The production build passed,
with the existing large-chunk warning. Use the `RocketSim audit final totals`
task to rerun all test directories on the installed Node version, which does
not expand the package script's recursive glob. A subsequent five-minute live
Skybot performance capture was interrupted by page navigation and yielded no
usable result. Sustained performance, every bot/mode lifecycle, complete internal
state transfer, and exact Rocket League parity remain unverified.

## Native wall diagnostic

Run the `RocketSim native scalar build` task on Windows with Visual Studio 2022
C++ Build Tools installed. It builds the pinned source with MSVC, `/fp:precise`
and Bullet SSE disabled. Run `node tools/rocketsim-wasm/native-wall-compare.mjs`
to compare both wall cases against the cached native recordings at every tick.
The command retains the gameplay test limits and exits nonzero for failures.

Build the alternative arithmetic path with
`powershell -NoProfile -ExecutionPolicy Bypass -File tools/rocketsim-wasm/build-native.ps1 -Sse`,
then run `node tools/rocketsim-wasm/native-wall-compare.mjs --sse` or the
`RocketSim native SSE wall comparison` task. Both builds use separate ignored
directories and leave production WASM unchanged.

On 2026-10-02, MSVC scalar reproduced the WASM angular errors exactly:
0.00010329484939575195 rad/s for wall driving and
0.0002541865191198089 rad/s for jumping into the wall. First limit failures
remained ticks 352 and 105. With the same source, compiler and preparation,
MSVC's default Bullet SSE path matched every recorded position, velocity,
angular velocity, basis, boost and grounding value exactly in both cases.
This isolates the scalar/SSE arithmetic path for these discrepancies, not
the JavaScript adapter. It does not establish parity for every scenario.
Forced native SSE2 also passes, ruling out SSE4/FMA solver selection for these
failures. Replacing native reciprocal-square-root estimates with exact
`1 / sqrt(x)` reproduces the SIMD WASM angular errors and failure ticks.
Emscripten's rsqrt compatibility implementation differs from x86's approximate
estimate, which Bullet refines during vector normalization.

`native_rsqrt.h` restores the reference CPU's estimates using the 2,048-entry
`rsqrt_table.generated.h`, without editing vendor source. `rsqrt_probe.cpp`
checks every float32 mantissa in `[1, 4)` and every normal exponent bin before
generating the table. The table is CPU-specific, not a promise of identical
rsqrt behavior on every native CPU. Regenerating on another machine can change
the reference arithmetic and must be followed by the full recording gates.
To regenerate after a native SSE build, run
`tools/rocketsim-wasm/build-native-msvc-sse/rsqrt_probe.exe tools/rocketsim-wasm/rsqrt_table.generated.h`.

The production build defaults to the verified configuration. Use `-Simd` to
build an isolated candidate under `build-simd/`, and set
`ROCKETSIM_TEST_BUILD=build-simd` when running the runtime tests. The existing
browser probe accepts `?build=build-simd`; it passed initialization, all 16 mesh
loads, gravity/boost and contact checks on the integrated browser.

## Licensing

RocketSim is MIT-licensed; retain its pinned `LICENSE` when distributing an
engine artifact. Bundled Bullet source contains its permissive attribution
and redistribution notice, including in `LinearMath/btScalar.h`; preserve
those notices as well. Rocket League collision meshes have separate rights
and are not committed here. The local Vite production build currently includes
them. Do not publish that build without establishing permission to distribute
the mesh assets; the engine's MIT license does not grant those rights.

## Local Windows installation workaround

Windows file scanning locked compiler executables during the SDK installer's
extract-then-rename operation. The local ignored installer was changed to copy
extracted files instead of renaming them, and retain its temporary extraction
directory. RocketSim source is unmodified. This installer workaround is not
part of the upstream SDK and may be unnecessary on another machine.