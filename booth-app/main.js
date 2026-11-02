'use strict';
// Campus E-Voting booth app: setup screen, full-screen locked voting page, silent receipt printing,
// and an exit that needs the Election Officer's authenticator code.
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, net, session, shell } = require('electron');
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
const spoolDir = () => path.join(app.getPath('userData'), 'receipts');

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
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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

const toPdf = (html) => withPage(html, (wc) => wc.printToPDF({ pageSize: 'A5', printBackground: false, margins: { top: 0, bottom: 0, left: 0, right: 0 } }));

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
      { silent: true, printBackground: false, deviceName: target, copies, margins: { marginType: 'none' } },
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
  const html = receipt.toHtml(r);
  let saved;
  try {
    saved = receipt.archive(spoolDir(), r);
  } catch (e) {
    return { archived: false, printed: false, error: `could not save the copy: ${e.message}` };
  }
  let pdf = '';
  try {
    pdf = await savePdf(saved, html); // a PDF of every vote copy, kept with the others
  } catch (e) {
    console.error('PDF copy failed:', e.message); // the HTML copy is already safe; printing still goes ahead
  }
  try {
    await printHtml(html, r.printer || cfg.printer, r.copies);
    return { archived: true, printed: true, pdf };
  } catch (e) {
    return { archived: true, printed: false, error: e.message, pdf };
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
  const html = receipt.toHtml(r);
  try {
    const how = await printHtml(html, printer, 1);
    if (how === 'pdf') {
      fs.mkdirSync(spoolDir(), { recursive: true });
      const file = path.join(spoolDir(), `test-${Date.now()}.pdf`);
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
ui('maint:setup', () => showUi('setup.html', { maintenance: '1' }));
ui('maint:receipts', () => shell.openPath(spoolDir()));
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
