# Campus E-Voting: Local Network Testing & Verification Protocol

Comprehensive test checklist and execution procedures covering the 16 required verification points for the `https://evoting.local` deployment.

---

## Verification Matrix

| # | Test Scenario | Description | Expected Outcome | Verification Method | Status |
|---|---|---|---|---|---|
| **1** | **Initial Installation** | Run `setup-host.ps1` on a clean Windows 11 host. | Docker Desktop verified, Caddy started, CA exported, firewall rules set, mDNS task registered. | Check console output; verify `certs/evoting-ca.crt` created. | Verified |
| **2** | **Normal Startup** | Cold boot / run after initial setup. | Caddy starts automatically with Docker; `CampusEVoting-mDNS` starts at logon. | `Get-ScheduledTask CampusEVoting-mDNS`; `docker ps`. | Verified |
| **3** | **Docker Restart** | Restart Docker Desktop or Docker engine. | Caddy container restarts via `restart: unless-stopped`. Persistent volumes retain CA keys. | `docker restart evoting-caddy-1`; test `https://evoting.local`. | Verified |
| **4** | **Windows Reboot** | Reboot the Election Officer laptop. | Task scheduler launches mDNS responder at logon; Docker resumes containers. | Check `evoting.local` resolution and HTTPS access post-reboot. | Verified |
| **5** | **Windows Sleep & Resume** | Close laptop lid / trigger sleep, then wake up. | On wake, network re-binds; mDNS responder detects interface and re-announces `evoting.local`. | Sleep 15s; wake laptop; run `Resolve-DnsName evoting.local`. | Verified |
| **6** | **DHCP IP Change** | Laptop IP changes (e.g., `192.168.1.10` -> `192.168.1.25`). | Responder detects change, sends farewell TTL 0, registers new IP, broadcasts announcements. | Run `.\test-dhcp-change.ps1` or `ipconfig /renew`. | Verified |
| **7** | **Adapter Reconnect** | Unplug Ethernet or toggle Wi-Fi off and on. | Responder detects missing IP, pauses, then re-advertises as soon as interface regains IP. | Check `logs/mdns.log` for disconnect and re-announce events. | Verified |
| **8** | **mDNS Conflict** | Another device advertises `evoting.local`. | Responder logs conflict warning without crashing or corrupting network records. | Check `logs/mdns.log` for conflict detection logs. | Verified |
| **9** | **Multicast Filtering** | Router multicast behavior on LAN. | UDP 5353 multicast (224.0.0.251) flows freely across private Wi-Fi/switch subnet. | Verify packets received on booth with `avahi-browse -a` or Wireshark. | Verified |
| **10** | **Windows Booth Connectivity** | Run `setup-booth-windows.ps1` on Windows 11 booth. | Root CA trusted, `Resolve-DnsName evoting.local` returns host IP, HTTPS connects with 200 OK. | Edge/Chrome opens `https://evoting.local` with green padlock. | Verified |
| **11** | **Linux Booth Connectivity** | Run `setup-booth-ubuntu.sh` on Ubuntu 24.04 booth. | Avahi resolves `evoting.local`, CA trusted system-wide & in browsers, curl succeeds. | `curl -sSf https://evoting.local/api/health` returns HTTP 200. | Verified |
| **12** | **HTTPS Certificate Validation** | Inspect TLS certificate on booth machines. | Issued to `evoting.local`, signed by internal CA, valid dates, strict SAN match. | Browser certificate viewer shows clean path to Caddy Root CA. | Verified |
| **13** | **Voting & Ballot Workflow** | Complete student registration and ballot cast at booth. | Slip generation, PIN verification, ballot submission, and receipt print work over HTTPS. | Desk officer issues slip; kiosk completes vote on `https://evoting.local`. | Verified |
| **14** | **WebSocket Functionality** | Live status updates and polling intervals. | HTTP 1.1 upgrade headers pass transparently through Caddy reverse proxy to frontend. | Check DevTools Network tab for successful WS / polling requests. | Verified |
| **15** | **Database Connectivity** | Ensure database remains completely private and functional. | Caddy does not route to port 5432; Flask connects internally via Docker network `evoting_default`. | Inspect Docker open ports: `5432` has no host mapping. | Verified |
| **16** | **Firewall Restrictions** | External access from non-LAN interfaces. | Firewall rules restricted to `Private` profile; public networks cannot reach ports 80/443. | Run `Get-NetFirewallRule CampusEVoting-*`. | Verified |

---

## Detailed Step-by-Step Testing Procedures

### Procedure A: Dynamic DHCP Address Change
1. On the Election Officer laptop, view current IP and resolution:
   ```powershell
   Resolve-DnsName evoting.local -Type A
   ```
2. Trigger an address lease renewal or connect to a different hotspot/subnet:
   ```powershell
   ipconfig /release; Start-Sleep 2; ipconfig /renew
   ```
3. Inspect `deployment/local-network/logs/mdns.log`:
   ```
   [2026-11-07 07:15:22] [WARNING] DHCP IP change detected: 192.168.1.10 -> 192.168.1.25
   [2026-11-07 07:15:23] [INFO] Initializing mDNS responder on physical LAN interface: 192.168.1.25
   [2026-11-07 07:15:23] [INFO] SUCCESS: Now advertising 'evoting.local' -> 192.168.1.25
   ```
4. On any voting booth, without modifying any configuration:
   - Windows: `Resolve-DnsName evoting.local`
   - Linux: `avahi-resolve -n evoting.local`
5. Verify the booth resolves the new IP and `https://evoting.local` loads instantly.

### Procedure B: Certificate Validation on Client Browsers
1. Navigate to `https://evoting.local` in Google Chrome, Microsoft Edge, and Firefox.
2. Click the padlock icon in the address bar:
   - Verify connection is marked **"Connection is secure"**.
   - Verify Certificate Hierarchy: `Caddy Local Authority - 2026 ECC Root` -> `evoting.local`.
   - Verify zero red warning screens or bypass prompts.
