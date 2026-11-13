@echo off
setlocal
set "HMT_BUNDLE_ROOT=%~dp0"
set "HMT_BUNDLE_TASK=%~1"
if "%HMT_BUNDLE_TASK%"=="" set "HMT_BUNDLE_TASK=dev"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\run-task.ps1"
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo The task failed. Read the error above before retrying.
pause
exit /b 1
