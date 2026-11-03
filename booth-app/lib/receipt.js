'use strict';
// The vote copy: validation, HTML for the printer, and the copy kept on this computer's disk.
// Single-column ballot layout formatted to fit strictly in the top half of an A4 page (height <= 135mm)
// so that one A4 sheet can be torn/split into 2 parts horizontally.
const fs = require('fs');
const path = require('path');

const clean = (v, limit = 80) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit).trim();
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Keep only what a receipt needs, with bounded plain-text fields (the page is untrusted input). */
function normalize(r = {}) {
  const logo = typeof r.logo === 'string' && (r.logo.startsWith('data:image/') || r.logo.startsWith('https://') || r.logo.startsWith('/')) ? r.logo : '';
  const isMock = Boolean(r.is_mock || r.mock || (typeof r.election === 'string' && /\bmock\b/i.test(r.election)));
  return {
    institution: clean(r.institution, 80),
    election: clean(r.election, 80),
    slip: clean(r.slip || r.slip_id, 40),
    booth: clean(r.booth, 20),
    time: clean(r.time, 40),
    printer: clean(r.printer, 120),
    logo: logo.slice(0, 500000), // bounded data URL or URL
    copies: Math.min(Math.max(parseInt(r.copies, 10) || 1, 1), 3),
    is_mock: isMock,
    lines: (Array.isArray(r.lines) ? r.lines : []).slice(0, 40).map((l) => ({ position: clean(l?.position, 40), choice: clean(l?.choice, 60) })),
  };
}

function toHtml(r) {
  const lines = Array.isArray(r.lines) ? r.lines : [];
  const rowHtml = (l) => `<tr><td class="p">${esc(l.position)}</td><td class="c">${esc(l.choice)}</td></tr>`;
  const tableRows = lines.map(rowHtml).join('');

  const logoHtml = r.logo ? `<img class="logo" src="${esc(r.logo)}" alt="Logo" />` : '';
  const isMock = Boolean(r.is_mock);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Vote copy ${esc(r.slip)}</title><style>
    @page { size: A4 portrait; margin: 0; }
    html, body {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-wrap {
      width: 100%;
      margin: 0 auto;
      padding: 6mm 0 0 0;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      width: 125mm;
      max-width: 125mm;
      margin-left: auto;
      margin-right: auto;
      margin-top: 0;
      margin-bottom: 0;
      display: block;
      text-align: left;
      border: 1.5px solid ${isMock ? '#d97706' : '#0f172a'};
      border-radius: 3mm;
      background: #ffffff;
      overflow: hidden;
      box-sizing: border-box;
    }
    .hdr {
      padding: 2.5mm 4mm 2mm;
      text-align: center;
      border-bottom: 1.2px dashed ${isMock ? '#f59e0b' : '#64748b'};
      background: ${isMock ? '#fffbeb' : '#fafafa'};
    }
    .logo {
      height: 12mm;
      max-width: 15mm;
      max-height: 12mm;
      object-fit: contain;
      margin: 0 auto 1.5mm;
      display: block;
    }
    h1 {
      font-size: 9pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .02em;
      margin: 0;
      line-height: 1.2;
      text-align: center;
      color: ${isMock ? '#92400e' : '#0f172a'};
    }
    .sub {
      font-size: 7.5pt;
      color: ${isMock ? '#b45309' : '#334155'};
      margin: 0.6mm 0;
      text-align: center;
      font-weight: 500;
    }
    .badge {
      display: inline-block;
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: ${isMock ? '#92400e' : '#0f172a'};
      border: .8px solid ${isMock ? '#d97706' : '#0f172a'};
      background: ${isMock ? '#fef3c7' : '#ffffff'};
      border-radius: 1mm;
      padding: .2mm 2.5mm;
      margin-top: .4mm;
      text-align: center;
    }
    .banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5mm 4mm;
      border-bottom: 1px dashed ${isMock ? '#f59e0b' : '#94a3b8'};
      background: #ffffff;
      font-size: 7pt;
    }
    .banner .side {
      color: #475569;
      font-weight: 500;
    }
    .banner .slip {
      text-align: center;
    }
    .banner .slip-lbl {
      font-size: 5.5pt;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: #64748b;
      font-weight: 700;
      display: block;
    }
    .banner .slip-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11pt;
      font-weight: 800;
      letter-spacing: .08em;
      color: #0f172a;
    }
    .table-wrap {
      width: 100%;
      background: #ffffff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7.8pt;
    }
    th {
      background: ${isMock ? '#fef3c7' : '#f1f5f9'};
      padding: 1mm 4mm;
      font-size: 6.5pt;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: ${isMock ? '#92400e' : '#475569'};
      border-bottom: 1px solid ${isMock ? '#fde68a' : '#cbd5e1'};
    }
    th.p { text-align: left; }
    th.c { text-align: right; }
    td {
      padding: 1.1mm 4mm;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      line-height: 1.2;
    }
    tr:last-child td { border-bottom: 0; }
    .p { color: #334155; font-weight: 500; }
    .c { text-align: right; font-weight: 700; color: #0f172a; }
    .ftr {
      padding: 1.5mm 4mm;
      border-top: 1.2px dashed ${isMock ? '#f59e0b' : '#64748b'};
      background: ${isMock ? '#fffbeb' : '#fafafa'};
      text-align: center;
    }
    .info {
      font-size: 5.5pt;
      color: ${isMock ? '#b45309' : '#64748b'};
      margin: 0;
      text-align: center;
      line-height: 1.25;
    }
    .mock-warning {
      font-weight: 800;
      letter-spacing: .05em;
      display: block;
      margin-bottom: .3mm;
    }
  </style></head><body>
    <div class="page-wrap">
      <div class="card">
        <div class="hdr">
          ${logoHtml}
          <h1>${esc(r.institution)}</h1>
          <div class="sub">${esc(r.election)}</div>
          <div class="badge">${isMock ? 'MOCK ELECTION · PRACTICE SLIP' : 'OFFICIAL VOTE RECEIPT - VVPAT'}</div>
        </div>
        <div class="banner">
          <div class="side">Booth: ${esc(r.booth || 'BOOTH')}</div>
          <div class="slip">
            <span class="slip-lbl">VOTER SLIP ID</span>
            <span class="slip-id">${esc(r.slip)}</span>
          </div>
          <div class="side">Time: ${esc(r.time)}</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th class="p">Contested Position</th><th class="c">Selected Choice</th></tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        <div class="ftr">
          ${
            isMock
              ? '<p class="info"><span class="mock-warning">*** PRACTICE BALLOT — NOT AN OFFICIAL VOTE ***</span>Check your choices above, then drop this practice slip into the mock box.</p>'
              : '<p class="info">Check your choices above, then fold this slip and drop it into the box at the booth.</p>'
          }
        </div>
      </div>
    </div>
  </body></html>`;
}

/** Save the copy before printing: one HTML file per vote plus one JSON line, flushed to disk. */
function archive(dir, r, now = new Date()) {
  const folder = path.join(dir, now.toISOString().slice(0, 10));
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const slip = r.slip.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown';
  const base = `${now.toISOString().slice(11, 19).replace(/:/g, '')}-${slip}`;
  let file = path.join(folder, `${base}.html`);
  for (let n = 2; fs.existsSync(file); n += 1) file = path.join(folder, `${base}-${n}.html`); // a reprint never overwrites
  fs.writeFileSync(file, toHtml(r), { mode: 0o600 });
  const logFile = r.is_mock ? 'mock-receipts.jsonl' : 'receipts.jsonl';
  const fd = fs.openSync(path.join(dir, logFile), 'a', 0o600);
  fs.writeSync(fd, `${JSON.stringify({ saved_at: now.toISOString(), file, ...r })}\n`);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  return file;
}

module.exports = { normalize, toHtml, archive, clean };
