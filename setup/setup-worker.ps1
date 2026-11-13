$ErrorActionPreference = 'Stop'
try {
    $root = $env:HMT_BUNDLE_ROOT
    if (-not $root) { $root = Split-Path $PSScriptRoot }
    . (Join-Path $PSScriptRoot 'runtime-common.ps1')
    $node = Ensure-Node $root
    # Let the engine record a pending cancellation before running native installers.
    & $node (Join-Path $PSScriptRoot 'engine.mjs')
    exit $LASTEXITCODE
} catch {
    $message = $_.Exception.Message
    try { Write-SetupState $message 0 'failed' } catch {}
    $report = @{ success = $false; error = $message; phase = 'node-bootstrap'; finishedAt = [DateTime]::UtcNow.ToString('o') }
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $root 'installation-report.json') -Encoding UTF8
    exit 1
}
