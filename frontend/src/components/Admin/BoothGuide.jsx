import React from 'react';
import { toast } from 'react-hot-toast';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';

const CopyBlock = ({ children }) => (
  <div className="relative group">
    <pre className="bg-recessed border border-line rounded-lg px-4 py-3 pr-12 text-xs sm:text-sm overflow-x-auto font-mono leading-relaxed">{children}</pre>
    <button
      type="button"
      className="absolute top-2 right-2 btn-ghost btn-sm p-1.5"
      aria-label="Copy commands"
      onClick={() => {
        navigator.clipboard?.writeText(children);
        toast.success('Copied');
      }}
    >
      <ClipboardDocumentIcon className="w-4 h-4" />
    </button>
  </div>
);

const Step = ({ n, title, children }) => (
  <section className="card card-body">
    <div className="flex items-center gap-3 mb-3">
      <span className="w-7 h-7 rounded-full bg-brand text-white text-sm font-semibold flex items-center justify-center shrink-0">{n}</span>
      <h2 className="font-semibold">{title}</h2>
    </div>
    <div className="space-y-3 text-sm text-muted [&_strong]:text-fg [&_code]:font-mono [&_code]:text-fg [&_code]:bg-recessed [&_code]:rounded [&_code]:px-1">{children}</div>
  </section>
);

const Row = ({ what, how }) => (
  <tr>
    <td className="align-top whitespace-normal font-medium">{what}</td>
    <td className="whitespace-normal font-mono text-xs">{how}</td>
  </tr>
);

const RELEASE = 'https://github.com/s0n4jit/e-voting/releases/download/booth-app-latest';
const DOWNLOADS = [
  { label: 'Windows installer (.exe)', file: 'Campus-E-Voting-Booth-Setup.exe' },
  { label: 'Ubuntu / Debian package (.deb)', file: 'evote-booth_amd64.deb' },
  { label: 'Linux AppImage', file: 'Campus-E-Voting-Booth.AppImage' },
];

/** Download and set up the desktop booth app (Windows and Linux). */
const AppSection = () => {
  const address = `${window.location.origin}/kiosk/vote`;
  return (
    <Step n="A" title="Booth app for Windows and Linux (recommended)">
      <p>
        A ready-made program that turns a computer into a full-screen voting booth: no special user or lock-down scripts are needed, it prints the
        vote copy silently, and it keeps a copy of every vote copy (HTML and PDF) on the computer. Download it on the booth computer:
      </p>
      <div className="flex flex-wrap gap-2">
        {DOWNLOADS.map((d) => (
          <a key={d.file} className="btn-primary" href={`${RELEASE}/${d.file}`} target="_blank" rel="noopener noreferrer">{d.label}</a>
        ))}
      </div>
      <p>If a download says the file is not found, the booth app has not been published yet: open the repository's <strong>Actions</strong> tab, run <strong>Booth app</strong>, then try again.</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li><strong>Install.</strong> Windows: run the <code>.exe</code> (SmartScreen shows "More info → Run anyway", the app is not code-signed). Ubuntu: <code>sudo apt install ./evote-booth_amd64.deb</code>, then start <strong>Campus E-Voting Booth</strong> from the applications menu.</li>
        <li><strong>Install the printer</strong> in the computer's own settings first.</li>
        <li><strong>First start:</strong> the setup screen asks for the portal address (use the one below) and the printer. Press <strong>Print a test page</strong>, then <strong>Save and start voting</strong>.</li>
        <li><strong>Approve the booth:</strong> on the <strong>Booths</strong> tab press <strong>Generate booth token</strong>, then enter the token and your authenticator code on the booth screen.</li>
        <li><strong>Leave the full screen</strong> with <code>Ctrl + Alt + Shift + Q</code> and the current authenticator code of an election officer. Maintenance offers Return to voting, Address and printer, Open saved receipts and Quit.</li>
      </ol>
      <p>Portal address to enter in the setup screen:</p>
      <CopyBlock>{address}</CopyBlock>
      <p>Printing options for all booths (on or off, printer name, copies) are in <strong>Settings → Booth printing</strong>. Saved copies are in <code>%APPDATA%\Campus E-Voting Booth\receipts</code> (Windows) or <code>~/.config/Campus E-Voting Booth/receipts</code> (Linux); treat them like the ballot box.</p>
    </Step>
  );
};

/** Ubuntu booth guide for the Election Officer / technician. */
export default function BoothGuide() {
  return (
    <div className="space-y-5 max-w-4xl">
      <section className="card card-body text-sm text-muted">
        <p>
          A <strong className="text-fg">voting booth</strong> is an Ubuntu computer locked down so it can only show the voting page{' '}
          <span className="font-mono text-fg">/kiosk/vote</span>. Votes are accepted only from computers set up this way. This guide covers
          the booth app, or alternatively installing the Linux lock-down, turning the computer into a booth, operating it, and turning it back into a normal computer.
        </p>
      </section>

      <AppSection />

      <Step n="1" title="What you need">
        <ul className="list-disc pl-5 space-y-1">
          <li>A computer with <strong>Ubuntu 24.04 or 26.04 LTS</strong> (GNOME on Wayland), at least 4 GB RAM, and a working network connection to the portal.</li>
          <li>An administrator (<code>sudo</code>) account, and <code>openssh-server</code> so you can manage the booth from another computer. The locked-down screen has no terminal.</li>
          <li>The portal's HTTPS address, for example <code>https://evote.campus.internal</code>.</li>
          <li>Internet access during installation (the script installs the Firefox snap).</li>
          <li>Your election officer account with two-step verification, and your phone with the authenticator app.</li>
        </ul>
        <CopyBlock>{`sudo apt update
sudo apt install -y git openssh-server`}</CopyBlock>
      </Step>

      <Step n="2" title="Install the lock-down on the computer">
        <p>
          <strong className="text-fg">Where and as whom:</strong> type these commands in a terminal <strong>on the booth computer</strong> (Ctrl+Alt+T), logged in
          as your <strong>administrator account</strong>, not as <code>evote</code> (the booth user has no terminal). Replace the address with your portal.
        </p>
        <CopyBlock>{`cd /opt
sudo git clone <repository-url> e-voting
cd /opt/e-voting/kiosk/ubuntu
sudo VOTING_URL="https://evote.campus.internal/kiosk/vote" bash setup-kiosk.sh`}</CopyBlock>
        <p>It asks for a password for the <code>evote</code> user (Enter generates one: write it down). Options before <code>bash</code>: <code>AUTOLOGIN=yes</code> to sign the booth in by itself.</p>
        <p>The installer:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>creates a restricted user <code>evote</code> (no admin rights, password chosen at install) that you pick on the login screen, or signs in automatically with <code>AUTOLOGIN=yes</code>;</li>
          <li>starts Firefox in full-screen kiosk mode for the <code>evote</code> user with its own profile that can reach <strong>only</strong> the booth address, with no address bar, tabs or developer tools (the administrator's browser is not restricted);</li>
          <li>locks desktop shortcuts (Alt+Tab, Ctrl+Alt+T, screenshots, hot corners) for the <code>evote</code> user only, so your administrator account stays normal;</li>
          <li>installs a service, <code>evote-kiosk.service</code>, that restarts the browser if it ever closes.</li>
        </ul>
      </Step>

      <Step n="3" title="Connect the printer (administrator account)">
        <p>Plug in and power on the printer, add it in <strong>Settings → Printers</strong> (or Firefox at <code>http://localhost:631</code>), then in a terminal as the administrator:</p>
        <CopyBlock>{`sudo evote printer list
sudo evote printer set "PRINTER_NAME"
sudo evote printer test
sudo evote status
sudo reboot`}</CopyBlock>
        <p>After the restart choose <strong>evote</strong> on the login screen. Printing options for all booths are under <strong>Settings → Booth printing</strong>. Vote copies are saved in <code>~/.evote-receipts</code> of the administrator who ran the installer.</p>
      </Step>

      <Step n="3b" title="Make it a booth">
        <ol className="list-decimal pl-5 space-y-1">
          <li>On the <strong>Booths</strong> tab of this page, press <strong>Generate booth token</strong>. The token works once and expires after 15 minutes.</li>
          <li>On the booth computer the screen shows <strong>Set up this voting booth</strong>. Enter the token and the current 6-digit code from your authenticator app.</li>
          <li>The booth gets its ID automatically for the running election (<code>BOOTH-01</code>, <code>BOOTH-02</code>, …) and shows the voter entry screen.</li>
        </ol>
        <p>A booth takes votes only while the election is <strong>Voting active</strong>, and only for its own election. It appears on the Booths tab as Online while it is running.</p>
      </Step>

      <Step n="4" title="What the booth can do, and how">
        <div className="table-container">
          <table className="table">
            <thead><tr><th>To do this</th><th>Use</th></tr></thead>
            <tbody>
              <Row what="Open the maintenance screen (unlock with your authenticator code)" how="Ctrl + Alt + Shift + M" />
              <Row what="Open network diagnostics directly" how="Ctrl + Alt + Shift + N" />
              <Row what="Restart or shut down the computer (asks to confirm)" how="Ctrl + Alt + Shift + R" />
              <Row what="Return to the voting screen" how="Ctrl + Alt + Shift + L" />
              <Row what="Re-run the network and server check" how="Ctrl + Alt + Shift + T" />
              <Row what="Check the kiosk service (from an admin account, e.g. over SSH)" how="sudo systemctl --user -M evote@ status evote-kiosk.service" />
              <Row what="Restart the kiosk browser" how="sudo systemctl --user -M evote@ restart evote-kiosk.service" />
              <Row what="Check the network" how="ip addr   ·   ping -c 3 evote.campus.internal" />
              <Row what="Restart the computer" how="sudo reboot" />
            </tbody>
          </table>
        </div>
        <p>Voters cannot reach a desktop, a terminal or other websites. A voter's screen clears itself after voting or after 5 minutes without activity.</p>
      </Step>

      <Step n="5" title="Remove a booth and use the computer normally again">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>Revoke the booth.</strong> On the Booths tab press <strong>Delete</strong> next to it. Its token stops working at once and the screen asks for set-up again. This is all you need to stop it taking votes.
          </li>
          <li>
            <strong>Remove the lock-down</strong> (only if the computer should become a normal workstation). From an admin account, for example over SSH:
            <CopyBlock>{`cd /opt/e-voting/kiosk/ubuntu
sudo bash rollback-kiosk.sh
sudo reboot`}</CopyBlock>
            This stops the service and restores the normal login, shortcuts, USB storage, text consoles and Firefox settings. To delete the <code>evote</code> user as well, run it with <code>--remove-user</code>.
            <CopyBlock>{`sudo bash rollback-kiosk.sh --remove-user`}</CopyBlock>
          </li>
          <li>Optional: remove Firefox if it was only installed for the booth: <code>sudo snap remove firefox</code>. Delete <code>/opt/e-voting</code> if you no longer need it.</li>
        </ol>
        <p>To use the computer as a booth again later, run the installer again (step 2) and set it up with a new booth token (step 3).</p>
      </Step>

      <Step n="6" title="If something is wrong">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>"Token or code is not correct":</strong> the token was already used, expired (15 minutes) or mistyped, or the authenticator code is from another officer. Generate a new token; use the code of the officer who generated it.</li>
          <li><strong>Booth goes back to set-up on its own:</strong> it was deleted on the Booths tab, or its election was archived. Generate a new token.</li>
          <li><strong>Offline on the Booths tab:</strong> check the network (<code>ip addr</code>, <code>ping</code>), then restart the kiosk service.</li>
          <li><strong>The page does not open:</strong> the address given at install time may be wrong. Edit <code>VOTING_URL</code> in <code>/etc/default/evote-kiosk</code> and restart the kiosk service.</li>
        </ul>
      </Step>
    </div>
  );
}
