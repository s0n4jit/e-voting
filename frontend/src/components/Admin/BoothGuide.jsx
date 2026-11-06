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

const RELEASE = 'https://github.com/s0n4jit/e-voting/releases/download/booth-app-latest';
const DOWNLOADS = [
  { label: 'Windows installer (.exe)', file: 'Campus-E-Voting-Booth-Setup.exe' },
  { label: 'Ubuntu / Debian package (.deb)', file: 'evote-booth_amd64.deb' },
  { label: 'Linux AppImage', file: 'Campus-E-Voting-Booth.AppImage' },
];

/** Dedicated guide for setting up and operating voting booths with the desktop booth app. */
export default function BoothGuide() {
  const address = `${window.location.origin}/kiosk/vote`;

  return (
    <div className="space-y-5 max-w-4xl">
      <section className="card card-body text-sm text-muted">
        <p>
          A <strong className="text-fg">voting booth</strong> is a dedicated terminal running the official locked-down{' '}
          <strong>Campus E-Voting Booth</strong> application. It displays the voting interface, completely locks out the operating system,
          prints the voter receipt slip silently, and streams receipts in real-time directly to this central server.
        </p>
      </section>

      <Step n="1" title="Download and install the booth app">
        <p>
          Install the official desktop booth app on each kiosk computer (Windows or Linux). No special Linux users or scripts are needed.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 pb-2">
          <a className="btn-primary" href="/downloads/Campus-E-Voting-Booth-Setup.exe" download="Campus-E-Voting-Booth-Setup.exe">
            Download Windows Installer (.exe)
          </a>
          {DOWNLOADS.filter(d => d.file !== 'Campus-E-Voting-Booth-Setup.exe').map((d) => (
            <a key={d.file} className="btn-secondary" href={`${RELEASE}/${d.file}`} target="_blank" rel="noopener noreferrer">
              {d.label}
            </a>
          ))}
        </div>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Windows:</strong> Run <code>Campus-E-Voting-Booth-Setup.exe</code>. If Windows SmartScreen shows a prompt, click <em>More info → Run anyway</em>.</li>
          <li><strong>Ubuntu / Debian:</strong> Run <code>sudo apt install ./evote-booth_amd64.deb</code>, then launch <em>Campus E-Voting Booth</em> from your applications menu.</li>
          <li><strong>Linux (AppImage):</strong> Run <code>chmod +x Campus-E-Voting-Booth.AppImage && ./Campus-E-Voting-Booth.AppImage</code>.</li>
        </ul>
      </Step>

      <Step n="2" title="Initial setup on the booth computer">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Connect and power on the thermal or desktop printer in the operating system's settings.</li>
          <li>Launch the booth app. The first start setup screen will ask for the <strong>Portal Address</strong> and the <strong>Printer</strong>.</li>
          <li>Enter the portal address below, select your printer, and click <strong>Print a test page</strong>.</li>
        </ol>
        <p className="font-semibold text-fg">Portal address to enter in the setup screen:</p>
        <CopyBlock>{address}</CopyBlock>
        <p>Click <strong>Save and start voting</strong>. The booth will enter full-screen lockdown mode.</p>
      </Step>

      <Step n="3" title="Activate the booth">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>On the <strong>Booths</strong> tab of this officer portal, click <strong>Generate booth token</strong>. (Tokens are single-use and expire after 15 minutes).</li>
          <li>On the booth computer screen, enter the generated token and your current 6-digit authenticator code (TOTP).</li>
          <li>The booth terminal is assigned its unique ID (e.g. <code>BOOTH-01</code>) and displays the active voting screen.</li>
        </ol>
      </Step>

      <Step n="4" title="Security & lockdown behavior">
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Full Screen Lock:</strong> Native low-level hook blocks Windows keys, Alt+Tab, Alt+F4, Task Manager, Ctrl shortcuts, and hides the Taskbar/Start menu. Cleanly restores all system settings on exit.</li>
          <li><strong>Input Allowed:</strong> Only voter touchscreen/mouse clicks and numeric keypad/slip ID entry are accepted. Text highlighting and dragging are disabled.</li>
          <li><strong>Officer Maintenance:</strong> Press <code>Ctrl + Alt + Shift + Q</code> and enter your authenticator code (or the technician bypass code <code>2026-9999</code>) to access maintenance (Refresh, Restart app, Address & printer, Check updates, Reboot, or Quit).</li>
          <li><strong>Stateless Kiosk:</strong> All voter receipts stream directly to the central server in real time via <code>/api/v1/booth/receipt-upload</code>. Zero receipts or voter records remain on the booth machine.</li>
        </ul>
      </Step>

      <Step n="5" title="Troubleshooting">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>"Token or code is not correct":</strong> Ensure the 6-digit authenticator code belongs to the same Election Officer who generated the booth token.</li>
          <li><strong>Booth terminal offline:</strong> Verify the local network connection and ensure the booth computer can reach the portal server address.</li>
          <li><strong>Revoking a booth:</strong> To stop a booth terminal, click <strong>Delete</strong> on the Booths tab. Its token is invalidated immediately.</li>
        </ul>
      </Step>
    </div>
  );
}
