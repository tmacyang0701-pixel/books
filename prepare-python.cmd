@echo off
setlocal
set "HMT_OFFLINE_ROOT=%~dp0"
if exist "%HMT_OFFLINE_ROOT%runtime\python\python.exe" goto ready
echo [1/3] Verifying bundled Python archive...
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $archive=Join-Path $env:HMT_OFFLINE_ROOT 'python\python-3.14.10-embed-amd64.zip'; $expected='90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159'; if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Python archive checksum mismatch.' }; Write-Host '[2/3] Extracting Python locally (no download)...'; $destination=Join-Path $env:HMT_OFFLINE_ROOT 'runtime\python'; Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force"
if errorlevel 1 exit /b 1
:ready
echo [3/3] Checking bundled Python...
"%HMT_OFFLINE_ROOT%runtime\python\python.exe" -I -c "import sys; print('Python ready:', sys.version.split()[0]); print(sys.executable)"
exit /b %errorlevel%
