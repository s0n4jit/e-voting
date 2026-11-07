# ==============================================================================
# Campus E-Voting - Host Uninstall Script (Windows 11)
# ==============================================================================
# Cleanly reverses only the local network mDNS, Caddy, and firewall changes
# made by setup-host.ps1, leaving core application data and containers safe.
# ==============================================================================

# Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [switch]$RemoveCerts
)

$ErrorActionPreference = "Continue"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Administrative privileges required. Re-launching as Administrator..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList ("-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"")
    exit 0
}

Clear-Host
Write-Host "=================================================================" -ForegroundColor Yellow
Write-Host " Campus E-Voting - Reversing Local Network Host Setup" -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Yellow

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path

# 1. Stop and remove scheduled task
Write-Host "`n[*] Step 1: Stopping mDNS responder service..." -ForegroundColor Cyan
$TaskName = "CampusEVoting-mDNS"
try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Write-Host "    [OK] Removed scheduled task '$TaskName'." -ForegroundColor Green
} catch {
    Write-Host "    [OK] Scheduled task not registered." -ForegroundColor Gray
}

# Kill any running python instance of responder
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*evoting-mdns-responder.py*" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "    [OK] Stopped running mDNS process ($($_.ProcessId))." -ForegroundColor Gray
}

# 2. Remove Windows Firewall Rules
Write-Host "`n[*] Step 2: Removing Windows Defender Firewall rules..." -ForegroundColor Cyan
$rules = @("CampusEVoting-HTTP-HTTPS", "CampusEVoting-mDNS-In", "CampusEVoting-mDNS-Out")
foreach ($r in $rules) {
    Remove-NetFirewallRule -Name $r -ErrorAction SilentlyContinue | Out-Null
    Write-Host "    [OK] Removed firewall rule: $r" -ForegroundColor Gray
}

# 3. Stop Caddy Container
Write-Host "`n[*] Step 3: Stopping Caddy reverse proxy..." -ForegroundColor Cyan
Push-Location $ProjectRoot
try {
    $composeFile = "docker-compose.yml"
    $caddyCompose = "deployment/local-network/docker-compose.caddy.yml"
    & docker.exe compose -f $composeFile -f $caddyCompose stop caddy 2>$null
    & docker.exe compose -f $composeFile -f $caddyCompose rm -f caddy 2>$null
    Write-Host "    [OK] Caddy container stopped and removed." -ForegroundColor Green
} catch {
    Write-Warning "Failed to stop Caddy container via Docker Compose: $_"
} finally {
    Pop-Location
}

# 4. Remove Trusted Root CA from Host Store if requested
Write-Host "`n[*] Step 4: Cleaning up local root certificate store..." -ForegroundColor Cyan
try {
    $rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store(
        [System.Security.Cryptography.X509Certificates.StoreName]::Root,
        [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
    )
    $rootStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $certs = $rootStore.Certificates | Where-Object { $_.Subject -like "*Caddy Local Authority*" -or $_.Subject -like "*evoting.local*" }
    foreach ($c in $certs) {
        $rootStore.Remove($c)
        Write-Host "    [OK] Removed certificate '$($c.Subject)' ($($c.Thumbprint))." -ForegroundColor Gray
    }
    $rootStore.Close()
} catch {
    Write-Warning "Could not clean up host certificate store: $_"
}

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host " UNINSTALL COMPLETE" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "mDNS responder, Caddy reverse proxy, and firewall rules removed."
Write-Host "Core application database and containers remain untouched."
Write-Host "=================================================================" -ForegroundColor Green
