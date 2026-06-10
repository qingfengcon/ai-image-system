@echo off
chcp 65001 >nul
title AI Image System

cd /d "%~dp0"

echo ========================================
echo   AI Image System - Starting
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)

echo [INFO] Starting service...
node server.js

pause
