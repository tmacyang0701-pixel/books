$ErrorActionPreference = 'Stop'
try {
    # NSIS requires /D to be last, with its remaining path deliberately unquoted.
    $arguments = '/S /D=' + $env:HMT_DEVCPP_TARGET
    $process = Start-Process -FilePath $env:HMT_INSTALLER_FILE -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    exit $process.ExitCode
} catch {
    [Console]::Error.WriteLine('Dev-C++ administrator authorization was cancelled or installation could not start.')
    exit 1
}
