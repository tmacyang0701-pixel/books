$ErrorActionPreference='Stop'
$bundle=Split-Path -Parent $PSScriptRoot
$source=Join-Path $bundle 'extension'
if(Test-Path -LiteralPath (Join-Path $bundle 'gesp-lab-extension')){$source=Join-Path $bundle 'gesp-lab-extension'}
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('codearena-stop-test-'+[guid]::NewGuid().ToString('N'))
$root=Join-Path $fixture 'books\gesp-lab-extension'
$setup=Join-Path $fixture 'books\setup'
New-Item -Path $setup,(Join-Path $root 'scripts'),(Join-Path $root '.local') -ItemType Directory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $bundle 'setup\stop-codearena.ps1') -Destination $setup
$helper=Join-Path $root 'scripts\service-process.ps1'
Copy-Item -LiteralPath (Join-Path $source 'scripts\service-process.ps1') -Destination $helper
@'
$script:fixtureRoot=Split-Path -Parent $PSScriptRoot
$script:mode=(Get-Content -LiteralPath (Join-Path $fixtureRoot 'case.txt') -Raw).Trim()
function Invoke-RestMethod {
 param($Uri,$TimeoutSec)
 if($mode -in @('stopped','unresponsive','wrong-record')){throw 'No response'}
 [pscustomobject]@{service=$(if($mode -eq 'unrelated'){'other-service'}else{'codearena-learning'});processId=101;instancePath=$fixtureRoot}
}
function Get-CimInstance {
 param($ClassName,$Filter,$ErrorAction)
 if($Filter -like 'ParentProcessId*'){return @()}
 [pscustomobject]@{ProcessId=101;Name='python.exe';CommandLine=$(if($mode -eq 'wrong-record'){'python other_app.py'}else{'python -m learning_service.server --port 8766'});CreationDate=[datetime]'2026-01-01'}
}
function Get-Process {
 param($Id,$ErrorAction)
 $process=[pscustomobject]@{Id=$Id;HasExited=$false;StartTime=[datetime]'2026-01-01'}
 $process | Add-Member ScriptMethod WaitForExit {param($timeout)return $true}
 $process
}
function Stop-Process {
 param($InputObject,$ErrorAction)
 if($InputObject.Id -ne 101 -or $mode -in @('unrelated','wrong-record','stopped')){throw 'Unsafe process stop attempted'}
 Add-Content -LiteralPath (Join-Path $fixtureRoot 'events.txt') -Value $InputObject.Id
}
'@ | Add-Content -LiteralPath $helper -Encoding UTF8
foreach($mode in @('running','pid-missing','unresponsive','unrelated','stopped','wrong-record')){
 Set-Content -LiteralPath (Join-Path $root 'case.txt') -Value $mode
 $pidFile=Join-Path $root '.local\service.pid';$events=Join-Path $root 'events.txt'
 foreach($file in @($pidFile,$events)){if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}
 if($mode -in @('running','unresponsive','wrong-record')){Set-Content -LiteralPath $pidFile -Value 101;(Get-Item -LiteralPath $pidFile).LastWriteTime=[datetime]'2026-01-01'}
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $setup 'stop-codearena.ps1')
 if($LASTEXITCODE -ne $(if($mode -eq 'wrong-record'){1}else{0})){throw "$mode exit status mismatch"}
 $stopped=Test-Path -LiteralPath $events
 if($stopped -ne ($mode -in @('running','pid-missing','unresponsive'))){throw "$mode stop result mismatch"}
 Write-Output "PASS: $mode stop scenario"
}
