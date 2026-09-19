# Frontend helper for Angular forms SPA.
# Usage: .\scripts\frontend.ps1 <start|install|build|test|check|help>

param(
    [Parameter(Position=0)]
    [ValidateSet('start', 'install', 'build', 'test', 'check', 'help')]
    [string]$Command = 'help'
)

$FrontendPath = Join-Path $PSScriptRoot '..\frontend'

function Assert-Bun {
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Error 'Bun is required. Install it from https://bun.sh and reopen the terminal.'
        exit 1
    }
}

function Invoke-FrontendScript {
    param([string]$ScriptName)

    Assert-Bun
    bun run $ScriptName
    return $LASTEXITCODE
}

Push-Location $FrontendPath
try {
    switch ($Command) {
        'start' {
            Write-Host 'Starting Angular dev server at http://localhost:4200...' -ForegroundColor Green
            $code = Invoke-FrontendScript 'start'
            if ($code -ne 0) { exit $code }
        }
        'install' {
            Assert-Bun
            Write-Host 'Installing frontend dependencies with Bun...' -ForegroundColor Green
            bun install
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        'build' {
            Write-Host 'Building Angular app...' -ForegroundColor Green
            $code = Invoke-FrontendScript 'build'
            if ($code -ne 0) { exit $code }
        }
        'test' {
            Write-Host 'Running frontend tests...' -ForegroundColor Green
            $code = Invoke-FrontendScript 'test'
            if ($code -ne 0) { exit $code }
        }
        'check' {
            Write-Host 'Running Angular compile check...' -ForegroundColor Green
            $code = Invoke-FrontendScript 'check'
            if ($code -ne 0) { exit $code }
        }
        'help' {
            Write-Host 'Frontend Scripts - commands:' -ForegroundColor Yellow
            Write-Host '  start   - Start Angular dev server'
            Write-Host '  install - Install frontend dependencies with Bun'
            Write-Host '  build   - Production build'
            Write-Host '  test    - Run tests'
            Write-Host '  check   - Development compile check'
        }
    }
} finally {
    Pop-Location
}
