# ==============================================================================
# reset.ps1 — Database State Reset Script for Windows Kiosk Lab
# Resets the test database to clean seed state without affecting production data
# ==============================================================================

[CmdletBinding()]
param()

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

function Write-ErrMsg {
    param([string]$Message)
    Write-Host " [ERROR] $Message" -ForegroundColor Red
}

Write-Host "==============================================================================" -ForegroundColor DarkGreen
Write-Host "     RESETTING KIOSK TESTING LAB DATABASE TO FRESH SEED STATE                 " -ForegroundColor White -BackgroundColor DarkGreen
Write-Host "==============================================================================" -ForegroundColor DarkGreen

Write-Step "Checking if kiosk_test_backend container is running..."
$backendStatus = docker inspect -f '{{.State.Status}}' kiosk_test_backend 2>$null

if ($backendStatus -ne "running") {
    Write-ErrMsg "kiosk_test_backend is not running. Please start the lab first using .\start.ps1"
    exit 1
}

Write-Step "Executing test database purge & re-seeding..."

# Execute cleanup and seed within backend container
$cleanupPy = @"
from app import create_app
from app.extensions import db
from app.models.ballot_entry import BallotEntry
from app.models.voting_token import VotingToken
from app.models.voter_record import VoterRecord

app = create_app()
with app.app_context():
    print('  - Clearing test ballots and voting tokens...')
    BallotEntry.query.delete()
    VotingToken.query.delete()
    # Reset voted flag for all voters
    for vr in VoterRecord.query.all():
        vr.has_voted = False
    db.session.commit()
    print('  - Reset voter statuses to unvoted.')
"@

docker compose -f docker-compose.yml --env-file .env.test exec -T kiosk_test_backend python -c "$cleanupPy"

Write-Step "Re-running campus election seed script..."
docker compose -f docker-compose.yml --env-file .env.test exec -T kiosk_test_backend python migrations/seed_data.py

if ($LASTEXITCODE -eq 0) {
    Write-Success "Test database (evoting_test_db) has been reset to clean pristine state!"
    Write-Host "  * 9 Portfolios refreshed" -ForegroundColor White
    Write-Host "  * Voters STU001 to STU020 restored to 'Not Voted'" -ForegroundColor White
    Write-Host "  * Single-use PIN slips invalidated and cleared" -ForegroundColor White
    Write-Host "  * Production / local dev databases completely untouched" -ForegroundColor Green
} else {
    Write-ErrMsg "Reset script encountered an error."
    exit $LASTEXITCODE
}
