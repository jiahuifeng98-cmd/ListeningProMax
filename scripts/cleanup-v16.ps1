$ErrorActionPreference='Stop'
$project=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
& (Join-Path $project 'runtime\python\python.exe') (Join-Path $PSScriptRoot 'check-dev-state.py')
if($LASTEXITCODE -ne 0){throw 'Development state guard failed'}
$apps=Get-Process -Name 'electron','ListeningProMax.App' -ErrorAction SilentlyContinue | Where-Object {$_.Path -and $_.Path.StartsWith($project+'\',[StringComparison]::OrdinalIgnoreCase)}
if($apps){throw 'Application still running'}
$targets=@('cache\v16-smoke','cache\pycache','cache\tmp','data','scripts\patch-v16-ui.py','scripts\patch-v16.py','scripts\prepare-v16-test.py','scripts\prepare-v16-release.py','scripts\document-v16.py')
$targets+=@(Get-ChildItem -LiteralPath (Join-Path $project 'cache') -Directory | Where-Object {$_.Name -like 'storage-test-*'} | ForEach-Object {'cache\'+$_.Name})
Write-Output 'Cleanup manifest:'
$targets | ForEach-Object {Join-Path $project $_}
$result=@()
foreach($relative in $targets){
 $target=[IO.Path]::GetFullPath((Join-Path $project $relative))
 if(-not $target.StartsWith($project+'\',[StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith((Join-Path $project 'release')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe cleanup path'}
 if(-not (Test-Path -LiteralPath $target)){continue}
 if($relative -eq 'cache\v16-smoke'){
  foreach($name in @('assets','models','runtime')){
   $link=Get-Item -LiteralPath (Join-Path $target $name) -Force
   if(-not ($link.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Expected test resource junction'}
   if([IO.Path]::GetFullPath([string]$link.Target) -ne (Join-Path $project $name)){throw 'Unexpected junction target'}
   Remove-Item -LiteralPath $link.FullName -Force
  }
 }
 $size=if((Get-Item -LiteralPath $target).PSIsContainer){(Get-ChildItem -LiteralPath $target -Recurse -File -Force | Measure-Object Length -Sum).Sum}else{(Get-Item -LiteralPath $target).Length}
 Remove-Item -LiteralPath $target -Recurse -Force
 $result+=@{path=$target;bytes=$size}
}
$result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $project 'reports\v16\cleanup.json') -Encoding utf8
$result | Measure-Object -Property bytes -Sum | Select-Object Sum
