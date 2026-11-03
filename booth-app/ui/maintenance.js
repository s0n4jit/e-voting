document.getElementById('resume').onclick = () => evoteUi.resume();
document.getElementById('setup').onclick = () => evoteUi.openSetup();
document.getElementById('receipts').onclick = () => evoteUi.openReceipts();
document.getElementById('mockReceipts').onclick = () => evoteUi.openMockReceipts();
document.getElementById('quit').onclick = () => evoteUi.quit();

const checkBtn = document.getElementById('checkUpdate');
const msgEl = document.getElementById('updateMsg');
if (checkBtn) {
  checkBtn.onclick = async () => {
    checkBtn.disabled = true;
    msgEl.style.display = 'block';
    msgEl.textContent = 'Checking for updates...';
    try {
      const res = await evoteUi.checkUpdates();
      if (res && res.ok) {
        msgEl.textContent = res.version ? `New version ${res.version} found! Downloading...` : 'App is up to date.';
      } else {
        msgEl.textContent = (res && res.message) || 'App is up to date.';
      }
    } catch (err) {
      msgEl.textContent = 'Could not check for updates.';
    } finally {
      checkBtn.disabled = false;
    }
  };
}
