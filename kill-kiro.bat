@echo off
REM Script để dừng tất cả process kiro đang chạy trước khi build

echo Checking for running kiro processes...

tasklist /FI "IMAGENAME eq kiro-rs-desktop.exe" 2>NUL | find /I /N "kiro-rs-desktop.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Found kiro-rs-desktop.exe running, stopping it...
    taskkill /F /IM kiro-rs-desktop.exe
    timeout /t 2 >nul
    echo Process stopped.
) else (
    echo No kiro-rs-desktop.exe process found.
)

echo Ready to build!
