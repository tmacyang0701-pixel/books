@echo off
call "%~dp0run-task.cmd" build
exit /b %errorlevel%
