const $ = (id) => document.getElementById(id);
const go = async () => {
  $('ok').disabled = true;
  $('msg').textContent = '';
  const r = await evoteUi.verifyCode($('code').value);
  if (!r.ok) {
    $('msg').textContent = r.message;
    $('code').value = '';
    $('ok').disabled = false;
    $('code').focus();
  }
};
$('ok').onclick = go;
$('cancel').onclick = () => evoteUi.cancelExit();
$('code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') go();
  if (e.key === 'Escape') evoteUi.cancelExit();
});
