$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$root = $env:HMT_BUNDLE_ROOT
if (-not $root) { $root = Split-Path $PSScriptRoot }
$env:HMT_BUNDLE_ROOT = $root
$mutex = New-Object System.Threading.Mutex($false, 'Local\NumberGardenOfflineInstaller')
if (-not $mutex.WaitOne(0)) {
    [void][System.Windows.Forms.MessageBox]::Show('已有安装窗口正在运行，请使用原窗口查看进度。', '数间')
    $mutex.Dispose()
    exit 0
}
if (-not $env:HMT_SETUP_MODE) { $env:HMT_SETUP_MODE = 'install' }
$stateDir = Join-Path $root '.setup'
[IO.Directory]::CreateDirectory($stateDir) | Out-Null
$env:HMT_SETUP_STATE = Join-Path $stateDir 'status.json'
$cancelFile = Join-Path $stateDir 'cancel'
$script:Worker = $null
$script:CloseAfter = $false
$script:Finished = $false

$form = New-Object System.Windows.Forms.Form
$form.Text = '数间 · 环境检测与一键安装'
$form.Size = New-Object System.Drawing.Size(850, 650)
$form.MinimumSize = New-Object System.Drawing.Size(850, 650)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)
$form.BackColor = [Drawing.Color]::FromArgb(247, 248, 244)

$heading = New-Object System.Windows.Forms.Label
$heading.Text = '先检测，再补齐。'
$heading.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 19, [Drawing.FontStyle]::Bold)
$heading.SetBounds(25, 20, 770, 40)
$form.Controls.Add($heading)
$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = '已有可用环境会跳过；缺失组件从本包离线安装。Dev-C++ 安装可能需要一次系统授权。'
$subtitle.SetBounds(27, 65, 775, 30)
$form.Controls.Add($subtitle)

$status = New-Object System.Windows.Forms.Label
$status.Text = '正在准备检测工具…'
$status.SetBounds(27, 100, 770, 45)
$status.AutoEllipsis = $true
$form.Controls.Add($status)
$progress = New-Object System.Windows.Forms.ProgressBar
$progress.SetBounds(27, 150, 770, 18)
$form.Controls.Add($progress)
$detail = New-Object System.Windows.Forms.Label
$detail.Text = '总步骤 0 / 8'
$detail.SetBounds(27, 175, 770, 24)
$form.Controls.Add($detail)

$list = New-Object System.Windows.Forms.ListView
$list.SetBounds(27, 210, 770, 160)
$list.View = 'Details'
$list.FullRowSelect = $true
$list.GridLines = $true
$list.Columns.Add('环境 / 组件', 190) | Out-Null
$list.Columns.Add('状态', 110) | Out-Null
$list.Columns.Add('版本与说明', 440) | Out-Null
$form.Controls.Add($list)
$logs = New-Object System.Windows.Forms.TextBox
$logs.SetBounds(27, 385, 770, 150)
$logs.Multiline = $true
$logs.ReadOnly = $true
$logs.ScrollBars = 'Vertical'
$form.Controls.Add($logs)

$retry = New-Object System.Windows.Forms.Button
$retry.Text = '重新检测并补齐'
$retry.SetBounds(27, 550, 155, 34)
$retry.Enabled = $false
$form.Controls.Add($retry)
$open = New-Object System.Windows.Forms.Button
$open.Text = '打开应用'
$open.SetBounds(195, 550, 115, 34)
$open.Enabled = $false
$form.Controls.Add($open)
$viewLog = New-Object System.Windows.Forms.Button
$viewLog.Text = '查看报告'
$viewLog.SetBounds(323, 550, 115, 34)
$form.Controls.Add($viewLog)
$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = '当前步骤后停止'
$cancel.SetBounds(450, 550, 155, 34)
$form.Controls.Add($cancel)
$close = New-Object System.Windows.Forms.Button
$close.Text = '关闭'
$close.SetBounds(682, 550, 115, 34)
$form.Controls.Add($close)

function Start-InstallWorker {
    Remove-Item -LiteralPath $env:HMT_SETUP_STATE -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $cancelFile -ErrorAction SilentlyContinue
    $script:Finished = $false
    $script:CloseAfter = $false
    $retry.Enabled = $false
    $open.Enabled = $false
    $cancel.Enabled = $true
    $status.Text = '正在检测环境…'
    $progress.Style = 'Marquee'
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $psi.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'setup-worker.ps1') + '"'
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WorkingDirectory = $root
    $script:Worker = [Diagnostics.Process]::Start($psi)
}
function Add-Row([string]$Name, [bool]$Ready, [string]$Info) {
    $row = New-Object System.Windows.Forms.ListViewItem($Name)
    $row.SubItems.Add($(if ($Ready) { '可用 / 已满足' } else { '缺失或需补齐' })) | Out-Null
    $row.SubItems.Add($Info) | Out-Null
    $list.Items.Add($row) | Out-Null
}
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
    try {
        if (Test-Path -LiteralPath $env:HMT_SETUP_STATE) {
            $state = Get-Content -LiteralPath $env:HMT_SETUP_STATE -Raw -Encoding UTF8 | ConvertFrom-Json
            $status.Text = $state.message
            $elapsed = [Math]::Max(0, [Math]::Floor(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [double]$state.phaseStarted) / 1000))
            $terminal = @('completed', 'failed', 'detected', 'cancelled') -contains $state.state
            $done = [int]$state.completedSteps
            if ($state.state -eq 'completed' -or $state.state -eq 'detected') { $done = 8 }
            $detail.Text = '总步骤 ' + $done + ' / 8 · 当前步骤耗时 ' + $elapsed + ' 秒' + $(if (-not $terminal) { ' · 正在处理，请稍候' } else { '' })
            $progress.Style = 'Blocks'
            $progress.Value = [Math]::Min(100, [Math]::Max(0, [int]($done / 8 * 100)))
            $logs.Lines = @($state.logs)
            $logs.SelectionStart = $logs.TextLength
            $logs.ScrollToCaret()
            if ($state.report -and $state.report.components) {
                $components = $state.report.components
                $list.BeginUpdate()
                $list.Items.Clear()
                if ($components.node) { Add-Row 'Node.js 22+' $components.node.ready ([string]$components.node.version) }
                if ($components.python) { Add-Row 'Python 3.11+ 与 pip' $components.python.ready ([string]$components.python.version + ' · pip=' + [string]$components.python.pip) }
                if ($components.devCpp) {
                    Add-Row 'Dev-C++ IDE' ([bool]$components.devCpp.ide) ([string]$components.devCpp.version)
                    foreach ($entry in @(@('gcc','GCC 9+'),@('gpp','G++ 9+'),@('gdb','GDB 调试器'),@('make','Make 构建组件'))) {
                        $tool = $null
                        if ($components.devCpp.toolchain) { $tool = $components.devCpp.toolchain.tools.($entry[0]) }
                        Add-Row $entry[1] ([bool]$tool.ready) ([string]$tool.version)
                    }
                }
                $list.EndUpdate()
            }
            if ($terminal) {
                $script:Finished = $true
                $retry.Enabled = $true
                $cancel.Enabled = $false
                $open.Enabled = $state.state -eq 'completed'
                if ($script:CloseAfter) { $form.Close() }
            }
        }
        if ($script:Worker -and $script:Worker.HasExited -and -not $script:Finished) {
            $script:Finished = $true
            $retry.Enabled = $true
            $cancel.Enabled = $false
            $progress.Style = 'Blocks'
            $status.Text = '安装进程已结束但未报告完成，请查看 installation-report.json 或重试。'
        }
    } catch {
        # An atomic status replacement can briefly overlap a timer read; retry next tick.
    }
})
$retry.Add_Click({ $env:HMT_SETUP_MODE = 'install'; Start-InstallWorker })
$open.Add_Click({ Start-Process -FilePath (Join-Path $root 'start-dev.cmd') })
$viewLog.Add_Click({
    $report = Join-Path $root 'installation-report.json'
    if (Test-Path -LiteralPath $report) { Start-Process notepad.exe -ArgumentList ('"' + $report + '"') }
})
$cancel.Add_Click({ [IO.File]::WriteAllText($cancelFile, 'stop'); $cancel.Enabled = $false; $status.Text = '已请求停止，将在当前安装步骤结束后停止。' })
$close.Add_Click({ $form.Close() })
$form.Add_FormClosing({
    if (-not $script:Finished -and $script:Worker -and -not $script:Worker.HasExited) {
        $_.Cancel = $true
        $script:CloseAfter = $true
        [IO.File]::WriteAllText($cancelFile, 'stop')
        $status.Text = '正在等待当前安装步骤结束，随后关闭；不会强制中断安装器。'
    }
})
$form.Add_Shown({ Start-InstallWorker; $timer.Start() })
try { [void]$form.ShowDialog() } finally { $timer.Stop(); $timer.Dispose(); $form.Dispose(); $mutex.ReleaseMutex(); $mutex.Dispose() }
