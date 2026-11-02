'use strict';
// The voting page may only ask the app to print its vote copy.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('evoteApp', {
  printReceipt: (receipt) => ipcRenderer.invoke('print-receipt', receipt),
});
