$ErrorActionPreference='Stop'
$sourceRoot=Split-Path -Parent $PSScriptRoot
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('codearena-start-test-'+[guid]::NewGuid().ToString('N'))
$fixture=Join-Path $fixtureRoot 'books\gesp-lab-extension'
$scripts=Join-Path $fixture 'scripts'
New-Item -ItemType Directory -Path $scripts -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'start-learning.ps1') -Destination $fixture
Copy-Item -LiteralPath (Join-Path $sourceRoot 'scripts\service-process.ps1') -Destination $scripts
Add-Content -LiteralPath (Join-Path $scripts 'service-process.ps1') -Value 'function Test-LearningPortAvailable([int]$Port){return ($Port -ne 8766 -or $script:mode -ne "occupied")}'
# Run the real entry point in an isolated child shell. Model/network/process
# operations are fixtures: no installed service is started, stopped or changed.
@'
$script:fixture=Split-Path -Parent $PSScriptRoot
$script:mode=(Get-Content -LiteralPath (Join-Path $fixture 'case.txt') -Raw).Trim()
$script:started=$false
$script:stopped=$false
function Find-LearningPython { return 'Invoke-FixturePython' }
function Invoke-FixturePython {
    $global:LASTEXITCODE=0
    if ($args -contains '--config-only') { '{"port":8766}' }
}
function Test-PythonDependency { return $true }
function Invoke-RestMethod {
    param($Uri,$TimeoutSec)
    if (($mode -eq 'first' -or $stopped) -and -not $started) { throw 'No service' }
    if ($mode -eq 'occupied' -and -not $started) { throw 'Not an HTTP service' }
    $instance=$fixture
    if ($mode -eq 'migration' -and -not $started) { $instance=Join-Path (Split-Path -Parent (Split-Path -Parent $fixture)) 'extension' }
    if ($mode -eq 'foreign' -and -not $started) { $instance='C:\Unrelated\extension' }
    [pscustomobject]@{service='codearena-learning';version=12;processId=$(if($started){202}else{101});instancePath=$instance;configured=$true;model='fixture'}
}
function Get-CimInstance {
    param($ClassName,$Filter,$ErrorAction)
    if ($Filter -like 'ParentProcessId*') { return @() }
    [pscustomobject]@{ProcessId=101;ParentProcessId=0;Name='python.exe';CommandLine='python -m learning_service.server --port 8766';CreationDate=[datetime]'2026-01-01T00:00:00'}
}
function Get-Process {
    param($Id,$ErrorAction)
    $process=[pscustomobject]@{Id=$Id;HasExited=$false}
    $process | Add-Member ScriptMethod WaitForExit {param($timeout) return $true}
    return $process
}
function Stop-Process {
    param($InputObject,$Id,$ErrorAction)
    if ($InputObject.Id -ne 101) { throw 'Unexpected process stop' }
    Add-Content -LiteralPath (Join-Path $fixture 'events.txt') -Value 'stop 101'
    $script:stopped=$true
}
function Start-Process {
    param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError)
    if ($mode -notin @('first','foreign','occupied') -and -not $stopped) { throw 'Duplicate service start' }
    if ($mode -in @('foreign','occupied') -and $ArgumentList[-1] -ne '8767') { throw 'Occupied port was not changed' }
    if ($WorkingDirectory -ne $fixture -or $WindowStyle -ne 'Hidden') { throw 'Invalid service launch' }
    Add-Content -LiteralPath (Join-Path $fixture 'events.txt') -Value 'start 202'
    $script:started=$true
    [pscustomobject]@{Id=202;HasExited=$false}
}
function Start-Sleep {param($Milliseconds)}
'@ | Set-Content -LiteralPath (Join-Path $scripts 'windows-dependencies.ps1') -Encoding UTF8
foreach ($mode in @('first','migration','corrupt','already','installed','foreign','occupied')) {
    Set-Content -LiteralPath (Join-Path $fixture 'case.txt') -Value $mode
    $pidPath=Join-Path $fixture '.local\service.pid'
    $eventsPath=Join-Path $fixture 'events.txt'
    $endpointPath=Join-Path $fixture '.local\service-endpoint.json'
    foreach($file in @($pidPath,$eventsPath,$endpointPath)){if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}
    if($mode -eq 'corrupt') {Set-Content -LiteralPath $pidPath -Value 'bad old PID'}
    $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $fixture 'start-learning.ps1'))
    if($mode -in @('corrupt','installed','foreign','occupied')){$arguments+='-Restart'}
    & powershell.exe @arguments
    if($LASTEXITCODE -ne 0){throw "$mode startup failed"}
    $expected=if($mode -eq 'already'){'101'}else{'202'}
    if((Get-Content -LiteralPath $pidPath -Raw).Trim() -ne $expected){throw "$mode PID was not generated"}
    $events=if(Test-Path -LiteralPath $eventsPath){@(Get-Content -LiteralPath $eventsPath) -join ','}else{''}
    $expectedEvents=switch($mode){'first'{'start 202'};'already'{''};'foreign'{'start 202'};'occupied'{'start 202'};default{'stop 101,start 202'}}
    if($events -ne $expectedEvents){throw "$mode process sequence mismatch: $events"}
    $endpoint=Get-Content -LiteralPath $endpointPath -Raw | ConvertFrom-Json
    $expectedPort=if($mode -in @('foreign','occupied')){8767}else{8766}
    if($endpoint.port -ne $expectedPort){throw "$mode endpoint must match the running service"}
    Write-Output "PASS: $mode entry-point startup and PID recovery"
}
