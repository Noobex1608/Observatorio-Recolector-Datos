# Reconstruye la imagen Docker del backend, aplica migraciones y vuelve a levantar el contenedor de desarrollo.
# Uso: .\scripts\reconstruir-backend.ps1   (o doble clic en reconstruir-backend.bat)
# Deja el registro completo en scripts\reconstruir-backend.log

$ErrorActionPreference = 'Continue'
$ScriptsPath = $PSScriptRoot
$WebPath = Join-Path $ScriptsPath '..'
$LogFile = Join-Path $ScriptsPath 'reconstruir-backend.log'
$Backend = Join-Path $ScriptsPath 'backend.ps1'

Start-Transcript -Path $LogFile -Force | Out-Null
function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Fail($text) { Write-Host "ERROR: $text" -ForegroundColor Red; exit 1 }

try {
    Step 'Comprobando Docker'
    docker version --format '{{.Server.Version}}'
    if ($LASTEXITCODE -ne 0) { Fail 'Docker Desktop no responde. Ábrelo y vuelve a ejecutar este script.' }

    Step 'Levantando PostgreSQL (observatorio_db)'
    # Si el contenedor ya existe (aunque se haya creado con otro proyecto de compose), se reutiliza tal cual:
    # nunca se borra ni se recrea, para no tocar los datos.
    $existing = docker ps -a --filter 'name=^/observatorio_db$' --format '{{.Names}}'
    if ($existing) {
        $running = docker inspect -f '{{.State.Running}}' observatorio_db
        if ($running -ne 'true') { docker start observatorio_db | Out-Null }
        $pg = $LASTEXITCODE
        Write-Host 'Usando el contenedor existente observatorio_db.'
    } else {
        Push-Location $WebPath
        docker compose up -d postgres
        $pg = $LASTEXITCODE
        Pop-Location
    }
    if ($pg -ne 0) { Fail 'No se pudo levantar PostgreSQL.' }
    for ($i = 0; $i -lt 30; $i++) {
        docker exec observatorio_db pg_isready -U postgres *> $null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 2
    }

    Step 'Reconstruyendo la imagen del backend (backend-backend)'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Backend install
    if ($LASTEXITCODE -ne 0) { Fail 'Falló la construcción de la imagen.' }

    Step 'Deteniendo y eliminando los contenedores anteriores'
    foreach ($name in 'observatorio-backend-dev', 'observatorio-backend-worker', 'observatorio-backend-scheduler') {
        docker rm -f $name 2>$null | Out-Null
    }

    Step 'Aplicando migraciones'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Backend migrate
    if ($LASTEXITCODE -ne 0) { Fail 'Fallaron las migraciones.' }

    Step 'Iniciando el backend'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Backend start
    if ($LASTEXITCODE -ne 0) { Fail 'No se pudo iniciar el contenedor del backend.' }

    Step 'Comprobando /api/health'
    $ok = $false
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 5
            if ($r.ok) { $ok = $true; break }
        } catch { Start-Sleep -Seconds 3 }
    }
    if ($ok) { Write-Host 'Backend en línea: http://127.0.0.1:8000' -ForegroundColor Green }
    else { Write-Host 'El backend no respondió a /api/health; revisa: docker logs observatorio-backend-dev' -ForegroundColor Yellow }

    Step 'Estado de las migraciones nuevas'
    docker exec observatorio-backend-dev php artisan migrate:status 2>&1 | Select-String '2026_10_2'

    Write-Host "`nLISTO" -ForegroundColor Green
} finally {
    try { Stop-Transcript | Out-Null } catch { }
}
