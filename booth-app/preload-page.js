'use strict';
// The voting page: secure kiosk input handling, print dispatch, and accessibility mouse remapping.
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
        touch-action: manipulation !important;
      }
      html, body {
        overscroll-behavior: none !important;
        touch-action: manipulation !important;
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
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
}, true);
window.addEventListener('auxclick', (e) => {
  e.preventDefault();
  e.stopPropagation();
}, true);

// Mouse remapping: right-click (button 2) and scroll/middle-click (button 1) act as standard left-click (button 0)
// This ensures first-time and elderly voters who accidentally right-click or press the scroll wheel do not miss their selections.
window.addEventListener('mousedown', (e) => {
  if (e.button === 1 || e.button === 2) {
    e.preventDefault();
    e.stopPropagation();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target) {
      const clickable = target.closest('button, a, input, label, [role="button"], tr, div') || target;
      if (typeof clickable.click === 'function') {
        clickable.click();
      } else {
        clickable.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          detail: 1,
          screenX: e.screenX,
          screenY: e.screenY,
          clientX: e.clientX,
          clientY: e.clientY,
          button: 0,
          buttons: 1,
        }));
      }
      if (typeof clickable.focus === 'function') clickable.focus();
    }
  }
}, true);

// Numpad guarantee: even if NumLock is toggled off on hardware, numpad keys type their digits
const NUMPAD_MAP = {
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4',
  Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
  NumpadDecimal: '.', NumpadSubtract: '-',
};

window.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  // In-page fallback for exit shortcut: Ctrl+Shift+Q or Ctrl+Alt+Q
  if (ctrl && (e.shiftKey || e.altKey) && k === 'q') {
    e.preventDefault();
    e.stopPropagation();
    ipcRenderer.invoke('open-exit-prompt');
    return;
  }

  if (e.code && NUMPAD_MAP[e.code]) {
    const digit = NUMPAD_MAP[e.code];
    const target = document.activeElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (e.key !== digit) {
        // NumLock was off, but user pressed a numpad key: inject digit into input
        e.preventDefault();
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        const val = target.value;
        target.value = val.slice(0, start) + digit + val.slice(end);
        target.selectionStart = target.selectionEnd = start + 1;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }
}, true);
