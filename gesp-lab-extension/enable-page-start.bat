@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\register-page-control.ps1"
set "register_status=%errorlevel%"
pause
exit /b %register_status%
