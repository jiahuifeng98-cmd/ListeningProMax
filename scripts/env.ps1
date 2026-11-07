$projectRoot = Split-Path $PSScriptRoot -Parent
$env:TEMP = Join-Path $projectRoot 'cache\tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $projectRoot 'cache\npm'
$env:ELECTRON_CACHE = Join-Path $projectRoot 'cache\electron'
$env:ELECTRON_BUILDER_CACHE = Join-Path $projectRoot 'cache\builder'
$env:HF_HOME = Join-Path $projectRoot 'cache\huggingface'
$env:HF_HUB_CACHE = Join-Path $env:HF_HOME 'hub'
$env:TORCH_HOME = Join-Path $projectRoot 'cache\torch'
$env:PIP_CACHE_DIR = Join-Path $projectRoot 'cache\pip'
$env:PYTHONPYCACHEPREFIX = Join-Path $projectRoot 'cache\pycache'
$env:PYTHONUTF8 = '1'
$env:XDG_CACHE_HOME = Join-Path $projectRoot 'cache'
$env:UV_CACHE_DIR = Join-Path $projectRoot 'cache\uv'
foreach ($cachePath in @($env:TEMP, $env:npm_config_cache, $env:ELECTRON_CACHE, $env:PIP_CACHE_DIR, $env:HF_HOME, $env:TORCH_HOME)) { New-Item -ItemType Directory -Force -Path $cachePath | Out-Null }
Set-Location $projectRoot
