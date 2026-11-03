# Voting Booth Setup

Voting booths run the official **Campus E-Voting Booth** desktop application on Windows and Linux terminals.

For full setup instructions, download links, auto-update information, and lockdown details, please refer to:

- [Booth App Guide (Windows & Linux)](BOOTH_APP.md)
- In-portal Officer Guide: **Voting booths → Setup guide**

## Quick Start

1. **Download:** Get the installer for your OS:
   - Windows: `Campus-E-Voting-Booth-Setup.exe`
   - Ubuntu / Debian: `evote-booth_amd64.deb`
   - Linux: `Campus-E-Voting-Booth.AppImage`
2. **First Launch:** Enter your election portal address (e.g. `https://evote.campus.internal/kiosk/vote`) and select the connected receipt printer.
3. **Lockdown Mode:** The app enters locked full-screen kiosk mode, blocking operating system shortcuts, window switching, and external navigation.
4. **Approve Booth:** On the election officer panel under **Voting booths**, click **Generate booth token** and type the token and your 2FA authenticator code on the booth terminal.
5. **Officer Exit:** Press `Ctrl + Alt + Shift + Q` on the booth and enter your authenticator code to access maintenance options.
