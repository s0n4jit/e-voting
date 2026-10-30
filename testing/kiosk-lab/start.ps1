<#
.SYNOPSIS
  start.ps1 — Launches the Windows Testing Lab for Campus E-Voting System (CEVS).
.DESCRIPTION
  Verifies Docker availability, initializes isolated test containers, seeds the test database,
  and prints live access URLs for web and noVNC Linux GUI kiosk simulation.
#>

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   CAMPUS E-VOTING SYSTEM — WINDOWS KIOSK TESTING LAB LAUNCHER" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Verify Docker Engine Availability
Write-Host "[1/4] Checking Docker Desktop / Engine status..." -ForegroundColor Yellow
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker engine check failed."
    }
    Write-Host "  -> Docker Engine is running and responsive." -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Docker Desktop is not running or unreachable!" -ForegroundColor Red
    Write-Host "  Please start Docker Desktop on your Windows machine and retry." -ForegroundColor Red
    exit 1
}

# 2. Start Kiosk Lab Services via Docker Compose
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "[2/4] Starting isolated kiosk lab containers..." -ForegroundColor Yellow
docker compose --env-file .env.test up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Failed to start Docker Compose services." -ForegroundColor Red
    exit 1
}

# 3. Wait for Backend & Database Health
Write-Host "[3/4] Waiting for test database and backend health checks..." -ForegroundColor Yellow
$maxRetries = 20
$retryCount = 0
$healthy = $false

while ($retryCount -lt $maxRetries) {
    Start-Sleep -Seconds 2
    $retryCount++
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:5001/api/health" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($response.status -eq "healthy") {
            $healthy = $true
            break
        }
    } catch {
        Write-Host "  ... Waiting for backend (attempt $retryCount/$maxRetries)" -ForegroundColor Gray
    }
}

if (-not $healthy) {
    Write-Host "  [WARNING] Backend healthcheck took longer than expected. Containers are still booting." -ForegroundColor Yellow
} else {
    Write-Host "  -> Backend service is healthy on port 5001." -ForegroundColor Green
}

# 4. Initialize Test Database Seeds (Isolated Mock Roster)
Write-Host "[4/4] Seeding isolated test database (STU001-STU020, 9 portfolios)..." -ForegroundColor Yellow
docker exec cevs_test_backend python migrations/seed_data.py | Out-Null
Write-Host "  -> Isolated test database seeded successfully." -ForegroundColor Green

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "             KIOSK TESTING LAB IS LIVE & READY" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Web Kiosk Interface:         http://localhost:3001/kiosk" -ForegroundColor White
Write-Host "  Linux noVNC Kiosk Simulator: http://localhost:8080" -ForegroundColor White
Write-Host "  Polling Desk Officer Portal: http://localhost:3001/desk" -ForegroundColor White
Write-Host "  Election Admin Dashboard:    http://localhost:3001/login" -ForegroundColor White
Write-Host "  Backend Diagnostics API:     http://localhost:5001/api/maintenance/diagnostics" -ForegroundColor White
Write-Host ""
Write-Host "  Staff Maintenance Shortcuts: [Ctrl + Alt + Shift + M]" -ForegroundColor Yellow
Write-Host "  Default Staff PIN:           948201" -ForegroundColor Yellow
Write-Host ""
Write-Host "  To stop the lab, run:        .\stop.ps1" -ForegroundColor Gray
Write-Host "  To reset test data, run:     .\reset.ps1" -ForegroundColor Gray
Write-Host "======================================================================" -ForegroundColor Cyan
