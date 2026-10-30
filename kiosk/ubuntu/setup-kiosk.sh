#!/usr/bin/env bash
# ==============================================================================
# Campus E-Voting System (CEVS) - Ubuntu 26.04 LTS Kiosk Automated Installer
# Target Architecture: Ubuntu 26.04 / GNOME Wayland / Snap Firefox / evote user
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color scheme for status feedback
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

# ------------------------------------------------------------------------------
# Pre-Flight Checks
# ------------------------------------------------------------------------------
if [[ ${EUID} -ne 0 ]]; then
    log_error "This setup script must be executed as root (e.g. 'sudo bash setup-kiosk.sh')."
    exit 1
fi

log_step "Starting CEVS Ubuntu 26.04 Kiosk Installation & Lockdown..."

# Detect GDM config file location
GDM_CONF="/etc/gdm3/custom.conf"
if [[ ! -f "${GDM_CONF}" ]] && [[ -f "/etc/gdm/custom.conf" ]]; then
    GDM_CONF="/etc/gdm/custom.conf"
fi

# ------------------------------------------------------------------------------
# Step 1: Create Dedicated Restricted 'evote' User
# ------------------------------------------------------------------------------
log_step "Step 1: Provisioning dedicated restricted 'evote' user..."
EVOTE_USER="evote"
EVOTE_HOME="/home/${EVOTE_USER}"

if id "${EVOTE_USER}" >/dev/null 2>&1; then
    log_info "User '${EVOTE_USER}' already exists. Hardening account..."
else
    log_info "Creating non-privileged system user '${EVOTE_USER}'..."
    useradd -m -s /bin/bash -c "Campus E-Voting Kiosk User" "${EVOTE_USER}"
fi

# Lock the password so password-based login and SSH interactive password auth fail
passwd -l "${EVOTE_USER}" >/dev/null 2>&1 || true

# Strip any dangerous administrative group memberships
for bad_group in sudo admin wheel adm dip dialout; do
    if getent group "${bad_group}" | grep -q "\b${EVOTE_USER}\b"; then
        log_warn "Removing '${EVOTE_USER}' from sensitive group '${bad_group}'..."
        gpasswd -d "${EVOTE_USER}" "${bad_group}" || true
    fi
done

# Ensure user directories exist
mkdir -p "${EVOTE_HOME}/.config/systemd/user"
mkdir -p "${EVOTE_HOME}/.config/autostart"
mkdir -p "${EVOTE_HOME}/.config/evote"

# Enable systemd user session lingering for background service stability
if command -v loginctl >/dev/null 2>&1; then
    log_info "Enabling user lingering for '${EVOTE_USER}'..."
    loginctl enable-linger "${EVOTE_USER}" || true
fi

# ------------------------------------------------------------------------------
# Step 2: Configure GDM3 Auto-Login for 'evote'
# ------------------------------------------------------------------------------
log_step "Step 2: Configuring GDM3 auto-login..."
if [[ -f "${GDM_CONF}" ]]; then
    # Backup original configuration if not already backed up
    if [[ ! -f "${GDM_CONF}.kiosk-orig" ]]; then
        log_info "Backing up original GDM configuration to ${GDM_CONF}.kiosk-orig..."
        cp -p "${GDM_CONF}" "${GDM_CONF}.kiosk-orig"
    fi

    # Configure auto-login in GDM3 custom.conf
    # Remove existing conflicting lines
    sed -i '/^AutomaticLoginEnable/d' "${GDM_CONF}"
    sed -i '/^AutomaticLogin/d' "${GDM_CONF}"
    sed -i '/^WaylandEnable/d' "${GDM_CONF}"

    # Ensure [daemon] section exists
    if ! grep -q "^\[daemon\]" "${GDM_CONF}"; then
        echo -e "\n[daemon]" >> "${GDM_CONF}"
    fi

    # Append our settings right below [daemon]
    sed -i "/^\[daemon\]/a WaylandEnable=true\nAutomaticLoginEnable=True\nAutomaticLogin=${EVOTE_USER}" "${GDM_CONF}"
    log_info "GDM3 auto-login configured for '${EVOTE_USER}' under Wayland."
else
    log_warn "GDM configuration not found at /etc/gdm3/custom.conf. Verify display manager."
fi

# ------------------------------------------------------------------------------
# Step 3: Install & Deploy Firefox Snap with Enterprise Policies
# ------------------------------------------------------------------------------
log_step "Step 3: Deploying Firefox Snap Enterprise Policies..."

# Check Snap Firefox
if ! command -v snap >/dev/null 2>&1; then
    log_warn "Snapd not detected. Installing snapd..."
    apt-get update -qq && apt-get install -y -qq snapd
fi

if ! snap list firefox >/dev/null 2>&1; then
    log_info "Installing Firefox via Snap..."
    snap install firefox
fi

# System-wide enterprise policy paths
mkdir -p /etc/firefox/policies
mkdir -p /var/snap/firefox/current/policies 2>/dev/null || true

POLICIES_SRC="${SCRIPT_DIR}/policies/policies.json"
if [[ -f "${POLICIES_SRC}" ]]; then
    cp -f "${POLICIES_SRC}" /etc/firefox/policies/policies.json
    chmod 644 /etc/firefox/policies/policies.json
    
    if [[ -d "/var/snap/firefox/current" ]]; then
        cp -f "${POLICIES_SRC}" /var/snap/firefox/current/policies/policies.json
        chmod 644 /var/snap/firefox/current/policies/policies.json
    fi
    log_info "Firefox Enterprise Policies deployed to /etc/firefox/policies/policies.json."
else
    log_error "Policies file ${POLICIES_SRC} not found!"
    exit 1
fi

# ------------------------------------------------------------------------------
# Step 4: Install Kiosk Launcher Script
# ------------------------------------------------------------------------------
log_step "Step 4: Installing Kiosk Launcher executable..."
LAUNCHER_SRC="${SCRIPT_DIR}/scripts/kiosk-launcher.sh"
LAUNCHER_DEST="/usr/local/bin/kiosk-launcher.sh"

if [[ -f "${LAUNCHER_SRC}" ]]; then
    cp -f "${LAUNCHER_SRC}" "${LAUNCHER_DEST}"
    chmod 755 "${LAUNCHER_DEST}"
    log_info "Launcher installed at ${LAUNCHER_DEST}."
else
    log_error "Launcher source script ${LAUNCHER_SRC} not found!"
    exit 1
fi

# Install default environment file if missing
if [[ ! -f "/etc/default/evote-kiosk" ]]; then
    cat <<'EOF' > /etc/default/evote-kiosk
# Campus E-Voting System (CEVS) - Kiosk Configuration
VOTING_URL="http://localhost:3000/kiosk"
EOF
    chmod 644 /etc/default/evote-kiosk
    log_info "Created default configuration file: /etc/default/evote-kiosk"
fi

# ------------------------------------------------------------------------------
# Step 5: Enforce GNOME Security Lockdown (DConf)
# ------------------------------------------------------------------------------
log_step "Step 5: Applying GNOME dconf security locks..."
LOCKDOWN_SCRIPT="${SCRIPT_DIR}/gnome/kiosk-lockdown.sh"
if [[ -f "${LOCKDOWN_SCRIPT}" ]]; then
    bash "${LOCKDOWN_SCRIPT}"
else
    log_error "Lockdown script ${LOCKDOWN_SCRIPT} not found!"
    exit 1
fi

# ------------------------------------------------------------------------------
# Step 6: Deploy Systemd User Service & Autostart Fallback
# ------------------------------------------------------------------------------
log_step "Step 6: Deploying systemd user service and autostart entry..."
SERVICE_SRC="${SCRIPT_DIR}/systemd/evote-kiosk.service"
SERVICE_SYS_DEST="/etc/systemd/user/evote-kiosk.service"
SERVICE_USER_DEST="${EVOTE_HOME}/.config/systemd/user/evote-kiosk.service"

mkdir -p /etc/systemd/user
cp -f "${SERVICE_SRC}" "${SERVICE_SYS_DEST}"
chmod 644 "${SERVICE_SYS_DEST}"

cp -f "${SERVICE_SRC}" "${SERVICE_USER_DEST}"
chmod 644 "${SERVICE_USER_DEST}"

# Enable service for user session
USER_WANTS_DIR="${EVOTE_HOME}/.config/systemd/user/graphical-session.target.wants"
mkdir -p "${USER_WANTS_DIR}"
ln -sf "../evote-kiosk.service" "${USER_WANTS_DIR}/evote-kiosk.service"

# Also install GNOME Autostart desktop entry as defense-in-depth fallback
cat <<EOF > "${EVOTE_HOME}/.config/autostart/evote-kiosk.desktop"
[Desktop Entry]
Type=Application
Name=Campus E-Voting Kiosk
Comment=CEVS Secure Voting Terminal
Exec=/usr/local/bin/kiosk-launcher.sh
Terminal=false
StartupNotify=false
X-GNOME-Autostart-enabled=true
EOF
chmod 644 "${EVOTE_HOME}/.config/autostart/evote-kiosk.desktop"

# Fix permissions on all home directory assets
chown -R "${EVOTE_USER}:${EVOTE_USER}" "${EVOTE_HOME}"

# ------------------------------------------------------------------------------
# Step 7: Configure Minimal Sudoers File (evote-maintenance)
# ------------------------------------------------------------------------------
log_step "Step 7: Installing minimal restricted sudoers configuration..."
SUDOERS_SRC="${SCRIPT_DIR}/sudoers/evote-maintenance"
SUDOERS_DEST="/etc/sudoers.d/evote-maintenance"

if [[ -f "${SUDOERS_SRC}" ]]; then
    cp -f "${SUDOERS_SRC}" "${SUDOERS_DEST}"
    chmod 0440 "${SUDOERS_DEST}"
    
    # Validate with visudo
    if visudo -cf "${SUDOERS_DEST}" >/dev/null 2>&1; then
        log_info "Sudoers file syntax validated successfully."
    else
        log_error "Sudoers validation failed! Removing invalid sudoers file."
        rm -f "${SUDOERS_DEST}"
        exit 1
    fi
else
    log_error "Sudoers source template ${SUDOERS_SRC} not found!"
    exit 1
fi

# ------------------------------------------------------------------------------
# Installation Summary & Verification
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}Campus E-Voting System (CEVS) Kiosk Setup Complete!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo -e "User Account:       ${BOLD}${EVOTE_USER}${NC} (Locked password, non-root)"
echo -e "Display Manager:    GDM3 (Auto-login: ${EVOTE_USER}, Wayland: Enabled)"
echo -e "Target URL:         $(grep VOTING_URL /etc/default/evote-kiosk | cut -d'=' -f2)"
echo -e "Browser Engine:     Snap Firefox (Enterprise Lockdown Active)"
echo -e "DConf Hardening:    App Switcher, Hot Corners, TTY, Power, USB Storage Disabled"
echo -e "Service:            evote-kiosk.service (User systemd unit enabled)"
echo -e "Maintenance Sudo:   Restricted to restart, reboot, and network check commands"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Verify configuration file: ${BOLD}/etc/default/evote-kiosk${NC}"
echo -e "  2. Test reboot to auto-start voting kiosk: ${BOLD}sudo reboot${NC}"
echo -e "  3. To restore standard workstation: ${BOLD}sudo bash ${SCRIPT_DIR}/rollback-kiosk.sh${NC}"
echo ""
exit 0
