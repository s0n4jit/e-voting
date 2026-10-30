# ==============================================================================
# start.ps1 — Windows Testing Lab Launcher for Campus E-Voting System (CEVS)
# Powershell script to boot isolated testing environment on Windows 10/11
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$NoBuild,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

function Write-Step {
    param([string]$Message)
    Write-Host "`n>>> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host " [OK] $Message" -ForegroundColor Green
}

function Write-WarningMsg {
    param([string]$Message)
    Write-Host " [!] $Message" -ForegroundColor Yellow
}

function Write-ErrMsg {
    param([string]$Message)
    Write-Host " [ERROR] $Message" -ForegroundColor Red
}

Write-Host "==============================================================================" -ForegroundColor DarkCyan
Write-Host "     CAMPUS E-VOTING SYSTEM (CEVS) - WINDOWS KIOSK TESTING LAB                " -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "==============================================================================" -ForegroundColor DarkCyan

# ── 1. Check Docker Daemon & Docker Desktop Status ────────────────────────────
Write-Step "Checking Docker Engine status on Windows..."

$dockerRunning = $false
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerRunning = $true
    }
} catch {
    $dockerRunning = $false
}

if (-not $dockerRunning) {
    Write-ErrMsg "Docker Desktop / Docker Engine is not currently running!"
    Write-Host ""
    Write-Host "Guidance for Windows 10/11:" -ForegroundColor Yellow
    Write-Host "  1. Launch 'Docker Desktop' from your Windows Start Menu." -ForegroundColor White
    Write-Host "  2. Wait until the whale icon in your system tray is steady green (Engine running)." -ForegroundColor White
    Write-Host "  3. Ensure Docker is using Linux Containers mode (default)." -ForegroundColor White
    Write-Host "  4. Re-run this script: .\start.ps1" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Success "Docker engine is operational."

# ── 2. Environment Verification ───────────────────────────────────────────────
Write-Step "Loading environment configuration..."
$EnvFile = Join-Path $ScriptDir ".env.test"
if (-not (Test-Path $EnvFile)) {
    Write-ErrMsg ".env.test not found in $ScriptDir"
    exit 1
}
Write-Success "Found configuration: .env.test"

# ── 3. Build & Spin Up Compose Services ───────────────────────────────────────
Write-Step "Starting isolated kiosk-lab containers..."

$composeArgs = @("compose", "-f", "docker-compose.yml", "--env-file", ".env.test", "up", "-d")
if (-not $NoBuild) {
    $composeArgs += "--build"
}

Write-Host "Executing: docker $($composeArgs -join ' ')" -ForegroundColor DarkGray
& docker @composeArgs

if ($LASTEXITCODE -ne 0) {
    Write-ErrMsg "Failed to start Docker Compose services."
    exit $LASTEXITCODE
}

# ── 4. Health Check Polling ───────────────────────────────────────────────────
Write-Step "Waiting for isolated database & backend health checks..."

$maxWaitSec = 60
$elapsed = 0
$backendReady = $false

while ($elapsed -lt $maxWaitSec) {
    Start-Sleep -Seconds 2
    $elapsed += 2

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:5001/api/health" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.status -eq "healthy") {
            $backendReady = $true
            break
        }
    } catch {
        Write-Host -NoNewline "." -ForegroundColor DarkGray
    }
}
Write-Host ""

if (-not $backendReady) {
    Write-WarningMsg "Backend health check timed out at http://localhost:5001/api/health."
    Write-WarningMsg "Showing recent logs from kiosk_test_backend:"
    docker logs --tail 30 kiosk_test_backend
} else {
    Write-Success "Isolated PostgreSQL and Flask backend are healthy!"
}

# ── 5. Formatted Environment Dashboard & Information Table ────────────────────
Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "           KIOSK LAB ENVIRONMENT READY & OPERATIONAL                          " -ForegroundColor Black -BackgroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""

$services = @(
    [PSCustomObject]@{ Service = "Kiosk Web App (Touch Booth)"; URL = "http://localhost:3001/kiosk"; Description = "Direct Voter Kiosk Interface" },
    [PSCustomObject]@{ Service = "Linux noVNC Kiosk Simulator"; URL = "http://localhost:8080"; Description = "Containerized Linux Kiosk in Real-time" },
    [PSCustomObject]@{ Service = "Polling Desk Terminal"; URL = "http://localhost:3001/desk"; Description = "Desk Officer Student Verification & PINs" },
    [PSCustomObject]@{ Service = "Chief Election Admin Portal"; URL = "http://localhost:3001/login"; Description = "Election, Candidates & Kiosk Registry" },
    [PSCustomObject]@{ Service = "Network Failure Simulator"; URL = "http://localhost:8090/status"; Description = "Latency, Disconnect & Chaos Ingestion" },
    [PSCustomObject]@{ Service = "Isolated Test Database"; URL = "localhost:5433 (evoting_test_db)"; Description = "100% Isolated from dev/production DB" }
)

$services | Format-Table -AutoSize | Out-String | Write-Host -ForegroundColor Cyan

Write-Host "STAFF MAINTENANCE CONTROLS:" -ForegroundColor Yellow
Write-Host "  * Shortcut (Inside Kiosk): " -NoNewline -ForegroundColor White
Write-Host "Ctrl + Alt + Shift + M" -ForegroundColor Magenta
Write-Host "  * Close / Lock Shortcut:   " -NoNewline -ForegroundColor White
Write-Host "Ctrl + Alt + Shift + L" -ForegroundColor Magenta
Write-Host "  * Staff Security PIN:      " -NoNewline -ForegroundColor White
Write-Host "948201" -ForegroundColor Green
Write-Host ""

Write-Host "TEST CREDENTIALS:" -ForegroundColor Yellow
Write-Host "  - Chief Election Officer:  ADMIN001 / Admin@1234 (TOTP OTP: 123456)" -ForegroundColor White
Write-Host "  - Polling Desk Officer 1:  DESK001  / Desk@1234  (TOTP OTP: 123456)" -ForegroundColor White
Write-Host "  - Polling Desk Officer 2:  DESK002  / Desk@1234  (TOTP OTP: 123456)" -ForegroundColor White
Write-Host "  - Sample Enrolled Voters:  STU001 to STU020 / Student@1234" -ForegroundColor White
Write-Host ""

Write-Host "MANAGEMENT COMMANDS:" -ForegroundColor Yellow
Write-Host "  * Reset Database to clean seeds:  .\reset.ps1" -ForegroundColor White
Write-Host "  * Simulate network disconnect:    .\simulate-network.ps1 -Action disconnect" -ForegroundColor White
Write-Host "  * Restore network connectivity:   .\simulate-network.ps1 -Action restore" -ForegroundColor White
Write-Host "  * Run automated Playwright tests: npm test" -ForegroundColor White
Write-Host "  * Stop & tear down kiosk lab:     .\stop.ps1" -ForegroundColor White
Write-Host ""

if ($OpenBrowser) {
    Write-Step "Opening Kiosk and noVNC Linux simulator in default Windows browser..."
    Start-Process "http://localhost:3001/kiosk"
    Start-Process "http://localhost:8080"
}
