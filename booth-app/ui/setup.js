const $ = (id) => document.getElementById(id);
const say = (t, bad) => { $('msg').textContent = t; $('msg').className = 'msg' + (bad ? ' err' : ''); };

(async () => {
  const cfg = await evoteUi.getConfig();
  const printers = await evoteUi.listPrinters();
  $('url').value = cfg.url || '';
  $('auto').checked = cfg.autoStart !== false;
  $('printer').innerHTML = '<option value="">(computer default printer)</option>'
    + printers.map((p) => `<option>${p.name.replace(/</g, '&lt;')}</option>`).join('');
  $('printer').value = cfg.printer || '';
  if (!printers.length) say('No printer found. Connect and install the printer in the system first, then reopen this screen.', true);
})();

$('test').onclick = async () => {
  say('Sending the test page…');
  const r = await evoteUi.testPrint($('printer').value);
  say(r.ok ? 'Test page sent to the printer.' : `Could not print: ${r.error}`, !r.ok);
};
$('save').onclick = async () => {
  const r = await evoteUi.saveConfig({ url: $('url').value, printer: $('printer').value, autoStart: $('auto').checked });
  if (r.error) say(r.error, true);
};
