$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$dataPath = Join-Path $projectRoot 'chroma-data'
$venvChroma = Join-Path $PSScriptRoot '.venv\Scripts\chroma.exe'
$hostName = if ($env:CHROMA_HOST) { $env:CHROMA_HOST } else { 'localhost' }
$port = if ($env:CHROMA_PORT) { $env:CHROMA_PORT } else { '8000' }

New-Item -ItemType Directory -Force -Path $dataPath | Out-Null

Write-Host "Starting Chroma at http://$hostName`:$port"
Write-Host "Persist directory: $dataPath"

if (Test-Path -LiteralPath $venvChroma) {
  & $venvChroma run --path $dataPath --host $hostName --port $port
  exit $LASTEXITCODE
}

Write-Error 'Chroma 服务依赖尚未安装，请先在 server 目录执行：npm.cmd run chroma:install'
exit 1
