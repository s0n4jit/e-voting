'use strict';
// The voting page may only ask the app to print its vote copy.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('evoteApp', {
  printReceipt: (receipt) => ipcRenderer.invoke('print-receipt', receipt),
});

window.addEventListener('DOMContentLoaded', () => {
  try {
    const s = document.createElement('style');
    s.textContent = `
      *, *::before, *::after {
        -webkit-app-region: no-drag !important;
        -webkit-user-drag: none !important;
        -webkit-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
      }
      ::selection {
        background: transparent !important;
        color: inherit !important;
      }
      ::-moz-selection {
        background: transparent !important;
        color: inherit !important;
      }
      img, a, button, div, span, p, h1, h2, h3, form, input, textarea {
        -webkit-user-drag: none !important;
        user-drag: none !important;
      }
    `;
    document.head?.appendChild(s);
  } catch (_) {}
});

// Suppress dragging, text selection, copy, and context menu inside the kiosk web page
window.addEventListener('dragstart', (e) => e.preventDefault(), true);
window.addEventListener('selectstart', (e) => e.preventDefault(), true);
window.addEventListener('copy', (e) => e.preventDefault(), true);
window.addEventListener('cut', (e) => e.preventDefault(), true);
window.addEventListener('contextmenu', (e) => e.preventDefault(), true);

