# Voting booth setup (Ubuntu)

A **voting booth** is an Ubuntu computer locked down so that it can only show the voting page, `/kiosk/vote`. Votes are accepted only from computers set up this way. This page is also available in the officer panel under **Voting booths → Setup guide**.

## 1. Requirements

- Ubuntu **24.04 or 26.04 LTS** with GNOME on Wayland, 4 GB RAM or more, a reliable network connection to the portal
- An administrator account with `sudo`, and `openssh-server` so the booth can be managed remotely (the locked-down screen has no terminal)
- The portal's HTTPS address, for example `https://evote.campus.internal`
- Internet access during installation (the script installs the Firefox snap)
- An Election Officer account with two-step verification, and the officer's phone with the authenticator app

```bash
sudo apt update
sudo apt install -y git openssh-server
```

## 2. Install the lock-down

```bash
cd /opt
sudo git clone https://github.com/s0n4jit/e-voting.git
cd /opt/e-voting/kiosk/ubuntu
sudo VOTING_URL="https://evote.campus.internal/kiosk/vote" bash setup-kiosk.sh
sudo reboot
```

The installer:

1. creates a restricted user `evote` (locked password, no admin rights) that logs in automatically through GDM on Wayland;
2. installs the Firefox snap with an enterprise policy that blocks every address except `…/kiosk/vote…`, with no address bar, tabs, downloads, developer tools or `about:config`;
3. locks GNOME shortcuts (Alt+Tab, Ctrl+Alt+T, screenshots, hot corners, idle sleep) with dconf locks;
4. disables USB mass storage and the Ctrl+Alt+F1–F12 text consoles;
5. installs `evote-kiosk.service`, a user service with a crash watchdog that restarts the browser;
6. installs a tightly limited sudoers file (`/etc/sudoers.d/evote-maintenance`) for restarting the service and checking the network.

The booth address is stored in `/etc/default/evote-kiosk` (`VOTING_URL`). `/kiosk` and `/vote` redirect to `/kiosk/vote`, but the browser policy allows only `/kiosk/vote…`, so use that address.

## 3. Turn the computer into a booth

1. In the officer panel open **Voting booths** and press **Generate booth token**. The token works once and expires after 15 minutes.
2. On the booth computer, the screen shows **Set up this voting booth**. Enter the token and the **current 6-digit code from the Election Officer's authenticator app**. The code must belong to the officer who generated the token.
3. The booth is created with an automatic ID for the running election (`BOOTH-01`, `BOOTH-02`, …). The browser keeps a booth token; only a hash of it is stored on the server.

A booth takes votes only while its election is in **Voting active**, and only for that election. Deleting the booth in the panel revokes it immediately: within seconds the booth returns to the set-up screen, and a new token and code are needed to set it up again.

## 4. What the booth can do

| To do this | Use |
|---|---|
| Open the maintenance screen (unlock with an officer's authenticator code) | `Ctrl + Alt + Shift + M` |
| Open network diagnostics | `Ctrl + Alt + Shift + N` |
| Restart or shut down (asks to confirm) | `Ctrl + Alt + Shift + R` |
| Return to the voting screen | `Ctrl + Alt + Shift + L` |
| Re-run the network and server check | `Ctrl + Alt + Shift + T` |
| Kiosk service status | `sudo systemctl --user -M evote@ status evote-kiosk.service` |
| Restart the kiosk browser | `sudo systemctl --user -M evote@ restart evote-kiosk.service` |
| Live service log | `sudo journalctl --user -M evote@ -u evote-kiosk.service -f` |
| Network checks | `ip addr`, `ping -c 3 evote.campus.internal` |
| Restart the computer | `sudo reboot` |

Voters cannot reach a desktop, a terminal or other websites. A voter's screen clears itself after voting or after five minutes of inactivity.

## 5. Hardware checklist

Software lock-down does not stop someone with physical access. Before opening the polling station:

1. Set a UEFI/BIOS supervisor password and disable booting from USB or external media.
2. Enable Secure Boot.
3. Block unused USB and network ports; secure the chassis (for example a Kensington lock).
4. Fit a privacy filter on the monitor.

## 6. Remove a booth / use the computer normally again

1. **Revoke the booth.** In the officer panel press **Delete** next to it. Its token stops working at once.
2. **Remove the lock-down** (only if the computer becomes a normal workstation), from an admin account such as over SSH:

   ```bash
   cd /opt/e-voting/kiosk/ubuntu
   sudo bash rollback-kiosk.sh                 # stops the service, restores login, shortcuts, USB, consoles, Firefox settings
   sudo bash rollback-kiosk.sh --remove-user   # same, and deletes the 'evote' user
   sudo reboot
   ```

3. Optional: `sudo snap remove firefox` if Firefox was installed only for the booth; delete `/opt/e-voting`.

To use the computer as a booth again, run the installer again and set it up with a new booth token.
