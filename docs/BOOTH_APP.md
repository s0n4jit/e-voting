# Booth app for Windows and Linux

`booth-app/` is a desktop app that turns any Windows or Linux computer into a voting booth without creating special users or locking down the whole system. It opens the portal's `/kiosk/vote` page full screen and prints the vote copy silently.

## What it does

| | |
|---|---|
| First start | Setup screen: portal address (must end with `/kiosk/vote`), printer (list of installed printers, test page), start with the computer |
| Locked | Full screen, always on top, only the portal address can load, no new windows, developer tools off, browser shortcuts blocked |
| Vote copy | Every vote copy is saved first in the app's data folder: `receipts/<date>/<time>-<slip>.html`, the same as a **PDF**, and a line in `receipts/receipts.jsonl`. Then it prints silently to the chosen printer. The officer's **Settings → Booth printing** (on/off, printer name, copies) applies |
| "Microsoft Print to PDF" | That Windows printer always asks for a file name, so the app does not use it: when it is the chosen (or default) printer, the saved PDF *is* the output and nothing pops up. **Maintenance → Open saved receipts** opens the folder |
| Leaving | **Ctrl+Alt+Shift+Q** asks for the Election Officer's authenticator code (the same check as the website's maintenance screen: 5 wrong codes lock the check for 15 minutes). Then: Return to voting, Address and printer, Quit. It returns to voting by itself after 15 minutes |
| Network lost | A "Cannot reach the voting portal" screen retries every 5 seconds |

## Install

Download buttons and the setup steps are in the officer panel: **Voting booths → Setup guide → Booth app**. They link to the GitHub release `booth-app-latest`, which the **Booth app** workflow (Actions → Booth app → Run workflow) creates and replaces on every run.

* **Windows:** run the `Setup … .exe`. It is not code-signed, so SmartScreen says "Windows protected your PC": More info → Run anyway.
* **Linux (Ubuntu 22.04 / 24.04 tested in a container):** `.deb` is the simplest: `sudo apt install ./evote-booth_1.0.0_amd64.deb`, then start *Campus E-Voting Booth* from the applications menu. Or the `.AppImage`: `chmod +x *.AppImage && ./*.AppImage` (on Ubuntu 24.04 install `libfuse2t64` first, or run it with `--appimage-extract-and-run`). Both start the app with `--no-sandbox`, which Ubuntu 23.10+ needs because it blocks the browser sandbox for normal users.

Then start **Campus E-Voting Booth**, fill in the setup screen, press **Save and start voting**. Approve the booth with a booth token as usual (see `KIOSK_SETUP.md`, "Start the booth and approve it").

Printer: install it in the operating system first (Windows: Settings → Printers; Linux: Settings → Printers or `http://localhost:631`). The app lists what the system has.

## Where things are kept

* Settings and saved vote copies: Windows `%APPDATA%\Campus E-Voting Booth`, Linux `~/.config/Campus E-Voting Booth`.
* A vote copy links a Voter Slip ID to the choices made. Keep that folder under the same control as the ballot box, and export it before wiping the computer.

## What an app cannot block

The app locks its own window and the page. It cannot stop the operating system's own shortcuts. For a stricter booth add a system lock:

* **Windows:** use an ordinary (non-administrator) account for the booth, and Group Policy or Assigned Access (single-app kiosk) to hide the Start menu and task manager; or run the booth only on a PC that voters cannot reach with a keyboard. Ctrl+Alt+Del cannot be blocked by any app.
* **Linux:** run it in a dedicated session (for example the `cage` Wayland kiosk compositor), or use the lab-PC installer for the browser-based booth (`KIOSK_SETUP.md`).

## Not included yet

Receipts are saved on the booth computer only. Storing them on the server (encrypted so only the officer can read them) is the next step.
