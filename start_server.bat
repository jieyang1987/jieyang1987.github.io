@echo off
cd /d "%~dp0"
echo ========================================
echo  Local server: http://localhost:8080
echo ========================================
echo.
echo Press Ctrl+C to stop.
echo.
python -m http.server 8080
pause
