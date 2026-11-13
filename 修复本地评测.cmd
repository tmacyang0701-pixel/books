@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0extension\scripts\register-page-control.ps1"
if errorlevel 1 (
  echo Repair failed. Read the message above.
  pause
  exit /b 1
)
echo Repair complete. Close and reopen the CodeArena tab, then run your code again.
pause
