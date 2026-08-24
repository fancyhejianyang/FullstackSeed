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

$globalChroma = Get-Command chroma -ErrorAction SilentlyContinue
if ($globalChroma) {
  & $globalChroma.Source run --path $dataPath --host $hostName --port $port
  exit $LASTEXITCODE
}

& py -3 -m chromadb.cli.cli run --path $dataPath --host $hostName --port $port
