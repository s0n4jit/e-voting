# Booth Maintenance Screen

The maintenance screen in the official desktop booth app lets authorised election officers and technical staff refresh the voting screen, re-test printers, restart the booth app, or safely exit without exposing a desktop or OS to voters.

---

## Opening Maintenance

| Shortcut | Action |
|---|---|
| `Ctrl + Alt + Shift + Q` | Opens Officer / Technician Authentication dialog |

On the booth screen, press **Ctrl + Alt + Shift + Q** (or click the emergency exit icon if visible on unconfigured/offline screens):

1. **Election Officer Code:** Enter the current 6-digit authenticator code (TOTP) from an Election Officer's authenticator app.
2. **Emergency Technician Bypass Code:**
   - In situations where the kiosk has not yet been registered with a booth token, or if the server network is temporarily unreachable, technical staff can enter the emergency bypass code:
     `2026-9999`
   - This bypass immediately unlocks the maintenance mode so the machine can be re-addressed, restarted, or cleanly shut down.

---

## Security & Lockout

- After 5 incorrect attempts, unlocking is locked out for 15 minutes.
- When unlocked, maintenance options are presented:
  - **Return to voting:** Returns immediately to full-screen locked kiosk mode.
  - **Refresh voting page:** Reloads the active voting portal session.
  - **Restart booth app:** Relaunches the booth application from scratch.
  - **Address and printer:** Re-configures the server URL or test-prints to the connected printer.
  - **Check for app updates:** Checks GitHub releases for newer booth app versions.
  - **Reboot computer:** Issues a clean restart to the computer.
  - **Quit the app:** Closes the booth app and cleanly restores the Windows Taskbar and Start button.
- An unlocked maintenance session returns to the locked voting screen automatically after 15 minutes of inactivity.
