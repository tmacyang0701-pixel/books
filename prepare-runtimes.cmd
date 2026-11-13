@echo off
call "%~dp0prepare-node.cmd"
if errorlevel 1 exit /b 1
call "%~dp0prepare-python.cmd"
exit /b %errorlevel%
