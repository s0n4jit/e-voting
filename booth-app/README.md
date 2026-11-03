# Campus E-Voting Booth (desktop app)

A full-screen voting booth for Windows and Linux. It shows the portal's `/kiosk/vote` page and nothing else.

* **First start:** a setup screen asks for the portal address and the printer (with a test page).
* **Locked:** full screen, no address bar, no other websites, no new windows, no developer tools.
* **Silent printing & Central Stream:** after each vote the vote copy prints without a dialog, and the vector PDF is streamed directly to the central election server via real-time receipt archiving.
* **100% Stateless Kiosk:** no voter receipts, ballots, or PDFs are kept on the booth machine's hard drive; all archiving and audits reside centrally on the election server.
* **Automatic updater:** integrates `electron-updater` to discover, download, and install newer versions from GitHub Releases (`s0n4jit/e-voting`).
* **Leaving:** press **Ctrl+Alt+Shift+Q**, enter the Election Officer's current authenticator code. The booth unlocks into a maintenance screen (Return to voting, Address and printer, Check for updates, Quit). It returns to voting by itself after 15 minutes.
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

Data (configuration only):
- Windows: `%APPDATA%\Campus E-Voting Booth\config.json`
- Linux: `~/.config/Campus E-Voting Booth/config.json`
