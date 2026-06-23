@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set "SINGBOX_DIR=%~dp0"
if "%SINGBOX_DIR:~-1%"=="\" set "SINGBOX_DIR=%SINGBOX_DIR:~0,-1%"

set TASK_NAME=sing-box
set SINGBOX_EXE=%SINGBOX_DIR%\sing-box.exe
set CONFD_DIR=%SINGBOX_DIR%\confd

schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Task "%TASK_NAME%" already exists. Nothing to do.
    pause
    exit /b 0
)

if not exist "%SINGBOX_EXE%" (
    echo [ERROR] %SINGBOX_EXE% not found.
    pause
    exit /b 1
)
if not exist "%CONFD_DIR%" (
    echo [ERROR] %CONFD_DIR% not found.
    pause
    exit /b 1
)

echo [INFO] sing-box root: %SINGBOX_DIR%
echo [INFO] Creating scheduled task "%TASK_NAME%"...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$action = New-ScheduledTaskAction -Execute '%SINGBOX_EXE%' -Argument 'run -D \"%SINGBOX_DIR%\" -C \"%CONFD_DIR%\"' -WorkingDirectory '%SINGBOX_DIR%';" ^
    "$trigger = New-ScheduledTaskTrigger -AtStartup;" ^
    "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest;" ^
    "$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1);" ^
    "Register-ScheduledTask -TaskName '%TASK_NAME%' -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null"

if %errorlevel% neq 0 (
    echo [ERROR] Failed to create scheduled task.
    pause
    exit /b 1
)

echo [OK] Task "%TASK_NAME%" created successfully.

echo [INFO] Starting task now...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-ScheduledTask -TaskName '%TASK_NAME%'"

echo [OK] Done.
pause