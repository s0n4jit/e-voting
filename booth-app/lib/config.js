'use strict';
// Booth settings kept in the user's app-data folder: portal address, printer, start-with-computer.
const fs = require('fs');

const URL_RE = /^https?:\/\/[^/\s]+\/kiosk\/vote$/;
const DEFAULTS = { url: '', printer: '', autoStart: true };

function validate(c = {}) {
  const url = String(c.url || '').trim();
  if (!URL_RE.test(url)) return { error: 'The address must look like https://your-site.example/kiosk/vote' };
  const printer = String(c.printer || '').trim().slice(0, 200);
  return { value: { url, printer, autoStart: c.autoStart !== false } };
}

function load(file) {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(file, c) {
  const { value, error } = validate(c);
  if (error) throw new Error(error);
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return value;
}

/** Everything the page may open: the portal's origin only. */
const originOf = (url) => new URL(url).origin;

module.exports = { URL_RE, DEFAULTS, validate, load, save, originOf };
