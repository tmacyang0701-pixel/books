@echo off
call "%~dp0run-task.cmd" test
exit /b %errorlevel%
