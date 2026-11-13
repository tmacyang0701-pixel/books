$ErrorActionPreference='Stop'
$bundleRoot=Split-Path -Parent $PSScriptRoot
$extensionRoot=Join-Path $bundleRoot 'extension'
. (Join-Path $extensionRoot 'scripts\windows-dependencies.ps1')
. (Join-Path $extensionRoot 'scripts\bootstrap-windows.ps1')
function Assert($Condition,$Message) { if (-not $Condition) { throw $Message } }
function Assert-Fails([scriptblock]$Action,$Message) {
    $failed=$false
    try { & $Action | Out-Null } catch { $failed=$true }
    Assert $failed $Message
}
Assert ((Get-CodeArenaBundleRoot) -eq $bundleRoot) 'Bundle root must be resolved relative to this copy, not Downloads.'
$catalog=Get-Content (Join-Path $extensionRoot 'scripts\windows-installers.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($kind in @('python','compiler')) {
    $path=Get-CodeArenaBundledInstaller $catalog.$kind
    Assert ([bool]$path) "Missing bundled $kind installer"
    Test-LearningInstaller $path $catalog.$kind
}
Assert ([bool](Get-CodeArenaPdfWheel)) 'Verified PDF wheel must be available offline.'

# All mutations below are confined to this unique test fixture; no app is installed.
$fixture=Join-Path $bundleRoot ('.tmp\gesp-integration-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixture 'python\wheels') -Force | Out-Null
function Get-CodeArenaBundleRoot { return $fixture }
$script:downloads=0
function Invoke-WebRequest { param($UseBasicParsing,$Uri,$OutFile,$TimeoutSec); $script:downloads++; throw 'No network is allowed in this test.' }
$selection=@{python='Z:\old-bundle\python.exe';cppBin='Z:\old-bundle\bin'}
$selection | ConvertTo-Json | Set-Content (Join-Path $fixture 'runtime-selection.json') -Encoding UTF8
Assert (@(Get-CodeArenaBundledPython) -contains $selection.python) 'Previously selected Python must be considered.'
Assert (@(Get-CodeArenaBundledPython) -contains (Join-Path $fixture 'runtime\python-full\python.exe')) 'Moved bundles must consider their new local runtime.'
Assert (@(Get-CodeArenaBundledCompilers) -contains ([IO.Path]::Combine($selection.cppBin,'g++.exe'))) 'Previously selected C++ must be considered.'

$file=Join-Path $fixture 'python\fixture.exe'
[IO.File]::WriteAllText($file,'trusted fixture')
$spec=[pscustomobject]@{filename='fixture.exe';name='test installer';sha256=(Get-FileHash $file -Algorithm SHA256).Hash}
$prepared=Get-LearningInstaller $spec (Join-Path $fixture 'cache')
Assert ($prepared -eq $file) 'Bundled installer must be reused without copying or downloading.'
[IO.File]::WriteAllText($file,'tampered')
Assert-Fails { Get-LearningInstaller $spec (Join-Path $fixture 'cache') } 'Corrupt bundled installer must stop instead of downloading/executing.'
Assert ($script:downloads -eq 0) 'Offline installer resolution must not access the network.'

$wheel=Join-Path $fixture 'python\wheels\pypdf-6.11.0-py3-none-any.whl'
[IO.File]::WriteAllText($wheel,'fixture wheel')
@{filename=(Split-Path $wheel -Leaf);sha256=(Get-FileHash $wheel -Algorithm SHA256).Hash} |
    ConvertTo-Json | Set-Content (Join-Path $fixture 'python\wheels\downloads.json') -Encoding UTF8
Assert ((Get-CodeArenaPdfWheel) -eq $wheel) 'Verified local PDF wheel must be selected.'
[IO.File]::WriteAllText($wheel,'tampered wheel')
Assert-Fails { Get-CodeArenaPdfWheel } 'Corrupt PDF wheel must stop.'
Remove-Item -LiteralPath $wheel
Assert-Fails { Get-CodeArenaPdfWheel } 'An incomplete bundled dependency must stop.'

[IO.File]::WriteAllText((Join-Path $fixture 'runtime-selection.json'),'not json')
Assert ($null -eq (Get-CodeArenaRuntimeSelection)) 'Old/malformed selection must allow normal rediscovery.'

# A harmless stderr warning must not make the GDB Python probe fail on PS 5.1.
$fakeBin=Join-Path $fixture 'compiler'
New-Item -ItemType Directory -Path $fakeBin -Force | Out-Null
$fakeGdb=Join-Path $fakeBin 'gdb.exe'
Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32\where.exe') -Destination $fakeGdb
Assert (-not (Test-LearningDebugger (Join-Path $fakeBin 'g++.exe'))) 'A present executable without GDB Python support must fail.'

# A compiler without the debugger is not a complete GESP toolchain.
function FindCompiler { return 'fixture-compiler' }
function Test-LearningCompiler { return $true }
function Test-LearningDebugger { return $false }
function Find-LearningPython { return 'fixture-python' }
function Find-LearningChrome { return 'fixture-chrome' }
Assert (-not (Get-LearningBootstrapState $fixture).compiler) 'Missing GDB must trigger toolchain repair even when C++ compiles.'

# Exercise the stale-registration repair path without launching installers.
$script:starts=New-Object System.Collections.Generic.List[object]
function Start-Process {
    param($FilePath,$ArgumentList,$WindowStyle,[switch]$Wait,[switch]$PassThru,$Verb)
    $script:starts.Add([pscustomobject]@{file=$FilePath;arguments=$ArgumentList})
    return [pscustomobject]@{ExitCode=0}
}
Install-LearningApplication 'python' $file $fixture
Assert ($script:starts.Count -eq 1) 'A working Python after install must not run repair.'
Assert ($script:starts[0].arguments -match 'TargetDir=') 'Fresh Python must target the current bundle runtime.'
function Find-LearningPython { return $null }
function Get-LearningRegisteredPython { return (Join-Path $fixture 'old\runtime\python-full\python.exe') }
$script:starts.Clear()
Install-LearningApplication 'python' $file $fixture
Assert ($script:starts.Count -eq 2 -and $script:starts[1].arguments -match '/repair') 'Missing registered bundle Python must request repair before re-detection.'
Write-Output 'PASS: bundled EXE/wheel checksums, offline reuse, corrupt/missing file rejection, moved/malformed runtime selections, debugger validation, Python install/repair dispatch.'
