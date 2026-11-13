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
