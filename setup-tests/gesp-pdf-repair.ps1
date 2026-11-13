$ErrorActionPreference='Stop'
$bundleRoot=Split-Path -Parent $PSScriptRoot
$extensionRoot=Join-Path $bundleRoot 'extension'
. (Join-Path $extensionRoot 'scripts\windows-dependencies.ps1')
. (Join-Path $extensionRoot 'scripts\bootstrap-windows.ps1')
$python=Find-LearningPython
$fixture=Join-Path $bundleRoot ('.tmp\pdf-repair-'+[guid]::NewGuid().ToString('N'))
$venv=Join-Path $fixture '.venv'
& $python -I -m venv $venv
if ($LASTEXITCODE -ne 0) { throw 'Test environment creation failed.' }
$probe=Join-Path $venv 'Scripts\python.exe'
$env:PIP_NO_INDEX='1'
$wheel=Get-CodeArenaPdfWheel
& $probe -I -m pip install --disable-pip-version-check --no-index --no-deps $wheel
if ($LASTEXITCODE -ne 0) { throw 'Test setup failed to install pypdf without dependencies.' }
$before=Test-PythonDependency $probe 'pypdf'
& $probe -I -c 'import sys; sys.exit(0 if sys.version_info < (3,11) else 1)'
if ($LASTEXITCODE -eq 0 -and $before) { throw 'Python 3.10 fixture should reproduce the missing typing_extensions import.' }
Install-LearningPythonPackages $fixture (Join-Path $extensionRoot 'native-host')
& $probe -I -c 'import pypdf; from io import BytesIO; w=pypdf.PdfWriter(); w.add_blank_page(width=72,height=72); data=BytesIO(); w.write(data); data.seek(0); assert len(pypdf.PdfReader(data).pages)==1'
if ($LASTEXITCODE -ne 0) { throw 'PDF read/write verification failed.' }
Install-LearningPythonPackages $fixture (Join-Path $extensionRoot 'native-host')
& $probe -I -m pip check
if ($LASTEXITCODE -ne 0) { throw 'PDF dependencies are incomplete.' }
Write-Output 'PASS: already installed pypdf repaired offline, PDF read/write verified, repeat installation succeeds.'
