# Multi-Tier Network Diagnostics & Disconnection Protection

## Overview
Because the Campus E-Voting System (CEVS) connects to a certified central election tally service over public HTTPS, physical booths require reliable network connectivity. The network diagnostic system provides granular diagnostics that distinguish between local physical interface faults, local router/gateway issues, DNS resolution failures, and remote API degradation.

---

## 1. The 6-Tier Diagnostic Probe

When polling officers press `Ctrl + Alt + Shift + N` or trigger diagnostics from the maintenance panel, `GET /api/maintenance/diagnostics` evaluates six independent network tiers:

```
[ Tier 1: Physical Interface ] ──> eth0/wlan0 link state & local IP
           │
[ Tier 2: Local Gateway ]     ──> Default router reachability (e.g. 192.168.1.1)
           │
[ Tier 3: DNS Resolution ]    ──> Recursive resolution query (dns.google / cloudflare.com)
           │
[ Tier 4: Public Internet ]   ──> WAN egress handshake to 1.1.1.1 / 8.8.8.8 (port 53/443)
           │
[ Tier 5: Public HTTPS ]      ──> Valid TLS 1.3 handshake to voting endpoint
           │
[ Tier 6: Application API ]   ──> PostgreSQL database ping & ballot transaction health
```

---

## 2. Real-Time Offline Protective Overlay

The React frontend includes `frontend/src/components/Kiosk/NetworkOfflineOverlay.jsx`.

### Protective Behaviors:
1. **Immediate Full-Screen Shield**: If the browser fires `window.addEventListener('offline')` or backend heartbeat fails, the entire screen transitions to a high-contrast protective shield:
   * **Title**: `Terminal Temporarily Offline`
   * **Message**: Reassures the voter that no ballot data has been lost and requests them to notify the presiding officer.
   * **Integrity Guard**: Prevents any in-flight or partial ballot submissions while transmission cannot be cryptographically guaranteed.
2. **Exponential Reconnection Poll**: Continuously polls the backend healthcheck endpoint every 3 seconds.
3. **State Preservation**: The voter's step-by-step selections in memory are preserved. Once the connection is re-established, the shield automatically lifts without reloading the page or losing current step selections.
4. **Staff Shortcut Access**: Presiding staff can immediately press `Ctrl + Alt + Shift + N` to inspect which tier failed (e.g. unplugged Ethernet cable vs DNS failure).
