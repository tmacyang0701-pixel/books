# Called by the user-run installer. Importing this file does not download or install anything.
. (Join-Path $PSScriptRoot 'bundle-runtime.ps1')
function Assert-LearningWindows {
    param([version]$Version=[Environment]::OSVersion.Version,[string]$Architecture=$(if($env:PROCESSOR_ARCHITEW6432){$env:PROCESSOR_ARCHITEW6432}else{$env:PROCESSOR_ARCHITECTURE}))
    if ($Version.Major -lt 10 -or $Version.Build -lt 17763 -or $Architecture -ne 'AMD64') {
        throw 'This installer targets Windows 10 1809+ / Windows 11 on Intel/AMD 64-bit PCs. 32-bit Windows and ARM64 are not supported by this package.'
    }
    if ($PSVersionTable.PSVersion -lt [version]'5.1') { throw 'Windows PowerShell 5.1 or newer is required.' }
}

function Get-LearningBootstrapState($ExtensionRoot) {
    $compiler=FindCompiler
    return [pscustomobject]@{python=[bool](Find-LearningPython);chrome=[bool](Find-LearningChrome);compiler=[bool]((Test-LearningCompiler $compiler $ExtensionRoot) -and (Test-LearningDebugger $compiler))}
}

function Test-LearningInstaller($Path,$Spec) {
    if ($Spec.sha256) {
        if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ine $Spec.sha256) { throw "Installer checksum mismatch: $($Spec.name). Nothing from this file was executed." }
    } elseif ($Spec.publisher) {
        $signature=Get-AuthenticodeSignature -LiteralPath $Path
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch ('(?:^|,\s*)O="?'+[regex]::Escape($Spec.publisher)+'"?(?:,|$)')) {
            throw "Installer signature/publisher verification failed: $($Spec.name). Nothing from this file was executed."
        }
    } else { throw 'Installer has no configured verification method.' }
}

function Get-LearningInstaller($Spec,$CacheDirectory) {
    $bundled=Get-CodeArenaBundledInstaller $Spec
    if ($bundled) {
        Test-LearningInstaller $bundled $Spec
        Write-Host "Using verified bundled installer: $bundled" -ForegroundColor Cyan
        return $bundled
    }
    New-Item -Path $CacheDirectory -ItemType Directory -Force | Out-Null
    $path=Join-Path $CacheDirectory $Spec.filename
    if (-not (Test-Path -LiteralPath $path)) {
        $partial=Join-Path $CacheDirectory ([IO.Path]::GetFileNameWithoutExtension($Spec.filename)+'.download'+[IO.Path]::GetExtension($Spec.filename))
        Write-Host "Downloading $($Spec.name)..." -ForegroundColor Cyan
        [Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $previousProgress=$ProgressPreference
        try {
            $ProgressPreference='SilentlyContinue'
            Invoke-WebRequest -UseBasicParsing -Uri $Spec.url -OutFile $partial -TimeoutSec 600
            Test-LearningInstaller $partial $Spec
            Move-Item -LiteralPath $partial -Destination $path -Force
        } catch { throw "Could not prepare $($Spec.name). Check internet access/system time and rerun. Detail: $($_.Exception.Message)" }
        finally { $ProgressPreference=$previousProgress }
    }
    Test-LearningInstaller $path $Spec
    return $path
}

function Install-LearningApplication($Kind,$Path,$LogDirectory) {
    Write-Host "Installing $Kind. Accept the Windows UAC prompt if shown." -ForegroundColor Cyan
    $parameters=@{FilePath=$Path;WindowStyle='Hidden';Wait=$true;PassThru=$true}
    switch ($Kind) {
        'python' { $parameters.ArgumentList='/quiet InstallAllUsers=0 Include_launcher=0 Include_test=0 Include_pip=1 PrependPath=0 /log "'+(Join-Path $LogDirectory 'python-install.log')+'"' }
        'chrome' { $parameters.FilePath=Join-Path $env:SystemRoot 'System32\msiexec.exe';$parameters.ArgumentList='/i "'+$Path+'" /qn /norestart /L*v "'+(Join-Path $LogDirectory 'chrome-install.log')+'"';$parameters.Verb='RunAs' }
        'compiler' { $parameters.ArgumentList='/S';$parameters.Verb='RunAs' }
        default { throw 'Unknown installer kind.' }
    }
    $bundle=Get-CodeArenaBundleRoot
    if ($Kind -eq 'python' -and $bundle) {
        $parameters.ArgumentList+=' /norestart Shortcuts=0 TargetDir="'+(Join-Path $bundle 'runtime\python-full')+'"'
    }
    try { $process=Start-Process @parameters }
    catch { throw "Installation of $Kind was cancelled or could not start. No later step will run." }
    if ($process.ExitCode -eq 3010 -or $process.ExitCode -eq 1641) { throw "$Kind requests a Windows restart. Restart Windows and run install-all.bat again." }
    if ($process.ExitCode -ne 0) { throw "$Kind installer failed (exit $($process.ExitCode)). Check .local installer logs. No later step will run." }
    if ($Kind -eq 'python' -and -not (Find-LearningPython)) {
        # A matching CPython registration can turn INSTALL into MODIFY without restoring
        # a deleted old bundle directory. Repair the registered location, then detect it.
        $missingRegistration=@(Get-LearningRegisteredPython | Where-Object {
            $_ -match '\\runtime\\python-full\\python\.exe$' -and -not (Test-Path -LiteralPath $_ -PathType Leaf)
        })
        if ($missingRegistration.Count) {
            Write-Host 'Repairing a Python registration whose previous bundle directory is missing...'
            $repair=Start-Process -FilePath $Path -ArgumentList ('/repair /quiet /norestart Include_launcher=0 PrependPath=0 Shortcuts=0 /log "'+(Join-Path $LogDirectory 'python-repair.log')+'"') -WindowStyle Hidden -Wait -PassThru
            if ($repair.ExitCode -eq 3010 -or $repair.ExitCode -eq 1641) { throw 'Python repair requires a Windows restart. Restart and rerun the installer.' }
            if ($repair.ExitCode -ne 0) { throw "Python repair failed (exit $($repair.ExitCode)). See .local/python-repair.log." }
        }
    }
}

function Install-LearningPythonPackages($ExtensionRoot,$HostDirectory) {
    $basePython=Find-LearningPython
    if (-not $basePython) { throw 'Python installer finished but a working Python 3.10+ was not found.' }
    $venv=Join-Path $ExtensionRoot '.venv'
    $python=Join-Path $venv 'Scripts\python.exe'
    $venvWorks=$false
    if (Test-Path -LiteralPath $python) {
        try { & $python -I -c 'import sys,ssl,sqlite3; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>$null; $venvWorks=$LASTEXITCODE -eq 0 } catch {}
    }
    if (-not $venvWorks) {
        Write-Host 'Creating the project Python environment...'
        & $basePython -m venv $venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create .venv. Check folder permissions and Python venv support.' }
    }
    if (-not (Test-PythonDependency $python 'pip')) {
        & $python -m ensurepip --upgrade
        if ($LASTEXITCODE -ne 0) { throw 'pip setup failed; installation stopped.' }
    }
    $packages=@()
    if (-not (Test-PythonDependency $python 'pypdf')) {
        $wheel=Get-CodeArenaPdfWheel
        if ($wheel) {
            Write-Host 'Installing the verified bundled PDF dependency (offline)...'
            $previousError=$ErrorActionPreference
            try { $ErrorActionPreference='Continue'; & $python -m pip install --disable-pip-version-check --no-index --no-deps $wheel; $pipStatus=$LASTEXITCODE }
            finally { $ErrorActionPreference=$previousError }
            if ($pipStatus -ne 0 -or -not (Test-PythonDependency $python 'pypdf')) { throw 'Bundled PDF dependency installation failed.' }
        } else { $packages+='pypdf>=5,<7' }
    }
    if ($packages.Count) {
        Write-Host 'Installing Python packages into the project .venv...'
        $previousError=$ErrorActionPreference
        try { $ErrorActionPreference='Continue'; & $python -m pip install --disable-pip-version-check --no-input --timeout 30 --retries 1 @packages; $pipStatus=$LASTEXITCODE }
        finally { $ErrorActionPreference=$previousError }
        if ($pipStatus -ne 0) { throw 'Python package download/install failed. Check PyPI network access and rerun; the service was not started.' }
    }
    $env:CODEARENA_PYTHON=$python
}

function Initialize-LearningPrerequisites($ExtensionRoot,$HostDirectory) {
    Assert-LearningWindows
    if ($env:CODEARENA_PYTHON -and -not (Find-LearningPython)) { throw 'CODEARENA_PYTHON points to an unusable Python. Correct or remove that override first.' }
    $state=Get-LearningBootstrapState $ExtensionRoot
    $catalog=Get-Content -LiteralPath (Join-Path $ExtensionRoot 'scripts\windows-installers.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $required=@('python','chrome','compiler' | Where-Object { -not $state.$_ })
    $logDirectory=Join-Path $ExtensionRoot '.local'
    $cacheDirectory=Join-Path $logDirectory 'installers'
    $prepared=@{}
    # Prepare every needed application before executing any installer.
    foreach ($kind in $required) { $prepared[$kind]=Get-LearningInstaller $catalog.$kind $cacheDirectory }
    foreach ($kind in $required) {
        Install-LearningApplication $kind $prepared[$kind] $logDirectory
        $after=Get-LearningBootstrapState $ExtensionRoot
        if (-not $after.$kind) { throw "$kind was installed but did not pass its runtime check. Installation stopped; rerun after fixing the reported dependency." }
    }
    Install-LearningPythonPackages $ExtensionRoot $HostDirectory
}

function Initialize-LearningModelConfig($PythonPath,$ExtensionRoot) {
    $configJson=& $PythonPath -m learning_service.doctor --config-only --json
    if ($LASTEXITCODE -eq 0) { return }
    Write-Host 'First-time Bailian setup. Your API key is stored locally and will not be printed.' -ForegroundColor Cyan
    $model=(Read-Host 'Model [qwen3.7-plus]').Trim();if(-not $model){$model='qwen3.7-plus'}
    $endpoint=(Read-Host 'OpenAI-compatible HTTPS base URL [https://dashscope.aliyuncs.com/compatible-mode/v1]').Trim();if(-not $endpoint){$endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1'}
    $uri=$null
    if (-not [uri]::TryCreate($endpoint,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Enter an HTTPS API base URL without credentials, query or fragment.' }
    if ($model -notmatch '^[A-Za-z0-9._:/-]+$') { throw 'Invalid model name.' }
    $secret=Read-Host 'Bailian API key (hidden)' -AsSecureString
    $buffer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $key=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($buffer)
        if ([string]::IsNullOrWhiteSpace($key) -or $key -match '[\s"'']') { throw 'API key is empty or contains invalid characters.' }
        $envPath=Join-Path $ExtensionRoot 'learning_service\.env'
        $old=if(Test-Path -LiteralPath $envPath){[IO.File]::ReadAllText($envPath)}else{''}
        # Keep any unrelated settings while replacing these three assignment keys.
        $kept=@($old -split '\r?\n' | Where-Object { $_ -and $_ -notmatch '^\s*(?:export\s+)?ALIBABA_BAILIAN_(?:API_KEY|MODEL|OPENAI_COMPATIBLE)\s*=' })
        $lines=$kept+@("ALIBABA_BAILIAN_API_KEY=$key","ALIBABA_BAILIAN_MODEL=$model",('ALIBABA_BAILIAN_OPENAI_COMPATIBLE='+$endpoint.TrimEnd('/')))
        [IO.File]::WriteAllText($envPath,($lines -join "`r`n")+"`r`n",(New-Object Text.UTF8Encoding($false)))
    } finally { $key=$null;[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($buffer);$secret.Dispose() }
}
