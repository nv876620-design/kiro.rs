@echo off
setlocal
REM Start kiro-rs server (release build)
REM Usage: run-server.bat [extra args...]

cd /d "%~dp0"

set "BIN=target\release\kiro-rs.exe"

if not exist "%BIN%" (
    echo [INFO] Release binary not found, building...
    cargo build --release
    if errorlevel 1 (
        echo [ERROR] Build failed.
        pause
        exit /b 1
    )
)

set "CFG_ARGS="
if exist "config.json" set "CFG_ARGS=%CFG_ARGS% -c config.json"
if exist "credentials.json" set "CFG_ARGS=%CFG_ARGS% --credentials credentials.json"

echo ========================================
echo   Starting kiro-rs server
echo   Binary: %BIN%
echo   Config: %CFG_ARGS%
echo ========================================
echo.

"%BIN%" %CFG_ARGS% %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo [INFO] Server stopped with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
