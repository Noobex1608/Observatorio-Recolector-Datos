@echo off
setlocal

REM Install all project dependencies.
REM Usage: scripts\install.bat

set "SCRIPT_DIR=%~dp0"
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1"
exit /b %ERRORLEVEL%
