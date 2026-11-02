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
# Distribution detection (Ubuntu/Debian, Fedora/RHEL family, Arch). Run with --detect to only print it.
# ------------------------------------------------------------------------------
detect_distro() {
    local file="${OS_RELEASE_FILE:-/etc/os-release}" id="" like=""
    if [[ -r "${file}" ]]; then
        id="$(. "${file}"; echo "${ID:-}")"
        like="$(. "${file}"; echo "${ID_LIKE:-}")"
    fi
    DISTRO_ID="${id:-unknown}"
    case " ${id} ${like} " in
        *" ubuntu "*)                           FAMILY="ubuntu" ;;
        *" debian "*)                           FAMILY="debian" ;;
        *" fedora "*|*" rhel "*|*" centos "*)   FAMILY="fedora" ;;
        *" arch "*)                             FAMILY="arch" ;;
        *)                                      FAMILY="unknown" ;;
    esac
}

detect_distro
if [[ "${1:-}" == "--detect" ]]; then
    echo "distribution: ${DISTRO_ID}  family: ${FAMILY}"
    exit 0
fi
if [[ "${FAMILY}" == "unknown" ]]; then
    echo "[ERROR] Unsupported distribution '${DISTRO_ID}'. Supported: Ubuntu, Debian, Fedora/RHEL and Arch (with GNOME/GDM)." >&2
    exit 1
fi

# Install Firefox the way each distribution ships it.
install_firefox() {
    case "${FAMILY}" in
        ubuntu)
            command -v snap >/dev/null 2>&1 || { log_warn "Snapd not detected. Installing snapd..."; apt-get update -qq && apt-get install -y -qq snapd; }
            snap list firefox >/dev/null 2>&1 || { log_info "Installing Firefox via Snap..."; snap install firefox; }
            ;;
        debian)
            command -v firefox >/dev/null 2>&1 || command -v firefox-esr >/dev/null 2>&1 || { log_info "Installing Firefox ESR (apt)..."; apt-get update -qq && apt-get install -y -qq firefox-esr; }
            ;;
        fedora)
            command -v firefox >/dev/null 2>&1 || { log_info "Installing Firefox (dnf)..."; dnf install -y firefox; }
            ;;
        arch)
            command -v firefox >/dev/null 2>&1 || { log_info "Installing Firefox (pacman)..."; pacman -S --noconfirm --needed firefox; }
            ;;
    esac
    command -v python3 >/dev/null 2>&1 || log_warn "python3 not found: the booth address cannot be added to the browser policy."
}

# ------------------------------------------------------------------------------
# Pre-Flight Checks
# ------------------------------------------------------------------------------
if [[ ${EUID} -ne 0 ]]; then
    log_error "This setup script must be executed as root (e.g. 'sudo bash setup-kiosk.sh')."
    exit 1
fi

log_step "Starting CEVS Kiosk Installation & Lockdown (${DISTRO_ID}, ${FAMILY} family)..."

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

# AUTOLOGIN=yes: the booth signs in by itself and the account has no usable password.
# Default: nobody is signed in automatically. The login screen lists the users, the administrator picks
# "evote" (with the password set here) or their own account.
GENERATED_PASSWORD=""
EVOTE_PASSWORD="${EVOTE_PASSWORD:-}"
if [[ "${AUTOLOGIN:-no}" == "yes" ]]; then
    passwd -l "${EVOTE_USER}" >/dev/null 2>&1 || true
else
    if [[ -z "${EVOTE_PASSWORD:-}" && -t 0 ]]; then
        read -rsp "Password for the kiosk user '${EVOTE_USER}' (8+ characters, Enter = generate one): " EVOTE_PASSWORD || true
        echo
    fi
    if [[ ${#EVOTE_PASSWORD} -lt 8 ]]; then
        EVOTE_PASSWORD="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 12)"
        GENERATED_PASSWORD="${EVOTE_PASSWORD}"
    fi
    echo "${EVOTE_USER}:${EVOTE_PASSWORD}" | chpasswd
    passwd -u "${EVOTE_USER}" >/dev/null 2>&1 || true
fi

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

    if [[ "${AUTOLOGIN:-no}" == "yes" ]]; then
        sed -i "/^\[daemon\]/a WaylandEnable=true\nAutomaticLoginEnable=True\nAutomaticLogin=${EVOTE_USER}" "${GDM_CONF}"
        log_info "GDM3 auto-login configured for '${EVOTE_USER}' under Wayland."
    else
        sed -i "/^\[daemon\]/a WaylandEnable=true" "${GDM_CONF}"
        log_info "Auto-login is OFF: choose the user on the login screen (turn it on later with: sudo evote autologin on)."
    fi
else
    log_warn "GDM configuration not found at /etc/gdm3/custom.conf. Verify display manager."
fi

# ------------------------------------------------------------------------------
# Step 3: Install & Deploy Firefox Snap with Enterprise Policies
# ------------------------------------------------------------------------------
log_step "Step 3: Installing Firefox and its enterprise policy..."

install_firefox

# System-wide enterprise policy paths
mkdir -p /etc/firefox/policies
mkdir -p /var/snap/firefox/current/policies 2>/dev/null || true

POLICIES_SRC="${SCRIPT_DIR}/policies/policies.json"
if [[ -f "${POLICIES_SRC}" ]]; then
    POLICY_TARGETS=(/etc/firefox/policies/policies.json)
    if [[ -d "/var/snap/firefox/current" ]]; then
        POLICY_TARGETS+=(/var/snap/firefox/current/policies/policies.json)
    fi
    for dist_dir in /usr/lib/firefox/distribution /usr/lib64/firefox/distribution /usr/lib/firefox-esr/distribution /usr/lib/firefox-esr/distribution; do
        [[ -d "$(dirname "${dist_dir}")" ]] && POLICY_TARGETS+=("${dist_dir}/policies.json")
    done
    for target in "${POLICY_TARGETS[@]}"; do
        # shellcheck disable=SC2174
        mkdir -p "$(dirname "${target}")"
        # a distribution directory that is a link to /etc/firefox/policies already is the same file
        [[ "${target}" -ef /etc/firefox/policies/policies.json && "${target}" != /etc/firefox/policies/policies.json ]] && continue
        cp -f "${POLICIES_SRC}" "${target}"
        chmod 644 "${target}"
    done
    log_info "Firefox Enterprise Policies deployed to /etc/firefox/policies/policies.json."

    # Allow the booth address given in VOTING_URL (the shipped policy only knows the example addresses).
    if [[ -n "${VOTING_URL:-}" ]]; then
        if [[ ! "${VOTING_URL}" =~ ^https?://[^/]+/kiosk/vote$ ]]; then
            log_error "VOTING_URL must look like https://your-site.example/kiosk/vote (got: ${VOTING_URL})."
            exit 1
        fi
        for POLICY_FILE in "${POLICY_TARGETS[@]}"; do
            [[ -f "${POLICY_FILE}" ]] || continue
            python3 - "${POLICY_FILE}" "${VOTING_URL}*" <<'PYEOF'
import json, sys
path, allowed = sys.argv[1], sys.argv[2]
policy = json.load(open(path))
p = policy["policies"]
for lst in (p["WebsiteFilter"]["Exceptions"], p["URLAllowlist"]):
    if allowed not in lst:
        lst.append(allowed)
json.dump(policy, open(path, "w"), indent=2)
PYEOF
        done
        log_info "Browser policy now also allows ${VOTING_URL}."
    fi
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

# The address given in VOTING_URL always wins; otherwise keep an existing file or write the default.
if [[ -n "${VOTING_URL:-}" ]]; then
    printf '# Campus E-Voting System (CEVS) - Kiosk Configuration\nVOTING_URL="%s"\n' "${VOTING_URL}" > /etc/default/evote-kiosk
    chmod 644 /etc/default/evote-kiosk
    log_info "Booth address set to ${VOTING_URL}."
elif [[ ! -f "/etc/default/evote-kiosk" ]]; then
    cat <<'EOF' > /etc/default/evote-kiosk
# Campus E-Voting System (CEVS) - Kiosk Configuration
VOTING_URL="http://localhost:3000/kiosk/vote"
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

# SELinux (Fedora/RHEL): give the files we copied their proper labels
if command -v restorecon >/dev/null 2>&1; then
    restorecon -RF /usr/local/bin/kiosk-launcher.sh /etc/systemd/user /etc/default/evote-kiosk "${EVOTE_HOME}" 2>/dev/null || true
fi

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
# Step 8: Booth agent (silent printing, receipt archive on disk) and the `evote` maintenance command
# ------------------------------------------------------------------------------
log_step "Step 8: Installing the booth agent, printing support and the evote command..."
AGENT_SRC="$(cd "${SCRIPT_DIR}/../../booth-agent" 2>/dev/null && pwd || true)"
if [[ -n "${AGENT_SRC}" && -f "${AGENT_SRC}/evote-agent.py" ]]; then
    case "${FAMILY}" in
        ubuntu|debian) apt-get install -y -qq cups cups-client python3 network-manager >/dev/null || log_warn "Could not install printing packages." ;;
        fedora)        dnf install -y cups python3 NetworkManager >/dev/null || log_warn "Could not install printing packages." ;;
        arch)          pacman -S --noconfirm --needed cups python networkmanager >/dev/null || log_warn "Could not install printing packages." ;;
    esac
    install -d -m 755 /usr/local/lib/evote /etc/evote
    # Vote copies are kept in the administrator's private folder (700, only that account can read it).
    RECEIPT_OWNER="${RECEIPT_OWNER:-${SUDO_USER:-}}"
    if [[ -n "${RECEIPT_OWNER}" && "${RECEIPT_OWNER}" != "root" && "${RECEIPT_OWNER}" != "${EVOTE_USER}" ]] && getent passwd "${RECEIPT_OWNER}" >/dev/null; then
        RECEIPT_DIR="$(getent passwd "${RECEIPT_OWNER}" | cut -d: -f6)/.evote-receipts"
        install -d -m 700 -o "${RECEIPT_OWNER}" -g "${RECEIPT_OWNER}" "${RECEIPT_DIR}"
    else
        RECEIPT_OWNER=""
        RECEIPT_DIR="/var/lib/evote/receipts"
        install -d -m 700 "${RECEIPT_DIR}"
        log_warn "No administrator account found (run the installer with sudo from your own account): receipts go to ${RECEIPT_DIR}."
    fi
    install -m 755 "${AGENT_SRC}/evote-agent.py" /usr/local/lib/evote/evote-agent.py
    install -m 644 "${AGENT_SRC}/setup.html" /usr/local/lib/evote/setup.html
    install -m 755 "${AGENT_SRC}/evote" /usr/local/bin/evote
    install -m 644 "${AGENT_SRC}/evote-agent.service" /etc/systemd/system/evote-agent.service
    if [[ ! -f /etc/evote/booth.conf ]]; then
        printf 'VOTING_URL="%s"\nPRINTER=""\nCOPIES="1"\nPRINT_ENABLED="1"\nRECEIPT_DIR=""\nRECEIPT_OWNER=""\n' \
            "$(grep -h '^VOTING_URL=' /etc/default/evote-kiosk | head -1 | cut -d'"' -f2)" > /etc/evote/booth.conf
    fi
    sed -i -e "s|^RECEIPT_DIR=.*|RECEIPT_DIR=\"${RECEIPT_DIR}\"|" -e "s|^RECEIPT_OWNER=.*|RECEIPT_OWNER=\"${RECEIPT_OWNER}\"|" /etc/evote/booth.conf
    grep -q '^RECEIPT_OWNER=' /etc/evote/booth.conf || printf 'RECEIPT_OWNER="%s"\n' "${RECEIPT_OWNER}" >> /etc/evote/booth.conf
    systemctl enable --now cups.service 2>/dev/null || true
    systemctl daemon-reload
    systemctl enable --now evote-agent.service
    log_info "Booth agent running on 127.0.0.1:9631. Receipts are kept in ${RECEIPT_DIR} (private to ${RECEIPT_OWNER:-root}). Set up the printer with: sudo evote setup"
else
    log_warn "The booth-agent folder was not found next to kiosk/: silent printing and the evote command were not installed."
fi

# ------------------------------------------------------------------------------
# Installation Summary & Verification
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}Campus E-Voting System (CEVS) Kiosk Setup Complete!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo -e "User Account:       ${BOLD}${EVOTE_USER}${NC} (Locked password, non-root)"
echo -e "Display Manager:    GDM3 (Auto-login: ${AUTOLOGIN:-no}, Wayland: Enabled)"
[[ -n "${GENERATED_PASSWORD}" ]] && echo -e "Kiosk user password: ${BOLD}${GENERATED_PASSWORD}${NC}  (write it down; change it with: sudo passwd ${EVOTE_USER})"
echo -e "Target URL:         $(grep VOTING_URL /etc/default/evote-kiosk | cut -d'=' -f2)"
echo -e "Browser Engine:     Firefox on ${DISTRO_ID} (Enterprise Lockdown Active)"
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
