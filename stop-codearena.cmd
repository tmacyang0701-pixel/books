@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\stop-codearena.ps1"
set "stop_status=%errorlevel%"
echo.
if not "%stop_status%"=="0" echo Could not stop every verified CodeArena process. Read the error above.
pause
exit /b %stop_status%
