param([switch]$Apply)
$ErrorActionPreference='Stop'
$project=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
& (Join-Path $project 'runtime\python\python.exe') (Join-Path $PSScriptRoot 'check-dev-state.py')
if($LASTEXITCODE -ne 0){throw 'Development state guard failed'}
$apps=Get-Process -Name 'electron','ListeningProMax.App' -ErrorAction SilentlyContinue | Where-Object {$_.Path -and $_.Path.StartsWith($project+'\',[StringComparison]::OrdinalIgnoreCase)}
if($apps){throw 'Application still running'}
$targets=@(Get-ChildItem -LiteralPath (Join-Path $project 'cache') -Directory | Where-Object {$_.Name -like 'v18-smoke*' -or $_.Name -like 'v18-background-*' -or $_.Name -like 'storage-test-*'} | ForEach-Object {$_.FullName})
$targets+=@(Join-Path $project 'cache\pycache';Join-Path $project 'cache\tmp')
Write-Output 'Cleanup manifest:'
$targets | ForEach-Object {Write-Output $_}
if(-not $Apply){return}
$result=@()
foreach($candidate in $targets){
 $target=[IO.Path]::GetFullPath($candidate)
 if(-not $target.StartsWith((Join-Path $project 'cache')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe cleanup path'}
 if(-not (Test-Path -LiteralPath $target)){continue}
 if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected root link'}
 $linkPath=Join-Path $target 'runtime'
 if(Test-Path -LiteralPath $linkPath){
  $link=Get-Item -LiteralPath $linkPath -Force
  if(-not ($link.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Expected fixture runtime junction'}
  if([IO.Path]::GetFullPath([string]$link.Target) -ne (Join-Path $project 'runtime')){throw 'Unexpected junction target'}
  Remove-Item -LiteralPath $link.FullName -Force
 }
 $links=Get-ChildItem -LiteralPath $target -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}
 if($links){throw 'Unexpected nested link'}
 $size=(Get-ChildItem -LiteralPath $target -Recurse -File -Force | Measure-Object Length -Sum).Sum
 Remove-Item -LiteralPath $target -Recurse -Force
 $result+=@{path=$target;bytes=$size}
}
$result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $project 'reports\v18\cleanup.json') -Encoding utf8
$result | Measure-Object -Property bytes -Sum | Select-Object Sum
