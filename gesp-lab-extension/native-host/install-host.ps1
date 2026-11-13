param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [Parameter(Mandatory=$true)][string]$Compiler,
  [Parameter(Mandatory=$true)][string]$ExtensionRoot,
  [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
$hostDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ExtensionRoot 'scripts\native-registration.ps1')
$launcherPath = Join-Path $hostDir 'start-host.bat'
$pythonPath = Join-Path $ExtensionRoot '.venv\Scripts\python.exe'
foreach ($required in @($launcherPath,$pythonPath,(Join-Path $hostDir 'host.py'))) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {throw "Missing $required. Run install-all.bat first."}
}
& $pythonPath -I -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)'
if ($LASTEXITCODE -ne 0) {throw 'The project Python environment is unusable. Run install-all.bat first.'}
if (-not (Test-Path -LiteralPath $Compiler)) {throw "Compiler not found: $Compiler"}
$compilerPath = (Resolve-Path -LiteralPath $Compiler).Path
$manifestPath = Join-Path $hostDir 'com.codearena.cpp_judge.json'
$manifest = @{
  name = 'com.codearena.cpp_judge'
  description = 'CodeArena local C++ judge'
  path = (Resolve-Path -LiteralPath $launcherPath).Path
  type = 'stdio'
  allowed_origins = @(Get-CodeArenaNativeOrigins -ExtensionRoot $ExtensionRoot -ExtensionId $ExtensionId)
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
New-Item -Path (Join-Path $hostDir 'dist') -ItemType Directory -Force | Out-Null
[System.IO.File]::WriteAllText((Join-Path $hostDir 'dist\config.json'), (@{compiler = $compilerPath;extensionRoot=(Resolve-Path -LiteralPath $ExtensionRoot).Path} | ConvertTo-Json), $utf8NoBom)
& $pythonPath (Join-Path $ExtensionRoot 'scripts\check-native-host.py') --host $launcherPath
if ($LASTEXITCODE -ne 0) {throw 'Native source host validation failed. Chrome registration was not changed.'}
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5), $utf8NoBom)
if ($PrepareOnly) { Write-Host 'Native host validated and manifest updated. Registry was not changed.'; exit 0 }
$key = 'HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.codearena.cpp_judge'
New-Item -Path $key -Force | Out-Null
Set-Item -Path $key -Value $manifestPath
Write-Host 'Native Messaging host installed for current Windows user.' -ForegroundColor Green
Write-Host "Extension ID: $ExtensionId"
Write-Host ('Allowed CodeArena extensions: '+($manifest.allowed_origins -join ', '))
Write-Host "Compiler: $compilerPath"
Write-Host 'Now close and reopen CodeArena extension tab.'
