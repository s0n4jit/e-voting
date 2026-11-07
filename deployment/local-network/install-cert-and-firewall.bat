@echo off
:: ==============================================================================
:: Campus E-Voting - Quick 1-Click Firewall & Certificate Installer
:: ==============================================================================
:: Right-click and "Run as administrator", or double-click to accept UAC prompt.
:: 1. Opens Windows Firewall for ports 80, 443, and 5353.
:: 2. Installs Caddy Local CA into Trusted Root Certification Authorities.
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
echo  Campus E-Voting - Firewall and SSL Certificate Configuration
echo =================================================================
echo.

echo [*] Step 1: Opening Windows Defender Firewall for election LAN (ports 80, 443, 5353)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-NetFirewallRule -Name 'CampusEVoting-HTTP-HTTPS' -ErrorAction SilentlyContinue | Out-Null; New-NetFirewallRule -Name 'CampusEVoting-HTTP-HTTPS' -DisplayName 'Campus E-Voting - Caddy Inbound (TCP 80, 443)' -Direction Inbound -Protocol TCP -LocalPort @('80', '443') -Action Allow -Profile Private | Out-Null; Remove-NetFirewallRule -Name 'CampusEVoting-mDNS-In' -ErrorAction SilentlyContinue | Out-Null; New-NetFirewallRule -Name 'CampusEVoting-mDNS-In' -DisplayName 'Campus E-Voting - mDNS Inbound (UDP 5353)' -Direction Inbound -Protocol UDP -LocalPort @('5353') -Action Allow -Profile Private | Out-Null"
echo     [OK] Windows Defender Firewall rules created for Private network profile.

echo.
echo [*] Step 2: Installing Caddy Root CA into Windows Trusted Root Store...
set CERT_FILE=%~dp0certs\evoting-ca.crt
if exist "%CERT_FILE%" (
    certutil -addstore -f Root "%CERT_FILE%" >nul
    echo     [OK] Certificate 'evoting-ca.crt' installed into Trusted Root Authorities.
) else (
    echo     [WARN] '%CERT_FILE%' not found. Make sure Caddy container is running.
)

echo.
echo =================================================================
echo  SETUP COMPLETE
echo =================================================================
echo  1. On this laptop: Close and re-open your browser, then visit:
echo     https://evoting.local  (will now show Connection is secure)
echo.
echo  2. On mobile phones on the same Wi-Fi:
echo     - iPhone (iOS): https://evoting.local
echo     - Android:      http://192.168.1.2:8080  or  https://evoting.local
echo =================================================================
echo.
pause
