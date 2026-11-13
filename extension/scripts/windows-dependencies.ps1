. (Join-Path $PSScriptRoot 'bundle-runtime.ps1')

function Find-LearningPython {
    $candidates=@()
    if ($env:CODEARENA_PYTHON) { $candidates=@($env:CODEARENA_PYTHON) }
    else {
        $candidates += Join-Path (Split-Path -Parent $PSScriptRoot) '.venv\Scripts\python.exe'
        $candidates += @(Get-CodeArenaBundledPython)
        $candidates += @(Get-LearningRegisteredPython)
        $candidates += Join-Path $env:USERPROFILE 'lfun-github\explanation\.venv\Scripts\python.exe'
        $command=Get-Command python.exe -ErrorAction SilentlyContinue
        if ($command) { $candidates += $command.Source }
        $candidates += @(Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python*\python.exe') -ErrorAction SilentlyContinue | ForEach-Object FullName)
    }
    foreach ($candidate in $candidates) {
        if ($candidate -match '\\Microsoft\\WindowsApps\\python(?:3)?\.exe$') { continue } # Store shortcut, not an installed runtime.
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try {
            & $candidate -I -c 'import sys,ssl,sqlite3,venv; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>$null
            if ($LASTEXITCODE -eq 0) { return $candidate }
        } catch {}
    }
    if (-not $env:CODEARENA_PYTHON) {
        $launcher=Get-Command py.exe -ErrorAction SilentlyContinue
        if ($launcher) {
            try {
                $candidate=& $launcher.Source -3 -c 'import sys; print(sys.executable)' 2>$null
                if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $candidate)) {
                    & $candidate -I -c 'import sys,ssl,sqlite3,venv; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>$null
                    if ($LASTEXITCODE -eq 0) { return $candidate }
                }
            } catch {}
        }
    }
    return $null
}

function Test-PythonDependency($PythonPath,$ModuleName) {
    try {
        & $PythonPath -I -c 'import importlib,sys; importlib.import_module(sys.argv[1])' $ModuleName 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

function Find-LearningChrome {
    $paths=@((Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),(Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'))
    if (${env:ProgramFiles(x86)}) { $paths+=Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe' }
    return $paths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

function Test-LearningCompiler($CompilerPath,$ExtensionRoot) {
    if (-not $CompilerPath) { return $false }
    $checkDir=Join-Path $ExtensionRoot ('.tmp\compiler-check-'+[guid]::NewGuid().ToString('N'))
    New-Item -Path $checkDir -ItemType Directory -Force | Out-Null
    $source=Join-Path $checkDir 'probe.cpp'
    $program=Join-Path $checkDir 'probe.exe'
    $previousPath=$env:PATH
    try {
        $env:PATH=(Split-Path -Parent $CompilerPath)+';'+$previousPath
        Set-Content -LiteralPath $source -Encoding ASCII -Value '#include <iostream>', 'int main(){std::cout << 42;}'
        & $CompilerPath -std=c++17 $source -o $program 2>$null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $program)) { return $false }
        $value=& $program
        return ($LASTEXITCODE -eq 0 -and $value -eq '42')
    } catch { return $false }
    finally {
        $env:PATH=$previousPath
        Remove-Item -LiteralPath $source,$program -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $checkDir -Force -ErrorAction SilentlyContinue
    }
}

function Test-LearningDebugger($CompilerPath) {
    if (-not $CompilerPath) { return $false }
    $gdb=Join-Path (Split-Path -Parent $CompilerPath) 'gdb.exe'
    if (-not (Test-Path -LiteralPath $gdb -PathType Leaf)) {
        $command=Get-Command gdb.exe -ErrorAction SilentlyContinue
        if (-not $command) { return $false }
        $gdb=$command.Source
    }
    $previousPath=$env:PATH
    $previousError=$ErrorActionPreference
    try {
        $env:PATH=(Split-Path -Parent $gdb)+';'+$previousPath
        # Older bundled GDB emits harmless Python SyntaxWarnings on stderr.
        # PowerShell 5.1 must not turn these into a terminating exception.
        $ErrorActionPreference='Continue'
        $output=& $gdb -q -nx -batch -ex 'python print(314159)' 2>$null
        return ($LASTEXITCODE -eq 0 -and @($output | Where-Object { "$_".Trim() -eq '314159' }).Count -gt 0)
    } catch { return $false }
    finally { $env:PATH=$previousPath; $ErrorActionPreference=$previousError }
}
