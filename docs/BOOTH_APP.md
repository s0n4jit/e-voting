# Booth app for Windows and Linux

`booth-app/` is a desktop app that turns any Windows or Linux computer into a voting booth without creating special users or locking down the whole system. It opens the portal's `/kiosk/vote` page full screen and prints the vote copy silently.

## What it does

| Feature | Description |
|---|---|
| First start | Setup screen: portal address (must end with `/kiosk/vote`), printer (list of installed printers, test page), start with the computer |
| Locked | Full screen, always on top, only the portal address can load, no new windows, developer tools off, browser shortcuts blocked |
| Central Storage | The booth machine is 100% stateless: every voter slip and vector PDF is streamed directly to the central election server via `/api/booth/receipt-upload`. No receipts are kept on the kiosk disk |
| Silent Printing | After each vote the vote copy prints silently to the chosen printer without opening a dialog. The officer's **Settings → Booth printing** applies |
| Auto-updater | Automatically checks for releases on GitHub (`s0n4jit/e-voting`) using `electron-updater`. Updates download silently in the background and install when the app restarts. Officers can also click **Check for updates** in the maintenance screen |
| Leaving | **Ctrl+Alt+Shift+Q** asks for the Election Officer's authenticator code (5 wrong codes lock the check for 15 minutes). Unlocks into Maintenance mode: Return to voting, Refresh voting page, Restart booth app, Address and printer, Check for updates, Reboot computer, Quit. It returns to voting by itself after 15 minutes |
| Network lost | A "Cannot reach the voting portal" screen retries every 5 seconds |

## Install

Download buttons and the setup steps are in the officer panel: **Voting booths → Setup guide → Booth app**. They link to the GitHub release `booth-app-latest`, which the **Booth app** workflow (Actions → Booth app → Run workflow) creates and publishes on every run or git release tag.

* **Windows:** run the `Setup … .exe`. It is not code-signed, so SmartScreen says "Windows protected your PC": More info → Run anyway.
* **Linux (Ubuntu 22.04 / 24.04 tested in a container):** `.deb` is the simplest: `sudo apt install ./evote-booth_1.0.0_amd64.deb`, then start *Campus E-Voting Booth* from the applications menu. Or the `.AppImage`: `chmod +x *.AppImage && ./*.AppImage` (on Ubuntu 24.04 install `libfuse2t64` first, or run it with `--appimage-extract-and-run`). Both start the app with `--no-sandbox`, which Ubuntu 23.10+ needs because it blocks the browser sandbox for normal users.

Then start **Campus E-Voting Booth**, fill in the setup screen, press **Save and start voting**. Approve the booth with a booth token as usual (see `KIOSK_SETUP.md`, "Start the booth and approve it").

Printer: install it in the operating system first (Windows: Settings → Printers; Linux: Settings → Printers or `http://localhost:631`). The app lists what the system has.

## Auto-Updates

The app includes automatic updater capabilities powered by `electron-updater`:
- Background update check: Runs 6 seconds after boot, and periodically every 4 hours.
- Manual update check: Open Maintenance screen (**Ctrl+Alt+Shift+Q** -> Authenticator code) and click **Check for updates**.
- Manifest and packages: GitHub Actions builds upload `latest.yml`, `latest-linux.yml`, and blockmap files alongside executable binaries to GitHub releases (`s0n4jit/e-voting`).

## Uninstallation

To cleanly remove the booth application, terminate background processes, and clean up shortcuts/registry entries:

* **Windows (Batch script):** Run `scripts\uninstall-booth.bat` (double click or run as administrator).
* **Windows (PowerShell):** Run `powershell -ExecutionPolicy Bypass -File scripts\uninstall-booth.ps1` (supports `-PurgeData` flag to delete receipts).
* **Linux (Bash):** Run `chmod +x scripts/uninstall-booth.sh && ./scripts/uninstall-booth.sh` (supports `--purge-data`).

Both uninstallers prompt whether you wish to keep or remove saved audit receipts.

## Where things are kept

* Windows:
  * Program files: `%LOCALAPPDATA%\Programs\evote-booth`
  * Settings and official receipts: `%APPDATA%\Campus E-Voting Booth\receipts`
  * Practice / Mock receipts: `%APPDATA%\Campus E-Voting Booth\mockelection`
* Linux:
  * Settings and receipts: `~/.config/Campus E-Voting Booth/receipts`
  * Practice / Mock receipts: `~/.config/Campus E-Voting Booth/mockelection`
  * Agent receipts: `/var/lib/evote/receipts` and `/var/lib/evote/mockelection`

A vote copy links a Voter Slip ID to the choices made. Keep that folder under the same control as the ballot box, and export it before wiping the computer.

## What an app cannot block

The app locks its own window and the page. It cannot stop the operating system's own shortcuts. For a stricter booth add a system lock:

* **Windows:** use an ordinary (non-administrator) account for the booth, and Group Policy or Assigned Access (single-app kiosk) to hide the Start menu and task manager; or run the booth only on a PC that voters cannot reach with a keyboard. Ctrl+Alt+Del cannot be blocked by any app.
* **Linux:** run it in a dedicated session (for example the `cage` Wayland kiosk compositor), or use the lab-PC installer for the browser-based booth (`KIOSK_SETUP.md`).
