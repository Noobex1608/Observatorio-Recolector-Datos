# Starts the complete Barometro project for local development.
# Usage:
#   .\iniciar-todo.ps1
#   .\iniciar-todo.ps1 -Install

param(
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
$RootPath = $PSScriptRoot
$WebPath = Join-Path $RootPath 'Barometro_WEB'
$WebScriptsPath = Join-Path $WebPath 'scripts'
$WebFrontendPath = Join-Path $WebPath 'frontend'
$MobilePath = Join-Path $RootPath 'Barometro_MOVIL\kobo-mobile'

function Assert-Command {
    param(
        [string]$Name,
        [string]$InstallMessage
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "No se encontro '$Name'. $InstallMessage"
    }
}

function Invoke-ProjectScript {
    param(
        [string]$ScriptName,
        [string]$Command
    )

    $scriptPath = Join-Path $WebScriptsPath $ScriptName
    & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath $Command
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

function Start-DevTerminal {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )

    $arguments = @(
        '-NoExit',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "& { Set-Location -LiteralPath '$WorkingDirectory'; `$host.UI.RawUI.WindowTitle = '$Title'; $Command }"
    )

    Start-Process powershell -ArgumentList $arguments
}

Write-Host 'Verificando herramientas...' -ForegroundColor Cyan
Assert-Command 'docker' 'Instala Docker Desktop y vuelve a ejecutar el script.'
Assert-Command 'docker-compose' 'Los scripts actuales usan docker-compose para levantar PostgreSQL.'
Assert-Command 'npm' 'Instala Node.js 20+ para usar la version movil.'
Assert-Command 'bun' 'Instala Bun 1.2.18+ para usar la version web.'

if ($Install) {
    Write-Host 'Instalando dependencias de la version web...' -ForegroundColor Cyan
    Push-Location $WebFrontendPath
    try {
        bun install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }

    Write-Host 'Instalando dependencias de la version movil...' -ForegroundColor Cyan
    Push-Location $MobilePath
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
}

Write-Host 'Iniciando PostgreSQL...' -ForegroundColor Cyan
Invoke-ProjectScript 'docker.ps1' 'up'

Write-Host 'Iniciando backend Laravel...' -ForegroundColor Cyan
Invoke-ProjectScript 'backend.ps1' 'start'

Write-Host 'Abriendo frontend web en una nueva terminal...' -ForegroundColor Cyan
Start-DevTerminal `
    -Title 'Barometro WEB - http://localhost:4200' `
    -WorkingDirectory $WebFrontendPath `
    -Command 'bun run start'

Write-Host 'Abriendo app movil en una nueva terminal...' -ForegroundColor Cyan
Start-DevTerminal `
    -Title 'Barometro MOVIL - http://localhost:4201' `
    -WorkingDirectory $MobilePath `
    -Command 'npm start'

Write-Host ''
Write-Host 'Proyecto iniciado.' -ForegroundColor Green
Write-Host '  Web:     http://localhost:4200'
Write-Host '  Movil:   http://localhost:4201'
Write-Host '  API:     http://localhost:8000/api'
Write-Host '  Swagger: http://localhost:8000/api/docs'
