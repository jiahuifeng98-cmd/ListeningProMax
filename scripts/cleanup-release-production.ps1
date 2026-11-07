param([switch]$Apply)
$ErrorActionPreference='Stop'
. "$PSScriptRoot\env.ps1"
$project=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$report=Join-Path $project 'reports\share-20261106'
& "$project\runtime\python\python.exe" -B "$project\scripts\check-dev-state.py"
if($LASTEXITCODE -ne 0){throw 'Development data guard failed'}
if(-not (Get-Content (Join-Path $report 'verified.json') -Raw | ConvertFrom-Json).passed){throw 'Final archive must pass validation'}
$archive=Get-Content (Join-Path $report 'archive.json') -Raw | ConvertFrom-Json
if((Get-FileHash -LiteralPath $archive.path).Hash -ne $archive.sha256){throw 'Final archive changed'}
if(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($project+'\',[StringComparison]::OrdinalIgnoreCase) -and $_.Name -match 'ListeningProMax|electron|msedge|ffmpeg'}){throw 'Project application still running'}
$candidates=@('cache\share-build','cache\share-launcher-tests','cache\分享验收 中文 空格','cache\移动后的 分享验收','cache\分享验收 桌面','cache\promo-render','cache\promo-assets','release\ListeningProMax-1.9.0-轻量分享包.zip','scripts\update-catalog-ui.py','scripts\reset-share-fixture.ps1')
$candidates+=@(Get-ChildItem -LiteralPath (Join-Path $project 'cache') -Directory | Where-Object {$_.Name -match '^(catalog-toolbar|vocabulary-smoke)-\d+$'} | ForEach-Object {'cache\'+$_.Name})
$assets=Join-Path $project 'release\ListeningProMax\app\resources\app\out\renderer\assets'
$liveHtml=Get-Content (Join-Path (Split-Path $assets -Parent) 'index.html') -Raw
foreach($file in Get-ChildItem -LiteralPath $assets -File){if(-not (Test-Path -LiteralPath (Join-Path $project ('out\renderer\assets\'+$file.Name))) -and -not $liveHtml.Contains($file.Name)){$candidates+=$file.FullName.Substring($project.Length+1)}}
$plan=@()
foreach($relative in $candidates){
 $target=[IO.Path]::GetFullPath((Join-Path $project $relative))
 if(-not $target.StartsWith($project+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe cleanup target'}
 if(-not (Test-Path -LiteralPath $target)){continue}
 if((Resolve-Path -LiteralPath $target).Path -ne $target){throw 'Unexpected resolved target'}
 $item=Get-Item -LiteralPath $target -Force
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected link'}
 if($item.PSIsContainer){if(Get-ChildItem -LiteralPath $target -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Nested link'};$bytes=(Get-ChildItem -LiteralPath $target -Recurse -File -Force | Measure-Object Length -Sum).Sum}else{$bytes=$item.Length}
 $plan+=@{path=$target;directory=$item.PSIsContainer;logicalBytes=$bytes}
}
$plan | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $report 'cleanup-plan.json') -Encoding utf8
$plan | ConvertTo-Json -Depth 5
if(-not $Apply){return}
foreach($entry in $plan){Remove-Item -LiteralPath $entry.path -Recurse -Force}
@{completed=$true;targets=$plan;note='Logical byte totals include hard-linked test files and are not a physical space-reclaimed claim'} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $report 'cleanup.json') -Encoding utf8
