@echo off
setlocal
cd /d "%~dp0"

if exist "BambuPresetDashboard.exe" (
  start "" "BambuPresetDashboard.exe"
  exit /b 0
)

for %%F in ("release\BambuPresetDashboard-*-portable.exe") do (
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
