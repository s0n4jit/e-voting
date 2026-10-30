# Operational Troubleshooting & Failure Recovery Runbook

## 1. Physical Polling Booth Issues

### Issue A: Kiosk Browser Shows "Terminal Temporarily Offline"
* **Cause**: Network cable unplugged, local gateway down, or DNS resolution failure.
* **Resolution**:
  1. Press **`Ctrl + Alt + Shift + N`** on the booth keyboard.
  2. Enter the Staff PIN (**`948201`**).
  3. Inspect the 6 diagnostic rows:
     * If *Physical Interface* is DOWN: Re-seat Ethernet cable.
     * If *Local Gateway* is UNREACHABLE: Check the computer lab switch or router.
     * If *DNS Resolution* is FAILED: Verify campus DNS server reachability.
  4. Once resolved, the offline overlay will clear automatically.

### Issue B: Voter Enters 6-Digit PIN but Gets "Invalid Student ID or Voting PIN"
* **Cause**: Typo in Student ID or PIN, PIN expired (20 min limit), or PIN already used.
* **Resolution**:
  1. Check the physical slip.
  2. Polling Desk Officer searches the student's ID at [http://localhost:3000/desk](http://localhost:3000/desk).
  3. If status is `Ready` or expired, issue a fresh 6-digit PIN slip.

### Issue C: Student Accidentally Closes or Freezes the Browser
* **Cause**: Firefox crash or unresponsiveness.
* **Resolution**:
  1. The systemd service `evote-kiosk.service` watchdog will automatically restart Firefox within 3 seconds.
  2. If frozen, press **`Ctrl + Alt + Shift + M`**, unlock maintenance, and click **Restart Firefox Kiosk**.

---

## 2. Windows Testing Lab Troubleshooting

### Issue A: `docker compose` Fails with Port Conflict
* **Cause**: Ports 3001, 5001, 5433, or 8080 already in use.
* **Resolution**:
  1. Check conflicting processes using `netstat -ano | findstr :3001`.
  2. Change mapped ports in `testing/kiosk-lab/.env.test`.
  3. Re-run `.\start.ps1`.

### Issue B: Linux noVNC Browser on Port 8080 Shows Black Screen
* **Cause**: The Chromium container is initializing its virtual X11 buffer.
* **Resolution**: Wait ~5 seconds and refresh [http://localhost:8080](http://localhost:8080).
