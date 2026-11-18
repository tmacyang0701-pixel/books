param([string]$ProjectRoot=(Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$script:checks=0
function Assert($Condition,$Message) { if (-not $Condition) { throw $Message }; $script:checks++; Write-Host "PASS $Message" }
. (Join-Path $ProjectRoot 'gesp-lab-extension/scripts/windows-dependencies.ps1')
. (Join-Path $ProjectRoot 'gesp-lab-extension/scripts/bootstrap-windows.ps1')
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('ca-python-'+[guid]::NewGuid().ToString('N'))
$extension=Join-Path $temporary 'gesp-lab-extension'
New-Item -Path (Join-Path $extension 'scripts') -ItemType Directory -Force | Out-Null
New-Item -Path (Join-Path $temporary 'python') -ItemType Directory -Force | Out-Null
$script:executeWindows=[Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
try {
    $package=Get-LearningPythonRuntimePackage (Join-Path $ProjectRoot 'gesp-lab-extension')
    Assert ($package.Spec.sha256 -eq 'f54ba67c9951c3d773ea47d2bb095150c037c399f0423a968bcda22809241784') 'Official Python NuGet archive passes pinned SHA256'
    Copy-Item (Join-Path $ProjectRoot 'gesp-lab-extension/scripts/python-runtime.json') (Join-Path $extension 'scripts')
    $payload=Join-Path $temporary ('python/'+$package.Spec.filename)
    Copy-Item $package.Path $payload
    $manifest=Join-Path $temporary 'python/offline-bundle.json'
    @{pythonRuntime=$package.Spec}|ConvertTo-Json -Depth 5|Set-Content $manifest
    $script:installedPython=$null
    $script:failProbe=$false
    $script:probeCount=0
    $originalProbe=${function:Test-LearningPythonExecutable}
    function Find-LearningPython { return $script:installedPython }
    function Invoke-WebRequest { throw 'Unexpected network request' }
    function Start-Process { throw 'An MSI or EXE installer must not run' }
    if (-not $script:executeWindows) {
        function Get-LearningPythonVersion { return 'Python 3.14.10 (64-bit)' }
        # macOS cannot execute PE files. Extraction/hash/placement checks are real;
        # only the Windows executable probe is simulated on this platform.
        function Test-LearningPythonExecutable([string]$Path) {
            $script:probeCount++
            if ($script:failProbe) { return $false }
            return (Test-Path -LiteralPath $Path -PathType Leaf) -and ((Get-FileHash -LiteralPath $Path).Hash -eq $script:pythonExeHash)
        }
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive=[IO.Compression.ZipFile]::OpenRead($payload)
    try {
        $stream=$archive.GetEntry('tools/python.exe').Open()
        try { $sha=[Security.Cryptography.SHA256]::Create();$script:pythonExeHash=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') } finally { $stream.Dispose();$sha.Dispose() }
    } finally { $archive.Dispose() }
    $python=Initialize-LearningPrivatePython $extension
    Assert ($python -eq (Join-Path $extension '.local/python-3.14.10/tools/python.exe')) 'Missing Python is provisioned locally without any MSI process or network'
    Assert ((Get-FileHash $python).Hash -eq $script:pythonExeHash) 'Extracted Python executable exactly matches the official package'
    foreach ($file in @('Lib/venv/__main__.py','Lib/ensurepip/__main__.py','vcruntime140.dll','vcruntime140_1.dll','LICENSE.txt')) {
        Assert (Test-Path (Join-Path (Split-Path $python) $file)) ('Private runtime includes '+$file)
    }
    Assert (Test-Path (Join-Path $extension '.local/python-runtime.log')) 'Private runtime writes a concrete diagnostic log'
    $script:installedPython=$python
    $before=$script:probeCount
    Assert ((Initialize-LearningPrivatePython $extension) -eq $python -and $script:probeCount -eq $before) 'Usable Python is reused without another extraction'
    $script:installedPython=$null
    $keep=Join-Path $extension '.local/keep-user-data.txt';Set-Content $keep 'preserve me'
    $python=Initialize-LearningPrivatePython $extension
    Assert ((Get-Content $keep) -eq 'preserve me' -and @(Get-ChildItem (Join-Path $extension '.local') -Directory -Filter 'python-3.14.10.unusable-*').Count -eq 1) 'Replacing an unusable runtime preserves its backup and unrelated user data'
    $script:failProbe=$true
    $message='';try { Initialize-LearningPrivatePython $extension|Out-Null } catch { $message=$_.Exception.Message }
    Assert ($message -match 'python-runtime.log' -and (Test-Path $python)) 'A failed runtime check stops with a log path and preserves the existing runtime'
    Assert (@(Get-ChildItem (Join-Path $extension '.local') -Directory -Filter 'python-unpack-*').Count -eq 0) 'Failed runtime extraction staging is cleaned up'
    $script:failProbe=$false
    $bad=@{pythonRuntime=@{filename=$package.Spec.filename;sha256=('0'*64)}}
    $bad|ConvertTo-Json -Depth 4|Set-Content $manifest
    $message='';try { Get-LearningPythonRuntimePackage $extension|Out-Null } catch { $message=$_.Exception.Message }
    Assert ($message -match 'manifest mismatch') 'Mismatched offline manifest rejects runtime before execution'
    Remove-Item $manifest
    Add-Content $payload 'corrupt'
    $message='';try { Get-LearningPythonRuntimePackage $extension|Out-Null } catch { $message=$_.Exception.Message }
    Assert ($message -match 'checksum mismatch') 'Corrupt local runtime stops without a network fallback'
    Remove-Item $payload
    $message='';try { Get-LearningPythonRuntimePackage $extension|Out-Null } catch { $message=$_.Exception.Message }
    Assert ($message -match 'Missing local Python runtime') 'Missing local runtime stops with its exact expected path'
    $unsafe=Join-Path $temporary 'unsafe.zip'
    $zip=[IO.Compression.ZipFile]::Open($unsafe,[IO.Compression.ZipArchiveMode]::Create)
    try { $null=$zip.CreateEntry('../escape.txt') } finally { $zip.Dispose() }
    $message='';try { Expand-LearningPythonRuntimeArchive $unsafe (Join-Path $temporary 'unsafe') } catch { $message=$_.Exception.Message }
    Assert ($message -match 'Unsafe path' -and -not (Test-Path (Join-Path $temporary 'escape.txt'))) 'Archive traversal is rejected before extraction'
    # The complete prerequisite dispatcher must select the private runtime and
    # skip the Python EXE installer, then continue to offline package setup.
    Copy-Item $package.Path $payload
    Copy-Item (Join-Path $ProjectRoot 'gesp-lab-extension/scripts/windows-installers.json') (Join-Path $extension 'scripts')
    function Assert-LearningWindows {}
    $script:runtimeReady=$false;$script:packageCalls=0;$script:runtimeCalls=0
    function Get-LearningBootstrapState { return [pscustomobject]@{python=$script:runtimeReady;chrome=$true;compiler=$true} }
    function Initialize-LearningPrivatePython { $script:runtimeCalls++;$script:runtimeReady=$true;$script:installedPython='private-python';return 'private-python' }
    function Get-LearningInstaller { throw 'Unexpected system installer lookup' }
    function Install-LearningApplication { throw 'Unexpected system installer execution' }
    function Install-LearningPythonPackages { $script:packageCalls++ }
    $env:CXX='existing-compiler'
    Initialize-LearningPrerequisites $extension (Join-Path $extension 'native-host')
    Assert ($script:runtimeCalls -eq 1 -and $script:packageCalls -eq 1) 'Prerequisite dispatcher bypasses system Python installer and continues to offline dependencies'
    Initialize-LearningPrerequisites $extension (Join-Path $extension 'native-host')
    Assert ($script:runtimeCalls -eq 1 -and $script:packageCalls -eq 2) 'Second full prerequisite pass skips all usable applications'
    # Re-import a fixture copy to test daily-start discovery of the private
    # runtime in its own project, after the installer process has exited.
    Copy-Item (Join-Path $ProjectRoot 'gesp-lab-extension/scripts/windows-dependencies.ps1') (Join-Path $extension 'scripts')
    Copy-Item (Join-Path $ProjectRoot 'gesp-lab-extension/scripts/bundle-runtime.ps1') (Join-Path $extension 'scripts')
    . (Join-Path $extension 'scripts/windows-dependencies.ps1')
    if (-not $script:executeWindows) {
        function Test-LearningPythonExecutable([string]$Path) { return $Path -eq $python }
    }
    $env:CODEARENA_PYTHON=$null
    $env:USERPROFILE=$temporary;$env:LOCALAPPDATA=$temporary;$env:ProgramFiles=$temporary
    Assert ((Find-LearningPython) -eq $python) 'A later process rediscovers private Python without PATH changes or environment overrides'
    $env:CODEARENA_PYTHON=Join-Path $temporary 'missing-override.exe'
    Assert ($null -eq (Find-LearningPython)) 'An invalid explicit override remains an error rather than being silently replaced'
    Write-Host "All $script:checks Python runtime checks passed. Windows executable probes executed: $script:executeWindows"
} finally { Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue }
