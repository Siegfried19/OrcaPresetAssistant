@echo off
setlocal
cd /d "%~dp0"

set "LATEST_LAUNCHER=%~dp0Launch-Latest-Orca.ps1"
if not exist "%LATEST_LAUNCHER%" (
  echo [ERROR] Latest full-version launcher was not found:
  echo %LATEST_LAUNCHER%
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LATEST_LAUNCHER%"
