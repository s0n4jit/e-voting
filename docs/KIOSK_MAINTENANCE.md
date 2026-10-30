# Booth maintenance screen

The maintenance screen lets authorised staff check a booth, test its network and restart the browser or computer without exposing a desktop or shell to voters.

## Opening it

| Shortcut | Opens |
|---|---|
| `Ctrl + Alt + Shift + M` | Maintenance screen (asks for a code) |
| `Ctrl + Alt + Shift + N` | Network diagnostics tab |
| `Ctrl + Alt + Shift + R` | Restart / shut down confirmation |
| `Ctrl + Alt + Shift + L` | Back to the voting screen |
| `Ctrl + Alt + Shift + T` | Re-run the network and server check |

There is no visible button on the booth screen. The shortcuts work only on the booth page.

## Unlocking

The screen asks for the **current 6-digit authenticator code of an Election Officer**. There is no fixed PIN.

- After 5 wrong codes from one address, the screen locks for 15 minutes.
- An unlocked session ends after 5 minutes without activity, or after 15 minutes in total.
- Unlocking is recorded in the audit log.

## What it shows

- **Booth ID**, the election it belongs to, whether it is **accepting votes** or voting is not open, and the booth's session reference
- Operating system and uptime
- Network interfaces, gateway reachability, DNS, internet and the portal API status

## Actions

Only these actions exist; arbitrary commands are impossible.

| Action | Effect |
|---|---|
| `restart_browser` | Restarts the kiosk browser |
| `restart_kiosk` | Restarts the kiosk service |
| `restart_system` | Restarts the computer (asks to confirm) |
| `test_network` | Runs the connectivity probe |

Every action is written to the audit log with the booth's address.

## Related

[Booth setup on Ubuntu](KIOSK_SETUP.md) · [Troubleshooting](TROUBLESHOOTING.md)
