@echo off
chcp 65001 >nul
echo ========================================
echo 推送更改到GitHub
echo ========================================
echo.

REM 检查是否有git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到git命令！
    echo 请确保已安装Git并将其添加到系统PATH中。
    echo 下载地址: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM 显示当前状态
echo [1/4] 检查更改...
git status
echo.

REM 添加所有更改
echo [2/4] 添加更改到暂存区...
git add .
echo.

REM 显示将要提交的文件
echo [3/4] 待提交的文件:
git status --short
echo.

REM 提交更改
set /p commit_msg="请输入提交信息 (直接回车使用默认信息): "
if "%commit_msg%"=="" (
    set commit_msg=更新论文数据: 修复摘要渲染支持下标/上标
)

echo.
echo 提交信息: %commit_msg%
git commit -m "%commit_msg%"
echo.

REM 推送到远程仓库
echo [4/4] 推送到GitHub...
git push origin main
echo.

if %errorlevel% equ 0 (
    echo ========================================
    echo ✓ 推送成功！
    echo ========================================
) else (
    echo ========================================
    echo ✗ 推送失败，请检查错误信息
    echo ========================================
)

pause
