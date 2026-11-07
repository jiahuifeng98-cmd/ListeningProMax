$ErrorActionPreference='Stop'
$projectPath=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent)).TrimEnd('\')
$relativeTargets=@(
 'reports\fixtures\fleurs-ja-test.parquet',
 'reports\long-audio\two-hour-sparse.wav',
 'scripts\update-v11.py','scripts\refine-v11.py','scripts\finalize-v11.py',
 'scripts\inspect-current.py','scripts\inspect-history.py','scripts\probe-translation.py',
 'scripts\recover-user-course.py',
 'release\ListeningProMax\data\media\c398df00-6987-4899-ade5-5c7c774209c5\playback-590e259e3cf0.wav',
 'release\ListeningProMax\SHA256SUMS.json'
)
$deleted=@()
foreach($relative in $relativeTargets){
 $target=[IO.Path]::GetFullPath((Join-Path $projectPath $relative))
 if(-not $target.StartsWith($projectPath+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Outside workspace'}
 if(-not (Test-Path -LiteralPath $target)){continue}
 $item=Get-Item -LiteralPath $target
 if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Expected regular file'}
 $deleted+=[pscustomobject]@{Path=$target;Bytes=$item.Length}
 Remove-Item -LiteralPath $target -Force
}
# Vite assets are content-hashed. Only keep the files in the current build.
$active=Get-ChildItem -LiteralPath (Join-Path $projectPath 'out\renderer\assets') -File | Select-Object -ExpandProperty Name
$assetDirectory=Join-Path $projectPath 'release\ListeningProMax\app\resources\app\out\renderer\assets'
foreach($item in Get-ChildItem -LiteralPath $assetDirectory -File){
 if($item.Name -notin $active){$deleted+=[pscustomobject]@{Path=$item.FullName;Bytes=$item.Length};Remove-Item -LiteralPath $item.FullName -Force}
}
$deleted | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $projectPath 'reports\v11\cleanup-tail.json') -Encoding utf8
[pscustomobject]@{Files=$deleted.Count;GiB=[math]::Round(($deleted | Measure-Object Bytes -Sum).Sum/1GB,3)} | ConvertTo-Json
