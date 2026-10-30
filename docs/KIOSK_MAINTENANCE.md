# Staff-Only Maintenance System & Terminal Operations Runbook

## Overview
The Campus E-Voting System (CEVS) incorporates a concealed, cryptographically authenticated **Staff Maintenance Console** built directly into the voting booth interface. This mechanism allows authorized election officers to perform diagnostics, inspect network interfaces, restart browser processes, or gracefully reboot hardware without exposing underlying desktop or shell environments to student voters.

---

## 1. Maintenance Keyboard Shortcuts

The following global keyboard shortcuts are registered by `frontend/src/hooks/useMaintenanceShortcuts.js`:

| Keyboard Shortcut | Operation |
| :--- | :--- |
| **`Ctrl + Alt + Shift + M`** | Open Staff Maintenance Panel (PIN challenge) |
| **`Ctrl + Alt + Shift + N`** | Open directly to Network Diagnostics Tab |
| **`Ctrl + Alt + Shift + R`** | Open Terminal Reboot Confirmation Dialog |
| **`Ctrl + Alt + Shift + L`** | Return immediately to clean Voting Kiosk interface |
| **`Ctrl + Alt + Shift + T`** | Re-run full system and network connectivity probe |

---

## 2. Staff Authentication & Brute-Force Defense

* **PBKDF2/Salted Hash**: Staff PIN is validated exclusively via backend endpoint `POST /api/maintenance/auth`. The raw PIN is never stored in plaintext or logged.
* **Rate Limiting & Lockout**: After **5 consecutive failed attempts**, the terminal automatically locks down for **15 minutes (900 seconds)** (`HTTP 429 Too Many Requests`).
* **Session Inactivity Timeout**: If no mouse or keyboard input is detected within **5 minutes (300 seconds)** while unlocked, the maintenance session terminates automatically and returns to the welcome screen.
* **Short-Lived Maintenance JWT**: Upon successful PIN entry, a 15-minute JWT token is issued with claim `role: "staff_maintenance"`.

---

## 3. Allowlisted Maintenance Operations

The maintenance API enforces a strict allowlist. Arbitrary shell commands are completely impossible:

```python
PERMITTED_ACTIONS = {
    "restart_browser",
    "restart_kiosk",
    "restart_system",
    "test_network",
}
```

### Action Descriptions:
1. **Restart Firefox Kiosk (`restart_browser`)**:
   - Soft-restarts the browser process via `pkill -f firefox`.
   - Cleans temporary session locks and cache files.
   - The systemd watchdog launcher immediately brings up a clean, full-screen Firefox session.
2. **Restart Kiosk Session (`restart_kiosk`)**:
   - Executes `systemctl --user restart evote-kiosk.service`.
   - Re-initializes the Wayland graphical session.
3. **Reboot Booth Computer (`restart_system`)**:
   - Requires explicit second confirmation dialog on the UI.
   - Executes `/sbin/reboot` via allowlisted sudoers rule.
   - Machine reboots cleanly into the automatic `evote` session within ~25 seconds.

---

## 4. Emergency Administrative Terminal Access

If the web interface becomes unresponsive and cannot be accessed via keyboard shortcuts:

1. Connect a physical maintenance keyboard.
2. Switch to root virtual console (if enabled by election committee) using `Ctrl + Alt + F3`.
3. Log in using the dedicated Administrator account (NOT `evote`).
4. Inspect running service logs:
   ```bash
   # Inspect kiosk service status
   systemctl --user -M evote@ status evote-kiosk.service

   # View live journal logs
   journalctl -u evote-kiosk.service -f
   ```
