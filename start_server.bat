@echo off
chcp 65001 >nul
echo ========================================
echo  启动本地服务器
echo  访问地址: http://localhost:8080
echo ========================================
echo.
echo 按 Ctrl+C 停止服务器
echo.
python -m http.server 8080
pause
