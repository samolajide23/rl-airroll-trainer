param([switch]$Simd, [switch]$Scalar, [switch]$SkipSdkSetup)

$ErrorActionPreference = 'Stop'
if ($Simd -and $Scalar) { throw 'Choose either the isolated SIMD build or scalar diagnostics' }
$root = $PSScriptRoot
$sdk = Join-Path $root 'vendor/emsdk'
$python = Join-Path $sdk 'python/3.13.3_64bit/python.exe'
if (!$SkipSdkSetup) {
	& $python "$sdk/emsdk.py" install 4.0.15
	if ($LASTEXITCODE -ne 0) { throw 'Emscripten installation failed' }
	& $python "$sdk/emsdk.py" activate 4.0.15
	if ($LASTEXITCODE -ne 0) { throw 'Emscripten activation failed' }
}
$env:EMSDK = $sdk
$env:EMSDK_PYTHON = $python
$env:EM_CONFIG = Join-Path $sdk '.emscripten'
$cmake = Join-Path $root 'vendor/cmake/cmake-3.31.6-windows-x86_64/bin/cmake.exe'
$ninja = Join-Path $root 'vendor/ninja/ninja.exe'
$env:PATH = "$(Split-Path $cmake);$sdk/upstream/emscripten;$sdk/upstream/bin;$env:PATH"
$build = if ($Simd) { "$root/build-simd" } else { "$root/build" }
$simdEnabled = if ($Scalar) { 'OFF' } else { 'ON' }
& $cmake -S $root -B $build -G Ninja "-DCMAKE_MAKE_PROGRAM=$ninja" "-DCMAKE_TOOLCHAIN_FILE=$sdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" "-DROCKETSIM_WASM_SIMD=$simdEnabled" -DCMAKE_BUILD_TYPE=Release
if ($LASTEXITCODE -ne 0) { throw 'WASM configuration failed' }
& $cmake --build $build --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'WASM compilation failed' }