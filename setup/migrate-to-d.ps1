param([string]$Destination='D:\books-angent',[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$env:PYTHONUTF8='1'
$bundle=Split-Path -Parent $PSScriptRoot
$python=Join-Path $bundle 'gesp-lab-extension\.venv\Scripts\python.exe'
if(-not(Test-Path -LiteralPath $python)){throw 'Project Python is missing. Run the existing one-click installer first.'}
$migrator=Join-Path $PSScriptRoot 'migrate-repository.py'
& $python $migrator --source $bundle --target $Destination --check
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
if($CheckOnly){exit 0}

Write-Host '[1/3] Stopping the verified old CodeArena service before copying.' -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop-codearena.ps1')
if($LASTEXITCODE -ne 0){throw 'Could not stop the old service. Migration did not start.'}
Write-Host '[2/3] Copying all files and local Git history; verifying SHA-256.' -ForegroundColor Cyan
& $python $migrator --source $bundle --target $Destination
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}

$destinationRoot=(Resolve-Path -LiteralPath $Destination).Path
$extension=Join-Path $destinationRoot 'gesp-lab-extension'
# A copied PID/endpoint describes the stopped old instance, not a new service.
# Archive those records within the new installation before it can start.
$archive=Join-Path $extension ('.local\migration-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss'))
foreach($name in @('service.pid','service-endpoint.json')){
    $record=Join-Path $extension ('.local\'+$name)
    if(Test-Path -LiteralPath $record){
        New-Item -Path $archive -ItemType Directory -Force | Out-Null
        $resolvedRecord=(Resolve-Path -LiteralPath $record).Path
        if(-not $resolvedRecord.StartsWith($destinationRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Migration record escaped the target directory.'}
        Move-Item -LiteralPath $resolvedRecord -Destination (Join-Path $archive $name)
    }
}
Write-Host '[3/3] Validating C++ and registering the new Native Messaging path.' -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $extension 'scripts\register-page-control.ps1')
if($LASTEXITCODE -ne 0){
    Write-Host 'Files/history were copied and verified. Local component registration needs repair.' -ForegroundColor Yellow
    Write-Host "Run install-all.cmd in $destinationRoot. Do not run migration again."
    exit 2
}
Write-Host "Migration complete: $destinationRoot" -ForegroundColor Green
Write-Host 'The original directory is retained as a backup. No Git remote was modified or pushed.'
Write-Host "In chrome://extensions, load: $extension"
Write-Host ('In chrome://extensions, load: '+(Join-Path $destinationRoot 'physics-lab-extension'))
Write-Host 'Then click the CodeArena startup button. Open the target folder as your coding workspace.'
