@echo off
setlocal

REM Observatorio ULEAM - Windows CMD wrapper.
REM Canonical implementation lives in the PowerShell scripts.

set "SCRIPT_DIR=%~dp0"
set "COMMAND=%~1"
if "%COMMAND%"=="" set "COMMAND=help"

if /I "%COMMAND%"=="help" goto help
if /I "%COMMAND%"=="all" goto all
if /I "%COMMAND%"=="docker" goto docker
if /I "%COMMAND%"=="backend" goto backend
if /I "%COMMAND%"=="frontend" goto frontend
if /I "%COMMAND%"=="install" goto install
if /I "%COMMAND%"=="setup" goto setup
if /I "%COMMAND%"=="stop" goto stop
if /I "%COMMAND%"=="restart" goto restart
if /I "%COMMAND%"=="migrate" goto migrate
if /I "%COMMAND%"=="clean" goto clean
if /I "%COMMAND%"=="build" goto build
if /I "%COMMAND%"=="check" goto check
goto help

:help
echo Observatorio ULEAM - Formularios
echo.
echo Uso: scripts\start.bat ^<comando^>
echo.
echo Comandos:
echo   all       Inicia PostgreSQL, backend y frontend
echo   docker    Inicia PostgreSQL
echo   backend   Inicia Laravel API
echo   frontend  Inicia Angular
echo   install   Instala dependencias backend/frontend
echo   setup     Instala backend/frontend y migra BD
echo   stop      Detiene servicios Docker
echo   restart   Reinicia servicios
echo   migrate   Ejecuta migraciones
echo   clean     Limpia cache backend
echo   build     Compila frontend
echo   check     Chequeo de compilacion frontend
echo   help      Muestra esta ayuda
echo.
echo URLs:
echo   Frontend: http://localhost:4200
echo   API:      http://localhost:8000/api
echo   Docs:     http://localhost:8000/api/docs
exit /b 0

:docker
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%docker.ps1" up
exit /b %ERRORLEVEL%

:backend
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%backend.ps1" start
exit /b %ERRORLEVEL%

:frontend
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%frontend.ps1" start
exit /b %ERRORLEVEL%

:install
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1"
exit /b %ERRORLEVEL%

:all
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1" all
exit /b %ERRORLEVEL%

:setup
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1" setup
exit /b %ERRORLEVEL%

:stop
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1" stop
exit /b %ERRORLEVEL%

:restart
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1" restart
exit /b %ERRORLEVEL%

:migrate
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1" migrate
exit /b %ERRORLEVEL%

:clean
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1" clean
exit /b %ERRORLEVEL%

:build
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%frontend.ps1" build
exit /b %ERRORLEVEL%

:check
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%frontend.ps1" check
exit /b %ERRORLEVEL%
