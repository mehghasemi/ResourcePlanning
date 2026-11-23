@echo off
"%~dp0runtime\node.exe" "%~dp0tools\manage.mjs" start --live %*
if errorlevel 1 (
  echo.
  echo The operation could not finish. See the message above.
  pause
  exit /b 1
)
