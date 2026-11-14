# ============================================
# Docker Scripts
# Uso: .\scripts\docker.ps1 [comando]
# ============================================

param(
    [Parameter(Position=0)]
    [ValidateSet("up", "down", "restart", "logs", "status", "help")]
    [string]$Command = "help"
)

$RootPath = Join-Path $PSScriptRoot ".."

Push-Location $RootPath

try {
    switch ($Command) {
        "up" {
            Write-Host "Iniciando contenedores Docker..." -ForegroundColor Green
            docker-compose up -d
            Write-Host "Contenedores iniciados" -ForegroundColor Green
        }
        "down" {
            Write-Host "Deteniendo contenedores Docker..." -ForegroundColor Yellow
            docker-compose down
            Write-Host "Contenedores detenidos" -ForegroundColor Green
        }
        "restart" {
            Write-Host "Reiniciando contenedores Docker..." -ForegroundColor Green
            docker-compose restart
            Write-Host "Contenedores reiniciados" -ForegroundColor Green
        }
        "logs" {
            Write-Host "Mostrando logs de PostgreSQL..." -ForegroundColor Green
            docker-compose logs -f postgres
        }
        "status" {
            Write-Host "Estado de contenedores:" -ForegroundColor Cyan
            docker-compose ps
        }
        "help" {
            Write-Host "Docker Scripts - Comandos disponibles:" -ForegroundColor Yellow
            Write-Host "  up      - Iniciar contenedores (detached)"
            Write-Host "  down    - Detener contenedores"
            Write-Host "  restart - Reiniciar contenedores"
            Write-Host "  logs    - Ver logs de PostgreSQL (follow)"
            Write-Host "  status  - Ver estado de contenedores"
            Write-Host ""
            Write-Host "Uso: .\scripts\docker.ps1 [comando]" -ForegroundColor Cyan
        }
    }
} finally {
    Pop-Location
}
