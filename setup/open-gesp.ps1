$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$extension=Join-Path $root 'gesp-lab-extension'
. (Join-Path $extension 'scripts\windows-dependencies.ps1')
$chrome=Find-LearningChrome
if (-not $chrome) { throw 'Chrome is missing. Run install-all.cmd first.' }
$manifest=Join-Path $extension 'native-host\com.codearena.cpp_judge.json'
$id=$null
if (Test-Path -LiteralPath $manifest -PathType Leaf) {
    try {
        $origin=(Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).allowed_origins[0]
        if ($origin -cmatch '^chrome-extension://([a-p]{32})/$') { $id=$Matches[1] }
    } catch {}
}
if ($id) {
    Start-Process -FilePath $chrome -ArgumentList ('chrome-extension://'+$id+'/index.html')
} else {
    Write-Host 'First run install-all.cmd, then load this directory in chrome://extensions:' -ForegroundColor Yellow
    Write-Host $extension
    Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions'
}
