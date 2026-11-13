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
