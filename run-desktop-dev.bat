@echo off
REM Script để chạy desktop app ở dev mode
REM Yêu cầu: Node.js, pnpm, Rust/Cargo đã cài đặt

echo ========================================
echo   Kiro Desktop - Development Mode
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
echo [3/3] Starting desktop app...
echo.
echo Desktop app will start at: http://127.0.0.1:8080/admin
echo (Port may change if 8080 is occupied)
echo.
cargo run --manifest-path src-tauri/Cargo.toml

pause
