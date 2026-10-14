$ErrorActionPreference = 'Stop'
$queueRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $queueRoot
$queueLogDir = Join-Path $queueRoot 'logs'
New-Item -ItemType Directory -Path $queueLogDir -Force | Out-Null
$queueLog = Join-Path $queueLogDir 'queue-worker.log'
$queueErrorLog = Join-Path $queueLogDir 'queue-worker-error.log'
$queueSupervisorLog = Join-Path $queueLogDir 'queue-supervisor.log'
$queueNode = (Get-Command node -ErrorAction Stop).Source
while ($true) {
    foreach ($queueFile in @($queueLog, $queueErrorLog, $queueSupervisorLog)) {
        if ((Test-Path -LiteralPath $queueFile) -and (($queueFile -ne $queueSupervisorLog) -or (Get-Item -LiteralPath $queueFile).Length -gt 10MB)) {
            Move-Item -LiteralPath $queueFile -Destination ($queueFile + '.previous') -Force
        }
    }
    try {
        $queueChild = Start-Process -FilePath $queueNode -ArgumentList '--env-file-if-exists=.env.queue.local', 'server/requestQueueWorker.js' -WorkingDirectory $queueRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $queueLog -RedirectStandardError $queueErrorLog
        $queueChild.Id | Set-Content -LiteralPath (Join-Path $queueLogDir 'queue-worker.pid')
        Add-Content -LiteralPath $queueSupervisorLog -Value ((Get-Date -Format o) + ' started worker PID ' + $queueChild.Id)
        $queueChild.WaitForExit()
        Add-Content -LiteralPath $queueSupervisorLog -Value ((Get-Date -Format o) + ' worker exited; restarting in 10 seconds')
    } catch {
        Add-Content -LiteralPath $queueSupervisorLog -Value ((Get-Date -Format o) + ' could not start worker; restarting in 10 seconds')
    }
    Start-Sleep -Seconds 10
}
