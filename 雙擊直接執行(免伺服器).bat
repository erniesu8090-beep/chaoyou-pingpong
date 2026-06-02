@echo off
chcp 65001 >nul
title 朝友桌球分級小程式 - 單機免伺服器版
cd /d "%~dp0"

:: 取得當前目錄並將反斜線 \ 轉換為斜線 /
set "CURRENT_DIR=%~dp0"
set "CURRENT_DIR=%CURRENT_DIR:\=/%"

:: 檢查 Chrome 常用安裝路徑
set "CHROME_PATH="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

:: 檢查 Edge 常用安裝路徑
set "EDGE_PATH="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)

:: 優先使用 Chrome App 模式（無網址列的獨立視窗，看起來像原生桌面 App）
:: 次之使用 Edge App 模式，再次之直接用系統預設瀏覽器開啟
if defined CHROME_PATH (
    start "" "%CHROME_PATH%" --app="file:///%CURRENT_DIR%index.html"
) else if defined EDGE_PATH (
    start "" "%EDGE_PATH%" --app="file:///%CURRENT_DIR%index.html"
) else (
    start "" "index.html"
)
