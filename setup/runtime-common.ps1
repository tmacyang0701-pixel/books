$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Write-SetupState([string]$Message, [int]$Completed = 0, [string]$Phase = 'processing') {
    if (-not $env:HMT_SETUP_STATE) { Write-Host $Message; return }
    $state = @{ state = $Phase; step = 1; totalSteps = 8; completedSteps = $Completed; message = $Message; percent = $null; phaseStarted = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); logs = @($Message) }
    $parent = Split-Path $env:HMT_SETUP_STATE
    [IO.Directory]::CreateDirectory($parent) | Out-Null
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($env:HMT_SETUP_STATE, ($state | ConvertTo-Json -Depth 8 -Compress), $utf8)
}

function Get-CompatibleNode([string]$Root) {
    $paths = @()
    $selectionFile = Join-Path $Root 'runtime-selection.json'
    if (Test-Path -LiteralPath $selectionFile) {
        try { $selected = Get-Content -LiteralPath $selectionFile -Raw -Encoding UTF8 | ConvertFrom-Json; if ($selected.node) { $paths += $selected.node } } catch {}
    }
    $paths += @(Get-Command node.exe -CommandType Application -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
    if ($env:ProgramFiles) { $paths += Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    $paths += Join-Path $Root 'runtime\node-v22.23.5-win-x64\node.exe'
    foreach ($path in @($paths | Select-Object -Unique)) {
        if (-not $path -or $path -match '\\WindowsApps\\' -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        try {
            $version = & $path --version 2>$null
            if ($LASTEXITCODE -eq 0 -and "$version" -match '^v(\d+)\.') {
                if ([int]$matches[1] -ge 22) { return $path }
            }
        } catch {}
    }
    return $null
}

function Ensure-Node([string]$Root) {
    Write-SetupState '正在检测现有 Node.js（要求 22 或更新版本）'
    $node = Get-CompatibleNode $Root
    if ($node) { Write-SetupState 'Node.js 已可用，跳过重复安装。' 1; return $node }
    Write-SetupState '未找到可用 Node.js，正在校验包内便携运行时。'
    $archive = Join-Path $Root 'node\node-v22.23.5-win-x64.zip'
    $expected = '4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3'
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node.js 压缩包校验失败，请重新获取完整整合包。' }
    Write-SetupState '正在解压本地 Node.js 运行时，不需要联网下载。'
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $Root 'runtime') -Force
    $node = Get-CompatibleNode $Root
    if (-not $node) { throw 'Node.js 解压后的运行检查失败。' }
    $env:HMT_NODE_BOOTSTRAPPED = '1'
    Write-SetupState 'Node.js 已准备完成。' 1
    return $node
}
