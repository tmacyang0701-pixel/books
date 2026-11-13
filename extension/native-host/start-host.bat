@echo off
setlocal DisableDelayedExpansion
set "CODEARENA_NATIVE_PYTHON=%~dp0..\.venv\Scripts\python.exe"
if not exist "%CODEARENA_NATIVE_PYTHON%" (
  echo CodeArena Python environment is missing. Run install-all.bat. 1>&2
  exit /b 1
)
"%CODEARENA_NATIVE_PYTHON%" -E -s -u "%~dp0host.py"
exit /b %errorlevel%
