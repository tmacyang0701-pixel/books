@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\open-gesp.ps1"
set "open_status=%errorlevel%"
if not "%open_status%"=="0" pause
exit /b %open_status%
