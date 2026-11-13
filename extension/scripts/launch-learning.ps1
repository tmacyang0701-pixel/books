param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$JobId,[switch]$Restart)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$directory=Join-Path $root '.local\service-start'
New-Item -Path $directory -ItemType Directory -Force | Out-Null
$jobPath=Join-Path $directory ($JobId+'.json')
$encoder=New-Object Text.UTF8Encoding($false)
function Set-LaunchStatus($Status,$Message) {
    $record=@{id=$JobId;status=$Status;message=$Message;updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()}
    $temporary=$jobPath+'.tmp'
    [IO.File]::WriteAllText($temporary,($record|ConvertTo-Json -Compress),$encoder)
    Move-Item -LiteralPath $temporary -Destination $jobPath -Force
}
$hash=[Security.Cryptography.SHA256]::Create()
$suffix=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()))).Replace('-','')
$hash.Dispose()
# V2 also lets an installation recover from the previous launcher, whose -Wait
# kept waiting for the long-lived Python descendant after startup was complete.
$mutex=New-Object Threading.Mutex($false,('Local\CodeArenaLearningV2-'+$suffix))
$acquired=$false
try {
    try {$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
    if(-not $acquired){Set-LaunchStatus 'failed' 'Another service startup is already running. Wait a moment and retry.';exit 1}
    Set-LaunchStatus 'running' 'Checking dependencies and starting the learning service...'
    $oldError=Join-Path $root '.local\restart-error.log'
    if(Test-Path -LiteralPath $oldError){Remove-Item -LiteralPath $oldError -Force}
    $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $root 'start-learning.ps1')+'"'
    if($Restart){$arguments+=' -Restart'}
    $process=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $directory ($JobId+'.log')) -RedirectStandardError (Join-Path $directory ($JobId+'.err'))
    # Wait only for the startup script; Start-Process -Wait includes the backend
    # process tree, which intentionally remains alive after Ready.
    $null=$process.Handle
    $process.WaitForExit()
    if($process.ExitCode -ne 0){
        $detail=if(Test-Path -LiteralPath $oldError){[IO.File]::ReadAllText($oldError)}else{'Startup failed. See .local/service-start logs or run install-all.bat to repair dependencies.'}
        Set-LaunchStatus 'failed' $detail.Substring(0,[Math]::Min(2500,$detail.Length))
        exit 1
    }
    Set-LaunchStatus 'completed' 'Ready'
}catch{Set-LaunchStatus 'failed' $_.Exception.Message;exit 1}
finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
