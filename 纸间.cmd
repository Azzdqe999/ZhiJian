@echo off
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0app"
if not exist "%~dp0app\node_modules\electron\dist\electron.exe" (
  echo Electron not installed. Run: pnpm install
  pause
  exit /b 1
)
start "" "%~dp0app\node_modules\electron\dist\electron.exe" "%~dp0app"
