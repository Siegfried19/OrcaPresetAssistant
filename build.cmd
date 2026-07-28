@echo off
setlocal
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm is required to build this project.
  echo Install Node.js 22+ and enable pnpm, then run build.cmd again.
  pause
  exit /b 1
)

call pnpm package:win
if errorlevel 1 (
  echo [ERROR] Build failed. Review the output above.
  pause
  exit /b 1
)

echo.
echo Portable build created in release\
pause
