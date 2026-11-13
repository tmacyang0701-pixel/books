@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher py.exe not found. Install Python 3 first.
  pause
  exit /b 1
)
py -3 -m pip show pyinstaller >nul 2>nul
if errorlevel 1 (
  echo Installing PyInstaller (first time requires internet)...
  py -3 -m pip install pyinstaller
  if errorlevel 1 (pause & exit /b 1)
)
py -3 -m PyInstaller --noconfirm --clean --onefile --console --name codearena_host --distpath dist --workpath build --specpath . host.py
if errorlevel 1 (echo Build failed & pause & exit /b 1)
echo Build success: %~dp0dist\codearena_host.exe
pause
