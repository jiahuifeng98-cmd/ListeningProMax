param([switch]$Apply)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$report = Join-Path $repo 'reports\vocabulary'
& (Join-Path $repo 'runtime\python\python.exe') -B (Join-Path $repo 'scripts\check-dev-state.py')
if ($LASTEXITCODE -ne 0) { throw 'Non-test development state; stop cleanup' }
if (Get-Process | Where-Object { $_.Path -and ($_.Path.StartsWith((Join-Path $repo 'release\ListeningProMax') + '\', [StringComparison]::OrdinalIgnoreCase) -or $_.Path -eq (Join-Path $repo 'node_modules\electron\dist\electron.exe')) }) { throw 'Application/test process is running; stop cleanup' }
$targets = @()
foreach ($dir in Get-ChildItem -LiteralPath (Join-Path $repo 'cache') -Directory) {
    if ($dir.Name -match '^vocabulary-smoke-\d+$' -or $dir.Name -eq 'vocabulary-sources' -or $dir.Name -eq 'v18-path-test-rm2PIA') { $targets += $dir.FullName }
}
$temporary = Join-Path $repo 'scripts\fetch-vocabulary-pages.cjs'
if (Test-Path -LiteralPath $temporary) { $targets += $temporary }
$liveAssets = Join-Path $repo 'release\ListeningProMax\app\resources\app\out\renderer\assets'
$builtAssets = Join-Path $repo 'out\renderer\assets'
foreach ($file in Get-ChildItem -LiteralPath $liveAssets -File) {
    if ($file.Name -match '^index-[A-Za-z0-9_-]+\.(js|css)$' -and -not (Test-Path -LiteralPath (Join-Path $builtAssets $file.Name))) {
        if ((Get-Content (Join-Path $repo 'release\ListeningProMax\app\resources\app\out\renderer\index.html') -Raw).Contains($file.Name)) { throw 'Asset still referenced by index.html' }
        $targets += $file.FullName
    }
}
$plan = @()
foreach ($target in $targets) {
    $resolved = (Resolve-Path -LiteralPath $target).Path
    if (-not $resolved.StartsWith($repo + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup path escaped project' }
    $item = Get-Item -LiteralPath $resolved -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refuse cleanup of link' }
    $all = if ($item.PSIsContainer) { @(Get-ChildItem -LiteralPath $resolved -Recurse -Force) } else { @($item) }
    if ($all | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Refuse tree containing reparse point' }
    $plan += @{ path=$resolved; logicalBytes=($all | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum }
}
$plan | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $report 'cleanup-plan.json') -Encoding utf8
Get-Content -LiteralPath (Join-Path $report 'cleanup-plan.json')
if (-not $Apply) { exit 0 }
foreach ($entry in $plan) { Remove-Item -LiteralPath $entry.path -Recurse -Force }
@{passed=$true;removed=$plan;logicalBytes=($plan | Measure-Object logicalBytes -Sum).Sum;note='Includes temporary hardlink directory entries; logical bytes are not physical reclaimed disk space. Personal data/models and active analysis untouched.'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $report 'cleanup.json') -Encoding utf8
