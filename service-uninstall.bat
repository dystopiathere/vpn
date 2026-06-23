@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set TASK_NAME=sing-box

schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Task "%TASK_NAME%" does not exist. Nothing to do.
    pause
    exit /b 0
)

echo [INFO] Stopping task "%TASK_NAME%" (if running)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-ScheduledTask -TaskName '%TASK_NAME%' -ErrorAction SilentlyContinue"

echo [INFO] Killing any running sing-box.exe processes...
taskkill /F /IM sing-box.exe >nul 2>&1

echo [INFO] Removing scheduled task "%TASK_NAME%"...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unregister-ScheduledTask -TaskName '%TASK_NAME%' -Confirm:$false"

if %errorlevel% neq 0 (
    echo [ERROR] Failed to remove scheduled task.
    pause
    exit /b 1
)

echo [OK] Task "%TASK_NAME%" removed successfully.
pause