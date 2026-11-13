@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-all.ps1"
set "install_status=%errorlevel%"
if not "%install_status%"=="0" echo Installation stopped. Fix the reported requirements and run this file again.
pause
exit /b %install_status%
