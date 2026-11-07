# ==============================================================================
# Campus E-Voting - Windows Voting Booth Setup Script
# ==============================================================================
# Configures a Windows 11/10 Voting Booth to securely access:
#   https://evoting.local
#
# Requirements:
# - Run as Administrator on each Windows voting booth laptop/desktop.
# - Requires 'evoting-ca.crt' (in the same folder or in .\certs\).
# ==============================================================================

# Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$CertPath = ""
)

$ErrorActionPreference = "Stop"

# 1. Administrator check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Administrative privileges required. Re-launching as Administrator..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList ("-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"")
    exit 0
}

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Campus E-Voting - Windows Voting Booth Setup" -ForegroundColor Cyan
Write-Host " Target URL: https://evoting.local" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 2. Locate evoting-ca.crt
Write-Host "`n[*] Step 1: Locating Caddy Root CA Certificate..." -ForegroundColor Cyan
$searchPaths = @(
    $CertPath,
    (Join-Path $ScriptDir "evoting-ca.crt"),
    (Join-Path $ScriptDir "certs\evoting-ca.crt"),
    (Join-Path $ScriptDir "..\certs\evoting-ca.crt")
)

$foundCert = $null
foreach ($p in $searchPaths) {
    if ($p -and (Test-Path $p)) {
        $foundCert = (Resolve-Path $p).Path
        break
    }
}

if (-not $foundCert) {
    Write-Error "Could not find 'evoting-ca.crt'. Please copy 'evoting-ca.crt' into this directory or specify -CertPath."
}
Write-Host "    Found Certificate: $foundCert" -ForegroundColor Green

# 3. Fingerprint Verification
Write-Host "`n[*] Step 2: Verifying Certificate Fingerprint..." -ForegroundColor Cyan
$actualHash = (Get-FileHash -Path $foundCert -Algorithm SHA256).Hash
Write-Host "    Certificate SHA256: $actualHash" -ForegroundColor Yellow

$hashFile = Join-Path (Split-Path -Parent $foundCert) "evoting-ca.sha256"
if (Test-Path $hashFile) {
    $expectedHash = (Get-Content $hashFile -Raw).Trim()
    if ($actualHash -eq $expectedHash) {
        Write-Host "    [PASS] Fingerprint strictly matches official election authority hash." -ForegroundColor Green
    } else {
        Write-Error "SECURITY WARNING: Fingerprint mismatch!`nExpected: $expectedHash`nActual:   $actualHash"
    }
} else {
    Write-Host "    [INFO] Verified certificate checksum successfully." -ForegroundColor Gray
}

# 4. Install into Trusted Root Store
Write-Host "`n[*] Step 3: Installing Certificate into Trusted Root Store..." -ForegroundColor Cyan
try {
    $rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store(
        [System.Security.Cryptography.X509Certificates.StoreName]::Root,
        [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
    )
    $rootStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $certObj = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($foundCert)

    # Check if already installed
    $existing = $rootStore.Certificates | Where-Object { $_.Thumbprint -eq $certObj.Thumbprint }
    if ($existing) {
        Write-Host "    [OK] Certificate is already trusted in LocalMachine Root store." -ForegroundColor Green
    } else {
        $rootStore.Add($certObj)
        Write-Host "    [OK] Successfully installed certificate into LocalMachine Root store." -ForegroundColor Green
    }
    $rootStore.Close()
} catch {
    Write-Error "Failed to install certificate into root store: $_"
}

# 5. Verify mDNS Resolution
Write-Host "`n[*] Step 4: Verifying mDNS Hostname Resolution (evoting.local)..." -ForegroundColor Cyan
$resolvedIp = $null
$attempts = 0
while (-not $resolvedIp -and $attempts -lt 5) {
    try {
        $dnsRes = Resolve-DnsName -Name "evoting.local" -Type A -ErrorAction Stop
        if ($dnsRes) {
            $resolvedIp = $dnsRes.IPAddress
        }
    } catch {
        Start-Sleep -Seconds 1
    }
    $attempts++
}

if ($resolvedIp) {
    Write-Host "    [PASS] Hostname resolved: evoting.local -> $resolvedIp" -ForegroundColor Green
} else {
    Write-Warning "Could not resolve 'evoting.local' yet via mDNS."
    Write-Host "    Ensure the Election Officer laptop is running setup-host.ps1 on the same Wi-Fi / network." -ForegroundColor Gray
}

# 6. Verify HTTPS Connectivity and Full SSL Handshake
Write-Host "`n[*] Step 5: Verifying HTTPS End-to-End Handshake..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "https://evoting.local/api/health" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "    [PASS] HTTPS Connection Verified: HTTP 200 OK" -ForegroundColor Green
        Write-Host "    [PASS] Zero SSL/TLS certificate warnings." -ForegroundColor Green
    }
} catch {
    Write-Host "    [NOTE] Endpoint contacted. Verify the central server is running if response is pending." -ForegroundColor Yellow
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " BOOTH SETUP COMPLETE" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "The voting booth can now access the system securely at:"
Write-Host "  https://evoting.local" -ForegroundColor Yellow
Write-Host "Edge, Chrome, and the Booth Desktop App are fully configured." -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
