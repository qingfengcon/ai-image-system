@echo off
chcp 65001 >nul 2>&1
title AI图片处理系统 - 一键部署

echo ============================================
echo        AI图片处理系统 - 一键部署脚本
echo ============================================
echo.

:: 检查 Node.js
echo [1/5] 检查 Node.js 环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 16 或更高版本
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo [成功] Node.js 版本: %NODE_VER%
echo.

:: 检查项目文件
echo [2/5] 检查项目文件...
if not exist "package.json" (
    echo [错误] 未找到 package.json，请确认在项目根目录运行此脚本
    pause
    exit /b 1
)
if not exist "server.js" (
    echo [错误] 未找到 server.js，请确认项目文件完整
    pause
    exit /b 1
)
echo [成功] 项目文件检查通过
echo.

:: 安装依赖
echo [3/5] 安装项目依赖...
if exist "node_modules" (
    echo [提示] 检测到已有 node_modules，跳过安装
    echo        如需重新安装，请删除 node_modules 文件夹后重新运行
) else (
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
)
echo [成功] 依赖就绪
echo.

:: 创建必要目录
echo [4/5] 创建必要目录...
if not exist "data" mkdir data
if not exist "uploads" mkdir uploads
echo [成功] 目录创建完成
echo.

:: 检查 .env 配置
echo [5/5] 检查配置文件...
if not exist ".env" (
    echo [提示] 未找到 .env 文件，正在创建默认配置...
    (
        echo WAVESPEED_API_KEY=your_wavespeed_api_key_here
        echo JWT_SECRET=ai-image-system-secret-key-2024
        echo PORT=3000
    ) > .env
    echo [警告] 请编辑 .env 文件，填入您的 WaveSpeed API Key
    echo.
)

:: 配置防火墙
echo [附加] 配置 Windows 防火墙规则...
netsh advfirewall firewall show rule name="AI图片处理系统" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="AI图片处理系统" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
    if %errorlevel% equ 0 (
        echo [成功] 防火墙规则已添加，允许 3000 端口入站连接
    ) else (
        echo [警告] 防火墙规则添加失败，请以管理员身份运行或手动放行 3000 端口
    )
) else (
    echo [提示] 防火墙规则已存在，跳过
)
echo.

:: 获取本机IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set LOCAL_IP=%%b
)

echo ============================================
echo              部署完成！
echo ============================================
echo.
echo   本机访问:   http://localhost:3000
echo   局域网访问: http://%LOCAL_IP%:3000
echo.
echo   默认管理员: admin / admin123
echo.
echo   启动命令:   npm start
echo              或 node server.js
echo.
echo ============================================

:: 询问是否立即启动
echo.
set /p START_NOW=是否立即启动系统？(Y/N): 
if /i "%START_NOW%"=="Y" (
    echo.
    echo 正在启动系统...
    node server.js
) else (
    echo.
    echo 稍后可运行 npm start 启动系统
)
pause
