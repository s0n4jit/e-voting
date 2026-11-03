'use strict';
// The vote copy: validation, HTML for the printer, and the copy kept on this computer's disk.
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
    slip: clean(r.slip, 40),
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
  const rows = r.lines.map((l) => `<tr><td class="p">${esc(l.position)}</td><td class="c">${esc(l.choice)}</td></tr>`).join('');
  const logoHtml = r.logo ? `<img class="logo" src="${esc(r.logo)}" alt="Logo" />` : '';
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
      padding: 16mm 0 0 0;
      display: block;
      text-align: center;
      box-sizing: border-box;
    }
    .card {
      width: 110mm;
      max-width: 110mm;
      margin-left: auto;
      margin-right: auto;
      margin-top: 0;
      margin-bottom: 0;
      display: block;
      text-align: left;
      border: 1.5px solid #0f172a;
      border-radius: 3.5mm;
      background: #ffffff;
      overflow: hidden;
      box-sizing: border-box;
    }
    .hdr {
      padding: 4mm 5mm 3.5mm;
      text-align: center;
      border-bottom: 1.5px dashed #64748b;
      background: #fafafa;
    }
    .logo {
      width: 18mm;
      height: 18mm;
      max-width: 18mm;
      max-height: 18mm;
      object-fit: contain;
      margin: 0 auto 2.5mm;
      display: block;
    }
    h1 {
      font-size: 11pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .03em;
      margin: 0;
      line-height: 1.2;
      text-align: center;
    }
    .sub {
      font-size: 8.5pt;
      color: #334155;
      margin: 1mm 0;
      text-align: center;
    }
    .badge {
      display: inline-block;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #0f172a;
      border: .8px solid #0f172a;
      border-radius: 1.5mm;
      padding: .5mm 2.5mm;
      margin-top: 1mm;
      text-align: center;
    }
    .slip-box {
      padding: 3mm 4mm;
      text-align: center;
      border-bottom: 1px dashed #94a3b8;
      background: #ffffff;
    }
    .l {
      font-size: 6.5pt;
      text-transform: uppercase;
      letter-spacing: .15em;
      color: #64748b;
      font-weight: 600;
      display: block;
    }
    .id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 15pt;
      font-weight: 700;
      letter-spacing: .08em;
      color: #0f172a;
      margin: .5mm 0 0;
      text-align: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    th {
      background: #f1f5f9;
      padding: 1.5mm 4mm;
      font-size: 7pt;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: #475569;
      border-bottom: 1px solid #cbd5e1;
    }
    th.p { text-align: left; }
    th.c { text-align: right; }
    td {
      padding: 2mm 4mm;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: 0; }
    .p { color: #334155; font-weight: 500; }
    .c { text-align: right; font-weight: 700; color: #0f172a; }
    .ftr {
      padding: 3mm 4mm;
      border-top: 1.5px dashed #64748b;
      background: #fafafa;
      text-align: center;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      font-size: 7pt;
      color: #475569;
      margin-bottom: 1.5mm;
    }
    .info {
      font-size: 6.5pt;
      color: #64748b;
      line-height: 1.35;
      margin: 0;
      text-align: center;
    }
  </style></head><body>
    <div class="page-wrap">
      <div class="card">
        <div class="hdr">
          ${logoHtml}
          <h1>${esc(r.institution)}</h1>
          <div class="sub">${esc(r.election)}</div>
          ${
            r.is_mock
              ? '<div class="badge" style="background:#fef3c7;border-color:#d97706;color:#92400e;">MOCK ELECTION · PRACTICE SLIP</div>'
              : '<div class="badge">Official Vote Receipt · VVPAT</div>'
          }
        </div>
        <div class="slip-box">
          <div class="l">Voter Slip ID</div>
          <div class="id">${esc(r.slip)}</div>
        </div>
        <table>
          <thead>
            <tr><th class="p">Contested Position</th><th class="c">Selected Choice</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="ftr">
          <div class="meta">
            <span><strong>Booth:</strong> ${esc(r.booth || 'Kiosk')}</span>
            <span><strong>Time:</strong> ${esc(r.time)}</span>
          </div>
          ${
            r.is_mock
              ? '<p class="info" style="color:#b45309;font-weight:600;">PRACTICE BALLOT: This is a mock election. Choices will be wiped when the mock ends.</p>'
              : '<p class="info">Check your choices above, then fold this slip and drop it into the box at the booth.</p>'
          }
        </div>
      </div>
    </div>
  </body></html>`;
}

/** Save the copy before printing: one HTML file per vote plus one JSON line, flushed to disk. */
function archive(dir, r, now = new Date()) {
  const day = now.toISOString().slice(10);
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
