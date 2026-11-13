param([switch]$CheckOnly,[switch]$SkipNetwork,[string]$ExtensionId)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$env:PYTHONUTF8='1'
Set-Location -LiteralPath $PSScriptRoot
if ($SkipNetwork -and -not $CheckOnly) { throw '-SkipNetwork is only allowed with -CheckOnly. Installation cannot skip network checks.' }
$hostDir=Join-Path $PSScriptRoot 'native-host'
$legacyHostDir=Join-Path (Split-Path -Parent $PSScriptRoot) 'native-host'
. (Join-Path $PSScriptRoot 'scripts\windows-dependencies.ps1')
. (Join-Path $PSScriptRoot 'scripts\find-compiler.ps1')
. (Join-Path $PSScriptRoot 'scripts\bootstrap-windows.ps1')
$checks=New-Object System.Collections.Generic.List[object]
function Check($name,$ok,$fix) { $checks.Add([pscustomobject]@{Name=$name;Passed=[bool]$ok;Fix=$(if($ok){''}else{$fix})}) }
function Stop-WithMessage($message) { Write-Host "[STOP] $message" -ForegroundColor Red; exit 1 }

Write-Host '[1/4] Checking project files and preparing required dependencies.' -ForegroundColor Cyan
$files=@('manifest.json','background.js','index.html','app.js','styles.css',
    'vendor\katex\katex.min.js','vendor\katex\katex.min.css','vendor\katex\auto-render.min.js','vendor\katex\fonts\KaTeX_Main-Regular.woff2',
    'ui\lesson-examples.js','ui\chat-images.js','ui\chat-voice.js','ui\chat-math.js','vendor\vs\loader.js','vendor\vs\editor\editor.main.js','vendor\vs\editor\editor.main.css','vendor\vs\base\worker\workerMain.js','vendor\vs\basic-languages\cpp\cpp.js',
    'data\gesp\index.json','data\gesp\levels.json','learning_service\server.py','learning_service\model.py','learning_service\doctor.py','learning_service\config.json','scripts\bootstrap-windows.ps1','scripts\windows-installers.json','scripts\check-native-host.py','scripts\service-process.ps1','scripts\launch-learning.ps1',
    'ui\core.js','ui\chat-panel.js','ui\page-questions.js','ui\chat-sessions.js','ui\chat-store.js','ui\chat.css','ui\lesson-runner.js','ui\visuals.js','ui\visual-player.js','ui\pseudocode.js','ui\code-access.js','ui\service-control.js','start-learning.ps1','scripts\bundle-runtime.ps1')
$files+=@('ui\courseware.css','ui\lesson-prose.js','ui\syntax-lab.js','ui\syntax-render.js','ui\syntax-lab.css','learning_service\topic_lesson.py','ui\knowledge.js','ui\knowledge.css','data\gesp\knowledge.json','learning_service\knowledge.py','ui\sidebar-height.js','ui\analysis-settings.js','learning_service\analysis_settings.py','ui\code-analysis.css','ui\code-analysis.js','ui\analysis-policy.js','ui\analysis-store.js','learning_service\code_analysis.py','ui\lesson-debugger.js','ui\native-debugger.js','ui\run-cases.js','ui\unlock-history.js')
$files+=@('ui\layout.css','ui\layout.js','ui\compact.css','ui\reading.css')
$missing=@($files | Where-Object { -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $_) -PathType Leaf) })
$nativeFiles=@('host.py','judge.py','debugger.py','gdb_support.py','install-host.ps1','start-host.bat')
$missing+=@($nativeFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $hostDir $_) -PathType Leaf) } | ForEach-Object { 'native-host\'+$_ })
Check 'Complete project files' ($missing.Count -eq 0) ('Extract the complete cpp-oj-extension folder. Missing: '+($missing -join ', '))
$bankValid=$false
try {
    $bank=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'data\gesp\index.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $missingProblems=@($bank.problems | Where-Object { -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $_.file) -PathType Leaf) })
    $bankValid=$bank.problems.Count -gt 0 -and $missingProblems.Count -eq 0
} catch {}
Check 'Question bank index and problem files' $bankValid 'Extract the complete data\gesp folder; every indexed problem file is required.'
if (-not $CheckOnly) {
    if ($missing.Count -or -not $bankValid) { Stop-WithMessage 'Project files are incomplete. Extract the complete package first; no dependency installation was attempted.' }
    try { Initialize-LearningPrerequisites $PSScriptRoot $hostDir }
    catch { Stop-WithMessage $_.Exception.Message }
}
$chrome=Find-LearningChrome
Check 'Google Chrome' ([bool]$chrome) 'Install Google Chrome, then rerun. Example: winget install --id Google.Chrome --exact'
$python=Find-LearningPython
Check 'Python 3.10 or newer (working executable)' ([bool]$python) 'Install Python 3.10+ and reopen this installer. A Windows Store alias alone is not sufficient.'
$compiler=FindCompiler
Check 'GCC with working C++17 compile and run' (Test-LearningCompiler $compiler $PSScriptRoot) 'Install Dev-C++ including GCC (not the No_Compiler edition), or add g++.exe to PATH.'
$gdbFound=Test-LearningDebugger $compiler
Check 'GDB debugger' $gdbFound 'Install Dev-C++ including GCC and GDB. Debugging requires a GDB build with Python support.'
$configured=$false
if ($python) {
    Write-Host "Using Python: $python"
    if (-not $CheckOnly) {
        try { Initialize-LearningModelConfig $python $PSScriptRoot }
        catch { Stop-WithMessage $_.Exception.Message }
    }
    Check 'pypdf (PDF upload)' (Test-PythonDependency $python 'pypdf') "Run: & '$python' -m pip install pypdf"
    try {
        $configJson=& $python -m learning_service.doctor --config-only --json
        if ($LASTEXITCODE -eq 0) { $modelConfig=$configJson | ConvertFrom-Json; $configured=$modelConfig.configured }
    } catch {}
    Check 'Bailian model configuration' $configured 'Configure ALIBABA_BAILIAN_API_KEY / ALIBABA_BAILIAN_MODEL / ALIBABA_BAILIAN_OPENAI_COMPATIBLE in learning_service\.env (or use explanation\.env).'
}
$checks | ForEach-Object { Write-Host (('[{0}] {1}' -f $(if($_.Passed){'OK'}else{'MISSING'}),$_.Name)) -ForegroundColor $(if($_.Passed){'Green'}else{'Red'}); if($_.Fix){Write-Host ('  '+$_.Fix) -ForegroundColor Yellow} }
New-Item -Path (Join-Path $PSScriptRoot '.local') -ItemType Directory -Force | Out-Null
$checks | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $PSScriptRoot '.local\install-check.json') -Encoding UTF8
if (@($checks | Where-Object { -not $_.Passed }).Count) { Stop-WithMessage 'Required dependencies are missing or unusable. No host registration or service restart was performed. Fix all items above and rerun.' }
if (-not $SkipNetwork) {
    & $python -m learning_service.doctor --output (Join-Path $PSScriptRoot '.local\network-check.json')
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Model endpoint network check failed. No host registration or service restart was performed.' }
}
if ($CheckOnly) { Write-Host $(if($SkipNetwork){'Local dependency checks passed. Network was NOT checked. No installation performed.'}else{'All preflight checks passed. No installation performed.'}) -ForegroundColor Green; exit 0 }

Write-Host '[2/4] Preparing and registering the local C++ judge.' -ForegroundColor Cyan
$manifestPath=Join-Path $hostDir 'com.codearena.cpp_judge.json'
. (Join-Path $PSScriptRoot 'scripts\native-registration.ps1')
if(-not $ExtensionId){$ExtensionId=Get-CodeArenaExtensionId $PSScriptRoot}
if (-not $ExtensionId) {
    Write-Host "Open chrome://extensions, enable Developer mode, Load unpacked: $PSScriptRoot" -ForegroundColor Yellow
    Write-Host 'Copy the 32-letter extension ID from the CodeArena card.'
    Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions' -WindowStyle Normal
    $ExtensionId=(Read-Host 'Chrome extension ID').Trim()
}
if ($ExtensionId -cnotmatch '^[a-p]{32}$') { Stop-WithMessage 'Invalid extension ID. Must be 32 letters a-p.' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $hostDir 'install-host.ps1') -ExtensionId $ExtensionId -Compiler $compiler -ExtensionRoot $PSScriptRoot
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Native host registration failed. Learning service was not started.' }
$registered=(Get-Item -LiteralPath 'HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.codearena.cpp_judge').GetValue('')
if ($registered -ne $manifestPath) { Stop-WithMessage 'Native host registry verification failed.' }

Write-Host '[3/4] Starting or restarting the learning service.' -ForegroundColor Cyan
$env:CODEARENA_PYTHON=$python
$env:CODEARENA_PORT=[string]$modelConfig.port
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-learning.ps1') -Restart
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Learning service startup failed. See .local\service-error.log and .local\network-check.json.' }
Write-Host '[4/4] Verifying the installed service.' -ForegroundColor Cyan
. (Join-Path $PSScriptRoot 'scripts\service-process.ps1')
$endpoint=Read-LearningEndpoint $PSScriptRoot
$serviceUrl=if($endpoint){$endpoint.serviceUrl}else{"http://127.0.0.1:$($modelConfig.port)"}
$health=Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 5
if ($health.service -ne 'codearena-learning' -or -not $health.configured -or $health.version -lt 12) { Stop-WithMessage 'Service verification failed. The expected updated service is not ready.' }
Write-Host "Installation complete. Service: $serviceUrl | Model: $($health.model). Reload CodeArena in chrome://extensions and reopen its page." -ForegroundColor Green
Write-Host 'Next time, including after reboot, open the Chrome extension and click its startup button. No BAT is required for daily use.'
