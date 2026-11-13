@echo off
if not exist "%~dp0application\.env" copy /y "%~dp0application\.env.example" "%~dp0application\.env" >nul
if not exist "%~dp0application\.env" exit /b 1
notepad.exe "%~dp0application\.env"
