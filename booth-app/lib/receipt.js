'use strict';
// The vote copy: validation, HTML for the printer, and the copy kept on this computer's disk.
const fs = require('fs');
const path = require('path');

const clean = (v, limit = 80) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit).trim();
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Keep only what a receipt needs, with bounded plain-text fields (the page is untrusted input). */
function normalize(r = {}) {
  return {
    institution: clean(r.institution, 80),
    election: clean(r.election, 80),
    slip: clean(r.slip, 40),
    booth: clean(r.booth, 20),
    time: clean(r.time, 40),
    printer: clean(r.printer, 120),
    copies: Math.min(Math.max(parseInt(r.copies, 10) || 1, 1), 3),
    lines: (Array.isArray(r.lines) ? r.lines : []).slice(0, 40).map((l) => ({ position: clean(l?.position, 40), choice: clean(l?.choice, 60) })),
  };
}

function toHtml(r) {
  const rows = r.lines.map((l) => `<tr><td class="p">${esc(l.position)}</td><td class="c">${esc(l.choice)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Vote copy ${esc(r.slip)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;padding:6mm;width:72mm}
    h1{font-size:12pt;margin:0}.sub{font-size:9pt;margin:1mm 0 3mm}
    .id{font-family:Consolas,monospace;font-size:15pt;font-weight:700;text-align:center;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:2mm 0;margin:2mm 0}
    .l{font-size:7pt;text-transform:uppercase;text-align:center;letter-spacing:.1em}
    table{width:100%;border-collapse:collapse;font-size:9.5pt}td{padding:1mm 0;border-bottom:1px solid #ccc;vertical-align:top}
    .c{text-align:right;font-weight:700}.f{font-size:7.5pt;margin-top:3mm;text-align:center}
  </style></head><body>
    <h1>${esc(r.institution)}</h1><div class="sub">${esc(r.election)} - vote copy</div>
    <div class="l">Voter Slip ID</div><div class="id">${esc(r.slip)}</div>
    <table>${rows}</table>
    <div class="f">Booth ${esc(r.booth)} · ${esc(r.time)}<br>Check your choices, then drop this slip into the box at the booth.</div>
  </body></html>`;
}

/** Save the copy before printing: one HTML file per vote plus one JSON line, flushed to disk. */
function archive(dir, r, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const folder = path.join(dir, day);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const slip = r.slip.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown';
  const base = `${now.toISOString().slice(11, 19).replace(/:/g, '')}-${slip}`;
  let file = path.join(folder, `${base}.html`);
  for (let n = 2; fs.existsSync(file); n += 1) file = path.join(folder, `${base}-${n}.html`); // a reprint never overwrites
  fs.writeFileSync(file, toHtml(r), { mode: 0o600 });
  const fd = fs.openSync(path.join(dir, 'receipts.jsonl'), 'a', 0o600);
  fs.writeSync(fd, `${JSON.stringify({ saved_at: now.toISOString(), file, ...r })}\n`);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  return file;
}

module.exports = { normalize, toHtml, archive, clean };
