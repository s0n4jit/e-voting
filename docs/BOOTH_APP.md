# Booth app for Windows and Linux

`booth-app/` is a dedicated cross-platform desktop application that turns any Windows or Linux computer into a secure, locked-down voting booth without requiring custom user accounts or manual OS configuration. It opens the portal's `/kiosk/vote` endpoint full screen, blocks unauthorized access to the operating system, and handles silent receipt printing.

---

## What it does

| Feature | Description |
|---|---|
| **First Start** | Setup screen: portal address (e.g. `http://server:8080/kiosk/vote`), printer selection (lists all installed printers, test page), and autostart option |
| **OS Lockdown (Windows)** | Uses a native C++ low-level hook (`win-lockdown.exe`) to intercept and block Windows keys, `Win+S`, `Win+R`, `Win+E`, `Win+X`, `Win+Tab`, `Alt+Tab`, `Alt+Esc`, `Alt+F4`, `Ctrl+Esc`, and `Ctrl+Shift+Esc` (Task Manager). Automatically hides and locks the Windows Taskbar and Start button on launch, and restores them when exiting |
| **OS Lockdown (Linux)** | Enforces full-screen kiosk window state, disables window borders and resizing, and suppresses common desktop shortcuts |
| **Instant Process Kill** | Quitting the app cleanly and immediately terminates all associated helper processes (`win-lockdown.exe`, child Electron workers) with zero lingering processes |
| **Technician Bypass** | Pressing **Ctrl+Alt+Shift+Q** or clicking the emergency exit button opens an exit prompt supporting both the Officer's TOTP code and an offline **Emergency Technician Bypass Code** (`2026-9999`) for maintenance before/during/after booth activation |
| **100% Stateless Kiosk** | Zero voter receipts, ballots, or PDFs remain on the kiosk's hard drive. All receipt PDFs are streamed in real time to the central server via `/api/v1/booth/receipt-upload` |
| **Silent Printing** | The vote copy prints silently to the selected printer without displaying any operating system dialogs, adhering to the Election Officer's **Settings → Booth printing** configuration |
| **Auto-updater** | Integrates `electron-updater` to automatically check for releases on GitHub (`s0n4jit/e-voting`). Updates download silently in the background and install on application restart |
| **Sequential Slip Progression** | Displays the prefilled sequential Voter Slip ID for the booth (e.g. `SUE26-B1-1001`); voter enters the 4-digit voting PIN using the on-screen virtual numpad with mouse |
| **Seamless Voting UI** | Anchored top header, zero-gap sticky subheadings, 3-column ballot card grid with NOTA wrapping to line 2, and review autoscroll to the submit button |
| **Theme Control** | Kiosk theme defaults to White (Light mode) and hides the theme toggle unless explicitly enabled by the Election Officer in Settings |
| **Maintenance Mode** | **Ctrl+Alt+Shift+Q** unlocks the maintenance screen: *Return to voting*, *Refresh voting page*, *Restart booth app*, *Address & printer*, *Check for updates*, *Reboot local machine* (runs strictly via local agent, never server), and *Quit*. Resumes voting automatically after 15 minutes |
| **Network Resilience** | Displays an automatic retry overlay if the voting portal is unreachable, reconnecting seamlessly once service resumes |

---

## Installation

Installers are accessible from the Election Officer portal (**Voting booths → Setup guide → Booth app**) or from GitHub Releases (`booth-app-latest`):

* **Windows:** Run `Campus-E-Voting-Booth-Setup.exe`. If Windows SmartScreen appears: *More info → Run anyway*.
* **Linux (Ubuntu / Debian):** Run `sudo apt install ./evote-booth_amd64.deb`, then launch *Campus E-Voting Booth* from the application menu. Alternatively, use the standalone `.AppImage`: `chmod +x Campus-E-Voting-Booth.AppImage && ./Campus-E-Voting-Booth.AppImage`.

---

## Clean Uninstallation

To cleanly remove the booth application, terminate background lockdown hooks, and clean up shortcuts/registry entries:

* **Windows (Batch):** Run `scripts\uninstall-booth.bat` as Administrator.
* **Windows (PowerShell):** Run `powershell -ExecutionPolicy Bypass -File scripts\uninstall-booth.ps1` (supports `-PurgeData`).
* **Linux (Bash):** Run `chmod +x scripts/uninstall-booth.sh && ./scripts/uninstall-booth.sh` (supports `--purge-data`).

---

## Configuration Paths

* **Windows:** `%APPDATA%\Campus E-Voting Booth\config.json`
* **Linux:** `~/.config/Campus E-Voting Booth/config.json`
