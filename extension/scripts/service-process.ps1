# Identify this installation by its PID record, creation time and exact Python command.
# TCP CIM queries are deliberately not required (they can miss valid user-session listeners).
function Get-LearningRestartProcessIds {
    param([int]$RecordedId,[datetime]$RecordedStart,[datetime]$PidWritten,[int]$Port,[scriptblock]$Lookup,[scriptblock]$Children)
    $delay=($PidWritten-$RecordedStart).TotalSeconds
    if ($delay -lt 0 -or $delay -gt 120) { throw 'The PID record does not match the process start time. No process was stopped.' }
    function Is-LearningCommand($Info) {
        return $Info -and $Info.Name -in @('python.exe','pythonw.exe') -and
            $Info.CommandLine -match '(?:^|\s)-m\s+"?learning_service\.server"?(?:\s|$)' -and
            $Info.CommandLine -match ('(?:^|\s)--port(?:=|\s+)"?'+$Port+'"?(?:\s|$)')
    }
    $record=& $Lookup $RecordedId
    if (-not (Is-LearningCommand $record)) { throw 'The recorded PID is not the expected CodeArena service command. No process was stopped.' }
    $chain=New-Object System.Collections.Generic.List[int]
    foreach ($child in @(& $Children $RecordedId)) {
        if ($child.ParentProcessId -eq $RecordedId -and (Is-LearningCommand $child)) { $chain.Add([int]$child.ProcessId) }
    }
    $chain.Add($RecordedId)
    return $chain.ToArray()
}

# A health response identifies the live instance even after its PID file was
# deleted or the installation was moved. Never trust an orphaned PID file.
function Resolve-LearningServiceProcessIds {
    param($Health,[string[]]$AllowedRoots,[string]$PidPath,[int]$Port,[scriptblock]$Lookup,[scriptblock]$Children)
    if (-not $Health) { return @() }
    if ($Health.service -ne 'codearena-learning' -or -not $Health.processId -or -not $Health.instancePath) {
        throw 'The running service did not provide a valid CodeArena identity. No process was stopped.'
    }
    $instance=[IO.Path]::GetFullPath([string]$Health.instancePath).TrimEnd('\','/')
    $sameInstallation=$false
    foreach($allowedRoot in $AllowedRoots){
        $normalizedRoot=[IO.Path]::GetFullPath($allowedRoot).TrimEnd('\','/')
        if([string]::Equals($normalizedRoot,$instance,[StringComparison]::OrdinalIgnoreCase)){$sameInstallation=$true;break}
    }
    if (-not $sameInstallation) { throw "Another CodeArena installation is using this port: $instance. Expected: $($AllowedRoots -join ', '). No process was stopped." }
    $liveId=0
    if (-not [int]::TryParse([string]$Health.processId,[ref]$liveId) -or $liveId -le 0) { throw 'Invalid service process ID.' }
    $live=& $Lookup $liveId
    if (-not $live -or -not $live.CreationDate) { throw 'Cannot verify the running service process. No process was stopped.' }
    $started=[datetime]$live.CreationDate
    $ids=@(Get-LearningRestartProcessIds -RecordedId $liveId -RecordedStart $started -PidWritten $started -Port $Port -Lookup $Lookup -Children $Children)
    # Keep the timestamp associated with the verified process, including when
    # recovering a record long after startup (legacy readers validate this).
    $directory=Split-Path -Parent $PidPath
    New-Item -Path $directory -ItemType Directory -Force | Out-Null
    Set-Content -LiteralPath $PidPath -Value $liveId -Encoding ASCII
    (Get-Item -LiteralPath $PidPath -Force).LastWriteTime=$started
    return $ids
}

function Test-LearningPortAvailable([int]$Port) {
    $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$Port)
    try { $listener.Server.ExclusiveAddressUse=$true; $listener.Start(); return $true }
    catch { return $false }
    finally { $listener.Stop() }
}

function Find-LearningAvailablePort([int]$Preferred) {
    for($candidatePort=$Preferred+1;$candidatePort -le [Math]::Min(65535,$Preferred+100);$candidatePort++) {
        if(Test-LearningPortAvailable $candidatePort){return $candidatePort}
    }
    throw 'No available local port was found. No unrelated process was stopped.'
}

function Read-LearningEndpoint([string]$Root) {
    $path=Join-Path $Root '.local\service-endpoint.json'
    if(Test-Path -LiteralPath $path){
        try {
            $endpoint=Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
            $endpointPort=[int]$endpoint.port
            if($endpointPort -ge 1024 -and $endpointPort -le 65535 -and $endpoint.instancePath -eq $Root){return $endpoint}
        } catch {}
    }
    return $null
}

function Save-LearningEndpoint([string]$Root,[int]$Port) {
    $path=Join-Path $Root '.local\service-endpoint.json'
    $endpoint=@{port=$Port;serviceUrl="http://127.0.0.1:$Port";instancePath=$Root}
    $temporary=$path+'.tmp'
    [IO.File]::WriteAllText($temporary,($endpoint|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $path -Force
}
