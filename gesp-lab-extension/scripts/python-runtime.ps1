function Get-LearningPythonRuntimeSpec([string]$ExtensionRoot) {
    $spec=Get-Content -LiteralPath (Join-Path $ExtensionRoot 'scripts\python-runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($spec.directory -notmatch '^python-\d+\.\d+\.\d+$' -or $spec.filename -notmatch '^python-[\d.]+-win-x64\.nupkg$' -or $spec.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
        throw 'Invalid bundled Python runtime specification.'
    }
    return $spec
}

function Get-LearningPythonRuntimePackage([string]$ExtensionRoot) {
    $spec=Get-LearningPythonRuntimeSpec $ExtensionRoot
    $bundle=Join-Path (Split-Path -Parent $ExtensionRoot) 'python'
    $markerPath=Join-Path $bundle 'offline-bundle.json'
    if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
        $marker=Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($marker.pythonRuntime.filename -ne $spec.filename -or $marker.pythonRuntime.sha256 -ine $spec.sha256) { throw 'Python runtime bundle manifest mismatch. Extract the complete Python repair package.' }
    }
    $path=Join-Path $bundle $spec.filename
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing local Python runtime: $path. No download will be attempted." }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $spec.sha256) { throw 'Bundled Python runtime checksum mismatch. No runtime was executed.' }
    return [pscustomobject]@{Spec=$spec;Path=$path}
}

function Expand-LearningPythonRuntimeArchive([string]$Package,[string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive=[IO.Compression.ZipFile]::OpenRead($Package)
    try {
        foreach ($entry in $archive.Entries) {
            $name=$entry.FullName.Replace('\','/')
            if ($name.StartsWith('/') -or $name -match '(^|/)\.\.(/|$)|:' -or $name -match '[\x00-\x1f]') { throw 'Unsafe path in the Python runtime archive.' }
        }
    } finally { $archive.Dispose() }
    # The two-argument overload works on Windows PowerShell 5.1 / .NET Framework.
    [IO.Compression.ZipFile]::ExtractToDirectory($Package,$Destination)
}

function Initialize-LearningPrivatePython([string]$ExtensionRoot) {
    $existing=Find-LearningPython
    if ($existing) { Write-Host ("Using compatible {0}; skipping extraction: {1}" -f (Get-LearningPythonVersion $existing),$existing) -ForegroundColor Green; return $existing }
    $package=Get-LearningPythonRuntimePackage $ExtensionRoot
    $local=Join-Path $ExtensionRoot '.local'
    New-Item -Path $local -ItemType Directory -Force | Out-Null
    $target=Join-Path $local $package.Spec.directory
    $staging=Join-Path $local ('python-unpack-'+[guid]::NewGuid().ToString('N'))
    $log=Join-Path $local 'python-runtime.log'
    try {
        Write-Host '正在从本地包解压 Python；无需运行系统 Python 安装器。' -ForegroundColor Cyan
        Expand-LearningPythonRuntimeArchive $package.Path $staging
        $probe=Join-Path $staging 'tools\python.exe'
        if (-not (Test-LearningPythonExecutable $probe)) { throw 'The extracted Python runtime could not start. Check Windows security software and folder access.' }
        if (Test-Path -LiteralPath $target) {
            $backup=$target+'.unusable-'+[guid]::NewGuid().ToString('N')
            Move-Item -LiteralPath $target -Destination $backup
        }
        Move-Item -LiteralPath $staging -Destination $target
        $python=Join-Path $target 'tools\python.exe'
        if (-not (Test-LearningPythonExecutable $python)) { throw 'Python runtime failed its final executable check.' }
        Set-Content -LiteralPath $log -Encoding UTF8 -Value ('Ready: '+$python)
        Write-Host ("本地 {0} 检查通过：{1}" -f (Get-LearningPythonVersion $python),$python) -ForegroundColor Green
        return $python
    } catch {
        Set-Content -LiteralPath $log -Encoding UTF8 -Value $_.Exception.Message
        throw "Local Python setup failed. Log: $log. Detail: $($_.Exception.Message)"
    } finally {
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
