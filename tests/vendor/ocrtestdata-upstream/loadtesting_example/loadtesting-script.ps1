# Shared variables
$RUNTIME    = 1201
$OUTDIR     = "./out"
$TEXTLOCALE = "de_DE"

# Ensure output directory exists
if (-not (Test-Path $OUTDIR)) {
    New-Item -ItemType Directory -Path $OUTDIR | Out-Null
}

# Start ocrtestdata processes in the background with a safe ArgumentList
$proc1 = Start-Process -FilePath "ocrtestdata" -ArgumentList @(
    "-b","15","-p","2","-l",$TEXTLOCALE,"--dpi","150","-t","30","-r",$RUNTIME,"-o",$OUTDIR
) -PassThru

$proc2 = Start-Process -FilePath "ocrtestdata" -ArgumentList @(
    "-b","5","-p","30","-l",$TEXTLOCALE,"--dpi","300","--qr","SEPARATOR","-t","180","-r",$RUNTIME,"-o",$OUTDIR
) -PassThru

$proc3 = Start-Process -FilePath "ocrtestdata" -ArgumentList @(
    "-b","2","-p","100","-l",$TEXTLOCALE,"--dpi","150","-t","300","-r",$RUNTIME,"-o",$OUTDIR
) -PassThru

Write-Host "Started ocrtestdata processes:"
Write-Host "  PID1 = $($proc1.Id)"
Write-Host "  PID2 = $($proc2.Id)"
Write-Host "  PID3 = $($proc3.Id)"
Write-Host ""

# Cleanup function
function Cleanup {
    param(
        [switch]$FromEvent
    )

    Write-Host "Stopping ocrtestdata processes..."

    $procs = @($proc1, $proc2, $proc3) | Where-Object { $_ -ne $null }

    foreach ($p in $procs) {
        try {
            if ($p.HasExited) { continue }

            # Try a graceful close (works for GUI apps). For console apps, this usually does nothing.
            $p.CloseMainWindow() | Out-Null
            # Wait a short time for graceful exit
            $p.WaitForExit(3000)

            if (-not $p.HasExited) {
                # Try Stop-Process (best cross-platform approach in PowerShell)
                Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 300
            }

            if (-not $p.HasExited) {
                # Force kill as last resort
                $p.Kill()
            }
        } catch {
            # ignore individual process errors
        }
    }

    Write-Host "All processes terminated."
}

# Register handlers for normal exit and Ctrl+C
# PowerShell.Exiting covers normal engine exit
$exitEvent = Register-EngineEvent PowerShell.Exiting -Action { & Cleanup -FromEvent } 

# Console Cancel (Ctrl+C) — attempt to run cleanup and prevent immediate termination so cleanup can run
$cancelEvent = Register-ObjectEvent -InputObject [Console] -EventName CancelKeyPress -Action {
    # $eventArgs is available inside the action scriptblock
    & Cleanup -FromEvent
    $eventArgs.Cancel = $true
}

try {
    # Wait for user confirmation
    Read-Host "Press ENTER to stop all ocrtestdata processes..."
} finally {
    # Ensure cleanup runs if script ends normally or via exception
    Cleanup

    # Unregister events to avoid leaks
    if ($exitEvent) { Unregister-Event -SubscriptionId $exitEvent.SubscriptionId -ErrorAction SilentlyContinue }
    if ($cancelEvent) { Unregister-Event -SubscriptionId $cancelEvent.SubscriptionId -ErrorAction SilentlyContinue }
}
