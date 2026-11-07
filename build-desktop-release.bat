@echo off
REM Script để build desktop app ở release mode (tạo installer)
REM Yêu cầu: Node.js, pnpm, Rust/Cargo đã cài đặt

echo ========================================
echo   Kiro Desktop - Release Build
echo ========================================
echo.

REM Kiểm tra pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] pnpm not found. Please install it first:
    echo   npm install -g pnpm
    exit /b 1
)

REM Kiểm tra cargo
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] cargo not found. Please install Rust first:
    echo   https://rustup.rs/
    exit /b 1
)

echo [1/3] Installing frontend dependencies...
cd admin-ui
if not exist node_modules (
    pnpm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        cd ..
        exit /b 1
    )
)
cd ..

echo.
echo [2/3] Building frontend...
cd admin-ui
pnpm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed
    cd ..
    exit /b 1
)
cd ..

echo.
echo [3/3] Building desktop app (this may take a while)...
echo.

REM Dừng process nếu đang chạy
tasklist /FI "IMAGENAME eq kiro-rs-desktop.exe" 2>NUL | find /I /N "kiro-rs-desktop.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Stopping running kiro-rs-desktop.exe...
    taskkill /F /IM kiro-rs-desktop.exe >NUL 2>&1
    timeout /t 2 >nul
)

REM Build với native-tls cho Windows (sử dụng SChannel)
cargo build --manifest-path src-tauri/Cargo.toml --release --features native-tls

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
echo   src-tauri\target\release\kiro-rs-desktop.exe
echo.
echo To create installer, run:
echo   cd src-tauri
echo   cargo tauri build --features native-tls
echo.
echo Installer will be created in:
echo   src-tauri\target\release\bundle\
echo.

pause
