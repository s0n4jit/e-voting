'use strict';
// Campus E-Voting booth app: setup screen, full-screen locked voting page, silent receipt printing,
// and an exit that needs the Election Officer's authenticator code.
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, net, session } = require('electron');
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
const spoolDir = () => path.join(app.getPath('userData'), 'receipts');

let cfg = config.DEFAULTS;
let mainWin = null;
let promptWin = null;
let uiWin = null;
let allowQuit = false;
let apiBase = '';
let resumeTimer = null;

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
  fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Campus E-Voting Booth\nExec="${process.env.APPIMAGE || process.execPath}"\nX-GNOME-Autostart-enabled=true\n`);
}

async function installedPrinters() {
  const wc = (mainWin || uiWin)?.webContents;
  return wc ? wc.getPrintersAsync() : [];
}

/** Print an HTML page silently on the chosen printer (the default printer when the name is empty or unknown). */
async function printHtml(html, wanted, copies = 1) {
  if (process.env.EVOTE_DRY_PRINT) return; // tests: go through everything except the physical printer
  const printers = await installedPrinters();
  const known = printers.find((p) => p.name === wanted);
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve, reject) => {
      win.webContents.print(
        { silent: true, printBackground: false, deviceName: known ? known.name : '', copies, margins: { marginType: 'none' } },
        (ok, reason) => (ok ? resolve() : reject(new Error(reason || 'the printer did not accept the job'))),
      );
    });
  } finally {
    win.destroy();
  }
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

function startKiosk() {
  if (mainWin) {
    mainWin.loadURL(cfg.url);
    return;
  }
  Menu.setApplicationMenu(null);
  mainWin = new BrowserWindow({
    fullscreen: true, kiosk: true, frame: false, show: false, backgroundColor: '#0f1330', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-page.js'), contextIsolation: true, sandbox: true, nodeIntegration: false,
      devTools: false, spellcheck: false, backgroundThrottling: false,
    },
  });
  mainWin.setAlwaysOnTop(true, 'screen-saver');
  const wc = mainWin.webContents;
  wc.setVisualZoomLevelLimits(1, 1);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  const guard = (e, url) => { if (!url.startsWith(`${config.originOf(cfg.url)}/`)) e.preventDefault(); };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key.toLowerCase();
    const ctrl = input.control || input.meta;
    if (ctrl && input.alt && input.shift && k === 'q') { e.preventDefault(); openExitPrompt(); return; }
    const blocked = ['f5', 'f11', 'f12'].includes(k)
      || (ctrl && ['r', 'w', 'p', 'u', 'l', 'n', 't', 's', '+', '-', '=', '0'].includes(k))
      || (ctrl && input.shift && ['i', 'j', 'c', 'r'].includes(k))
      || (input.alt && ['arrowleft', 'arrowright', 'home'].includes(k));
    if (blocked) e.preventDefault();
  });
  wc.on('did-fail-load', (_e, code, _d, url, isMain) => {
    if (!isMain || code === -3) return; // -3: aborted by a new navigation
    mainWin.loadFile(path.join(UI_DIR, 'offline.html'), { query: { u: cfg.url } });
  });
  mainWin.on('close', (e) => { if (!allowQuit) e.preventDefault(); });
  mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.loadURL(cfg.url);
}

function enterKiosk() {
  clearTimeout(resumeTimer);
  if (uiWin) uiWin.destroy();
  if (!mainWin) return startKiosk();
  mainWin.setKiosk(true);
  mainWin.setAlwaysOnTop(true, 'screen-saver');
  mainWin.show();
  mainWin.focus();
}

function openExitPrompt() {
  if (promptWin || !mainWin) return;
  promptWin = new BrowserWindow({
    width: 440, height: 320, frame: false, resizable: false, alwaysOnTop: true, parent: mainWin, modal: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-ui.js'), contextIsolation: true, sandbox: true },
  });
  promptWin.setAlwaysOnTop(true, 'screen-saver');
  promptWin.loadFile(path.join(UI_DIR, 'exit.html'));
  promptWin.once('ready-to-show', () => promptWin.show());
  promptWin.on('closed', () => { promptWin = null; });
}

function leaveKiosk() {
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
  const base = apiBase || `${config.originOf(cfg.url)}/api`;
  try {
    const res = await net.fetch(`${base}/maintenance/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: String(code || '').replace(/\D/g, '').slice(0, 8) }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.authenticated) return { ok: true };
    return { ok: false, message: body.message || 'The code was not accepted.' };
  } catch {
    return { ok: false, message: 'Cannot reach the server. Check the network and try again.' };
  }
}

// ── IPC ────────────────────────────────────────────────────────────────────
ipcMain.handle('print-receipt', async (event, raw) => {
  if (!fromPortal(event)) return { archived: false, printed: false, error: 'not allowed' };
  const r = receipt.normalize(raw);
  try {
    receipt.archive(spoolDir(), r);
  } catch (e) {
    return { archived: false, printed: false, error: `could not save the copy: ${e.message}` };
  }
  try {
    await printHtml(receipt.toHtml(r), r.printer || cfg.printer, r.copies);
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
  const r = receipt.normalize({ institution: 'Printer test', election: 'Campus E-Voting Booth', slip: 'TEST-000000', booth: 'TEST', time: new Date().toLocaleString(), lines: [{ position: 'President', choice: 'Sample Candidate' }, { position: 'Secretary', choice: 'NOTA' }] });
  try {
    await printHtml(receipt.toHtml(r), printer, 1);
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
ui('maint:setup', () => showUi('setup.html', { maintenance: '1' }));
ui('maint:quit', () => { allowQuit = true; app.quit(); });

// ── start ──────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  cfg = config.load(cfgFile());
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

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('second-instance', () => { if (mainWin) mainWin.focus(); });
app.on('window-all-closed', () => { if (allowQuit || !cfg.url) app.quit(); }); // closing the very first setup window ends the app
