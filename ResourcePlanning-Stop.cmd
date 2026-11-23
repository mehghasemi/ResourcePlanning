@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20.6 or newer is required to stop ResourcePlanning.
  pause
  exit /b 1
)
node "%~dp0tools\manage.mjs" stop %*
if errorlevel 1 pause
