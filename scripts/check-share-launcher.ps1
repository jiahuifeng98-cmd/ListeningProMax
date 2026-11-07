param([Parameter(Mandatory=$true)][string]$PortableRoot)
$ErrorActionPreference='Stop'
$targetRoot=(Resolve-Path -LiteralPath $PortableRoot).Path
$executable=Join-Path $targetRoot 'app\ListeningProMax.App.exe'
$timer=[Diagnostics.Stopwatch]::StartNew()
Start-Process -FilePath (Join-Path $targetRoot 'ListeningProMax.exe') -WorkingDirectory $targetRoot -WindowStyle Hidden
$instance=$null
try {
 for ($attempt=0; $attempt -lt 120; $attempt++) {
  $instance=Get-Process -Name 'ListeningProMax.App' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($instance) { break }
  Start-Sleep -Milliseconds 500
 }
 if (-not $instance) { throw 'Portable launcher did not display a window' }
 $report=@{passed=$true;root=$targetRoot;visibleWindowMs=$timer.ElapsedMilliseconds;check='Outer launcher displayed app from extracted Chinese and space path'}
 $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot '..\reports\share-launcher.json') -Encoding utf8
 $report | ConvertTo-Json
} finally {
 if ($instance) {
  $null=$instance.CloseMainWindow()
  if (-not $instance.WaitForExit(15000)) { throw 'Test app did not close cleanly' }
 }
}
