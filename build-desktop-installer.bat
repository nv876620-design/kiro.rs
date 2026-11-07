@echo off
REM Script để build desktop installer (MSI/NSIS cho Windows)
REM Yêu cầu: Node.js, pnpm, Rust/Cargo, Tauri CLI đã cài đặt

echo ========================================
echo   Kiro Desktop - Build Installer
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
echo [3/3] Building desktop installer (this may take 5-10 minutes)...
echo.

REM Build installer với native-tls cho Windows
cd src-tauri
cargo tauri build --features native-tls

if %errorlevel% neq 0 (
    echo [ERROR] Installer build failed
    cd ..
    exit /b 1
)
cd ..

echo.
echo ========================================
echo   Build Success!
echo ========================================
echo.
echo Installer location:
dir /b src-tauri\target\release\bundle\msi\*.msi 2>nul
dir /b src-tauri\target\release\bundle\nsis\*.exe 2>nul
echo.
echo Executable:
echo   src-tauri\target\release\kiro-rs-desktop.exe
echo.

pause
