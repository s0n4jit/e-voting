#!/usr/bin/env bash
# ==============================================================================
# Campus E-Voting System (CEVS) - Kiosk Rollback Script
# Safely reverts all kiosk lockdown settings on Ubuntu 26.04 LTS
# ==============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_step() {
    echo -e "${BLUE}${BOLD}==>${NC} ${BOLD}$*${NC}"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

if [[ ${EUID} -ne 0 ]]; then
    log_error "Rollback script must be executed as root (e.g. 'sudo bash rollback-kiosk.sh')."
    exit 1
fi

REMOVE_USER=0
if [[ "${1:-}" == "--remove-user" ]]; then
    REMOVE_USER=1
fi

log_step "Initiating CEVS Kiosk Rollback..."

# ------------------------------------------------------------------------------
# 1. Terminate and Disable Systemd User Service
# ------------------------------------------------------------------------------
log_step "Step 1: Stopping kiosk services..."
if id "evote" >/dev/null 2>&1; then
    # Stop user service if active
    systemctl --user -M evote@ stop evote-kiosk.service 2>/dev/null || true
    systemctl --user -M evote@ disable evote-kiosk.service 2>/dev/null || true
fi

# Kill any running kiosk-launcher instances
pkill -f "kiosk-launcher.sh" 2>/dev/null || true

# Remove systemd service files
rm -f /etc/systemd/user/evote-kiosk.service
rm -f /home/evote/.config/systemd/user/evote-kiosk.service 2>/dev/null || true
rm -rf /home/evote/.config/systemd/user/graphical-session.target.wants 2>/dev/null || true
rm -f /home/evote/.config/autostart/evote-kiosk.desktop 2>/dev/null || true

# ------------------------------------------------------------------------------
# 2. Restore GDM3 Display Manager Configuration
# ------------------------------------------------------------------------------
log_step "Step 2: Restoring GDM3 configuration..."
GDM_CONF="/etc/gdm3/custom.conf"
if [[ ! -f "${GDM_CONF}" ]] && [[ -f "/etc/gdm/custom.conf" ]]; then
    GDM_CONF="/etc/gdm/custom.conf"
fi

if [[ -f "${GDM_CONF}.kiosk-orig" ]]; then
    log_info "Restoring original GDM config from ${GDM_CONF}.kiosk-orig..."
    mv -f "${GDM_CONF}.kiosk-orig" "${GDM_CONF}"
elif [[ -f "${GDM_CONF}" ]]; then
    log_info "Removing auto-login settings from ${GDM_CONF}..."
    sed -i '/^AutomaticLoginEnable/d' "${GDM_CONF}"
    sed -i '/^AutomaticLogin/d' "${GDM_CONF}"
fi

# ------------------------------------------------------------------------------
# 3. Remove GNOME DConf Lockdown Profile and Locks
# ------------------------------------------------------------------------------
log_step "Step 3: Removing GNOME dconf security locks..."
rm -f /etc/dconf/db/local.d/00-kiosk-lockdown /etc/dconf/db/local.d/locks/00-kiosk-lockdown
rm -rf /etc/dconf/db/evote.d /etc/dconf/profile/evote /home/evote/.config/environment.d/10-evote-dconf.conf

if command -v dconf >/dev/null 2>&1; then
    log_info "Recompiling dconf database..."
    dconf update || true
fi

# ------------------------------------------------------------------------------
# 4. Remove Kernel Module & Hardware Restrictions
# ------------------------------------------------------------------------------
log_step "Step 4: Restoring USB mass storage and VT switching..."
rm -f /etc/modprobe.d/kiosk-block-storage.conf
rm -f /etc/systemd/logind.conf.d/kiosk-no-vt.conf

# ------------------------------------------------------------------------------
# 5. Remove Firefox Policies
# ------------------------------------------------------------------------------
log_step "Step 5: Removing Firefox Enterprise Policies..."
rm -f /etc/firefox/policies/policies.json
rm -f /var/snap/firefox/current/policies/policies.json 2>/dev/null || true
rm -f /usr/lib/firefox/distribution/policies.json /usr/lib64/firefox/distribution/policies.json /usr/lib/firefox-esr/distribution/policies.json 2>/dev/null || true

# ------------------------------------------------------------------------------
# 6. Remove Maintenance Sudoers Entry
# ------------------------------------------------------------------------------
systemctl disable --now evote-agent.service 2>/dev/null || true
rm -f /etc/systemd/system/evote-agent.service /usr/local/bin/evote
rm -rf /usr/local/lib/evote   # saved receipts in /var/lib/evote/receipts are kept on purpose

log_step "Step 6: Removing sudoers entry..."
rm -f /etc/sudoers.d/evote-maintenance

# ------------------------------------------------------------------------------
# 7. Remove Launcher Script & Config
# ------------------------------------------------------------------------------
log_step "Step 7: Removing launcher binary and configuration..."
rm -f /usr/local/bin/kiosk-launcher.sh
rm -f /etc/default/evote-kiosk

# ------------------------------------------------------------------------------
# 8. Optional: Remove 'evote' User
# ------------------------------------------------------------------------------
if [[ ${REMOVE_USER} -eq 1 ]]; then
    log_step "Step 8: Deleting 'evote' user and home directory..."
    if id "evote" >/dev/null 2>&1; then
        userdel -r evote 2>/dev/null || userdel -f evote || true
        log_info "User 'evote' removed."
    fi
else
    log_info "Retaining 'evote' user account. (Pass '--remove-user' if deletion is desired)."
fi

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}Campus E-Voting System (CEVS) Kiosk Rollback Complete!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo -e "Standard desktop settings and display manager configurations have been restored."
echo -e "A system restart is recommended to re-initialize default session settings:"
echo -e "  ${BOLD}sudo reboot${NC}"
echo ""
exit 0
