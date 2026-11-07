param([ValidateSet('favorite-sort','listening-modes','vocabulary','catalog-toolbar')][string]$ReportName = 'favorite-sort')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target = (Resolve-Path (Join-Path $repo 'release\ListeningProMax')).Path
$source = (Resolve-Path (Join-Path $repo 'out')).Path
$reportDir = Join-Path $repo ('reports\' + $ReportName)
if (-not (Get-Content (Join-Path $reportDir 'checks.json') -Raw | ConvertFrom-Json).passed) { throw 'Desktop checks must pass before deployment' }
if (Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase) }) { throw '请退出 ListeningProMax 后再更新' }
& (Join-Path $repo 'runtime\python\python.exe') -B (Join-Path $repo 'scripts\check-dev-state.py')
if ($LASTEXITCODE -ne 0) { throw 'Development data guard failed' }
$dataBefore = @(Get-ChildItem -LiteralPath (Join-Path $target 'data') -Filter 'library.sqlite*' -File | ForEach-Object { @{ path=$_.FullName; sha256=(Get-FileHash -LiteralPath $_.FullName).Hash } })
$deployed = @()
foreach ($file in Get-ChildItem -LiteralPath $source -Recurse -File) {
    $relative = $file.FullName.Substring($source.Length + 1)
    $destination = [IO.Path]::GetFullPath((Join-Path $target ('app\resources\app\out\' + $relative)))
    if (-not $destination.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid deployment path' }
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination ($destination + '.new') -Force
    Move-Item -LiteralPath ($destination + '.new') -Destination $destination -Force
    $hash = (Get-FileHash -LiteralPath $destination).Hash
    if ($hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) { throw 'Deployed code hash mismatch' }
    $deployed += @{ path=$destination; sha256=$hash }
}
foreach ($file in $dataBefore) {
    if ((Get-FileHash -LiteralPath $file.path).Hash -ne $file.sha256) { throw 'User database changed unexpectedly' }
}
if ($ReportName -eq 'vocabulary') {
    foreach ($relative in @('README.md','使用说明.txt','reports\vocabulary\acceptance.md','THIRD_PARTY_NOTICES.md','licenses\vocabulary-sources.md','licenses\open-anki-jlpt-decks.txt','assets\vocabulary\exam-203-sources.json','assets\vocabulary\level-index.json')) {
        $destination = [IO.Path]::GetFullPath((Join-Path $target $relative))
        if (-not $destination.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid notice path' }
        $noticeSource = if ($relative -eq 'assets\vocabulary\level-index.json') { Join-Path $repo 'src\main\vocabulary-data.json' } else { Join-Path $repo $relative }
        New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
        Copy-Item -LiteralPath $noticeSource -Destination ($destination + '.new') -Force
        Move-Item -LiteralPath ($destination + '.new') -Destination $destination -Force
        $deployed += @{ path=$destination; sha256=(Get-FileHash -LiteralPath $destination).Hash }
    }
}
@{ passed=$true; files=$deployed; userDataUnchanged=$true; userData=$dataBefore } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $reportDir 'deployment.json') -Encoding utf8
Write-Output "DEPLOYED $($deployed.Count) files; user data unchanged"
