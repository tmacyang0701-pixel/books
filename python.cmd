@echo off
setlocal
set "HMT_BUNDLE_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\python-launch.ps1" %*
exit /b %errorlevel%
