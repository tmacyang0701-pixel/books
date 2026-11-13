$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\service-process.ps1')
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
function Assert-Fails([scriptblock]$Action,$Message){$failed=$false;try{& $Action}catch{$failed=$true};Assert $failed $Message}
$start=[datetime]'2026-11-12T12:00:00'
$snapshots=@{
    101=[pscustomobject]@{ProcessId=101;Name='python.exe';CommandLine='"C:\Project\.venv\Scripts\python.exe" -m learning_service.server --port 8766';ParentProcessId=50}
    102=[pscustomobject]@{ProcessId=102;Name='python.exe';CommandLine='"C:\Project\.venv\Scripts\python.exe" -m learning_service.server --port 8766';ParentProcessId=101}
}
$options=@{RecordedId=101;RecordedStart=$start;PidWritten=$start.AddSeconds(1);Port=8766;Lookup={param($idToRead) $snapshots[$idToRead]};Children={param($parentToRead) @($snapshots.Values | Where-Object {$_.ParentProcessId -eq $parentToRead})}}
$child=@(Get-LearningRestartProcessIds @options)
Assert (($child -join ',') -eq '102,101') 'Venv service child and launcher must be selected'
$snapshots.Remove(102)
$direct=@(Get-LearningRestartProcessIds @options)
Assert (($direct -join ',') -eq '101') 'Direct service must work without querying a TCP CIM listener'
$snapshots[103]=[pscustomobject]@{ProcessId=103;Name='python.exe';CommandLine='python other_app.py';ParentProcessId=101}
Assert ((@(Get-LearningRestartProcessIds @options) -join ',') -eq '101') 'Unrelated child must not be stopped'
$snapshots[101].CommandLine='python other_app.py'
Assert-Fails {Get-LearningRestartProcessIds @options} 'Other recorded command must not be stopped'
$snapshots[101].CommandLine='python -m learning_service.server --port 8888'
Assert-Fails {Get-LearningRestartProcessIds @options} 'Other recorded port must not be stopped'
$snapshots[101].CommandLine='python -m learning_service.server --port 8766'
$options.PidWritten=$start.AddDays(1)
Assert-Fails {Get-LearningRestartProcessIds @options} 'Stale PID must not match'
Write-Output 'PASS: direct/venv processes without TCP CIM, unrelated child, wrong command/port and stale PID.'

$testDirectory=Join-Path ([IO.Path]::GetTempPath()) ('codearena-pid-test-'+[guid]::NewGuid().ToString('N'))
$recordPath=Join-Path $testDirectory 'service.pid'
$health=[pscustomobject]@{service='codearena-learning';processId=101;instancePath='C:\Project\extension'}
$snapshots[101] | Add-Member -NotePropertyName CreationDate -NotePropertyValue $start -Force
$recovery=@{Health=$health;AllowedRoots=@('C:\Project\books\extension','C:\Project\extension');PidPath=$recordPath;Port=8766;Lookup=$options.Lookup;Children=$options.Children}
try {
    $recovery.Health=$null
    $first=@(Resolve-LearningServiceProcessIds @recovery)
    $recovery.Health=$health
    Assert ($first.Count -eq 0 -and -not (Test-Path -LiteralPath $recordPath)) 'First startup must not require a PID file'
    $recovered=@(Resolve-LearningServiceProcessIds @recovery)
    Assert (($recovered -join ',') -eq '101') 'Missing PID must recover the verified migration service'
    Assert ((Get-Content -LiteralPath $recordPath -Raw).Trim() -eq '101') 'Recovered file must contain live PID'
    Assert ((Get-Item -LiteralPath $recordPath).LastWriteTime -eq $start) 'Recovered record must preserve process identity timestamp'
    foreach ($stale in @('999','not-a-pid','')) {
        Set-Content -LiteralPath $recordPath -Value $stale
        $null=Resolve-LearningServiceProcessIds @recovery
        Assert ((Get-Content -LiteralPath $recordPath -Raw).Trim() -eq '101') 'Stale or corrupt PID must be replaced using live identity'
    }
    $health.instancePath='C:\OtherProject\extension'
    Assert-Fails {Resolve-LearningServiceProcessIds @recovery} 'Another installation must not be adopted'
    $health.instancePath='C:\Project\books\extension'
    $snapshots[101].CommandLine='python unrelated.py'
    Assert-Fails {Resolve-LearningServiceProcessIds @recovery} 'Health must not authorize an unrelated process'
    $snapshots[101].CommandLine='python -m learning_service.server --port 9999'
    Assert-Fails {Resolve-LearningServiceProcessIds @recovery} 'Health must not authorize the wrong port'
    $snapshots[101].CommandLine='python -m learning_service.server --port 8766'
    $null=Resolve-LearningServiceProcessIds @recovery
    $health.processId=999
    Assert-Fails {Resolve-LearningServiceProcessIds @recovery} 'Exited service must not produce an invented PID record'
    Assert ((Get-Content -LiteralPath $recordPath -Raw).Trim() -eq '101') 'Failed verification must leave existing record intact'
    Write-Output 'PASS: first startup, missing/corrupt/stale PID recovery, migration and unrelated process protection.'
} finally {
    if (Test-Path -LiteralPath $recordPath) { Remove-Item -LiteralPath $recordPath -Force }
    if (Test-Path -LiteralPath $testDirectory) { Remove-Item -LiteralPath $testDirectory -Force }
}
