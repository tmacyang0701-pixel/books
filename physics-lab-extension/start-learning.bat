@echo off
chcp 65001 >nul
setlocal
set "PHYSICS_SHARED_LAUNCH=%~dp0..\gesp-lab-extension\start-learning.bat"
if not exist "%PHYSICS_SHARED_LAUNCH%" (
  echo 未找到共用的 GESP 后台启动脚本：
  echo "%PHYSICS_SHARED_LAUNCH%"
  echo 请将完整的 gesp-lab-extension 和 physics-lab-extension 放在同一个父目录下。
  pause
  exit /b 1
)
call "%PHYSICS_SHARED_LAUNCH%"
exit /b %errorlevel%
