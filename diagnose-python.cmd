@echo off
setlocal
set "HMT_BUNDLE_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\diagnose-python.ps1"
if errorlevel 1 pause
exit /b %errorlevel%
