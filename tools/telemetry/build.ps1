param(
    [string]$Sdk = "$env:APPDATA\bakkesmod\bakkesmod\bakkesmodsdk"
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    throw 'Open x64 Native Tools Command Prompt for Visual Studio, then run this script. Install Desktop development with C++ if cl.exe is unavailable.'
}
if (-not (Test-Path "$Sdk\lib\pluginsdk.lib")) { throw "SDK not found: $Sdk" }
$output = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$imgui = Join-Path $output 'imgui'
if (-not (Test-Path "$imgui\imgui.h")) {
    Expand-Archive -LiteralPath "$Sdk\imgui_bm.zip" -DestinationPath $output -Force
}
Push-Location $output
try {
    & cl.exe /nologo /LD /EHsc /std:c++17 /MD /O2 "/I$Sdk\include" "/I$imgui" "$PSScriptRoot\Recorder.cpp" "$imgui\imgui.cpp" "$imgui\imgui_draw.cpp" "$imgui\imgui_widgets.cpp" "$Sdk\lib\pluginsdk.lib" /link /OUT:airroll_recorder.dll
    if ($LASTEXITCODE -ne 0) { throw "Compilation failed: $LASTEXITCODE" }
    Write-Output "Built $output\airroll_recorder.dll. Not installed or loaded automatically."
} finally {
    Pop-Location
}