@echo off
chcp 65001 >nul
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

echo 检查更改...
git status --short
echo.

echo 添加更改...
git add .
echo.

echo 提交更改...
set /p commit_msg="请输入提交信息 (直接回车使用默认信息): "
if "%commit_msg%"=="" (
    set commit_msg=更新论文数据
)
git commit -m "%commit_msg%"
if %errorlevel% neq 0 (
    echo [警告] 提交失败，可能没有更改需要提交
)
echo.

echo 推送到 GitHub...
git push origin master
if %errorlevel% neq 0 (
    echo [错误] GitHub 推送失败
    goto :error
)
echo [OK] GitHub 推送成功！
echo.

REM ==================== 步骤2: 登录腾讯云 ====================
echo [步骤 2/3] 检查腾讯云登录状态...
echo.

where tcb >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 tcb 命令！请先运行: npm install -g @cloudbase/cli
    goto :error
)

tcb env:list -e academic-4gpadgfs73617168 >nul 2>&1
if %errorlevel% neq 0 (
    echo 需要登录腾讯云...
    tcb login
    if %errorlevel% neq 0 (
        echo [错误] 登录失败
        goto :error
    )
)
echo [OK] 已登录腾讯云
echo.

REM ==================== 步骤3: 部署到腾讯云 ====================
echo [步骤 3/3] 部署到腾讯云...
echo.

echo 部署主页面...
tcb hosting deploy index.html /index.html -e academic-4gpadgfs73617168

echo 部署其他 HTML 页面...
tcb hosting deploy publications.html /publications.html -e academic-4gpadgfs73617168
tcb hosting deploy research.html /research.html -e academic-4gpadgfs73617168
tcb hosting deploy chip_gallery.html /chip_gallery.html -e academic-4gpadgfs73617168
tcb hosting deploy coverage.html /coverage.html -e academic-4gpadgfs73617168
tcb hosting deploy book-item-bci.html /book-item-bci.html -e academic-4gpadgfs73617168
tcb hosting deploy index_en.html /index_en.html -e academic-4gpadgfs73617168
tcb hosting deploy research_en.html /research_en.html -e academic-4gpadgfs73617168
tcb hosting deploy publications_en.html /publications_en.html -e academic-4gpadgfs73617168
tcb hosting deploy chip_gallery_en.html /chip_gallery_en.html -e academic-4gpadgfs73617168
tcb hosting deploy coverage_en.html /coverage_en.html -e academic-4gpadgfs73617168

echo 部署静态资源...
tcb hosting deploy static /static -e academic-4gpadgfs73617168

echo 部署数据...
tcb hosting deploy data /data -e academic-4gpadgfs73617168

echo 部署图片资源...
tcb hosting deploy images /images -e academic-4gpadgfs73617168

echo 部署书籍资源...
tcb hosting deploy book /book -e academic-4gpadgfs73617168

echo 部署论文PDF...
tcb hosting deploy papers /papers -e academic-4gpadgfs73617168

echo.
echo ========================================
echo  部署全部完成！
echo ========================================
echo.
echo GitHub: https://github.com/jieyang1987/jieyang1987.github.io
echo 腾讯云: https://academic-4gpadgfs73617168-1258930043.tcloudbaseapp.com
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
