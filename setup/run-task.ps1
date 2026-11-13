$ErrorActionPreference = 'Stop'
try {
    $root = $env:HMT_BUNDLE_ROOT
    if (-not $root) { $root = Split-Path $PSScriptRoot }
    $env:HMT_SETUP_STATE = $null
    . (Join-Path $PSScriptRoot 'runtime-common.ps1')
    $node = Ensure-Node $root
    $file = Join-Path $root 'runtime-selection.json'
    if (Test-Path -LiteralPath $file) {
        $selected = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($selected.devCppHome) { $env:DEVCPP_HOME = $selected.devCppHome }
        if ($selected.cppBin) { $env:PATH = $selected.cppBin + ';' + $env:PATH }
        if ($selected.python) { $env:HMT_PYTHON_EXE = $selected.python }
    }
    if ($env:HMT_BUNDLE_TASK -eq 'check-cpp') {
        & $node (Join-Path $root 'check-cpp.mjs')
    } else {
        & $node (Join-Path $root 'tasks.mjs') $env:HMT_BUNDLE_TASK
    }
    exit $LASTEXITCODE
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
