document.getElementById('resume').onclick = () => evoteUi.resume();

const reloadBtn = document.getElementById('reload');
if (reloadBtn) {
  reloadBtn.onclick = async () => {
    reloadBtn.disabled = true;
    reloadBtn.textContent = 'Reloading ballot...';
    await evoteUi.reloadPage();
  };
}

document.getElementById('setup').onclick = () => evoteUi.openSetup();

const relaunchBtn = document.getElementById('relaunch');
if (relaunchBtn) {
  relaunchBtn.onclick = () => {
    if (confirm('Restart the voting booth app?')) {
      evoteUi.relaunchApp();
    }
  };
}

const rebootBtn = document.getElementById('reboot');
if (rebootBtn) {
  rebootBtn.onclick = () => {
    if (confirm('Are you sure you want to reboot the entire computer?')) {
      evoteUi.rebootMachine();
    }
  };
}

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
