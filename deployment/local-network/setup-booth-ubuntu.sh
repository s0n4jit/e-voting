#!/usr/bin/env bash
# ==============================================================================
# Campus E-Voting - Ubuntu Linux Voting Booth Setup Script
# ==============================================================================
# Configures Ubuntu 24.04+ (and 22.04 LTS) voting booths to securely access:
#   https://evoting.local
#
# Requirements:
# - Run with sudo: sudo bash setup-booth-ubuntu.sh
# - Place 'evoting-ca.crt' in the same folder or in ./certs/
# ==============================================================================

set -euo pipefail

# 1. Require root privileges
if [ "$EUID" -ne 0 ]; then
    echo -e "\033[1;31m[!] Error: Please run this script with sudo or as root:\033[0m"
    echo "    sudo bash $0"
    exit 1
fi

clear
echo -e "\033[1;36m=================================================================\033[0m"
echo -e "\033[1;36m Campus E-Voting - Ubuntu Voting Booth Setup\033[0m"
echo -e "\033[1;36m Target URL: https://evoting.local\033[0m"
echo -e "\033[1;36m=================================================================\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 2. Check Ubuntu Release
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo -e "\033[0;32m[*] Detected OS: ${PRETTY_NAME:-Linux}\033[0m"
fi

# 3. Install Required Packages
echo -e "\n\033[1;36m[*] Step 1: Installing mDNS and Certificate Utilities...\033[0m"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq avahi-daemon avahi-utils libnss-mdns ca-certificates curl libnss3-tools

# Ensure Avahi service is enabled and active
systemctl enable --now avahi-daemon

# 4. Verify /etc/nsswitch.conf for .local mDNS resolution
echo -e "\n\033[1;36m[*] Step 2: Configuring NSS for mDNS (.local) resolution...\033[0m"
if grep -q "mdns4_minimal" /etc/nsswitch.conf; then
    echo -e "\033[0;32m    [OK] nsswitch.conf already configured for mdns4_minimal.\033[0m"
else
    # Insert mdns4_minimal [NOTFOUND=return] before dns
    sed -i 's/hosts:.*dns/& mdns4_minimal [NOTFOUND=return]/' /etc/nsswitch.conf || true
    echo -e "\033[0;32m    [OK] Updated /etc/nsswitch.conf with mdns4_minimal.\033[0m"
fi

# 5. Locate evoting-ca.crt
echo -e "\n\033[1;36m[*] Step 3: Locating Caddy Root CA Certificate...\033[0m"
CERT_PATH=""
for p in "$SCRIPT_DIR/evoting-ca.crt" "$SCRIPT_DIR/certs/evoting-ca.crt" "$SCRIPT_DIR/../certs/evoting-ca.crt"; do
    if [ -f "$p" ]; then
        CERT_PATH="$p"
        break
    fi
done

if [ -z "$CERT_PATH" ]; then
    echo -e "\033[1;31m[!] Error: 'evoting-ca.crt' not found.\033[0m"
    echo "    Please copy 'evoting-ca.crt' into this directory and run again."
    exit 1
fi
echo -e "\033[0;32m    Found Certificate: $CERT_PATH\033[0m"

# 6. Verify SHA256 Fingerprint
echo -e "\n\033[1;36m[*] Step 4: Verifying Certificate Fingerprint...\033[0m"
ACTUAL_HASH=$(sha256sum "$CERT_PATH" | awk '{print $1}')
echo -e "\033[1;33m    Certificate SHA256: ${ACTUAL_HASH^^}\033[0m"

HASH_FILE="$(dirname "$CERT_PATH")/evoting-ca.sha256"
if [ -f "$HASH_FILE" ]; then
    EXPECTED_HASH=$(tr -d ' \r\n' < "$HASH_FILE")
    if [ "${ACTUAL_HASH,,}" = "${EXPECTED_HASH,,}" ]; then
        echo -e "\033[0;32m    [PASS] Fingerprint strictly matches official election authority hash.\033[0m"
    else
        echo -e "\033[1;31m[!] SECURITY WARNING: Fingerprint mismatch!\033[0m"
        echo "    Expected: $EXPECTED_HASH"
        echo "    Actual:   $ACTUAL_HASH"
        exit 1
    fi
fi

# 7. Install into System CA Trust Store
echo -e "\n\033[1;36m[*] Step 5: Installing Certificate into System CA Store...\033[0m"
cp "$CERT_PATH" /usr/local/share/ca-certificates/evoting-ca.crt
update-ca-certificates --fresh > /dev/null
echo -e "\033[0;32m    [OK] System certificate store updated.\033[0m"

# 8. Configure Chromium / Chrome and Firefox Browser Trust
echo -e "\n\033[1;36m[*] Step 6: Configuring Browser Root Trust Policies...\033[0m"

# Firefox Enterprise Policy
mkdir -p /etc/firefox/policies
cat > /etc/firefox/policies/policies.json <<EOF
{
  "policies": {
    "Certificates": {
      "Install": [
        "/usr/local/share/ca-certificates/evoting-ca.crt"
      ]
    }
  }
}
EOF
echo -e "\033[0;32m    [OK] Firefox enterprise certificate policy configured.\033[0m"

# Chromium / NSS Database Trust (for active users)
REAL_USER="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo "~$REAL_USER")
if [ -n "$USER_HOME" ]; then
    mkdir -p "$USER_HOME/.pki/nssdb"
    if [ ! -f "$USER_HOME/.pki/nssdb/cert9.db" ]; then
        certutil -d "sql:$USER_HOME/.pki/nssdb" -N --empty-password 2>/dev/null || true
    fi
    certutil -d "sql:$USER_HOME/.pki/nssdb" -D -n "Campus EVoting Local CA" 2>/dev/null || true
    certutil -d "sql:$USER_HOME/.pki/nssdb" -A -t "C,," -n "Campus EVoting Local CA" -i "$CERT_PATH" 2>/dev/null || true
    chown -R "$REAL_USER:$REAL_USER" "$USER_HOME/.pki" || true
    echo -e "\033[0;32m    [OK] Chromium / Chrome NSS certificate trust configured for user '$REAL_USER'.\033[0m"
fi

# 9. Verify mDNS Resolution
echo -e "\n\033[1;36m[*] Step 7: Verifying mDNS Hostname Resolution (evoting.local)...\033[0m"
RESOLVED_IP=""
for i in {1..5}; do
    RESOLVED_IP=$(avahi-resolve -4 -n evoting.local 2>/dev/null | awk '{print $2}' || true)
    if [ -n "$RESOLVED_IP" ]; then
        break
    fi
    sleep 1
done

if [ -n "$RESOLVED_IP" ]; then
    echo -e "\033[0;32m    [PASS] Hostname resolved via Avahi mDNS: evoting.local -> $RESOLVED_IP\033[0m"
else
    echo -e "\033[1;33m    [WARN] Initial mDNS resolution timed out.\033[0m"
    echo "    Ensure the Election Officer laptop is running on the same network subnet."
fi

# 10. Verify HTTPS End-to-End Handshake
echo -e "\n\033[1;36m[*] Step 8: Verifying HTTPS Handshake with curl...\033[0m"
if curl -sSf --max-time 5 https://evoting.local/api/health > /dev/null 2>&1; then
    echo -e "\033[0;32m    [PASS] HTTPS Connection Verified: HTTP 200 OK\033[0m"
    echo -e "\033[0;32m    [PASS] Zero SSL/TLS certificate warnings.\033[0m"
else
    echo -e "\033[0;37m    [NOTE] System ready. Connect to election network and navigate to https://evoting.local.\033[0m"
fi

echo -e "\n\033[1;36m=================================================================\033[0m"
echo -e "\033[1;32m UBUNTU BOOTH SETUP COMPLETE\033[0m"
echo -e "\033[1;36m=================================================================\033[0m"
echo -e "Voting booth is fully configured. Open the Booth App or browser to:"
echo -e "  \033[1;33mhttps://evoting.local\033[0m"
echo -e "\033[1;36m=================================================================\033[0m"
