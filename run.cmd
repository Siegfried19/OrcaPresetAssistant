@echo off
setlocal
cd /d "%~dp0"

set "PACKAGED_ORCA=%~dp0FullVersion\OrcaSlicer\orca-slicer.exe"
if exist "%PACKAGED_ORCA%" (
  start "" "%PACKAGED_ORCA%"
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
