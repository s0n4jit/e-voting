# Voting booth setup (Linux)

A **voting booth** is a Linux computer locked down so that it can only show the voting page, `/kiosk/vote`. Votes are accepted only from computers set up this way. This page is also available in the officer panel under **Voting booths → Setup guide**.

## 1. Requirements

- **Ubuntu** (24.04 or 26.04 LTS, tested design), **Debian**, **Fedora / RHEL family** or **Arch** (including derivatives such as Mint, Manjaro and Rocky) with **GNOME and GDM**, 4 GB RAM or more, a reliable network connection to the portal. The installer detects the distribution by itself (check with `sudo bash setup-kiosk.sh --detect`) and installs Firefox the way that distribution ships it: Snap on Ubuntu, `firefox-esr` on Debian, `dnf` on Fedora, `pacman` on Arch. Only Ubuntu has been exercised on real hardware; the other families are new. Desktops other than GNOME/GDM (KDE, XFCE, LightDM, SDDM) are not supported.
- An administrator account with `sudo`, and `openssh-server` so the booth can be managed remotely (the locked-down screen has no terminal)
- The portal's HTTPS address, for example `https://evote.campus.internal`
- Internet access during installation (the script installs Firefox if it is missing)
- An Election Officer account with two-step verification, and the officer's phone with the authenticator app

```bash
sudo apt update
sudo apt install -y git openssh-server
```

## 2. Install the lock-down

> **Where and as whom:** every command in sections 2 to 4 is typed in a **terminal on the booth computer** (open it with Ctrl+Alt+T), logged in as your **administrator account** (the one with `sudo`), **not** as `evote`. The `evote` booth user has no terminal on purpose. Commands starting with `sudo` ask for the administrator's password.

*Administrator account, terminal on the booth computer:*

```bash
cd /opt
sudo git clone https://github.com/s0n4jit/e-voting.git
cd /opt/e-voting/kiosk/ubuntu
sudo VOTING_URL="https://evote.campus.internal/kiosk/vote" bash setup-kiosk.sh
```

Run it with `sudo` from your own account: the account that runs `sudo` becomes the owner of the saved vote copies. The installer asks for a password for the `evote` booth user (Enter generates one and shows it at the end: write it down).

Options (put them before `bash`): `AUTOLOGIN=yes` signs `evote` in by itself at start-up; `EVOTE_PASSWORD=...` sets its password without asking; `BLOCK_USB_STORAGE=yes` blocks USB sticks.

The installer:

1. creates a restricted user `evote` (no admin rights) with the password you chose; it is **not** signed in automatically unless you use `AUTOLOGIN=yes`;
2. installs Firefox and gives the `evote` user its own browser profile that can reach **only the booth address** (a proxy rule), in full-screen kiosk mode with no address bar, tabs or developer tools. There is **no machine-wide browser policy**: your administrator account browses normally;
3. locks GNOME shortcuts (Alt+Tab, Ctrl+Alt+T, screenshots, hot corners, idle sleep, log out) **for the `evote` user only**: your administrator account keeps a normal desktop;
4. installs `evote-kiosk.service`, a user service with a crash watchdog that restarts the browser;
5. installs the **booth agent** (silent printing and a saved copy of every vote copy), CUPS, and the `evote` maintenance command;
6. installs a tightly limited sudoers file (`/etc/sudoers.d/evote-maintenance`).

The booth address is written to `/etc/default/evote-kiosk` and `/etc/evote/booth.conf` and added to the browser policy. To change it later, run the script again, or: `sudo evote url set https://…/kiosk/vote`.

## 3. Connect the printer

*Administrator account, on the booth computer, before switching to `evote`.* Plug in the printer and power it on, then add it in **Settings → Printers → Add Printer** (or in Firefox at `http://localhost:631`, Administration → Add Printer). Then, in a terminal:

```bash
sudo evote printer list                     # shows the printer names: copy yours exactly
sudo evote printer set "PRINTER_NAME"       # makes it the booth printer
sudo evote printer test                     # a test page must come out
sudo evote status                           # portal address, agent, printer, network, saved copies
```

The printer is shared by every user of the computer, so `evote` uses it without any setup. Printing options for all booths (on/off, printer name, copies) are in the officer panel under **Settings → Booth printing**. More in [`BOOTH_PRINTING.md`](BOOTH_PRINTING.md).

## 4. Start the booth and approve it

1. *Booth computer:* restart (`sudo reboot`). At the login screen choose **`evote`** and enter its password. (Choose your own account instead whenever you need to do administrator work.)
2. *Officer panel, in a browser on any computer:* open **Voting booths** and press **Generate booth token**. The token works once and expires after 15 minutes.
3. *Booth screen (logged in as `evote`):* it shows **Set up this voting booth**. Enter the token and the **current 6-digit code from the Election Officer's authenticator app**. The code must belong to the officer who generated the token.
4. The booth is created with an automatic ID for the running election (`BOOTH-01`, `BOOTH-02`, …). The browser keeps a booth token; only a hash of it is stored on the server.

A booth takes votes only while its election is in **Voting active**, and only for that election. Deleting the booth in the panel revokes it immediately: within seconds the booth returns to the set-up screen, and a new token and code are needed to set it up again.

### Maintenance (administrator account, terminal on the booth computer)

```bash
sudo evote                       # menu
sudo evote restart-browser       # booth browser
sudo evote network status        # network; also: network connect "WiFi" "password"
sudo evote receipts count        # saved vote copies; also: receipts check, receipts export /media/$USER/STICK
sudo evote autologin on          # or off: sign evote in automatically or not
sudo evote reboot
```

The saved vote copies are in `~/.evote-receipts` of the administrator who ran the installer.

## 5. What the booth can do

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

## 6. Hardware checklist

Software lock-down does not stop someone with physical access. Before opening the polling station:

1. Set a UEFI/BIOS supervisor password and disable booting from USB or external media.
2. Enable Secure Boot.
3. Block unused USB and network ports; secure the chassis (for example a Kensington lock).
4. Fit a privacy filter on the monitor.

## 7. Remove a booth / use the computer normally again

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
