$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$logDirectory=Join-Path $root '.local'
New-Item -Path $logDirectory -ItemType Directory -Force | Out-Null
$report=@{status='running';startedAt=[DateTimeOffset]::UtcNow.ToString('o');extensionRoot=$root}
function Save-RegistrationReport {
    [IO.File]::WriteAllText((Join-Path $logDirectory 'page-start-registration.json'),($report | ConvertTo-Json -Depth 3),(New-Object Text.UTF8Encoding($false)))
}
Save-RegistrationReport
trap {
    $report.status='failed';$report.message=$_.Exception.Message
    Save-RegistrationReport
    Write-Host $_ -ForegroundColor Red
    Write-Host 'Details: .local\page-start-registration.json'
    exit 1
}
$hostDir=Join-Path $root 'native-host'
. (Join-Path $PSScriptRoot 'find-compiler.ps1')
$compiler=FindCompiler
if(-not $compiler -or -not(Test-Path -LiteralPath (Join-Path $hostDir 'start-host.bat')) -or -not(Test-Path -LiteralPath (Join-Path $root '.venv\Scripts\python.exe'))){throw 'Required local components are missing. Run install-all.bat first.'}
$extensionId=$null
foreach($path in @((Join-Path $hostDir 'com.codearena.cpp_judge.json'),(Join-Path (Split-Path -Parent $root) 'native-host\com.codearena.cpp_judge.json'))){
    if(Test-Path -LiteralPath $path){
        $origin=(Get-Content -LiteralPath $path -Raw -Encoding UTF8|ConvertFrom-Json).allowed_origins[0]
        if($origin -cmatch '^chrome-extension://([a-p]{32})/$'){$extensionId=$Matches[1];break}
    }
}
if(-not $extensionId){throw 'No existing extension registration found. Run install-all.bat for first-time setup.'}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $hostDir 'install-host.ps1') -ExtensionId $extensionId -Compiler $compiler -ExtensionRoot $root
if($LASTEXITCODE -ne 0){throw 'Chrome local component registration failed.'}
$registered=(Get-Item -LiteralPath 'HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.codearena.cpp_judge').GetValue('')
if($registered -ne (Join-Path $hostDir 'com.codearena.cpp_judge.json')){throw 'Registration verification failed.'}
$report.status='completed';$report.manifest=$registered;$report.extensionId=$extensionId
Save-RegistrationReport
Write-Host 'Ready: reload CodeArena, then click the startup button on the page. No service was stopped by this registration step.' -ForegroundColor Green
