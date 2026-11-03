@echo off
setlocal enabledelayedexpansion
title Campus E-Voting Booth - Uninstaller

echo ========================================================
echo       Campus E-Voting Booth - Uninstaller
echo ========================================================
echo.

:: 1. Terminate running instances
echo Terminating running Campus E-Voting Booth processes...
taskkill /F /IM "Campus E-Voting Booth.exe" >nul 2>&1
taskkill /F /IM "evote-booth.exe" >nul 2>&1
timeout /t 1 /nobreak >nul

set "PROG_DIR=%LOCALAPPDATA%\Programs\evote-booth"
set "DATA_DIR=%APPDATA%\Campus E-Voting Booth"
set "UNINSTALL_EXE=%PROG_DIR%\Uninstall Campus E-Voting Booth.exe"

:: 2. Run official NSIS uninstaller if available
if exist "%UNINSTALL_EXE%" (
    echo Running official uninstaller...
    start /wait "" "%UNINSTALL_EXE%" /S
    timeout /t 2 /nobreak >nul
)

:: 3. Clean up program files if remaining
if exist "%PROG_DIR%" (
    echo Removing program files from %PROG_DIR%...
    rd /s /q "%PROG_DIR%" >nul 2>&1
)

:: 4. Remove shortcuts
echo Removing shortcuts...
del /f /q "%USERPROFILE%\Desktop\Campus E-Voting Booth.lnk" >nul 2>&1
del /f /q "%PUBLIC%\Desktop\Campus E-Voting Booth.lnk" >nul 2>&1
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Campus E-Voting Booth.lnk" >nul 2>&1

:: 5. Remove autostart registry entry
echo Removing autostart entries...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Campus E-Voting Booth" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "evote-booth" /f >nul 2>&1

:: 6. Prompt to keep or delete data & receipts
echo.
if exist "%DATA_DIR%" (
    echo Voting receipts and configuration are located at:
    echo   %DATA_DIR%
    echo.
    set /p "DEL_DATA=Do you also want to remove receipts and configuration? [y/N]: "
    if /i "!DEL_DATA!"=="y" (
        echo Removing configuration and receipts...
        rd /s /q "%DATA_DIR%" >nul 2>&1
        echo Data removed.
    ) else (
        echo Keeping receipts and configuration for audit records.
    )
)

echo.
echo ========================================================
echo Campus E-Voting Booth has been successfully uninstalled.
echo ========================================================
pause
