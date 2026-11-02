'use strict';
// The app's own setup, maintenance and exit-code screens.
const { contextBridge, ipcRenderer } = require('electron');

const call = (name) => (...args) => ipcRenderer.invoke(name, ...args);
contextBridge.exposeInMainWorld('evoteUi', {
  getConfig: call('cfg:get'),
  saveConfig: call('cfg:save'),
  listPrinters: call('printers'),
  testPrint: call('print-test'),
  verifyCode: call('exit:verify'),
  cancelExit: call('exit:cancel'),
  resume: call('maint:resume'),
  openSetup: call('maint:setup'),
  quit: call('maint:quit'),
});
