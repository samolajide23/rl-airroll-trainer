param([switch]$Sse, [switch]$ExactRsqrt)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$vcvars = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
if (!(Test-Path $vcvars)) { throw 'Visual Studio C++ Build Tools are required' }
$environment = & $env:COMSPEC /d /s /c "`"$vcvars`" >nul & set"
foreach ($entry in $environment) {
    if ($entry -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
}
$cmake = Join-Path $root 'vendor/cmake/cmake-3.31.6-windows-x86_64/bin/cmake.exe'
$ninja = Join-Path $root 'vendor/ninja/ninja.exe'
$compiler = (Get-Command cl.exe -ErrorAction Stop).Source
Get-Command link.exe -ErrorAction Stop | Out-Null
$build = if ($Sse) { "$root/build-native-msvc-sse" } else { "$root/build-native-msvc" }
$scalar = if ($Sse) { 'OFF' } else { 'ON' }
$exact = if ($ExactRsqrt) { 'ON' } else { 'OFF' }
if ($ExactRsqrt) { $build = "$root/build-native-msvc-exact" }
& $cmake -S $root -B $build -G Ninja "-DCMAKE_MAKE_PROGRAM=$ninja" "-DCMAKE_CXX_COMPILER=$compiler" "-DROCKETSIM_NATIVE_SCALAR=$scalar" "-DROCKETSIM_NATIVE_EXACT_RSQRT=$exact" -DCMAKE_BUILD_TYPE=Release
if ($LASTEXITCODE -ne 0) { throw 'Native configuration failed' }
& $cmake --build $build --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'Native compilation failed' }