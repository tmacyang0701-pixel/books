@echo off
setlocal
set "HMT_OFFLINE_ROOT=%~dp0"
echo [1/2] Verifying bundled Dev-C++ full installer...
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $installer=Join-Path $env:HMT_OFFLINE_ROOT 'devcpp\Embarcadero_Dev-Cpp_6.3_TDM-GCC_9.2_Setup.exe'; $expected='9ea2f0237e5c72d485f9fa29def3f0a11c51f8b252f650be533e09a5e2ada247'; if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Dev-C++ installer checksum mismatch.' }"
if errorlevel 1 goto failed
echo [2/2] Opening the local installer. No download is needed.
echo Choose Full installation and keep the TDM-GCC compiler selected.
start "" /wait "%HMT_OFFLINE_ROOT%devcpp\Embarcadero_Dev-Cpp_6.3_TDM-GCC_9.2_Setup.exe"
set "HMT_INSTALL_EXIT=%errorlevel%"
if not "%HMT_INSTALL_EXIT%"=="0" goto failed
echo Dev-C++ setup finished. Run check-cpp.cmd to verify the installed tools.
pause
exit /b 0
:failed
echo Dev-C++ setup failed or was cancelled. Review the message above.
pause
exit /b 1
