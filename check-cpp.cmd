@echo off
call "%~dp0run-task.cmd" check-cpp
set "HMT_CHECK_EXIT=%errorlevel%"
pause
exit /b %HMT_CHECK_EXIT%
