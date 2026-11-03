# Campus E-Voting Booth (desktop app)

A dedicated, full-screen voting booth application for Windows and Linux. It loads the portal's `/kiosk/vote` endpoint and strictly locks out the underlying operating system.

## Key Features

* **Locked-down Kiosk Environment:**
  * **Windows (Native C++ Hook):** Runs `bin/win-lockdown.exe` (low-level keyboard hook) to intercept and block all system shortcuts: Windows keys (`LWin`/`RWin`), `Win+S`, `Win+R`, `Win+E`, `Win+X`, `Win+D`, `Win+Tab`, `Alt+Tab`, `Alt+Esc`, `Alt+F4`, `Ctrl+Esc`, and `Ctrl+Shift+Esc` (Task Manager).
  * **Windows Taskbar Management:** Automatically hides and disables the Windows Taskbar and Start button on launch, and reliably restores them when exiting.
  * **Linux (X11 / Wayland):** Enforces full-screen kiosk window state, disables window decorations, and suppresses system key combinations.
  * **Process Lifecycle:** Instantly terminates all background helper processes upon exit (no lingering or orphaned processes).
* **First Start Setup:** Simple configuration screen to specify the portal address (e.g. `http://server:8080/kiosk/vote`), choose the thermal or desktop printer, and run a test print.
* **Emergency Technician Bypass Code:**
  * Technicians can press **Ctrl+Alt+Shift+Q** or click the emergency exit icon to enter the **Emergency Technician Bypass Code** (`2026-9999`).
  * Enables exit and maintenance even if the booth machine has not been activated with a booth token yet, or if the server network is temporarily unreachable.
* **100% Stateless Kiosk & Central Streamed Archiving:**
  * No voter receipts, ballots, or PDFs are ever stored on the booth machine's hard drive.
  * Each vote copy vector PDF is streamed in real-time directly to the central election server via `/api/v1/booth/receipt-upload`.
* **Silent Printing:**
  * After each vote, the vote copy prints silently to the selected printer without opening an operating system print dialog.
* **Real-time Silent Slip ID Verification & Auto-Jump:**
  * As the voter enters the 6-digit slip ID suffix (via the on-screen NumPad or physical keyboard), the booth silently verifies voter eligibility against `/api/v1/auth/voter-verify-slip`.
  * If valid, it immediately auto-jumps focus to the PIN input field.
* **Voting UX & Ballot Navigation:**
  * Fixed, non-scrolling top header showing institution logo, booth ID, live clock, and progress indicator.
  * Sticky candidate position and review subheadings with seamless zero-gap alignment.
  * 3 candidates per row (`grid-cols-3`) with NOTA wrapping naturally to the 2nd line when row 1 is full.
  * Large, prominent 1:1 square candidate photos and standardized department/semester format (`Department of <Name> | Semester: <Num><Ordinal>`).
  * Autoscroll to the "Submit my vote" button on the final review stage.
  * By default, the theme is locked to **White (Light mode)**; the theme toggle only appears if enabled by the Election Officer in Settings.
* **Automatic Updates:**
  * Integrates `electron-updater` to discover, silently download, and apply newer releases from GitHub Releases (`s0n4jit/e-voting`).
* **Maintenance Mode:**
  * Press **Ctrl+Alt+Shift+Q** and enter the Election Officer's authenticator code (or the Technician Bypass Code) to unlock maintenance options: *Return to voting*, *Refresh voting page*, *Restart booth app*, *Address & printer*, *Check for updates*, *Reboot computer*, and *Quit*. Automatically resumes voting after 15 minutes of inactivity.

---

## Installation

Download the installer from the Election Officer panel (**Voting booths → Setup guide → Booth app**) or from GitHub Releases (`booth-app-latest`):

* **Windows:** Run `Campus-E-Voting-Booth-Setup.exe`. (If Windows SmartScreen appears: *More info → Run anyway*).
* **Ubuntu / Debian:** Run `sudo apt install ./evote-booth_amd64.deb` and launch *Campus E-Voting Booth* from the application launcher.
* **Linux (AppImage):** Run `chmod +x Campus-E-Voting-Booth.AppImage && ./Campus-E-Voting-Booth.AppImage`.

---

## Clean Uninstallation

Clean uninstall scripts are provided in the `scripts/` directory:
* **Windows (Batch):** `scripts\uninstall-booth.bat` (Run as Administrator)
* **Windows (PowerShell):** `powershell -ExecutionPolicy Bypass -File scripts\uninstall-booth.ps1`
* **Linux (Bash):** `chmod +x scripts/uninstall-booth.sh && ./scripts/uninstall-booth.sh`

---

## Development

```bash
cd booth-app
npm install
node node_modules/electron/install.js   # Downloads Electron binary if needed
npm start                              # Start in dev mode
npm test                               # Run unit tests
npm run dist                           # Package distribution for the current OS
```

**Configuration paths:**
* Windows: `%APPDATA%\Campus E-Voting Booth\config.json`
* Linux: `~/.config/Campus E-Voting Booth/config.json`
