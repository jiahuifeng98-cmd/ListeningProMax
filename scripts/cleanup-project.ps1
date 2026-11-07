param([switch]$Apply)
$ErrorActionPreference='Stop'
$projectPath=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent)).TrimEnd('\')
$relativeTargets=@(
 'release\便携 验收',
 'release\ListeningProMax-1.0.0-win-x64-offline.zip',
 'release\ListeningProMax-1.0.0-win-x64-offline.zip.sha256',
 'release\ListeningProMax-1.0.0-source.zip',
 'models\punctuation','runtime\llama',
 'release\ListeningProMax\models\punctuation','release\ListeningProMax\runtime\llama',
 'cache\dictionary-build','cache\pip','cache\benchmark-deps','cache\wheels',
 'reports\final-portable-test-state'
)
$targets=@()
foreach($relative in $relativeTargets){
 $target=[IO.Path]::GetFullPath((Join-Path $projectPath $relative))
 if(-not $target.StartsWith($projectPath+'\',[StringComparison]::OrdinalIgnoreCase)){throw "Outside project: $target"}
 if(-not (Test-Path -LiteralPath $target)){continue}
 # Refuse junctions/symlinks, including any ancestor below the workspace root.
 $part=Get-Item -LiteralPath $target -Force
 while($part.FullName -ne $projectPath){
  if($part.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Refusing reparse path: $($part.FullName)"}
  $part=Get-Item -LiteralPath (Split-Path $part.FullName -Parent) -Force
 }
 $files=Get-ChildItem -LiteralPath $target -File -Recurse -Force -ErrorAction SilentlyContinue
 if((Get-Item -LiteralPath $target).PSIsContainer -eq $false){$files=@(Get-Item -LiteralPath $target)}
 $bytes=($files | Measure-Object Length -Sum).Sum
 $targets+= [pscustomobject]@{Path=$target;Bytes=$bytes}
}
$reportPath=Join-Path $projectPath 'reports\cleanup-plan.json'
$targets | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $reportPath -Encoding utf8
if($Apply){foreach($target in $targets){Remove-Item -LiteralPath $target.Path -Recurse -Force};$targets | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $projectPath 'reports\cleanup-completed.json') -Encoding utf8}
[pscustomobject]@{Applied=[bool]$Apply;Targets=$targets.Count;GiB=[math]::Round(($targets | Measure-Object Bytes -Sum).Sum/1GB,3)} | ConvertTo-Json
