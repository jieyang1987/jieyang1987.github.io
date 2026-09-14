@echo off
setlocal
REM One checked release route: GitHub Actions publishes the same artifact to both hosts.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publish.ps1"
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%
