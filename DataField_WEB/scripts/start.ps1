# Observatorio Forms Platform - development orchestrator
# Usage: .\scripts\start.ps1 <all|docker|backend|frontend|install|setup|stop|restart|migrate|clean|build|check|help>

param(
    [Parameter(Position=0)]
    [ValidateSet('all', 'docker', 'backend', 'frontend', 'install', 'setup', 'stop', 'restart', 'migrate', 'clean', 'build', 'check', 'help')]
    [string]$Command = 'help'
)

$ScriptsPath = $PSScriptRoot

function Invoke-Script {
    param(
        [string]$Script,
        [string]$Arg
    )

    & powershell -ExecutionPolicy Bypass -File (Join-Path $ScriptsPath $Script) $Arg
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Show-Help {
    Write-Host 'Observatorio Forms Platform - commands:' -ForegroundColor Yellow
    Write-Host '  all      - Start PostgreSQL, Laravel API and Angular SPA'
    Write-Host '  docker   - Start PostgreSQL only'
    Write-Host '  backend  - Start Laravel API in Docker'
    Write-Host '  frontend - Start Angular dev server'
    Write-Host '  install  - Install backend/frontend dependencies'
    Write-Host '  setup    - Install dependencies, migrate and seed'
    Write-Host '  stop     - Stop backend container and PostgreSQL'
    Write-Host '  restart  - Stop then start all services'
    Write-Host '  migrate  - Run Laravel migrations'
    Write-Host '  clean    - Clear Laravel caches'
    Write-Host '  build    - Build Angular app'
    Write-Host '  check    - Run Angular compile check'
    Write-Host ''
    Write-Host 'URLs:' -ForegroundColor Green
    Write-Host '  Frontend: http://localhost:4200'
    Write-Host '  API:      http://localhost:8000/api'
    Write-Host '  Swagger:  http://localhost:8000/api/docs'
}

switch ($Command) {
    'all' {
        Invoke-Script 'docker.ps1' 'up'
        Invoke-Script 'backend.ps1' 'start'
        Invoke-Script 'frontend.ps1' 'start'
    }
    'docker' { Invoke-Script 'docker.ps1' 'up' }
    'backend' { Invoke-Script 'backend.ps1' 'start' }
    'frontend' { Invoke-Script 'frontend.ps1' 'start' }
    'install' { & powershell -ExecutionPolicy Bypass -File (Join-Path $ScriptsPath 'install.ps1') }
    'setup' {
        & powershell -ExecutionPolicy Bypass -File (Join-Path $ScriptsPath 'install.ps1')
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        Invoke-Script 'backend.ps1' 'migrate-fresh-seed'
    }
    'stop' {
        Invoke-Script 'backend.ps1' 'stop'
        Invoke-Script 'docker.ps1' 'down'
    }
    'restart' {
        Invoke-Script 'backend.ps1' 'stop'
        Invoke-Script 'docker.ps1' 'restart'
        Invoke-Script 'backend.ps1' 'start'
        Invoke-Script 'frontend.ps1' 'start'
    }
    'migrate' { Invoke-Script 'backend.ps1' 'migrate' }
    'clean' { Invoke-Script 'backend.ps1' 'cache-clear' }
    'build' { Invoke-Script 'frontend.ps1' 'build' }
    'check' { Invoke-Script 'frontend.ps1' 'check' }
    'help' { Show-Help }
}
