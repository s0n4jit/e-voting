# ==============================================================================
# simulate-network.ps1 — Network Chaos & Resilience Simulation Controller
# Simulates disconnects, latency, and DNS failures on Windows Kiosk Lab
# ==============================================================================

[CmdletBinding()]
param(
    [ValidateSet("status", "disconnect", "restore", "latency", "dns-failure")]
    [string]$Action = "status",

    [int]$DelayMs = 1500
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$SimUrl = "http://localhost:8090"

function Write-Step {
    param([string]$Message)
    Write-Host "`n>>> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host " [OK] $Message" -ForegroundColor Green
}

function Write-ErrMsg {
    param([string]$Message)
    Write-Host " [ERROR] $Message" -ForegroundColor Red
}

switch ($Action.ToLower()) {
    "status" {
        Write-Step "Querying Kiosk Network Simulator status at $SimUrl..."
        try {
            $res = Invoke-RestMethod -Uri "$SimUrl/status" -Method Get -TimeoutSec 3
            Write-Host "Current Network Simulation Status:" -ForegroundColor Yellow
            $res | Format-List | Out-String | Write-Host -ForegroundColor White
        } catch {
            Write-ErrMsg "Failed to contact Network Simulator at $SimUrl. Ensure kiosk-lab is running (.\start.ps1)."
            exit 1
        }
    }

    "disconnect" {
        Write-Step "Injecting network disconnection & gateway outage..."
        try {
            $res = Invoke-RestMethod -Uri "$SimUrl/simulate/disconnect" -Method Post -TimeoutSec 3
            Write-Success $res.message
            Write-Host "  * Kiosk UI will detect offline state via heartbeat failure." -ForegroundColor White
            Write-Host "  * An offline overlay with 'Ballot Integrity Protected' should appear." -ForegroundColor Yellow
        } catch {
            Write-ErrMsg "Network simulator request failed: $_"
        }

        # Also optionally disconnect container network if requested
        Write-Host "Note: For complete Docker container network disconnection, use:" -ForegroundColor DarkGray
        Write-Host "  docker network disconnect kiosk_lab_net kiosk_test_frontend" -ForegroundColor DarkGray
    }

    "latency" {
        Write-Step "Injecting artificial latency of ${DelayMs}ms..."
        try {
            $body = @{ delay_ms = $DelayMs } | ConvertTo-Json
            $res = Invoke-RestMethod -Uri "$SimUrl/simulate/latency" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 3
            Write-Success $res.message
            Write-Host "  * Responses will be delayed by ${DelayMs}ms." -ForegroundColor White
        } catch {
            Write-ErrMsg "Network simulator request failed: $_"
        }
    }

    "dns-failure" {
        Write-Step "Simulating campus DNS resolution failure..."
        try {
            $res = Invoke-RestMethod -Uri "$SimUrl/simulate/dns-failure" -Method Post -TimeoutSec 3
            Write-Success $res.message
            Write-Host "  * Host resolution fails, simulating unreachable API domain." -ForegroundColor White
        } catch {
            Write-ErrMsg "Network simulator request failed: $_"
        }
    }

    "restore" {
        Write-Step "Restoring network to nominal healthy condition..."
        try {
            $res = Invoke-RestMethod -Uri "$SimUrl/simulate/restore" -Method Post -TimeoutSec 3
            Write-Success $res.message
            Write-Host "  * Kiosk overlay will automatically dismiss and restore voting flow." -ForegroundColor Green
        } catch {
            Write-ErrMsg "Network simulator request failed: $_"
        }
    }
}
