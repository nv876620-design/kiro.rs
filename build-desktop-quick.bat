@echo off
REM Script để build desktop app nhanh (dev mode, không tối ưu hóa)
REM Dùng để test nhanh các thay đổi

echo ========================================
echo   Kiro Desktop - Quick Dev Build
echo ========================================
echo.

echo [1/2] Building frontend...
cd admin-ui
call pnpm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed
    cd ..
    exit /b 1
)
cd ..

echo.
echo [2/2] Building desktop (debug mode)...
cargo build --manifest-path src-tauri/Cargo.toml

if %errorlevel% neq 0 (
    echo [ERROR] Desktop build failed
    exit /b 1
)

echo.
echo ========================================
echo   Build Success!
echo ========================================
echo.
echo Executable location:
echo   src-tauri\target\debug\kiro-rs-desktop.exe
echo.
echo To run it:
echo   src-tauri\target\debug\kiro-rs-desktop.exe
echo.

pause
