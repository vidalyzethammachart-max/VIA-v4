$ErrorActionPreference = 'Stop'
$queueRoot = Split-Path -Parent $PSScriptRoot
$queueRunner = Join-Path $PSScriptRoot 'run-queue-worker.ps1'
$queueUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$queueAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $queueRunner + '"') -WorkingDirectory $queueRoot
$queueTrigger = New-ScheduledTaskTrigger -AtLogOn -User $queueUser
$queueWatchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$queueSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$queuePrincipal = New-ScheduledTaskPrincipal -UserId $queueUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'VIA-V4-QueueWorker' -Description 'VIA V4 document queue worker; requires this PC online and user logged in.' -Action $queueAction -Trigger @($queueTrigger,$queueWatchdog) -Settings $queueSettings -Principal $queuePrincipal -Force | Out-Null
Start-ScheduledTask -TaskName 'VIA-V4-QueueWorker'
Get-ScheduledTask -TaskName 'VIA-V4-QueueWorker' | Select-Object TaskName,State
