#!/usr/bin/env bash
# ==============================================================================
# Campus E-Voting System (CEVS) - GNOME Desktop Lockdown Script
# Enforces strict dconf locks and gsettings for Ubuntu 26.04 LTS (Wayland)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color codes for logging
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Require root privileges to configure system-wide dconf profiles
if [[ ${EUID} -ne 0 ]]; then
    log_error "This script must be run as root (or via sudo) to apply system-wide dconf lockdowns."
    exit 1
fi

log_info "Initiating GNOME desktop security lockdown for kiosk environment..."

# ------------------------------------------------------------------------------
# 1. Configure DConf Profile
# ------------------------------------------------------------------------------
log_info "Configuring /etc/dconf/profile/evote..."
mkdir -p /etc/dconf/profile
cat <<'EOF' > /etc/dconf/profile/evote
user-db:user
system-db:evote
EOF

# ------------------------------------------------------------------------------
# 2. Deploy DConf Keyfiles and Locks
# ------------------------------------------------------------------------------
log_info "Creating /etc/dconf/db/evote.d and locks directories..."
mkdir -p /etc/dconf/db/evote.d/locks

if [[ -f "${SCRIPT_DIR}/dconf/00-kiosk-lockdown" ]]; then
    log_info "Copying dconf keyfile from repository..."
    cp -f "${SCRIPT_DIR}/dconf/00-kiosk-lockdown" /etc/dconf/db/evote.d/00-kiosk-lockdown
else
    log_info "Writing dconf keyfile directly..."
    cat <<'EOF' > /etc/dconf/db/evote.d/00-kiosk-lockdown
[org/gnome/desktop/interface]
enable-hot-corners=false
show-battery-percentage=false

[org/gnome/desktop/session]
idle-delay=uint32 0

[org/gnome/settings-daemon/plugins/power]
idle-dim=false
sleep-inactive-ac-type='nothing'
sleep-inactive-ac-timeout=0
sleep-inactive-battery-type='nothing'
sleep-inactive-battery-timeout=0
power-button-action='nothing'

[org/gnome/desktop/screensaver]
lock-enabled=false

[org/gnome/desktop/lockdown]
disable-lock-screen=true
disable-log-out=true
disable-user-switching=true
disable-command-line=true
disable-printing=true
disable-print-setup=true
disable-save-to-disk=true

[org/gnome/desktop/media-handling]
automount=false
automount-open=false
autorun-never=true

[org/gnome/desktop/wm/keybindings]
switch-applications=@as []
switch-applications-backward=@as []
switch-windows=@as []
switch-windows-backward=@as []
cycle-windows=@as []
cycle-windows-backward=@as []
cycle-group=@as []
cycle-group-backward=@as []
switch-panels=@as []
switch-panels-backward=@as []
close=@as []
minimize=@as []
maximize=@as []
toggle-maximized=@as []
show-desktop=@as []

[org/gnome/settings-daemon/plugins/media-keys]
terminal=@as []
screensaver=@as []
screencast=@as []
screenshot=@as []
screenshot-clip=@as []
window-screenshot=@as []
window-screenshot-clip=@as []
area-screenshot=@as []
area-screenshot-clip=@as []
custom-keybindings=@as []
logout=@as []
suspend=@as []
hibernate=@as []

[org/gnome/shell/keybindings]
show-screenshot-ui=@as []
screenshot=@as []
screenshot-window=@as []
show-screen-recording-ui=@as []
toggle-application-view=@as []
toggle-overview=@as []
toggle-message-tray=@as []

[org/gnome/mutter/keybindings]
toggle-tiled-left=@as []
toggle-tiled-right=@as []
EOF
fi

if [[ -f "${SCRIPT_DIR}/dconf/locks/00-kiosk-lockdown" ]]; then
    log_info "Copying dconf locks file from repository..."
    cp -f "${SCRIPT_DIR}/dconf/locks/00-kiosk-lockdown" /etc/dconf/db/evote.d/locks/00-kiosk-lockdown
else
    log_info "Writing dconf locks file directly..."
    cat <<'EOF' > /etc/dconf/db/evote.d/locks/00-kiosk-lockdown
/org/gnome/desktop/interface/enable-hot-corners
/org/gnome/desktop/session/idle-delay
/org/gnome/settings-daemon/plugins/power/idle-dim
/org/gnome/settings-daemon/plugins/power/sleep-inactive-ac-type
/org/gnome/settings-daemon/plugins/power/sleep-inactive-ac-timeout
/org/gnome/settings-daemon/plugins/power/sleep-inactive-battery-type
/org/gnome/settings-daemon/plugins/power/sleep-inactive-battery-timeout
/org/gnome/settings-daemon/plugins/power/power-button-action
/org/gnome/desktop/screensaver/lock-enabled
/org/gnome/desktop/lockdown/disable-lock-screen
/org/gnome/desktop/lockdown/disable-log-out
/org/gnome/desktop/lockdown/disable-user-switching
/org/gnome/desktop/lockdown/disable-command-line
/org/gnome/desktop/lockdown/disable-printing
/org/gnome/desktop/lockdown/disable-print-setup
/org/gnome/desktop/lockdown/disable-save-to-disk
/org/gnome/desktop/media-handling/automount
/org/gnome/desktop/media-handling/automount-open
/org/gnome/desktop/media-handling/autorun-never
/org/gnome/desktop/wm/keybindings/switch-applications
/org/gnome/desktop/wm/keybindings/switch-applications-backward
/org/gnome/desktop/wm/keybindings/switch-windows
/org/gnome/desktop/wm/keybindings/switch-windows-backward
/org/gnome/desktop/wm/keybindings/cycle-windows
/org/gnome/desktop/wm/keybindings/cycle-windows-backward
/org/gnome/desktop/wm/keybindings/cycle-group
/org/gnome/desktop/wm/keybindings/cycle-group-backward
/org/gnome/desktop/wm/keybindings/switch-panels
/org/gnome/desktop/wm/keybindings/switch-panels-backward
/org/gnome/desktop/wm/keybindings/close
/org/gnome/desktop/wm/keybindings/minimize
/org/gnome/desktop/wm/keybindings/maximize
/org/gnome/desktop/wm/keybindings/toggle-maximized
/org/gnome/desktop/wm/keybindings/show-desktop
/org/gnome/settings-daemon/plugins/media-keys/terminal
/org/gnome/settings-daemon/plugins/media-keys/screensaver
/org/gnome/settings-daemon/plugins/media-keys/screencast
/org/gnome/settings-daemon/plugins/media-keys/screenshot
/org/gnome/settings-daemon/plugins/media-keys/screenshot-clip
/org/gnome/settings-daemon/plugins/media-keys/window-screenshot
/org/gnome/settings-daemon/plugins/media-keys/window-screenshot-clip
/org/gnome/settings-daemon/plugins/media-keys/area-screenshot
/org/gnome/settings-daemon/plugins/media-keys/area-screenshot-clip
/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings
/org/gnome/settings-daemon/plugins/media-keys/logout
/org/gnome/settings-daemon/plugins/media-keys/suspend
/org/gnome/settings-daemon/plugins/media-keys/hibernate
/org/gnome/shell/keybindings/show-screenshot-ui
/org/gnome/shell/keybindings/screenshot
/org/gnome/shell/keybindings/screenshot-window
/org/gnome/shell/keybindings/show-screen-recording-ui
/org/gnome/shell/keybindings/toggle-application-view
/org/gnome/shell/keybindings/toggle-overview
/org/gnome/shell/keybindings/toggle-message-tray
/org/gnome/mutter/keybindings/toggle-tiled-left
/org/gnome/mutter/keybindings/toggle-tiled-right
EOF
fi

chmod 644 /etc/dconf/db/evote.d/00-kiosk-lockdown
chmod 644 /etc/dconf/db/evote.d/locks/00-kiosk-lockdown

# The locks apply to the kiosk user only (profile "evote"), so the administrator keeps a normal desktop.
# An older install locked everyone through the "local" database: remove that.
rm -f /etc/dconf/db/local.d/00-kiosk-lockdown /etc/dconf/db/local.d/locks/00-kiosk-lockdown
if id evote >/dev/null 2>&1; then
    install -d -o evote -g evote /home/evote/.config/environment.d
    echo "DCONF_PROFILE=evote" > /home/evote/.config/environment.d/10-evote-dconf.conf
    chown evote:evote /home/evote/.config/environment.d/10-evote-dconf.conf
fi

# ------------------------------------------------------------------------------
# 3. Compile DConf Database
# ------------------------------------------------------------------------------
log_info "Updating dconf system database..."
dconf update

# ------------------------------------------------------------------------------
# 4. Hardware & Storage Lockdown (USB Storage Blocking)
# ------------------------------------------------------------------------------
# Off by default: it blocks USB sticks for everyone, including the administrator exporting saved receipts
# (evote receipts export). Turn it on with BLOCK_USB_STORAGE=yes. The kiosk user cannot mount sticks either way.
if [[ "${BLOCK_USB_STORAGE:-no}" == "yes" ]]; then
    log_info "Configuring kernel module restrictions for USB mass storage..."
    cat <<'EOF' > /etc/modprobe.d/kiosk-block-storage.conf
# Disable USB storage driver to prevent insertion of thumb drives
blacklist usb-storage
blacklist uas
EOF
    chmod 644 /etc/modprobe.d/kiosk-block-storage.conf
else
    rm -f /etc/modprobe.d/kiosk-block-storage.conf
fi

# ------------------------------------------------------------------------------
# 5. Disable Virtual Terminal (TTY) Switching (Ctrl+Alt+F1-F12)
# ------------------------------------------------------------------------------
log_info "Configuring logind to prevent VT allocation during voting..."
mkdir -p /etc/systemd/logind.conf.d/
cat <<'EOF' > /etc/systemd/logind.conf.d/kiosk-no-vt.conf
[Login]
NAutoVTs=0
ReserveVT=0
EOF
chmod 644 /etc/systemd/logind.conf.d/kiosk-no-vt.conf

log_info "GNOME lockdown successfully enforced and compiled."
exit 0
