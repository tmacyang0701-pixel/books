$ErrorActionPreference='Stop'
$bundle=Split-Path -Parent $PSScriptRoot
$roots=@((Join-Path $bundle 'gesp-lab-extension'),(Join-Path $bundle 'extension'))
if((Split-Path -Leaf $bundle) -eq 'books'){$roots+=Join-Path (Split-Path -Parent $bundle) 'extension'}
$roots=@($roots | Where-Object {Test-Path -LiteralPath (Join-Path $_ 'scripts\service-process.ps1')} | Select-Object -Unique)
if(-not $roots.Count){Write-Host 'CodeArena installation was not found.' -ForegroundColor Red;exit 1}
. (Join-Path $roots[0] 'scripts\service-process.ps1')
$lookup={param($processIdToRead) Get-CimInstance Win32_Process -Filter "ProcessId = $processIdToRead" -ErrorAction Stop}
$children={param($parentIdToRead) Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentIdToRead" -ErrorAction Stop}
$stopped=New-Object 'System.Collections.Generic.HashSet[int]'
$failures=0
foreach($root in $roots){
    $ports=@(8766)
    foreach($relative in @('learning_service\config.json','learning_service\config.local.json','.local\service-endpoint.json')){
        $path=Join-Path $root $relative
        if(Test-Path -LiteralPath $path){
            try{$saved=Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json;if([int]$saved.port -ge 1024 -and [int]$saved.port -le 65535){$ports+=[int]$saved.port}}catch{}
        }
    }
    $pidPath=Join-Path $root '.local\service.pid'
    $verifiedIds=@()
    try{
        foreach($port in @($ports | Select-Object -Unique)){
            $health=$null
            try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2}catch{}
            if($health.service -eq 'codearena-learning' -and $health.instancePath -ieq $root){
                $verifiedIds+=@(Resolve-LearningServiceProcessIds -Health $health -AllowedRoots @($root) -PidPath $pidPath -Port $port -Lookup $lookup -Children $children)
            }
        }
        # Also handle an unresponsive server, but only with a valid PID timestamp
        # and the exact CodeArena Python module and port command.
        if(-not $verifiedIds.Count -and (Test-Path -LiteralPath $pidPath)){
            $recordedId=0
            if([int]::TryParse((Get-Content -LiteralPath $pidPath -Raw).Trim(),[ref]$recordedId) -and $recordedId -gt 0){
                $process=Get-Process -Id $recordedId -ErrorAction SilentlyContinue
                if($process){
                    $verified=$false
                    foreach($port in @($ports | Select-Object -Unique)){
                        try{
                            $verifiedIds=@(Get-LearningRestartProcessIds -RecordedId $recordedId -RecordedStart $process.StartTime -PidWritten (Get-Item -LiteralPath $pidPath).LastWriteTime -Port $port -Lookup $lookup -Children $children)
                            $verified=$true;break
                        }catch{}
                    }
                    if(-not $verified){throw 'PID record could not be verified. No unrelated process was stopped.'}
                }
            }
        }
        foreach($verifiedId in ($verifiedIds | Select-Object -Unique)){
            if($stopped.Contains($verifiedId)){continue}
            $process=Get-Process -Id $verifiedId -ErrorAction SilentlyContinue
            if($process -and -not $process.HasExited){
                Stop-Process -InputObject $process -ErrorAction Stop
                if(-not $process.WaitForExit(5000)){throw "Process $verifiedId has not exited yet."}
                $null=$stopped.Add($verifiedId)
                Write-Host "Stopped CodeArena PID $verifiedId" -ForegroundColor Green
            }
        }
    }catch{$failures++;Write-Host ($root+': '+$_.Exception.Message) -ForegroundColor Red}
}
if($failures){Write-Host 'Run this file under the Windows account that started CodeArena. If that service was elevated, run this stop script as administrator.';exit 1}
if($stopped.Count){Write-Host "CodeArena stopped ($($stopped.Count) process(es)). The folder can now be renamed." -ForegroundColor Green}
else{Write-Host 'No running CodeArena backend was found.' -ForegroundColor Green}
exit 0
