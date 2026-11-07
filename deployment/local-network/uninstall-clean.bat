@echo off
:: ==============================================================================
:: Campus E-Voting - 1-Click Complete Teardown & Reversal Script
:: ==============================================================================
:: Run this after the election is over to restore your Windows laptop to normal.
:: 1. Stops and removes the background mDNS responder.
:: 2. Deletes the incoming Windows Defender Firewall rules.
:: 3. Removes the Caddy Root CA from your Windows Trusted Root store.
:: 4. Stops and cleans up the Caddy container.
:: ==============================================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo.
echo =================================================================
echo  Campus E-Voting - Post-Election Local Network Cleanup
echo =================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-host.ps1"

echo.
echo Clean-up completed. Your Windows laptop networking is back to normal.
pause
