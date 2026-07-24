@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 一键部署 GitHub + 腾讯云

set "ENV_ID=academic-4gpadgfs73617168"
set "SITE_URL=https://academic-4gpadgfs73617168-1258930043.tcloudbaseapp.com"

echo ========================================
echo  一键部署到 GitHub + 腾讯云
echo ========================================
echo.

REM ==================== 步骤1: 推送到 GitHub ====================
echo [步骤 1/3] 推送到 GitHub...
echo.

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 git 命令！
    goto :error
)

REM 检查是否有更改
set "STATUS_FILE=%TEMP%\git_status_%RANDOM%.txt"
git status --porcelain > "%STATUS_FILE%"
set "HAS_CHANGES=0"
for %%A in ("%STATUS_FILE%") do if %%~zA gtr 0 set "HAS_CHANGES=1"
del "%STATUS_FILE%" >nul 2>&1

if "%HAS_CHANGES%"=="0" (
    echo [跳过] 没有本地更改，GitHub 已是最新
) else (
    echo 检查更改...
    git status --short
    echo.

    echo 添加更改...
    git add -A
    echo.

    echo 提交更改...
    set /p commit_msg="请输入提交信息 (直接回车使用默认信息): "
    if "!commit_msg!"=="" set "commit_msg=更新论文数据"
    git commit -m "!commit_msg!"
    if !errorlevel! neq 0 (
        echo [警告] 提交失败，可能没有更改需要提交
    ) else (
        echo 推送到 GitHub...
        git push origin master
        if !errorlevel! neq 0 (
            echo [错误] GitHub 推送失败
            goto :error
        )
        echo [OK] GitHub 推送成功！
    )
)
echo.

REM ==================== 步骤2: 登录腾讯云 ====================
echo [步骤 2/3] 检查腾讯云登录状态...
echo.

where tcb >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 未找到 tcb 命令，正在安装 @cloudbase/cli ...
    call npm install -g @cloudbase/cli
    if !errorlevel! neq 0 (
        echo [错误] CloudBase CLI 安装失败
        goto :error
    )
)

tcb env list >nul 2>&1
if %errorlevel% neq 0 (
    echo 需要登录腾讯云，请在浏览器中完成授权...
    call tcb login
    if !errorlevel! neq 0 (
        echo [错误] 登录失败
        goto :error
    )
)
echo [OK] 已登录腾讯云
echo.

REM ==================== 步骤3: 部署到腾讯云 ====================
echo [步骤 3/3] 部署到腾讯云 (环境: %ENV_ID%)...
echo.

set "FAIL_COUNT=0"

REM --- 部署 HTML 页面 ---
for %%P in (
    index
    publications
    research
    chip_gallery
    coverage
    book-item-bci
    index_en
    research_en
    publications_en
    chip_gallery_en
    coverage_en
) do (
    if exist "%%P.html" (
        call tcb hosting deploy "%%P.html" "/%%P.html" -e %ENV_ID% >nul 2>&1
        if !errorlevel! neq 0 (
            echo [失败] %%P.html
            set /a FAIL_COUNT+=1
        ) else (
            echo [OK] %%P.html
        )
    ) else (
        echo [跳过] %%P.html 不存在
    )
)

REM --- 部署目录 ---
for %%D in (static data images book papers) do (
    if exist "%%D\" (
        call tcb hosting deploy "%%D" "/%%D" -e %ENV_ID% >nul 2>&1
        if !errorlevel! neq 0 (
            echo [失败] %%D/
            set /a FAIL_COUNT+=1
        ) else (
            echo [OK] %%D/
        )
    ) else (
        echo [跳过] %%D/ 不存在
    )
)

echo.
if %FAIL_COUNT% gtr 0 (
    echo ========================================
    echo  部署完成，但有 %FAIL_COUNT% 项失败，请检查上方日志
    echo ========================================
    pause
    exit /b 1
)

echo ========================================
echo  部署全部完成！
echo ========================================
echo.
echo GitHub:  https://github.com/jieyang1987/jieyang1987.github.io
echo 腾讯云:  %SITE_URL%
echo.
echo 提示: CDN 缓存可能导致页面延迟更新，可用浏览器无痕模式验证
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo  部署失败，请检查错误信息
echo ========================================
pause
exit /b 1
