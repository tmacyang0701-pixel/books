@echo off
setlocal
set "HMT_BUNDLE_ROOT=%~dp0"
set "HMT_SETUP_MODE=detect"
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0setup\setup-windows.ps1"
if errorlevel 1 pause
exit /b %errorlevel%
