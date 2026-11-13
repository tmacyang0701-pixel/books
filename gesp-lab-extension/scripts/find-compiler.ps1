. (Join-Path $PSScriptRoot 'bundle-runtime.ps1')

function GetDevCppEntries {
    $keys = @(
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match '(^|\s)(Embarcadero\s+)?Dev-C\+\+' }
}
function FindCompiler {
    foreach ($candidate in @($env:CODEARENA_COMPILER)+@(Get-CodeArenaBundledCompilers)) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    $configPath = Join-Path $hostDir 'dist\config.json'
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        try {
            $savedCompiler = (Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json).compiler
            if ($savedCompiler -and (Test-Path -LiteralPath $savedCompiler -PathType Leaf)) {
                return (Resolve-Path -LiteralPath $savedCompiler).Path
            }
        } catch { }
    }
    $found = Get-Command g++.exe -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    $roots = @()
    foreach ($entry in @(GetDevCppEntries)) {
        if ($entry.InstallLocation) { $roots += $entry.InstallLocation.Trim('"') }
        foreach ($value in @($entry.DisplayIcon, $entry.UninstallString)) {
            if (-not $value) { continue }
            if ($value -match '^"([^"]+\.exe)"' -or $value -match '^(.*?\.exe)(?:,|\s|$)') {
                $roots += Split-Path -Parent $Matches[1]
            }
        }
    }
    $roots += @($env:ProgramFiles, ${env:ProgramFiles(x86)})
    # Probe only known layouts on local drives; do not recursively scan disks.
    foreach ($drive in @(Get-PSDrive -PSProvider FileSystem)) {
        if ($drive.Root -match '^[A-Za-z]:\\$') { $roots += $drive.Root }
    }
    $prefixes = @('', 'Dev-Cpp', 'Embarcadero Dev-Cpp', 'Embarcadero\Dev-Cpp',
        'Program Files\Embarcadero\Dev-Cpp', 'Program Files (x86)\Embarcadero\Dev-Cpp')
    $layouts = @('TDM-GCC-64\bin\g++.exe', 'TDM-GCC-32\bin\g++.exe',
        'MinGW64\bin\g++.exe', 'MinGW\bin\g++.exe', 'bin\g++.exe')
    $patterns = foreach ($prefix in $prefixes) {
        foreach ($layout in $layouts) {
            if ($prefix) { Join-Path $prefix $layout } else { $layout }
        }
    }
    foreach ($root in @($roots | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique)) {
        foreach ($relative in $patterns) {
            $full = Join-Path $root $relative
            if (Test-Path -LiteralPath $full -PathType Leaf) { return $full }
        }
    }
    return $null
}

