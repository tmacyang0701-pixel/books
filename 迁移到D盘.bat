@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\migrate-to-d.ps1" %*
set "migration_status=%errorlevel%"
echo.
if not "%migration_status%"=="0" echo Migration needs attention. Read the message above; source files are retained.
pause
exit /b %migration_status%
