param([switch]$Apply)
$ErrorActionPreference='Stop'
$project=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
& (Join-Path $project 'runtime\python\python.exe') -B (Join-Path $PSScriptRoot 'check-dev-state.py')
if($LASTEXITCODE -ne 0){throw 'Development data guard failed'}
$running=Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($project+'\cache\',[StringComparison]::OrdinalIgnoreCase) -and $_.Name -match 'ListeningProMax|python|electron'}
if($running){throw 'Share test program is still running; do not clean active data'}
$names=@('share-build','share-launcher-tests','share-download-check','分享验收 中文 空格','移动后的 分享验收','分享验收 桌面')
$targets=@()
foreach($name in $names){
 $candidate=[IO.Path]::GetFullPath((Join-Path $project ('cache\'+$name)))
 if(-not $candidate.StartsWith($project+'\cache\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe cleanup path'}
 if(Test-Path -LiteralPath $candidate){
  $resolved=(Resolve-Path -LiteralPath $candidate).Path
  if($resolved -ne $candidate){throw 'Unexpected resolved target'}
  if((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected link'}
  $links=Get-ChildItem -LiteralPath $candidate -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}
  if($links){throw 'Unexpected nested link'}
  $bytes=(Get-ChildItem -LiteralPath $candidate -Recurse -Force -File | Measure-Object Length -Sum).Sum
  $targets+=@{path=$candidate;logicalBytes=$bytes}
 }
}
$targets | ConvertTo-Json -Depth 5
if(-not $Apply){return}
$archive=Join-Path $project 'release\ListeningProMax-1.9.0-轻量分享包.zip'
if(-not (Test-Path -LiteralPath $archive)){throw 'Final distribution missing; do not delete staging'}
foreach($item in $targets){Remove-Item -LiteralPath $item.path -Recurse -Force}
$targets | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $project 'reports\share-v19\cleanup.json') -Encoding utf8
