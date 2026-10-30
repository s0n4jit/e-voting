# ==============================================================================
# stop.ps1 — Windows Testing Lab Teardown for Campus E-Voting System (CEVS)
# Safely tears down containers and cleans temporary test volumes
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$KeepVolumes
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

Write-Host "==============================================================================" -ForegroundColor DarkYellow
Write-Host "     STOPPING CAMPUS E-VOTING SYSTEM (CEVS) KIOSK TESTING LAB                 " -ForegroundColor White -BackgroundColor DarkRed
Write-Host "==============================================================================" -ForegroundColor DarkYellow

$downArgs = @("compose", "-f", "docker-compose.yml", "--env-file", ".env.test", "down")

if (-not $KeepVolumes) {
    $downArgs += "-v"
    Write-Step "Tearing down lab containers and removing temporary test volumes (clean reset)..."
} else {
    Write-Step "Tearing down lab containers while preserving test volumes..."
}

& docker @downArgs

if ($LASTEXITCODE -eq 0) {
    Write-Success "All kiosk-lab containers and networks safely stopped and removed."
} else {
    Write-Host "Docker compose returned exit code $LASTEXITCODE" -ForegroundColor Yellow
}
