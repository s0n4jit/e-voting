'use strict';
// The voting page may only ask the app to print its vote copy.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('evoteApp', {
  printReceipt: (receipt) => ipcRenderer.invoke('print-receipt', receipt),
});

window.addEventListener('DOMContentLoaded', () => {
  try {
    const s = document.createElement('style');
    s.textContent = '* { -webkit-app-region: no-drag !important; } input, textarea { -webkit-app-region: no-drag !important; user-select: auto !important; }';
    document.head?.appendChild(s);
  } catch (_) {}
});
