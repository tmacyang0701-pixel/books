@echo off
setlocal
set "HMT_OFFLINE_ROOT=%~dp0"
echo [1/3] Verifying the bundled offline installer...
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $installer=Join-Path $env:HMT_OFFLINE_ROOT 'python\python-3.14.10-amd64.exe'; $expected='92480239264744fe0386a1bd8275786fefa126e3129e56a68e22b52c73329965'; if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Python installer checksum mismatch.' }"
if errorlevel 1 exit /b 1
echo [2/3] Installing locally. The installer window displays progress.
start "" /wait "%HMT_OFFLINE_ROOT%python\python-3.14.10-amd64.exe" /passive InstallAllUsers=0 Include_pip=1 Include_test=0 Include_launcher=0 PrependPath=0 Shortcuts=0 TargetDir="%HMT_OFFLINE_ROOT%runtime\python-full"
set "HMT_INSTALL_EXIT=%errorlevel%"
if "%HMT_INSTALL_EXIT%"=="3010" goto check
if not "%HMT_INSTALL_EXIT%"=="0" exit /b %HMT_INSTALL_EXIT%
:check
echo [3/3] Checking installed Python and pip...
"%HMT_OFFLINE_ROOT%runtime\python-full\python.exe" -I -c "import sys, pip; print('Python ready:', sys.version.split()[0]); print('pip ready:', pip.__version__)"
exit /b %errorlevel%
