$ErrorActionPreference='Stop'
$bundleRoot=Split-Path -Parent $PSScriptRoot
$extensionRoot=Join-Path $bundleRoot 'gesp-lab-extension'
. (Join-Path $extensionRoot 'scripts\windows-dependencies.ps1')
. (Join-Path $extensionRoot 'scripts\bootstrap-windows.ps1')
$testRoot=Join-Path $bundleRoot ('.tmp\gesp-pdf-'+[guid]::NewGuid().ToString('N'))
$env:PIP_NO_INDEX='1'
Install-LearningPythonPackages $testRoot (Join-Path $extensionRoot 'native-host')
& $env:CODEARENA_PYTHON -I -c 'import pypdf; print(pypdf.__version__)'
if ($LASTEXITCODE -ne 0) { throw 'Offline PDF dependency verification failed.' }
Write-Output 'PASS: real isolated venv created and PDF wheel installed with package indexes disabled.'
