# Campus E-Voting System (CEVS) - Ubuntu 26.04 LTS Kiosk Suite

Production-grade Linux Kiosk hardening, configuration files, and automation scripts tailored for **Ubuntu 26.04 LTS**, running **GNOME Wayland**, **Snap Firefox**, and a dedicated restricted user (`evote`).

---

## 1. Architecture Overview

```
                      +------------------------------------------+
                      |               Ubuntu 26.04               |
                      |          (UEFI Secure Boot / TPM)        |
                      +------------------------------------------+
                                           |
                                [GDM3 Auto-Login]
                                           |
                                           v
                      +------------------------------------------+
                      |         Dedicated 'evote' User           |
                      |   - Locked password / No root privileges |
                      |   - Wayland Display Server (Isolated)    |
                      +------------------------------------------+
                                           |
                     [Systemd User Service: evote-kiosk.service]
                                           |
                                           v
                      +------------------------------------------+
                      |            kiosk-launcher.sh             |
                      |   - Signal handling & crash watchdog     |
                      |   - Ephemeral cache cleanup              |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |               Snap Firefox               |
                      |   - Kiosk Mode (--kiosk --private-window)|
                      |   - Enterprise Policy Enforcement        |
                      |   - URL Allowlisting (WebsiteFilter)     |
                      +------------------------------------------+
```

### Key Security Design Tenets
1. **Zero-Trust Display Isolation (Wayland):** Unlike legacy X11 sessions where any application can inspect keystrokes or inject input into other windows, GNOME Wayland isolates client surfaces.
2. **Strict Application Confinement (Snap):** Firefox runs within AppArmor profiles, seccomp filters, and cgroup constraints.
3. **Enterprise Policy Lockdown (`policies.json`):** Disables browser developer tools, address bar navigation, downloads, tab switching, bookmarks, and configuration pages (`about:config`).
4. **Desktop Lockdown (DConf):** Locks down window switching (`Alt+Tab`), terminal shortcuts (`Ctrl+Alt+T`), screenshot tools, hot corners, power button behaviors, and sleep timeouts.
5. **Hardware Attack Vector Mitigation:**
   - Disables USB mass storage kernel modules (`usb-storage`, `uas`) to prevent badUSB / thumbdrive execution.
   - Disables virtual terminal switching (`Ctrl+Alt+F1` through `F12`) via logind configuration.
6. **Watchdog Resilience:** Automatic recovery if the browser terminates unexpectedly, with backoff throttling to prevent CPU thrashing.

---

## 2. File Layout & Destination Mapping

| Source File | Deployed Path | Description |
|:---|:---|:---|
| `policies/policies.json` | `/etc/firefox/policies/policies.json`<br>`/var/snap/firefox/current/policies/policies.json` | Firefox enterprise policy (URL allowlist, sanitization, tab lock). |
| `scripts/kiosk-launcher.sh` | `/usr/local/bin/kiosk-launcher.sh` | Wrapper script with crash watchdog, signal handling, and lock sanitization. |
| `systemd/evote-kiosk.service` | `/etc/systemd/user/evote-kiosk.service`<br>`~evote/.config/systemd/user/evote-kiosk.service` | Systemd user service unit running under graphical target. |
| `gnome/dconf/00-kiosk-lockdown` | `/etc/dconf/db/local.d/00-kiosk-lockdown` | DConf keyfile disabling shortcuts, idle sleep, and automount. |
| `gnome/dconf/locks/00-kiosk-lockdown` | `/etc/dconf/db/local.d/locks/00-kiosk-lockdown` | DConf locks preventing user overrides. |
| `gnome/kiosk-lockdown.sh` | Tooling script | Deploys dconf profile, blacklists USB storage, and disables VTs. |
| `sudoers/evote-maintenance` | `/etc/sudoers.d/evote-maintenance` | Least-privilege sudo rules for polling station operators. |
| `setup-kiosk.sh` | Root installation script | Automated installer configuring user, GDM3, policies, and service. |
| `rollback-kiosk.sh` | Root rollback script | Restores default GNOME workstation settings. |

---

## 3. Deployment Instructions

### Prerequisites
- Fresh installation of **Ubuntu 26.04 LTS** (or 24.04 LTS).
- Wired or protected wireless network connection.
- Standard administrative user with `sudo` rights.

### Step-by-Step Installation
1. Clone or copy the repository onto the target kiosk terminal:
   ```bash
   cd /path/to/EVoting/kiosk/ubuntu
   ```

2. Make installer and scripts executable:
   ```bash
   chmod +x setup-kiosk.sh rollback-kiosk.sh gnome/kiosk-lockdown.sh scripts/kiosk-launcher.sh
   ```

3. Run the automated setup script with root privileges:
   ```bash
   sudo ./setup-kiosk.sh
   ```

4. Configure the voting application endpoint (optional):
   Edit `/etc/default/evote-kiosk`:
   ```bash
   sudo nano /etc/default/evote-kiosk
   ```
   Example:
   ```bash
   VOTING_URL="https://evote.campus.internal/kiosk"
   ```

5. Reboot the terminal to verify automatic startup:
   ```bash
   sudo reboot
   ```

Upon booting:
- The terminal automatically logs in as the unprivileged user `evote`.
- Firefox launches in fullscreen Kiosk mode pointing directly to `$VOTING_URL`.
- All desktop chrome, panels, hot corners, and escape key combinations are suppressed.

---

## 4. Maintenance & Operations Runbook

### Service Inspection & Status
To check the status of the kiosk service without logging into the desktop:
```bash
sudo systemctl --user -M evote@ status evote-kiosk.service
```

To tail live service logs:
```bash
sudo journalctl --user -M evote@ -u evote-kiosk.service -f
```

### Restarting the Kiosk Browser
The restricted sudoers configuration allows polling place marshals or technicians to restart the browser using:
```bash
sudo systemctl restart evote-kiosk.service
```

### Network Diagnostics
If the voting kiosk displays a network error page:
```bash
sudo ip link
sudo ip addr
sudo ping -c 3 192.168.1.1
```

### Power Management
To cleanly shutdown or reboot the station at polling close:
```bash
sudo systemctl reboot
# OR
sudo systemctl poweroff
```

---

## 5. Security & Hardware Hardening Checklist

For physical polling station security, implement the following hardware-level configurations in addition to the OS lockdown:

- [x] **BIOS/UEFI Password:** Set an administrative BIOS/UEFI password to prevent boot order tampering.
- [x] **Secure Boot:** Ensure UEFI Secure Boot is enabled.
- [x] **Boot Order:** Lock boot order to the primary NVMe/SSD; disable USB and Network (PXE) booting.
- [x] **Chassis Intrusion & Physical Ports:** Physically seal or lock unused USB and Thunderbolt ports using physical port locks.
- [x] **Disk Encryption:** Enable LUKS Full Disk Encryption (FDE) bound to TPM 2.0 with PIN.
- [x] **Kernel Lockdown:** Prevent dynamic module insertion or memory modification via `lockdown=confidentiality` kernel parameter.

---

## 6. Rollback to Normal Workstation

To return the terminal to a standard Ubuntu GNOME desktop:
```bash
sudo ./rollback-kiosk.sh
```
To also purge the `evote` user and its home directory:
```bash
sudo ./rollback-kiosk.sh --remove-user
```
After rollback, reboot the system to restore the standard GDM login screen:
```bash
sudo reboot
```
