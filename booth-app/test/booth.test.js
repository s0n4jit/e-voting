const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../lib/config');
const receipt = require('../lib/receipt');

test('portal address must end with /kiosk/vote and may carry a port', () => {
  assert.ok(config.validate({ url: 'http://192.168.1.13:8080/kiosk/vote' }).value);
  assert.ok(config.validate({ url: 'https://vote.example.edu/kiosk/vote' }).value);
  assert.ok(config.validate({ url: 'javascript:alert(1)' }).error);
  assert.ok(config.validate({ url: 'https://vote.example.edu/' }).error);
});

test('only the portal origin is allowed', () => {
  assert.strictEqual(config.originOf('http://192.168.1.13:8080/kiosk/vote'), 'http://192.168.1.13:8080');
});

test('receipt input is bounded plain text and HTML is escaped', () => {
  const r = receipt.normalize({ slip: 'SUE26-E1-1\u0000', election: '<b>x</b>', copies: 99, lines: Array(100).fill({ position: 'P', choice: 'C' }) });
  assert.strictEqual(r.copies, 3);
  assert.strictEqual(r.lines.length, 40);
  assert.ok(!receipt.toHtml(r).includes('<b>x</b>'));
});

test('a copy is saved to disk and a reprint never overwrites it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
  const r = receipt.normalize({ slip: 'SUE26-E1-123456', lines: [{ position: 'President', choice: 'Anita' }] });
  const now = new Date('2026-11-02T10:00:00Z');
  const a = receipt.archive(dir, r, now);
  const b = receipt.archive(dir, r, now);
  assert.notStrictEqual(a, b);
  assert.ok(fs.readFileSync(a, 'utf8').includes('Anita'));
  assert.strictEqual(fs.readFileSync(path.join(dir, 'receipts.jsonl'), 'utf8').trim().split('\n').length, 2);
});

test('config round trip, and a missing file falls back to defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'));
  const file = path.join(dir, 'config.json');
  assert.strictEqual(config.load(file).url, '');
  config.save(file, { url: 'https://v.example.edu/kiosk/vote', printer: 'HP' });
  assert.strictEqual(config.load(file).printer, 'HP');
  assert.throws(() => config.save(file, { url: 'nope' }));
});
