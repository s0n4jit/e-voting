# Ubuntu voting booth kit

Scripts and policies that turn a Linux computer (Ubuntu, Debian, Fedora/RHEL family or Arch, with GNOME/GDM) into a locked-down voting booth. The installer detects the distribution automatically: `sudo bash setup-kiosk.sh --detect` prints what it found.

| File | Purpose |
|---|---|
| `setup-kiosk.sh` | Installer: restricted `evote` user, GDM auto-login, Firefox policy, GNOME lock-down, service, sudoers |
| `rollback-kiosk.sh` | Reverts everything (`--remove-user` also deletes the `evote` user) |
| `policies/policies.json` | Firefox enterprise policy: only `/kiosk/vote…` may be opened |
| `scripts/kiosk-launcher.sh` | Browser launcher with crash watchdog |
| `systemd/evote-kiosk.service` | User service that keeps the browser running |
| `gnome/` | dconf lock-down profile and `kiosk-lockdown.sh` (USB storage and text consoles) |
| `sudoers/evote-maintenance` | Minimal sudo rules for restarting the service and checking the network |

```bash
sudo VOTING_URL="https://evote.campus.internal/kiosk/vote" bash setup-kiosk.sh
sudo reboot
```

Full guide: [`docs/KIOSK_SETUP.md`](../../docs/KIOSK_SETUP.md) · maintenance screen: [`docs/KIOSK_MAINTENANCE.md`](../../docs/KIOSK_MAINTENANCE.md).
