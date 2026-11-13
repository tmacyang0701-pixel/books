@echo off
setlocal
echo CodeArena GESP - integrated installer
echo Chrome / Python / C++ / GDB. Node.js is not required.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0extension\install-all.ps1" %*
set "install_status=%errorlevel%"
echo.
if not "%install_status%"=="0" echo Installation did not finish. Error code: %install_status%
pause
exit /b %install_status%
