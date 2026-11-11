import apiClient from './axiosConfig';

export const deskApi = {
  state: async () => (await apiClient.get('/desk/state')).data,
};

export const setupApi = {
  validate: async (step, data, token) =>
    (await apiClient.post('/setup/validate', { step, data }, { timeout: 60000, ...(token ? { headers: { 'X-Setup-Token': token } } : {}) })).data,
  complete: async (payload, token) =>
    (await apiClient.post('/setup/complete', payload, { timeout: 180000, ...(token ? { headers: { 'X-Setup-Token': token } } : {}) })).data,
  status: async () => (await apiClient.get('/setup/status')).data,
};

export const safeFileName = (str, fallback = 'document') => {
  if (!str) return fallback;
  return String(str)
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
};

export const triggerPrintWithTitle = (title, onAfter) => {
  const original = document.title;
  if (title) document.title = safeFileName(title, original);

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = original;
    window.removeEventListener('afterprint', restore);
    onAfter?.();
  };

  window.addEventListener('afterprint', restore);
  setTimeout(() => {
    window.print();
    setTimeout(restore, 2500);
  }, 100);
};

export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFileName(filename);
  a.click();
  URL.revokeObjectURL(url);
};
