@echo off
setlocal
cd /d "%~dp0"

set "ORCA_EXE=%~dp0FullVersion\OrcaPresetAssistant-Orca-0.6.2-Windows-x64\orca-slicer.exe"
if not exist "%ORCA_EXE%" (
  echo [ERROR] Full version was not found:
  echo %ORCA_EXE%
  pause
  exit /b 1
)

start "" "%ORCA_EXE%"
