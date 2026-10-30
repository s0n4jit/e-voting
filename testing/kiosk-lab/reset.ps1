<#
.SYNOPSIS
  reset.ps1 — Cleans and resets the isolated test database to clean seed state.
  GUARANTEE: Never touches production database or production volumes.
#>

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Resetting isolated test database..." -ForegroundColor Yellow
try {
    docker exec cevs_test_backend python migrations/seed_data.py
    Write-Host "Test database reset to initial seed state successfully." -ForegroundColor Green
} catch {
    Write-Host "Could not reset test database. Ensure lab is running via .\start.ps1" -ForegroundColor Red
}
