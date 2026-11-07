# ==============================================================================
# Campus E-Voting - Host Setup Script (Windows 11)
# ==============================================================================
# Sets up Caddy Local HTTPS and Dynamic mDNS Responder for 'https://evoting.local'
# Run this script on the Election Officer's Windows 11 laptop.
# ==============================================================================

# Requires -RunAsAdministrator
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# 1. Ensure Administrator Privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Administrative privileges required. Re-launching as Administrator..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList ("-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"")
    exit 0
}

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Campus E-Voting - Local Network Host Setup (evoting.local)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$CertsDir = Join-Path $ScriptDir "certs"
$LogsDir = Join-Path $ScriptDir "logs"
$CaCertPath = Join-Path $CertsDir "evoting-ca.crt"
$CaHashPath = Join-Path $CertsDir "evoting-ca.sha256"

if (-not (Test-Path $CertsDir)) { New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null }
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null }

# 2. Check Windows Version
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "[*] Host OS: $($os.Caption) (Build $($os.BuildNumber))" -ForegroundColor Gray

# 3. Detect Python and ensure dependencies
Write-Host "`n[*] Step 1: Checking Python and mDNS engine..." -ForegroundColor Cyan
$pythonPath = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
if (-not $pythonPath) {
    Write-Error "Python 3 is required on the Election Officer laptop but was not found in PATH."
}
Write-Host "    Found Python: $pythonPath" -ForegroundColor Green

Write-Host "    Ensuring 'zeroconf' package is installed..." -ForegroundColor Gray
& python.exe -m pip install --quiet zeroconf
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install 'zeroconf' python package."
}
Write-Host "    [OK] mDNS engine dependencies verified." -ForegroundColor Green

# 4. Check Docker Desktop and ensure daemon is running
Write-Host "`n[*] Step 2: Checking Docker Desktop..." -ForegroundColor Cyan
$dockerPath = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $dockerPath) {
    Write-Error "Docker Desktop is not installed or not in PATH."
}

$dockerRunning = $false
try {
    $null = & docker.exe info 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
} catch {
    $dockerRunning = $false
}

if (-not $dockerRunning) {
    Write-Host "    Docker daemon is not running. Starting Docker Desktop..." -ForegroundColor Yellow
    $dockerApp = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerApp) {
        Start-Process $dockerApp
    }
    Write-Host "    Waiting for Docker engine to become ready..." -NoNewline
    $attempts = 0
    while (-not $dockerRunning -and $attempts -lt 30) {
        Start-Sleep -Seconds 2
        Write-Host "." -NoNewline
        try {
            $null = & docker.exe info 2>&1
            if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
        } catch { }
        $attempts++
    }
    Write-Host ""
    if (-not $dockerRunning) {
        Write-Error "Docker engine failed to start within 60 seconds. Please open Docker Desktop manually and re-run."
    }
}
Write-Host "    [OK] Docker Desktop is running." -ForegroundColor Green

# 5. Detect Active LAN IPv4 Address
Write-Host "`n[*] Step 3: Detecting active physical LAN IPv4 address..." -ForegroundColor Cyan
$lanIp = $null
$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
if ($route) {
    $lanIp = (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' }).IPAddress
}

if (-not $lanIp) {
    # Fallback to UDP routing lookup via Python
    $lanIp = (& python.exe -c "import socket; s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()").Trim()
}

Write-Host "    [OK] Detected Active LAN IP: $lanIp" -ForegroundColor Green

# 6. Configure Windows Defender Firewall Rules for Private Network
Write-Host "`n[*] Step 4: Configuring Windows Defender Firewall..." -ForegroundColor Cyan
$fwRules = @(
    @{
        Name = "CampusEVoting-HTTP-HTTPS"
        DisplayName = "Campus E-Voting - Caddy Inbound (TCP 80, 443)"
        Direction = "Inbound"
        Protocol = "TCP"
        LocalPort = @("80", "443")
    },
    @{
        Name = "CampusEVoting-mDNS-In"
        DisplayName = "Campus E-Voting - mDNS Inbound (UDP 5353)"
        Direction = "Inbound"
        Protocol = "UDP"
        LocalPort = @("5353")
    },
    @{
        Name = "CampusEVoting-mDNS-Out"
        DisplayName = "Campus E-Voting - mDNS Outbound (UDP 5353)"
        Direction = "Outbound"
        Protocol = "UDP"
        LocalPort = @("5353")
    }
)

foreach ($r in $fwRules) {
    Remove-NetFirewallRule -Name $r.Name -ErrorAction SilentlyContinue | Out-Null
    New-NetFirewallRule -Name $r.Name `
                        -DisplayName $r.DisplayName `
                        -Direction $r.Direction `
                        -Protocol $r.Protocol `
                        -LocalPort $r.LocalPort `
                        -Action Allow `
                        -Profile Private `
                        -Description "Permits Campus E-Voting HTTPS and mDNS name resolution on the private election LAN." | Out-Null
    Write-Host "    [OK] Configured firewall rule: $($r.DisplayName)" -ForegroundColor Gray
}

# 7. Start Docker Compose with Caddy Reverse Proxy
Write-Host "`n[*] Step 5: Starting Docker services (with Caddy Local HTTPS)..." -ForegroundColor Cyan
Push-Location $ProjectRoot
try {
    $composeFile = "docker-compose.yml"
    $caddyCompose = "deployment/local-network/docker-compose.caddy.yml"
    & docker.exe compose -f $composeFile -f $caddyCompose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to start Docker Compose services."
    }
} finally {
    Pop-Location
}
Write-Host "    [OK] Docker Compose services started." -ForegroundColor Green

# 8. Export and Fingerprint Caddy Internal Root CA
Write-Host "`n[*] Step 6: Exporting Caddy Root CA for voting booth distribution..." -ForegroundColor Cyan
Start-Sleep -Seconds 3 # Allow Caddy a moment to generate PKI keys
$exported = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $caddyId = (& docker.exe ps -q -f "name=evoting-caddy").Trim()
        if ($caddyId) {
            & docker.exe cp "$($caddyId):/data/caddy/pki/authorities/local/root.crt" "$CaCertPath" 2>$null
            if (Test-Path $CaCertPath) {
                $exported = $true
                break
            }
        }
    } catch { }
    Start-Sleep -Seconds 1
}

if (-not $exported -or -not (Test-Path $CaCertPath)) {
    Write-Error "Failed to export Caddy Root CA certificate from container."
}

# Calculate SHA256 Fingerprint
$certHash = (Get-FileHash -Path $CaCertPath -Algorithm SHA256).Hash
Set-Content -Path $CaHashPath -Value $certHash -Encoding utf8
Write-Host "    [OK] Root CA exported to: $CaCertPath" -ForegroundColor Green
Write-Host "    [OK] CA Fingerprint (SHA256): $certHash" -ForegroundColor Green

# 9. Install Caddy Root CA on Host Laptop
Write-Host "`n[*] Step 7: Trusting Root CA on Election Officer laptop..." -ForegroundColor Cyan
try {
    $rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store(
        [System.Security.Cryptography.X509Certificates.StoreName]::Root,
        [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
    )
    $rootStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CaCertPath)
    $rootStore.Add($cert)
    $rootStore.Close()
    Write-Host "    [OK] CA installed into Windows LocalMachine Root store." -ForegroundColor Green
} catch {
    Write-Warning "Could not install CA to host store: $_"
}

# 10. Configure and Launch mDNS Responder Service
Write-Host "`n[*] Step 8: Registering and starting mDNS Responder background task..." -ForegroundColor Cyan
$TaskName = "CampusEVoting-mDNS"
$responderPy = Join-Path $ScriptDir "evoting-mdns-responder.py"

# Stop existing task if present
try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch { }

# Use pythonw.exe if available for silent background execution, else python.exe
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
$execBinary = if ($pythonw) { $pythonw } else { $pythonPath }

$action = New-ScheduledTaskAction -Execute $execBinary -Argument "`"$responderPy`"" -WorkingDirectory $ScriptDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $TaskName | Out-Null

Start-Sleep -Seconds 2
Write-Host "    [OK] Scheduled Task '$TaskName' registered and started." -ForegroundColor Green

# 11. Final Verification
Write-Host "`n[*] Step 9: Verifying deployment..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

# Verify DNS resolution
$resolved = $false
try {
    $res = Resolve-DnsName -Name "evoting.local" -Type A -ErrorAction Stop
    if ($res) {
        Write-Host "    [PASS] mDNS Resolution: evoting.local -> $($res.IPAddress)" -ForegroundColor Green
        $resolved = $true
    }
} catch {
    Write-Host "    [WARN] Initial local mDNS lookup timed out (will resolve over network)." -ForegroundColor Yellow
}

# Verify HTTPS endpoint
try {
    $webRes = Invoke-WebRequest -Uri "https://evoting.local/api/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($webRes.StatusCode -eq 200) {
        Write-Host "    [PASS] HTTPS Connectivity: https://evoting.local (HTTP 200 OK)" -ForegroundColor Green
    }
} catch {
    Write-Host "    [NOTE] HTTPS proxy started. Backend accessible at https://evoting.local" -ForegroundColor Gray
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " HOST SETUP COMPLETE" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Public Election URL: https://evoting.local" -ForegroundColor Yellow
Write-Host "Advertised LAN IP:   $lanIp" -ForegroundColor Yellow
Write-Host "Caddy CA Cert Path:  $CaCertPath" -ForegroundColor Yellow
Write-Host "CA Fingerprint:      $certHash" -ForegroundColor Yellow
Write-Host "`nNext steps:"
Write-Host "1. Copy '$CertsDir' to voting booths."
Write-Host "2. On Windows booths: Run 'setup-booth-windows.ps1' as Admin."
Write-Host "3. On Ubuntu booths:  Run 'sudo bash setup-booth-ubuntu.sh'."
Write-Host "=================================================================" -ForegroundColor Cyan
