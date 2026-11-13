param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$env:PYTHONUTF8 = '1'
trap {
    $failure=$_ | Out-String
    $failureDirectory=Join-Path $PSScriptRoot '.local'
    New-Item -Path $failureDirectory -ItemType Directory -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $failureDirectory 'restart-error.log'),$failure,(New-Object Text.UTF8Encoding($false)))
    Write-Host $failure -ForegroundColor Red
    Write-Host 'Details saved to .local\restart-error.log'
    exit 1
}
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\windows-dependencies.ps1')
. (Join-Path $PSScriptRoot 'scripts\service-process.ps1')
$python = Find-LearningPython
if (-not $python) { throw 'Python 3.10+ is required. Run install-all.bat for dependency checks.' }
$configJson = & $python -m learning_service.doctor --config-only --json
if ($LASTEXITCODE -ne 0) { throw 'Model configuration is missing or invalid. Run install-all.bat for details.' }
$config = $configJson | ConvertFrom-Json
$port = [int]$config.port
$url = "http://127.0.0.1:$port"
$existingHealth = $null
try { $existingHealth = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2 } catch {}
if ($existingHealth) {
    if ($existingHealth.service -ne 'codearena-learning') { throw 'Port is used by another service.' }
    if (-not $Restart) {
        Write-Host "CodeArena learning service is already running: $url" -ForegroundColor Green
        Write-Host 'To apply backend updates, run install-all.bat (or restart-learning.bat).'
        exit 0
    }
}
$logDir = Join-Path $PSScriptRoot '.local'
New-Item -Path $logDir -ItemType Directory -Force | Out-Null
if (-not (Test-PythonDependency $python 'pypdf')) {
    throw "Required dependency pypdf is missing. Run: & '$python' -m pip install pypdf. No service was stopped or started."
}
Write-Host 'Checking the model endpoint from this Windows session...'
& $python -m learning_service.doctor --output (Join-Path $logDir 'network-check.json')
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Network check failed. No service was stopped or started. Details: .local\network-check.json' -ForegroundColor Red
    exit 1
}
if ($existingHealth) {
    $pidFile = Get-Item -LiteralPath (Join-Path $logDir 'service.pid') -ErrorAction Stop
    $serviceProcessId = [int](Get-Content -LiteralPath $pidFile.FullName -Raw)
    $serviceProcess = Get-Process -Id $serviceProcessId -ErrorAction Stop
    $verifiedIds=@(Get-LearningRestartProcessIds -RecordedId $serviceProcessId -RecordedStart $serviceProcess.StartTime -PidWritten $pidFile.LastWriteTime -Port $port -Lookup {
        param($processIdToRead)
        Get-CimInstance Win32_Process -Filter "ProcessId = $processIdToRead" -ErrorAction Stop
    } -Children {
        param($parentIdToRead)
        Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentIdToRead" -ErrorAction Stop
    })
    Write-Host ('Restarting the verified CodeArena process chain: '+($verifiedIds -join ', '))
    foreach ($verifiedId in $verifiedIds) {
        $verifiedProcess=Get-Process -Id $verifiedId -ErrorAction SilentlyContinue
        if ($verifiedProcess -and -not $verifiedProcess.HasExited) {
            Stop-Process -InputObject $verifiedProcess -ErrorAction Stop
            if (-not $verifiedProcess.WaitForExit(5000)) { throw 'The old service has not exited yet.' }
        }
    }
}
$process = Start-Process -FilePath $python -ArgumentList @('-m','learning_service.server','--port',"$port") -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'service.log') -RedirectStandardError (Join-Path $logDir 'service-error.log')
$ready = $false
for ($attempt=0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($process.HasExited) { break }
    try {
        $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1
        if ($health.service -eq 'codearena-learning' -and $health.version -ge 12 -and $health.configured -and $health.instancePath -eq $PSScriptRoot -and $health.processId) { $ready=$true; break }
    } catch {}
}
if (-not $ready) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue }
    throw "Service did not start. Check $logDir\service-error.log"
}
Set-Content -LiteralPath (Join-Path $logDir 'service.pid') -Value $health.processId -Encoding ASCII
Write-Host "Ready: $url | Model: $($health.model)" -ForegroundColor Green
Write-Host 'Reload the extension at chrome://extensions, then open CodeArena.'
