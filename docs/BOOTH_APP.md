# Booth app for Windows and Linux

`booth-app/` is a desktop app that turns any Windows or Linux computer into a voting booth without creating special users or locking down the whole system. It opens the portal's `/kiosk/vote` page full screen and prints the vote copy silently.

## What it does

| | |
|---|---|
| First start | Setup screen: portal address (must end with `/kiosk/vote`), printer (list of installed printers, test page), start with the computer |
| Locked | Full screen, always on top, only the portal address can load, no new windows, developer tools off, browser shortcuts blocked |
| Vote copy | Prints silently to the chosen printer. The officer's **Settings → Booth printing** (on/off, printer name, copies) applies. A copy is saved first in the app's data folder: `receipts/<date>/…html` and `receipts/receipts.jsonl` |
| Leaving | **Ctrl+Alt+Shift+Q** asks for the Election Officer's authenticator code (the same check as the website's maintenance screen: 5 wrong codes lock the check for 15 minutes). Then: Return to voting, Address and printer, Quit. It returns to voting by itself after 15 minutes |
| Network lost | A "Cannot reach the voting portal" screen retries every 5 seconds |

## Install

Get the files from GitHub (Actions → **Booth app** → Run workflow → download the artifacts; a tag `booth-app-vX.Y.Z` also attaches them to a release).

* **Windows:** run the `Setup … .exe`. It is not code-signed, so SmartScreen says "Windows protected your PC": More info → Run anyway.
* **Linux:** `.AppImage` (make it executable and run it) or `.deb` (`sudo apt install ./file.deb`).

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
