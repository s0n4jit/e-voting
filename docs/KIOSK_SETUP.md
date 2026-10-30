# Ubuntu 26.04 LTS Kiosk Setup & Operating System Hardening Guide

## Overview
This document specifies the exact installation, configuration, and operating-system-level hardening steps to transform a generic workstation running **Ubuntu 26.04 LTS (Noble Numbat)** into an examination-style locked-down physical voting booth terminal for the **Campus E-Voting System (CEVS)**.

---

## 1. System Architecture & Boundaries

```
[ Physical Terminal Hardware (UEFI Password & SecureBoot Enabled) ]
   │
   ▼
[ Ubuntu 26.04 LTS Linux Kernel (Locked VTs, Blacklisted USB Storage) ]
   │
   ▼
[ GDM3 Display Manager (Automatic Wayland Login for 'evote' User) ]
   │
   ▼
[ GNOME Wayland Session (dconf Lockdown: No Hot Corners, No Alt+Tab) ]
   │
   ▼
[ Systemd User Unit: evote-kiosk.service ]
   │
   ▼
[ Watchdog Launcher: /usr/local/bin/kiosk-launcher.sh ]
   │
   ▼
[ Snap Firefox in Strict Kiosk Mode (--kiosk --private-window) ]
   │
   ▼
[ Enterprise Policies: Strict URL Allowlist, DevTools/Downloads Disabled ]
   │
   ▼
[ HTTPS Campus Voting Web Application ]
```

---

## 2. Automated One-Command Installation

The complete installation has been automated through `kiosk/ubuntu/setup-kiosk.sh`.

### Step 1: Copy Kiosk Configuration to Target Terminal
On the Ubuntu voting machine, clone the repository or transfer the `kiosk/ubuntu/` directory:

```bash
cd /opt
sudo git clone https://github.com/s0n4jit/e-voting.git
cd /opt/e-voting/kiosk/ubuntu
```

### Step 2: Set Voting Application URL & Execute Setup
Run the setup script with root privileges:

```bash
# Provide the public HTTPS voting URL for this terminal
sudo VOTING_URL="https://evote.campus.internal/kiosk" bash setup-kiosk.sh
```

The script will automatically perform:
1. **User Provisioning**: Creates an unprivileged, restricted system account `evote` without a login shell (`/bin/false`) and locks password access (`passwd -l evote`).
2. **Wayland Auto-Login**: Configures `/etc/gdm3/custom.conf` to automatically launch a GNOME Wayland session as `evote`.
3. **Snap Firefox Enterprise Policies**: Copies `policies/policies.json` to both `/etc/firefox/policies/` and `/var/snap/firefox/current/policies/`.
4. **Desktop Environment Lockdown**: Compiles dconf database locks disabling hot corners, app switching (`Alt+Tab`), lock screen, idle dimming, screenshots, and terminal hotkeys.
5. **Systemd Watchdog Service**: Installs and enables `evote-kiosk.service` under `~evote/.config/systemd/user/` with automatic restart and crash-loop backoff.
6. **Privilege Separation**: Installs strictly allowlisted sudoers rules at `/etc/sudoers.d/evote-maintenance` for system restart and network diagnosis commands only.

---

## 3. Firefox Enterprise Policies Verification

Inspect `/etc/firefox/policies/policies.json`:

```json
{
  "policies": {
    "Kiosk": true,
    "DisableDefaultBrowserAgent": true,
    "DisableDeveloperTools": true,
    "PromptForDownloadLocation": false,
    "DefaultDownloadDirectory": "/dev/null",
    "DisablePrivateBrowsing": false,
    "PasswordManagerEnabled": false,
    "SearchSuggestEnabled": false,
    "SanitizeOnShutdown": {
      "Cache": true,
      "Cookies": true,
      "History": true,
      "Sessions": true,
      "FormData": true,
      "Downloads": true
    },
    "URLAllowlist": [
      "https://evote.campus.internal/*",
      "http://localhost:3000/*",
      "http://127.0.0.1:3000/*"
    ],
    "URLBlocklist": ["*"],
    "OverrideFirstRunPage": "",
    "OverridePostUpdatePage": "",
    "DontCheckDefaultBrowser": true,
    "EnableTrackingProtection": {
      "Value": true,
      "Locked": true,
      "Cryptomining": true,
      "Fingerprinting": true
    }
  }
}
```

---

## 4. Hardware and UEFI/BIOS Hardening Checklist

Software lockdown cannot defend against physical physical port tampering or BIOS override. Prior to opening the polling booth:

1. **Set Supervisor UEFI/BIOS Password**: Prevent unauthorized boot device selection.
2. **Disable USB Boot & External Media Boot**: Ensure terminal only boots from internal signed NVMe/SSD.
3. **Enable Secure Boot**: Enforce signed Linux kernel and module loading.
4. **Physical Port Locks**: Insert physical RJ-45 and USB-A port blockers on unused ports.
5. **Kensington Lock**: Physically secure computer chassis and monitor to the voting booth desk.
6. **Privacy Screen Filter**: Affix optical privacy filter on the monitor to prevent shoulder surfing.

---

## 5. Rollback & Emergency Recovery

If you need to return the machine to standard desktop usage:

```bash
# Run the automated rollback script
sudo bash /opt/e-voting/kiosk/ubuntu/rollback-kiosk.sh

# Or with complete removal of the evote user:
sudo bash /opt/e-voting/kiosk/ubuntu/rollback-kiosk.sh --remove-user
```
