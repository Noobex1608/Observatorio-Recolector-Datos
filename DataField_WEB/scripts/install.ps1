# Install all project dependencies.
# Usage: .\scripts\install.ps1

$ErrorActionPreference = 'Stop'
$ScriptsPath = $PSScriptRoot

function Invoke-ProjectScript {
    param(
        [string]$Script,
        [string]$Argument
    )

    & powershell -ExecutionPolicy Bypass -File (Join-Path $ScriptsPath $Script) $Argument
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host 'Installing Observatorio Forms Platform dependencies...' -ForegroundColor Yellow

Invoke-ProjectScript 'docker.ps1' 'up'
Invoke-ProjectScript 'backend.ps1' 'install'
Invoke-ProjectScript 'frontend.ps1' 'install'

Write-Host 'Dependencies installed.' -ForegroundColor Green
Write-Host 'Next steps:'
Write-Host '  .\scripts\backend.ps1 migrate'
Write-Host '  .\scripts\start.ps1 all'
