$ErrorActionPreference = 'Stop'

$venvPath = Join-Path $PSScriptRoot '.venv'
$pythonPath = Join-Path $venvPath 'Scripts\python.exe'
$requirementsPath = Join-Path $PSScriptRoot 'requirements.txt'

if (-not (Test-Path -LiteralPath $pythonPath)) {
  py -3 -m venv $venvPath
}

& $pythonPath -m pip install --upgrade pip
& $pythonPath -m pip install -r $requirementsPath

Write-Host 'Chroma Python service dependencies installed.'
