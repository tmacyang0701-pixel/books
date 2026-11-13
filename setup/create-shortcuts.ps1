$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
function Add-Shortcut([string]$Name, [string]$Target, [string]$WorkingDirectory) {
    $link = $shell.CreateShortcut((Join-Path $desktop ($Name + '.lnk')))
    $link.TargetPath = $Target
    $link.WorkingDirectory = $WorkingDirectory
    $link.Save()
}
Add-Shortcut '数间' (Join-Path $env:HMT_BUNDLE_ROOT 'start-dev.cmd') $env:HMT_BUNDLE_ROOT
Add-Shortcut '数间 - Dev-C++' $env:HMT_SELECTED_DEVCPP (Split-Path $env:HMT_SELECTED_DEVCPP)
Add-Shortcut '数间 - Python' $env:HMT_SELECTED_PYTHON (Split-Path $env:HMT_SELECTED_PYTHON)
