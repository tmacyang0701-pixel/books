$ErrorActionPreference = 'Stop'
try {
    $root = $env:HMT_BUNDLE_ROOT
    if (-not $root) { $root = Split-Path $PSScriptRoot }
    $env:HMT_BUNDLE_ROOT = $root
    $env:HMT_SETUP_STATE = $null
    $env:HMT_SETUP_MODE = 'diagnose-python'
    . (Join-Path $PSScriptRoot 'runtime-common.ps1')
    $node = Ensure-Node $root
    & $node (Join-Path $PSScriptRoot 'engine.mjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $report = Join-Path $root 'python-diagnostics.json'
    Start-Process notepad.exe -ArgumentList ('"' + $report + '"')
    exit 0
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
