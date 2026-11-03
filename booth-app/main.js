'use strict';
// Campus E-Voting booth app: setup screen, full-screen locked voting page, silent receipt printing,
// and an exit that needs the Election Officer's authenticator code.
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, net, session, shell, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const config = require('./lib/config');
const receipt = require('./lib/receipt');

const UI_DIR = path.join(__dirname, 'ui');
const UI_URL = pathToFileURL(UI_DIR).href;
const EXIT_KEYS = 'CommandOrControl+Alt+Shift+Q';
const MAINTENANCE_MINUTES = 15; // the booth returns to voting by itself after this long outside kiosk mode

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function cleanupLegacyLocalSpool() {
  try {
    const receiptsDir = path.join(app.getPath('userData'), 'receipts');
    const mockDir = path.join(app.getPath('userData'), 'mockelection');
    if (fs.existsSync(receiptsDir)) fs.rmSync(receiptsDir, { recursive: true, force: true });
    if (fs.existsSync(mockDir)) fs.rmSync(mockDir, { recursive: true, force: true });
  } catch (e) {
    console.warn('Legacy spool cleanup notice:', e?.message || e);
  }
}

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = true;
} catch (e) {
  // auto-updater unavailable in dev or test
}

function initAutoUpdater() {
  if (!autoUpdater || process.env.EVOTE_NO_UPDATE || !app.isPackaged) return;
  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
  });
  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Notice:', err?.message || err);
  });
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6000);
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 4 * 60 * 60 * 1000);
}

let cfg = config.DEFAULTS;
let mainWin = null;
let promptWin = null;
let uiWin = null;
let allowQuit = false;
let apiBase = '';
let resumeTimer = null;

// Ubuntu 23.10+ blocks the browser sandbox for unprivileged users (AppImage, .deb): without this the app does not start.
// The window only ever loads the portal, so the loss of the extra sandbox layer is accepted.
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');

if (!app.requestSingleInstanceLock()) app.quit();
if (process.env.EVOTE_NO_GPU) app.disableHardwareAcceleration();

// ── helpers ────────────────────────────────────────────────────────────────
const fromUi = (event) => String(event.senderFrame?.url || '').startsWith(UI_URL);
const fromPortal = (event) => {
  try {
    return cfg.url && new URL(event.senderFrame.url).origin === config.originOf(cfg.url);
  } catch {
    return false;
  }
};

function applyAutoStart() {
  app.setLoginItemSettings({ openAtLogin: cfg.autoStart });
  if (process.platform !== 'linux') return;
  const dir = path.join(os.homedir(), '.config', 'autostart');
  const file = path.join(dir, 'evote-booth.desktop');
  if (!cfg.autoStart) return fs.rmSync(file, { force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Campus E-Voting Booth\nExec="${process.env.APPIMAGE || process.execPath}" --no-sandbox\nX-GNOME-Autostart-enabled=true\n`);
}

async function installedPrinters() {
  const wc = (mainWin || uiWin)?.webContents;
  return wc ? wc.getPrintersAsync() : [];
}

// Printers that always ask for a file name (Windows "Microsoft Print to PDF" and the XPS writer): for those the app
// saves a PDF in the receipts folder by itself, with an automatic name, and does not send a print job.
const FILE_PRINTER = /print to pdf|xps document writer/i;

async function withPage(html, fn) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      javascript: false,
      backgroundThrottling: false,
    },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    // Allow styles and base64 logo image to layout and rasterize before printing
    await new Promise((r) => setTimeout(r, 450));
    return await fn(win.webContents);
  } finally {
    win.destroy();
  }
}

/** The system's default printer (Electron does not report it on Windows). Empty when it cannot be found. */
function defaultPrinterName() {
  const [cmd, args] = process.platform === 'win32'
    ? ['powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Printer | Where-Object Default).Name']]
    : ['lpstat', ['-d']];
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, out) => {
      if (err) return resolve('');
      const text = String(out).trim();
      resolve(process.platform === 'win32' ? text : (text.split(':')[1] || '').trim());
    });
  });
}

const toPdf = (html) => withPage(html, (wc) => wc.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } }));

/** Save the PDF next to the saved HTML copy of the same vote. */
async function savePdf(htmlFile, html) {
  const file = htmlFile.replace(/\.html$/, '.pdf');
  fs.writeFileSync(file, await toPdf(html), { mode: 0o600 });
  return file;
}

/** Print an HTML page silently on the chosen printer (the default printer when the name is empty or unknown). */
async function printHtml(html, wanted, copies = 1) {
  if (process.env.EVOTE_DRY_PRINT) return 'dry'; // tests: go through everything except the physical printer
  const printers = await installedPrinters();
  const named = printers.find((p) => p.name === wanted);
  const target = named ? named.name : (printers.find((p) => p.isDefault) || {}).name || await defaultPrinterName();
  if (FILE_PRINTER.test(target)) return 'pdf'; // the PDF copy is saved by the caller
  await withPage(html, (wc) => new Promise((resolve, reject) => {
    wc.print(
      {
        silent: true,
        printBackground: true,
        deviceName: target,
        copies,
        pageSize: 'A4',
        color: true,
        margins: { marginType: 'none' },
      },
      (ok, reason) => (ok ? resolve() : reject(new Error(reason || 'the printer did not accept the job'))),
    );
  }));
  return 'printed';
}

// ── windows ────────────────────────────────────────────────────────────────
function showUi(page, query = {}, opts = {}) {
  if (uiWin) uiWin.destroy();
  uiWin = new BrowserWindow({
    width: 680, height: 760, title: 'Campus E-Voting Booth', autoHideMenuBar: true, alwaysOnTop: !!mainWin, ...opts,
    webPreferences: { preload: path.join(__dirname, 'preload-ui.js'), contextIsolation: true, sandbox: true },
  });
  uiWin.setMenu(null);
  uiWin.loadFile(path.join(UI_DIR, page), { query });
  uiWin.on('closed', () => { uiWin = null; });
}

let lockdownProc = null;

function getLockdownBinPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, 'bin', 'win-lockdown.exe');
  }
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'win-lockdown.exe');
}

function startWindowsLockdown() {
  if (process.platform !== 'win32') return;
  stopWindowsLockdown();
  try {
    const binPath = getLockdownBinPath();
    if (fs.existsSync(binPath)) {
      const { spawn } = require('child_process');
      lockdownProc = spawn(binPath, [], {
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true,
      });
      lockdownProc.on('error', (e) => console.warn('Lockdown hook notice:', e?.message));
    }
  } catch (e) {
    console.warn('Could not launch Windows lockdown hook:', e?.message);
  }
}

function stopWindowsLockdown() {
  if (lockdownProc) {
    try {
      lockdownProc.stdin.write('exit\n');
      lockdownProc.stdin.end();
    } catch (_) {}
    lockdownProc = null;
  }
  if (process.platform === 'win32') {
    try {
      const binPath = getLockdownBinPath();
      if (fs.existsSync(binPath)) {
        const { execFileSync } = require('child_process');
        execFileSync(binPath, ['restore'], { windowsHide: true });
      }
    } catch (_) {}
  }
}

const SWALLOWED_SHORTCUTS = [
  'Super+S',
  'Super+R',
  'Super+X',
  'Super+E',
  'Super+A',
  'Super+I',
  'Super+D',
  'Super+L',
  'Control+Shift+Escape',
  'Control+Escape',
  'Alt+Tab',
  'Alt+F4',
  'Alt+Escape',
  'Alt+Space',
  'CommandOrControl+Escape',
  'CommandOrControl+W',
  'CommandOrControl+Q',
  'CommandOrControl+R',
  'CommandOrControl+Shift+R',
  'F5',
  'F11',
];

function registerLockdownShortcuts() {
  for (const sc of SWALLOWED_SHORTCUTS) {
    try {
      globalShortcut.register(sc, () => {});
    } catch (_) {}
  }
}

function unregisterLockdownShortcuts() {
  for (const sc of SWALLOWED_SHORTCUTS) {
    try {
      globalShortcut.unregister(sc);
    } catch (_) {}
  }
}

function startKiosk() {
  if (mainWin) {
    mainWin.loadURL(cfg.url);
    return;
  }
  Menu.setApplicationMenu(null);
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  mainWin = new BrowserWindow({
    x,
    y,
    width,
    height,
    fullscreen: true,
    kiosk: true,
    frame: false,
    show: false,
    backgroundColor: '#0f1330',
    autoHideMenuBar: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-page.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  mainWin.setAlwaysOnTop(true, 'screen-saver', 1);
  mainWin.setResizable(false);
  mainWin.setMovable(false);
  mainWin.on('will-resize', (e) => e.preventDefault());
  mainWin.on('will-move', (e) => e.preventDefault());
  const wc = mainWin.webContents;
  wc.on('dom-ready', () => {
    try {
      wc.setVisualZoomLevelLimits(1, 1);
    } catch (_) {}
  });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  const guard = (e, url) => { if (!url.startsWith(`${config.originOf(cfg.url)}/`)) e.preventDefault(); };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);

  // Disable context menu and browser navigation buttons
  wc.on('context-menu', (e) => e.preventDefault());
  wc.on('app-command', (e, cmd) => {
    if (cmd === 'browser-backward' || cmd === 'browser-forward') {
      e.preventDefault();
    }
  });
  wc.on('did-navigate-in-page', () => {
    wc.clearHistory();
  });

  // Strict input lockdown: only allow typing voter slip ID / digits, and officer unlock shortcut
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = (input.key || '').toLowerCase();
    const ctrl = Boolean(input.control || input.meta);

    // 1. Officer exit shortcut: Ctrl+Alt+Shift+Q
    if (ctrl && input.alt && input.shift && k === 'q') {
      e.preventDefault();
      openExitPrompt();
      return;
    }

    // 2. Swallow any Meta / Windows / Super key
    if (input.meta) {
      e.preventDefault();
      return;
    }

    // 3. Swallow ALL Alt combinations (Alt+Tab, Alt+F4, Alt+Esc, Alt+Space, etc.)
    if (input.alt) {
      e.preventDefault();
      return;
    }

    // 4. Swallow ALL Control combinations (Ctrl+W, Ctrl+R, Ctrl+N, Ctrl+T, Ctrl+Q, Ctrl+Shift+..., etc.)
    if (input.control) {
      e.preventDefault();
      return;
    }

    // 5. Swallow all Function keys (F1-F12)
    if (/^f\d+$/i.test(k)) {
      e.preventDefault();
      return;
    }

    // 6. Swallow Escape
    if (k === 'escape') {
      e.preventDefault();
      return;
    }
  });

  // Automatically reclaim focus if any background notification or OS element attempts to blur
  mainWin.on('blur', () => {
    if (!promptWin && !uiWin && mainWin && !mainWin.isDestroyed()) {
      setImmediate(() => {
        try {
          mainWin.setAlwaysOnTop(true, 'screen-saver', 1);
          mainWin.moveTop();
          mainWin.focus();
        } catch (_) {}
      });
    }
  });

  wc.on('did-fail-load', (_e, code, _d, url, isMain) => {
    if (!isMain || code === -3) return; // -3: aborted by a new navigation
    mainWin.loadFile(path.join(UI_DIR, 'offline.html'), { query: { u: cfg.url } });
  });
  mainWin.on('close', (e) => { if (!allowQuit) e.preventDefault(); });
  mainWin.once('ready-to-show', () => {
    try {
      const pd = screen.getPrimaryDisplay();
      mainWin.setBounds(pd.bounds);
      mainWin.setFullScreen(true);
      mainWin.setKiosk(true);
      mainWin.setResizable(false);
      mainWin.setMovable(false);
    } catch (_) {}
    mainWin.show();
    mainWin.focus();
  });
  mainWin.loadURL(cfg.url);
  registerLockdownShortcuts();
  startWindowsLockdown();
}

function enterKiosk() {
  clearTimeout(resumeTimer);
  if (uiWin) uiWin.destroy();
  if (!mainWin) return startKiosk();
  try {
    const pd = screen.getPrimaryDisplay();
    mainWin.setBounds(pd.bounds);
    mainWin.setFullScreen(true);
    mainWin.setKiosk(true);
    mainWin.setResizable(false);
    mainWin.setMovable(false);
  } catch (_) {}
  mainWin.setAlwaysOnTop(true, 'screen-saver', 1);
  mainWin.show();
  mainWin.focus();
  registerLockdownShortcuts();
  startWindowsLockdown();
}

function openExitPrompt() {
  if (promptWin || !mainWin) return;
  promptWin = new BrowserWindow({
    width: 440, height: 320, frame: false, resizable: false, alwaysOnTop: true, parent: mainWin, modal: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-ui.js'), contextIsolation: true, sandbox: true },
  });
  promptWin.setAlwaysOnTop(true, 'screen-saver', 1);
  promptWin.loadFile(path.join(UI_DIR, 'exit.html'));
  promptWin.once('ready-to-show', () => promptWin.show());
  promptWin.on('closed', () => { promptWin = null; });
}

function leaveKiosk() {
  stopWindowsLockdown();
  unregisterLockdownShortcuts();
  mainWin.setKiosk(false);
  mainWin.setAlwaysOnTop(false);
  mainWin.minimize();
  showUi('maintenance.html');
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(enterKiosk, MAINTENANCE_MINUTES * 60 * 1000);
}

// ── officer code ───────────────────────────────────────────────────────────
// The same check the website's maintenance screen uses: the current authenticator code of an Election Officer.
async function verifyOfficerCode(code) {
  const clean = String(code || '').trim().replace(/\D/g, '');
  const base = apiBase || `${config.originOf(cfg.url)}/api`;

  let serverOnline = false;
  let authResponse = null;

  // 1. Try online verification against the Election Officer authenticator on the server
  try {
    const res = await net.fetch(`${base}/maintenance/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: clean.slice(0, 8) }),
    });
    serverOnline = true;
    authResponse = await res.json().catch(() => ({}));
    if (res.ok && authResponse.authenticated) {
      return { ok: true };
    }
  } catch (netErr) {
    serverOnline = false;
  }

  // If the server IS online: ONLY the officer's real authenticator TOTP code is accepted!
  // Offline bypass codes are strictly disallowed while the server is live.
  if (serverOnline) {
    return {
      ok: false,
      message: (authResponse && authResponse.message) || 'Invalid Election Officer authenticator code.',
    };
  }

  // 2. If the server is UNREACHABLE or booth is not yet set up:
  // Allow the configured Emergency Offline Exit PIN (set during initial booth setup, default 888888)
  const emergencyPin = String(cfg.exitCode || '888888').trim();
  if (clean && clean === emergencyPin) {
    return { ok: true, emergency: true };
  }

  return {
    ok: false,
    message: 'Server unreachable. Enter your configured offline emergency PIN to unlock.',
  };
}

async function uploadReceiptToServer(r, html, pdfBuffer) {
  let targetOrigin = '';
  try {
    if (cfg.url) targetOrigin = new URL(cfg.url).origin;
  } catch {}
  if (!targetOrigin && apiBase) {
    targetOrigin = apiBase.replace(/\/api\/?$/, '');
  }
  if (!targetOrigin) targetOrigin = 'http://localhost:8080';

  const form = new FormData();
  form.append('slip_id', r.slip || '');
  form.append('election_id', String(r.election_id || ''));
  form.append('booth_name', r.booth || 'Booth');
  form.append('is_mock', String(Boolean(r.is_mock)));
  form.append('choices', JSON.stringify(r.lines || []));
  form.append('html', html || '');
  if (pdfBuffer) {
    form.append('pdf', new Blob([pdfBuffer], { type: 'application/pdf' }), `${r.slip}.pdf`);
  }

  await fetch(`${targetOrigin}/api/booth/receipt-upload`, {
    method: 'POST',
    body: form,
  });
}

// ── IPC ────────────────────────────────────────────────────────────────────
ipcMain.handle('print-receipt', async (event, raw) => {
  if (!fromPortal(event)) return { archived: false, printed: false, error: 'not allowed' };
  const r = receipt.normalize(raw);
  const html = receipt.toHtml(r);
  let pdfBuffer = null;

  try {
    pdfBuffer = await toPdf(html);
  } catch (e) {
    console.warn('PDF render error:', e.message);
  }

  // Real-time stream to the central election server (no local disk storage)
  uploadReceiptToServer(r, html, pdfBuffer).catch((e) => {
    console.warn('Real-time receipt upload failed:', e.message);
  });

  try {
    await printHtml(html, r.printer || cfg.printer, r.copies);
    return { archived: true, printed: true };
  } catch (e) {
    return { archived: true, printed: false, error: e.message };
  }
});

const ui = (name, fn) => ipcMain.handle(name, (event, ...args) => (fromUi(event) ? fn(...args) : { error: 'not allowed' }));
ui('cfg:get', () => cfg);
ui('printers', async () => (await installedPrinters()).map((p) => ({ name: p.name, isDefault: p.isDefault })));
ui('cfg:save', (next) => {
  const { value, error } = config.validate(next);
  if (error) return { error };
  cfg = config.save(cfgFile(), value);
  applyAutoStart();
  setTimeout(enterKiosk, 100);
  if (mainWin) mainWin.loadURL(cfg.url);
  return { ok: true };
});
ui('print-test', async (printer) => {
  let branding = {};
  try {
    const origin = config.originOf(cfg.url) || 'http://localhost:8080';
    const res = await fetch(`${origin}/api/setup/status`);
    const data = await res.json();
    branding = data.branding || {};
  } catch {}
  const r = receipt.normalize({
    institution: branding.institution_name || 'Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga',
    election: "Students' Union Election 2026-27 (test)",
    slip: 'TEST-000000',
    booth: 'TEST-BOOTH',
    time: new Date().toLocaleString(),
    logo: branding.logo || '',
    lines: [
      { position: 'President', choice: 'Sample Candidate' },
      { position: 'Secretary', choice: 'NOTA' },
    ],
  });
  const html = receipt.toHtml(r);
  try {
    const how = await printHtml(html, printer, 1);
    if (how === 'pdf') {
      const file = path.join(os.tmpdir(), `test-print-${Date.now()}.pdf`);
      fs.writeFileSync(file, await toPdf(html));
      return { ok: true, file };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ui('exit:verify', async (code) => {
  const res = await verifyOfficerCode(code);
  if (res.ok) {
    if (promptWin) promptWin.destroy();
    leaveKiosk();
  }
  return res;
});
ui('exit:cancel', () => { if (promptWin) promptWin.destroy(); });
ui('maint:resume', enterKiosk);
ui('maint:reload', () => {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.reload();
  }
  enterKiosk();
  return { ok: true };
});
ui('maint:relaunch', () => {
  allowQuit = true;
  stopWindowsLockdown();
  app.relaunch();
  app.exit(0);
});
ui('maint:reboot', () => {
  allowQuit = true;
  if (process.platform === 'win32') {
    execFile('shutdown', ['/r', '/t', '2', '/f'], () => {});
  } else {
    execFile('systemctl', ['reboot'], (err) => {
      if (err) execFile('shutdown', ['-r', 'now'], () => {});
    });
  }
  setTimeout(() => {
    app.exit(0);
  }, 1000);
});
ui('maint:setup', () => showUi('setup.html', { maintenance: '1' }));
// Centralized receipts storage: managed on the central election server
ui('updater:check', async () => {
  if (!autoUpdater || !app.isPackaged) {
    return { ok: false, message: 'Auto-updater is active only in packaged builds.' };
  }
  try {
    autoUpdater.allowPrerelease = true;
    const res = await autoUpdater.checkForUpdates();
    const ver = res?.updateInfo?.version;
    if (ver && ver !== app.getVersion()) {
      return { ok: true, version: ver };
    }
    return { ok: true, message: `Current version (v${app.getVersion()}) is up to date.` };
  } catch (err) {
    return { ok: false, message: err?.message || 'Error checking for updates.' };
  }
});
ui('maint:quit', () => {
  allowQuit = true;
  stopWindowsLockdown();
  app.exit(0);
});

// ── start ──────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  cfg = config.load(cfgFile());
  cleanupLegacyLocalSpool();
  initAutoUpdater();
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  // Remember where the portal's API lives (it can be another host) so the exit code can be checked there.
  ses.webRequest.onBeforeRequest({ urls: ['*://*/api/*'] }, (details, cb) => {
    const i = details.url.indexOf('/api/');
    if (i > 0) apiBase = `${details.url.slice(0, i)}/api`;
    cb({});
  });
  globalShortcut.register(EXIT_KEYS, openExitPrompt);
  if (cfg.url) {
    applyAutoStart();
    startKiosk();
  } else {
    showUi('setup.html', { first: '1' });
  }
});

app.on('will-quit', () => { stopWindowsLockdown(); globalShortcut.unregisterAll(); });
app.on('second-instance', () => { if (mainWin) mainWin.focus(); });
app.on('window-all-closed', () => { if (allowQuit || !cfg.url) app.quit(); }); // closing the very first setup window ends the app
