# Campus E-Voting Booth (desktop app)

A full-screen voting booth for Windows and Linux. It shows the portal's `/kiosk/vote` page and nothing else.

* **First start:** a setup screen asks for the portal address and the printer (with a test page).
* **Locked:** full screen, no address bar, no other websites, no new windows, no developer tools.
* **Silent printing:** after each vote the vote copy prints without a dialog, and a copy is kept in the app's data folder (`receipts/`).
* **Mock election separation:** practice ballots during mock elections are automatically routed to `mockelection/` with a clear practice watermark badge and logged to `mock-receipts.jsonl`.
* **Automatic updater:** integrates `electron-updater` to discover, download, and install newer versions from GitHub Releases (`s0n4jit/e-voting`).
* **Leaving:** press **Ctrl+Alt+Shift+Q**, enter the Election Officer's current authenticator code. The booth unlocks into a maintenance screen (Return to voting, Address and printer, Saved receipts, Mock receipts, Check for updates, Quit). It returns to voting by itself after 15 minutes.
* **Uninstallation:** clean uninstall scripts provided under `scripts/uninstall-booth.bat`, `scripts/uninstall-booth.ps1`, and `scripts/uninstall-booth.sh`.
* **No user needed:** it runs under any account and can start with the computer.

## Install

Download from the officer panel (Voting booths → Setup guide → "Booth app") or from the GitHub release "booth-app-latest" (created by GitHub Actions workflow).

* Windows: run `Campus-E-Voting-Booth-Setup.exe` (it is not code-signed, so Windows SmartScreen shows "More info → Run anyway").
* Linux: `chmod +x Campus-E-Voting-Booth.AppImage && ./Campus-E-Voting-Booth.AppImage`, or install the `.deb`.

## Develop

```bash
cd booth-app
npm install
node node_modules/electron/install.js   # downloads the Electron binary
npm start        # run
npm test         # unit tests
npm run dist:win # or dist:linux
```

Data (settings and saved receipts):
- Windows: `%APPDATA%\Campus E-Voting Booth` (official receipts in `receipts/`, practice in `mockelection/`)
- Linux: `~/.config/Campus E-Voting Booth` (official receipts in `receipts/`, practice in `mockelection/`)
