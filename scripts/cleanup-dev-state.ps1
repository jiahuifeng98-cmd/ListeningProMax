$ErrorActionPreference='Stop'
$projectPath=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent)).TrimEnd('\')
& (Join-Path $projectPath 'runtime\python\python.exe') (Join-Path $PSScriptRoot 'check-dev-state.py')
if($LASTEXITCODE -ne 0){throw 'Development database guard failed'}
$relativeTargets=@('data','cache\pycache','cache\pnpm','cache\session','cache\tmp','cache\pip')
foreach($item in Get-ChildItem -LiteralPath (Join-Path $projectPath 'cache') -Directory){if($item.Name -like 'storage-test-*'){$relativeTargets+='cache\'+$item.Name}}
$deleted=@()
foreach($relative in $relativeTargets){
 $target=[IO.Path]::GetFullPath((Join-Path $projectPath $relative))
 if(-not $target.StartsWith($projectPath+'\',[StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith((Join-Path $projectPath 'release')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid cleanup target'}
 if(-not (Test-Path -LiteralPath $target)){continue}
 $item=Get-Item -LiteralPath $target -Force
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing reparse directory'}
 $bytes=(Get-ChildItem -LiteralPath $target -File -Recurse -Force | Measure-Object Length -Sum).Sum
 Remove-Item -LiteralPath $target -Recurse -Force
 $deleted+=[pscustomobject]@{Path=$target;Bytes=$bytes}
}
$deleted | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $projectPath 'reports\v14\cleanup-dev.json') -Encoding utf8
$deleted | Measure-Object Bytes -Sum | Select-Object Sum | ConvertTo-Json
