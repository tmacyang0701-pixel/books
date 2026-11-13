@echo off
setlocal
set "HMT_OFFLINE_ROOT=%~dp0"
if exist "%HMT_OFFLINE_ROOT%runtime\node-v22.23.5-win-x64\node.exe" goto ready
echo [1/3] Verifying bundled Node.js archive...
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $archive=Join-Path $env:HMT_OFFLINE_ROOT 'node\node-v22.23.5-win-x64.zip'; $expected='4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3'; if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node.js archive checksum mismatch.' }; Write-Host '[2/3] Extracting bundled Node.js locally (no download)...'; Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $env:HMT_OFFLINE_ROOT 'runtime') -Force"
if errorlevel 1 exit /b 1
:ready
echo [3/3] Checking bundled Node.js...
"%HMT_OFFLINE_ROOT%runtime\node-v22.23.5-win-x64\node.exe" -p "'Node.js ready: ' + process.version + ' / ' + process.arch"
exit /b %errorlevel%
