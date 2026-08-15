@echo off
setlocal
cd /d "%~dp0"

set "LATEST_LAUNCHER=%~dp0Launch-Latest-Orca.ps1"
if exist "%LATEST_LAUNCHER%" (
  start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%LATEST_LAUNCHER%"
  exit /b 0
)

if exist "OrcaPresetAssistant.exe" (
  start "" "OrcaPresetAssistant.exe"
  exit /b 0
)

for %%F in ("release\OrcaPresetAssistant-*-portable.exe") do (
  start "" "%%~fF"
  exit /b 0
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No portable EXE was found and pnpm is unavailable.
  pause
  exit /b 1
)

call pnpm dev
