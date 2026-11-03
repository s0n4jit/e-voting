<#
.SYNOPSIS
    Uninstalls Campus E-Voting Booth application from Windows.
.DESCRIPTION
    Stops running processes, unregisters startup tasks/registry keys,
    removes shortcuts, invokes official uninstaller, and optionally removes
    configuration and receipts.
.PARAMETER PurgeData
    If specified, silently removes receipts, mock receipts, and config.json.
#>
[CmdletBinding()]
param(
    [switch]$PurgeData
)

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       Campus E-Voting Booth - PowerShell Uninstaller   " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Stop running processes
Write-Host "[1/5] Stopping running booth processes..." -ForegroundColor Yellow
Get-Process -Name "Campus E-Voting Booth", "evote-booth" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$progDir = Join-Path $env:LOCALAPPDATA "Programs\evote-booth"
$dataDir = Join-Path $env:APPDATA "Campus E-Voting Booth"
$uninstaller = Join-Path $progDir "Uninstall Campus E-Voting Booth.exe"

# 2. Run official NSIS uninstaller if present
if (Test-Path $uninstaller) {
    Write-Host "[2/5] Running official NSIS uninstaller..." -ForegroundColor Yellow
    Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait
    Start-Sleep -Seconds 2
}

# 3. Clean up program folder
if (Test-Path $progDir) {
    Write-Host "[3/5] Cleaning up program folder: $progDir" -ForegroundColor Yellow
    Remove-Item -Path $progDir -Recurse -Force -ErrorAction SilentlyContinue
}

# 4. Remove shortcuts and autostart
Write-Host "[4/5] Removing shortcuts and autostart registry entries..." -ForegroundColor Yellow
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) "Campus E-Voting Booth.lnk"),
    (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) "Campus E-Voting Booth.lnk"),
    (Join-Path ([Environment]::GetFolderPath('Programs')) "Campus E-Voting Booth.lnk")
)
foreach ($sc in $shortcuts) {
    if (Test-Path $sc) {
        Remove-Item -Path $sc -Force -ErrorAction SilentlyContinue
    }
}

Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "Campus E-Voting Booth" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "evote-booth" -ErrorAction SilentlyContinue

# 5. Handle receipt / configuration data
Write-Host "[5/5] Checking audit data and configuration..." -ForegroundColor Yellow
if (Test-Path $dataDir) {
    $deleteData = $PurgeData
    if (-not $deleteData -and [Environment]::UserInteractive) {
        Write-Host ""
        Write-Host "Receipts and configuration are saved at: $dataDir" -ForegroundColor White
        $choice = Read-Host "Do you want to permanently delete all receipts and configuration? (y/N)"
        if ($choice -match '^[Yy]$') {
            $deleteData = $true
        }
    }

    if ($deleteData) {
        Write-Host "Removing $dataDir ..." -ForegroundColor Red
        Remove-Item -Path $dataDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Audit receipts and configuration removed." -ForegroundColor Green
    } else {
        Write-Host "Preserved receipts and configuration at: $dataDir" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Campus E-Voting Booth uninstallation complete." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
