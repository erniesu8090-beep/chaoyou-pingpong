@echo off
title Chao You Table Tennis Server
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start the server!
    echo Please make sure Windows PowerShell is installed.
    echo.
    pause
)
