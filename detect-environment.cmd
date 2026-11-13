@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0extension\install-all.ps1" -CheckOnly -SkipNetwork
set "check_status=%errorlevel%"
pause
exit /b %check_status%
