# Campus E-Voting: Local Network Deployment (`https://evoting.local`)

This directory contains the production-grade deployment infrastructure enabling a stable, zero-configuration local network URL:

**`https://evoting.local`**

Operates on an ordinary **Windows 11 (Home or Pro)** personal laptop belonging to the Election Officer, connecting both **Windows 11** and **Ubuntu Linux** voting booths without requiring Windows Server, static IP addresses, or dedicated DNS hardware.

---

## Architecture Overview

```
                      +-------------------------------------------------------+
                      |         Election Officer Laptop (Windows 11)          |
                      |                                                       |
                      |  [Physical LAN Adapter (Dynamic DHCP)]                |
                      |   -> IP: 192.168.x.x (auto-detected)                  |
                      |                                                       |
                      |  [Host Service: evoting-mdns-responder.py]            |
                      |   -> Multicast DNS daemon (RFC 6762 / 6763)           |
                      |   -> Advertises 'evoting.local' directly on LAN       |
                      |   -> Tracks DHCP changes & announces new IPs          |
                      |                                                       |
                      |  [Docker Network: evoting_default]                    |
                      |   ├── Caddy (ports 80 & 443) -> Internal Local CA     |
                      |   ├── Frontend (Nginx + React Vite SPA)               |
                      |   ├── Backend (Gunicorn + Flask API)                  |
                      |   └── Database (PostgreSQL 16, internal only)         |
                      +---------------------------▲---------------------------+
                                                  │
                            Election LAN (Wi-Fi or Switch)
                                                  │
            +-------------------------------------+-------------------------------------+
            │                                                                           │
+-----------▼---------------------------+                   +---------------------------▼-----------+
|      Windows Voting Booth             |                   |       Ubuntu Linux Voting Booth       |
|  - Windows 10/11                      |                   |  - Ubuntu 24.04+ (or 22.04 LTS)       |
|  - Native mDNS resolver               |                   |  - Avahi mDNS daemon                  |
|  - 'evoting-ca.crt' in LocalMachine   |                   |  - 'evoting-ca.crt' in system CA store|
|  - Accesses: https://evoting.local    |                   |  - Accesses: https://evoting.local    |
+---------------------------------------+                   +---------------------------------------+
```

---

## 1. Quick Start

### Step 1: Election Officer Laptop (Windows 11 Host)
1. Open PowerShell as **Administrator**.
2. Run the automated host setup script:
   ```powershell
   cd deployment\local-network
   .\setup-host.ps1
   ```
3. What this does automatically:
   - Starts Docker Desktop if not already running.
   - Detects the laptop's active physical LAN IP address.
   - Configures Windows Defender Firewall rules for port 80, 443, and 5353 (Private profile).
   - Starts Caddy in Docker alongside the application.
   - Exports Caddy's root CA certificate to `deployment/local-network/certs/evoting-ca.crt`.
   - Generates the SHA-256 fingerprint in `certs/evoting-ca.sha256`.
   - Starts the background mDNS responder service (`CampusEVoting-mDNS`).
   - Verifies local name resolution and HTTPS readiness.

### Step 2: Configure Voting Booths

Distribute the generated `certs/` folder (containing `evoting-ca.crt` and `evoting-ca.sha256`) to the voting booth machines via USB drive, network share, or local setup bundle.

#### For Windows 11 / 10 Voting Booths:
1. Open PowerShell as **Administrator** on the booth.
2. Run:
   ```powershell
   .\setup-booth-windows.ps1
   ```
3. The script verifies the SHA-256 fingerprint, installs the Root CA into `Cert:\LocalMachine\Root`, tests mDNS resolution of `evoting.local`, and verifies HTTPS connectivity.

#### For Ubuntu Linux (24.04+ / 22.04) Voting Booths:
1. Open terminal on the booth.
2. Run:
   ```bash
   sudo bash setup-booth-ubuntu.sh
   ```
3. The script installs Avahi, verifies mDNS resolution, installs the Root CA into the system CA store (`update-ca-certificates`), and configures Chrome/Chromium & Firefox trust policies.

---

## 2. File Index

| File | Purpose |
|---|---|
| `Caddyfile` | Reverse proxy configuration: internal CA, security headers, proxying to `frontend:80`. |
| `docker-compose.caddy.yml` | Docker Compose overlay adding Caddy on ports 80 & 443 with persistent CA volumes. |
| `evoting-mdns-responder.py` | Standalone Python mDNS daemon advertising `evoting.local` and tracking DHCP changes. |
| `setup-host.ps1` | Windows 11 host setup: Docker, Caddy, Firewall, mDNS scheduled task, and CA export. |
| `uninstall-host.ps1` | Clean reversal of host changes: removes task, firewall rules, host CA, and stops Caddy. |
| `setup-booth-windows.ps1` | Automated Windows booth setup: CA installation, mDNS check, and HTTPS validation. |
| `setup-booth-ubuntu.sh` | Automated Ubuntu booth setup: Avahi configuration, system CA, and browser trust. |
| `test-dhcp-change.ps1` | Automated test script verifying dynamic IP change handling and mDNS recovery. |
| `certs/` | Holds the exported public `evoting-ca.crt` and `evoting-ca.sha256`. |
| `logs/` | Runtime logs for the mDNS responder daemon. |
| `TESTING.md` | Comprehensive 16-point verification checklist and test procedures. |
| `SECURITY_REPORT.md` | Security assessment and controls verification report. |

---

## 3. How DHCP Changes Are Handled

1. The laptop starts with an IP (e.g. `192.168.1.10`).
2. `evoting-mdns-responder.py` monitors the active network interface every 2 seconds.
3. When the router renews DHCP or changes the IP (e.g. to `192.168.1.25`):
   - The responder detects the difference.
   - It issues mDNS farewell packets (TTL 0) for the old IP address.
   - It re-initializes on the new IP address and broadcasts unsolicited announcement packets.
4. All voting booths immediately receive the update. The URL `https://evoting.local` continues to work with zero booth reconfiguration.

---

## 4. Teardown / Uninstallation

To cleanly restore the Election Officer laptop after the election:
```powershell
cd deployment\local-network
.\uninstall-host.ps1
```
This stops the mDNS task, removes firewall rules, removes the local CA from the host store, and stops Caddy, leaving the core application database and containers completely untouched.
