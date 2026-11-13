$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\bootstrap-windows.ps1')
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
function Assert-Fails([scriptblock]$Action,$Message){$failed=$false;try{& $Action}catch{$failed=$true};Assert $failed $Message}
Assert-Fails { Assert-LearningWindows ([version]'6.1.7601') 'AMD64' } 'Windows 7 must stop'
Assert-Fails { Assert-LearningWindows ([version]'10.0.22631') 'ARM64' } 'Unsupported architecture must stop'
Assert-LearningWindows ([version]'10.0.19045') 'AMD64'
Assert-LearningWindows ([version]'10.0.22631') 'AMD64'
$catalog=Get-Content (Join-Path $root 'scripts\windows-installers.json') -Raw | ConvertFrom-Json
Assert ($catalog.compiler.filename -notmatch 'No_Compiler') 'Must install the GCC bundle'
Assert ($catalog.python.sha256 -match '^[a-f0-9]{64}$') 'Python checksum required'
$temporary=Join-Path $root ('.tmp\bootstrap-hash-'+[guid]::NewGuid().ToString('N')+'.bin')
try {
    [IO.File]::WriteAllText($temporary,'fixture')
    Test-LearningInstaller $temporary ([pscustomobject]@{name='fixture';sha256=(Get-FileHash $temporary -Algorithm SHA256).Hash})
    Assert-Fails { Test-LearningInstaller $temporary $catalog.python } 'Corrupt downloads must stop'
} finally { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }

# Run the real orchestrator with inert process/download boundaries; no installed software is changed.
function Assert-LearningWindows {}
function Get-LearningBootstrapState($ExtensionRoot){return [pscustomobject]$script:installed}
function Get-LearningInstaller($Spec,$CacheDirectory){$script:events.Add('download:'+ $Spec.filename);if($script:failDownload){throw 'simulated download failure'};return $Spec.filename}
function Install-LearningApplication($Kind,$Path,$LogDirectory){$script:events.Add('install:'+ $Kind);if($script:failInstall){throw 'simulated installer failure'};if(-not $script:failDetection){$script:installed[$Kind]=$true}}
function Install-LearningPythonPackages($ExtensionRoot,$HostDirectory){$script:events.Add('packages');if($script:failPackages){throw 'simulated pip failure'}}
function Reset-Fixture($Ready=$false){$script:installed=@{python=$Ready;chrome=$Ready;compiler=$Ready};$script:events=New-Object System.Collections.Generic.List[string];$script:failDownload=$false;$script:failInstall=$false;$script:failDetection=$false;$script:failPackages=$false}
$previousPython=$env:CODEARENA_PYTHON
try {
    $env:CODEARENA_PYTHON=$null
    Reset-Fixture
    Initialize-LearningPrerequisites $root (Join-Path (Split-Path -Parent $root) 'native-host')
    Assert ($script:events.Count -eq 7) 'Fresh installation must prepare 3 apps, install 3 apps and install Python packages'
    Assert (($script:events[0..2] | Where-Object {$_ -like 'download:*'}).Count -eq 3) 'All downloads must be ready before the first application install'
    Assert (($script:events[3..5] -join ',') -eq 'install:python,install:chrome,install:compiler') 'Dependency installation order'
    Reset-Fixture $true
    Initialize-LearningPrerequisites $root 'native-host'
    Assert (($script:events -join ',') -eq 'packages') 'Usable existing applications must not be reinstalled'
    Reset-Fixture;$script:failDownload=$true
    Assert-Fails { Initialize-LearningPrerequisites $root 'native-host' } 'Download failure must stop'
    Assert (-not ($script:events | Where-Object {$_ -like 'install:*' -or $_ -eq 'packages'})) 'Failed downloads must not execute installers'
    Reset-Fixture;$script:failInstall=$true
    Assert-Fails { Initialize-LearningPrerequisites $root 'native-host' } 'Installer failure must stop'
    Assert (-not ($script:events -contains 'packages')) 'Failed installers must not proceed to Python packages'
    Reset-Fixture;$script:failDetection=$true
    Assert-Fails { Initialize-LearningPrerequisites $root 'native-host' } 'An installer exit of zero is not proof of a working dependency'
    Assert (($script:events | Where-Object {$_ -like 'install:*'}).Count -eq 1) 'Runtime check failure must stop later installers'
    Reset-Fixture $true;$script:failPackages=$true
    Assert-Fails { Initialize-LearningPrerequisites $root 'native-host' } 'pip failure must propagate and stop setup'
    Write-Output 'PASS: Windows targets, checksums, fresh/no-winget orchestration, reuse, download/install/runtime/pip failures.'
} finally { $env:CODEARENA_PYTHON=$previousPython }
