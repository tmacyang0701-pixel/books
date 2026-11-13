# Optional integration with the enclosing GESP / Number Garden bundle.
# No installation, registry writes, or network activity occurs when this file is imported.
function Get-CodeArenaBundleRoot {
    $candidate=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    if (Test-Path -LiteralPath (Join-Path $candidate 'codearena-bundle.json') -PathType Leaf) { return $candidate }
    return $null
}

function Get-CodeArenaRuntimeSelection {
    $bundle=Get-CodeArenaBundleRoot
    if ($bundle) {
        $selection=Join-Path $bundle 'runtime-selection.json'
        if (Test-Path -LiteralPath $selection -PathType Leaf) {
            try { return (Get-Content -LiteralPath $selection -Raw -Encoding UTF8 | ConvertFrom-Json) } catch {}
        }
    }
    return $null
}

function Get-LearningRegisteredPython {
    foreach ($base in @('HKCU:\Software\Python\PythonCore','HKLM:\Software\Python\PythonCore','HKLM:\Software\WOW6432Node\Python\PythonCore')) {
        if (-not (Test-Path $base)) { continue }
        foreach ($key in @(Get-ChildItem $base -ErrorAction SilentlyContinue)) {
            $install=Get-Item -LiteralPath ($key.PSPath+'\InstallPath') -ErrorAction SilentlyContinue
            if ($install) {
                $executable=$install.GetValue('ExecutablePath')
                if ($executable) { $executable }
                elseif ($install.GetValue('')) { [IO.Path]::Combine($install.GetValue(''),'python.exe') }
            }
        }
    }
}

function Get-CodeArenaBundledPython {
    $bundle=Get-CodeArenaBundleRoot
    if ($bundle) {
        $selection=Get-CodeArenaRuntimeSelection
        if ($selection.python) { $selection.python }
        Join-Path $bundle 'runtime\python-full\python.exe'
    }
}

function Get-CodeArenaBundledCompilers {
    $bundle=Get-CodeArenaBundleRoot
    if ($bundle) {
        $selection=Get-CodeArenaRuntimeSelection
        if ($selection.cppBin) { [IO.Path]::Combine($selection.cppBin,'g++.exe') }
        $homes=@((Join-Path $bundle 'runtime\Dev-Cpp'))
        if ($selection.devCppHome) { $homes+=$selection.devCppHome }
        foreach ($base in $homes) {
            foreach ($layout in @('TDM-GCC-64','MinGW64','MinGW','MinGW32')) { [IO.Path]::Combine($base,$layout+'\bin\g++.exe') }
        }
    }
}

function Get-CodeArenaBundledInstaller($Spec) {
    $bundle=Get-CodeArenaBundleRoot
    if (-not $bundle) { return $null }
    # Use the authoritative CodeArena checksum even for a locally supplied file.
    foreach ($folder in @('python','devcpp','chrome')) {
        $candidate=Join-Path (Join-Path $bundle $folder) $Spec.filename
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

function Get-CodeArenaPdfWheel {
    $bundle=Get-CodeArenaBundleRoot
    if (-not $bundle) { return $null }
    $directory=Join-Path $bundle 'python\wheels'
    $metadata=Join-Path $directory 'downloads.json'
    if (-not (Test-Path -LiteralPath $metadata -PathType Leaf)) { return $null }
    $spec=Get-Content -LiteralPath $metadata -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($spec.filename -notmatch '^pypdf-[0-9.]+-py3-none-any\.whl$' -or $spec.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
        throw 'Invalid bundled PDF dependency metadata.'
    }
    $wheel=Join-Path $directory $spec.filename
    if (-not (Test-Path -LiteralPath $wheel -PathType Leaf)) { throw 'The bundled pypdf wheel is missing. Extract the complete package.' }
    if ((Get-FileHash -LiteralPath $wheel -Algorithm SHA256).Hash -ine $spec.sha256) { throw 'Bundled pypdf checksum mismatch; nothing was installed from this file.' }
    return $wheel
}
