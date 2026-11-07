param([switch]$Moved)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
$project=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$homePath=Join-Path $project 'cache\分享验收 中文 空格'
$desktopPath=Join-Path $project 'cache\分享验收 桌面'
if($Moved){
 $next=Join-Path $project 'cache\移动后的 分享验收'
 foreach($p in @($homePath,$next)){if(-not [IO.Path]::GetFullPath($p).StartsWith($project+'\cache\')){throw 'Unsafe move path'}}
 if(Test-Path -LiteralPath $next){throw 'Moved target already exists'}
 Move-Item -LiteralPath $homePath -Destination $next
 $homePath=$next
}else{
 New-Item -ItemType Directory -Force -Path $homePath,$desktopPath | Out-Null
 Copy-Item -LiteralPath (Join-Path $project 'cache\share-build\ListeningProMax.exe') -Destination (Join-Path $homePath 'ListeningProMax.exe')
}
$env:LPM_SHORTCUT_TEST_DIR=$desktopPath
$env:PATH=$env:SystemRoot+'\System32;'+$env:SystemRoot
$exe=Join-Path $homePath 'ListeningProMax.exe'
$appExe=Join-Path $homePath '.ListeningProMax\app\ListeningProMax.App.exe'
$before=(Get-Item -LiteralPath $exe).Length
$timer=[Diagnostics.Stopwatch]::StartNew()
Start-Process -FilePath $exe -WorkingDirectory $homePath -WindowStyle Hidden | Out-Null
$instance=$null
try{
 for($i=0;$i -lt 480;$i++){
  $instance=Get-Process -Name 'ListeningProMax.App' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $appExe -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if($instance){break};Start-Sleep -Milliseconds 500
 }
 if(-not $instance){throw 'Launcher did not produce the main window within four minutes'}
 $elapsed=$timer.ElapsedMilliseconds
 $shell=New-Object -ComObject WScript.Shell
 $link=$shell.CreateShortcut((Join-Path $desktopPath 'ListeningProMax.lnk'))
 if($link.TargetPath -ne $exe){throw 'Desktop shortcut target is incorrect'}
 if((Get-Item -LiteralPath $exe).Length -gt 200000){throw 'Embedded payload was not removed from starter after preparation'}
 $visible=@(Get-ChildItem -LiteralPath $homePath | Select-Object -ExpandProperty Name)
 if($visible.Count -ne 1 -or $visible[0] -ne 'ListeningProMax.exe'){throw 'Unexpected visible runtime files'}
 if(@(Get-ChildItem -LiteralPath (Join-Path $homePath '.ListeningProMax') -Filter 'package-retired-*.exe' -Force).Count){throw 'Old compressed payload retained'}
 $report=@{passed=$true;moved=[bool]$Moved;root=$homePath;firstWindowMs=$elapsed;beforeExeBytes=$before;afterExeBytes=(Get-Item $exe).Length;shortcutTarget=$link.TargetPath;developerPathRemoved=$true;desktopWasTestDirectory=$true;visibleEntries=$visible}
 $name=if($Moved){'moved-entry.json'}else{'first-entry.json'}
 $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $project ('reports\share-20261106\'+$name)) -Encoding utf8
 $report | ConvertTo-Json -Depth 6
}finally{
 if($instance){$null=$instance.CloseMainWindow();if(-not $instance.WaitForExit(15000)){throw 'Test app did not close'}}
}
