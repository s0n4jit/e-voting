#!/usr/bin/env bash
# Campus E-Voting Booth - Linux Uninstaller
set -e

PURGE_DATA=false
if [[ "$1" == "--purge-data" || "$1" == "-p" ]]; then
  PURGE_DATA=true
fi

echo "========================================================"
echo "       Campus E-Voting Booth - Linux Uninstaller        "
echo "========================================================"
echo ""

# 1. Kill any running process
echo "[1/4] Stopping running booth processes..."
killall -9 "campus-e-voting-booth" 2>/dev/null || true
killall -9 "evote-booth" 2>/dev/null || true

# 2. Remove desktop autostart & icons
echo "[2/4] Removing autostart entries and desktop shortcuts..."
rm -f "$HOME/.config/autostart/evote-booth.desktop"
rm -f "$HOME/.local/share/applications/campus-e-voting-booth.desktop"
rm -f "$HOME/Desktop/campus-e-voting-booth.desktop"

# 3. Remove system binary if installed via dpkg or manual
echo "[3/4] Removing installed binaries..."
if command -v dpkg >/dev/null 2>&1; then
  if dpkg -s campus-e-voting-booth >/dev/null 2>&1; then
    echo "Found deb package. Purging package..."
    sudo dpkg --purge campus-e-voting-booth 2>/dev/null || true
  fi
fi
rm -rf "$HOME/.local/share/campus-e-voting-booth" 2>/dev/null || true
rm -f "$HOME/.local/bin/evote-booth" 2>/dev/null || true

# 4. Handle receipts and configuration
CONFIG_DIR="$HOME/.config/Campus E-Voting Booth"
VAR_RECEIPTS="/var/lib/evote"

echo "[4/4] Checking audit data and receipts..."
if [ -d "$CONFIG_DIR" ] || [ -d "$VAR_RECEIPTS" ]; then
  if [ "$PURGE_DATA" = false ]; then
    read -p "Do you want to permanently delete receipts and configuration? [y/N]: " choice
    if [[ "$choice" =~ ^[Yy]$ ]]; then
      PURGE_DATA=true
    fi
  fi

  if [ "$PURGE_DATA" = true ]; then
    echo "Deleting configuration and receipts..."
    rm -rf "$CONFIG_DIR"
    if [ -d "$VAR_RECEIPTS" ]; then
      sudo rm -rf "$VAR_RECEIPTS" 2>/dev/null || true
    fi
    echo "Data purged."
  else
    echo "Audit receipts preserved at:"
    [ -d "$CONFIG_DIR" ] && echo "  - $CONFIG_DIR"
    [ -d "$VAR_RECEIPTS" ] && echo "  - $VAR_RECEIPTS"
  fi
fi

echo ""
echo "========================================================"
echo "Campus E-Voting Booth uninstallation complete."
echo "========================================================"
