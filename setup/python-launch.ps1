$ErrorActionPreference = 'Stop'
$root = $env:HMT_BUNDLE_ROOT
if (-not $root) { $root = Split-Path $PSScriptRoot }
$python = $null
if ($env:HMT_PYTHON_EXE -and (Test-Path -LiteralPath $env:HMT_PYTHON_EXE)) { $python = $env:HMT_PYTHON_EXE }
$selectionFile = Join-Path $root 'runtime-selection.json'
if (Test-Path -LiteralPath $selectionFile) {
    try { $selected = Get-Content -LiteralPath $selectionFile -Raw -Encoding UTF8 | ConvertFrom-Json; if (Test-Path -LiteralPath $selected.python) { $python = $selected.python } } catch {}
}
if (-not $python) {
    foreach ($candidate in @((Join-Path $root 'runtime\python-full\python.exe'), (Join-Path $root 'runtime\python\python.exe'))) {
        if (Test-Path -LiteralPath $candidate) { $python = $candidate; break }
    }
}
if (-not $python) {
    & (Join-Path $root 'prepare-python.cmd') | ForEach-Object { [Console]::Error.WriteLine($_) }
    if ($LASTEXITCODE -ne 0) { exit 1 }
    $python = Join-Path $root 'runtime\python\python.exe'
}
& $python @args
exit $LASTEXITCODE
