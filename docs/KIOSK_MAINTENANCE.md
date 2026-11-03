# Booth Maintenance Screen

The maintenance screen in the official desktop booth app lets authorised election officers refresh the voting screen, re-test printers, restart the booth app, or reboot the terminal computer without exposing a desktop or OS to voters.

## Opening Maintenance

| Shortcut | Action |
|---|---|
| `Ctrl + Alt + Shift + Q` | Opens Officer Authentication dialog |

On the booth, press **Ctrl + Alt + Shift + Q** and enter the **current 6-digit authenticator code (TOTP) of an Election Officer**.

- After 5 incorrect attempts, unlocking is locked out for 15 minutes.
- When unlocked, maintenance options are presented:
  - **Return to voting:** Returns immediately to full-screen locked kiosk mode.
  - **Refresh voting page:** Reloads the active voting portal session.
  - **Restart booth app:** Relaunches the booth application from scratch.
  - **Address and printer:** Re-configures the server URL or test-prints to the connected printer.
  - **Check for app updates:** Checks GitHub releases for newer booth app versions.
  - **Reboot computer:** Issues a clean restart to the computer.
  - **Quit the app:** Closes the booth app.
- An unlocked maintenance session returns to the locked voting screen automatically after 15 minutes of inactivity.
