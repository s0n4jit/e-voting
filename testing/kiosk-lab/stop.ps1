<#
.SYNOPSIS
  stop.ps1 — Safely halts the Windows Testing Lab containers.
#>

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Stopping Campus E-Voting Windows Testing Lab..." -ForegroundColor Yellow
docker compose --env-file .env.test down

Write-Host "Kiosk testing lab containers safely stopped." -ForegroundColor Green
