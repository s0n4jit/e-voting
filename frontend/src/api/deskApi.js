import apiClient from './axiosConfig';

export const deskApi = {
  importStudents: async (file) => {
    const form = new FormData();
    form.append('file', file);
    return (await apiClient.post('/desk/registrations/import', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })).data;
  },
  removeAll: async () => (await apiClient.delete('/desk/registrations', { data: { confirm: 'DELETE' } })).data,
  deleteStudent: async (slip) => (await apiClient.delete(`/desk/registrations/${encodeURIComponent(slip)}`)).data,
  bulkDelete: async (slipIds) => (await apiClient.post('/desk/registrations/bulk-delete', { slip_ids: slipIds })).data,
  issueAllPins: async (slipIds) => (await apiClient.post('/desk/registrations/issue-pins', slipIds ? { slip_ids: slipIds } : {})).data,
  getPin: async (slip) => (await apiClient.get(`/desk/registrations/${encodeURIComponent(slip)}/pin`)).data.pin,
  state: async () => (await apiClient.get('/desk/state')).data,
  getProgrammes: async () => (await apiClient.get('/desk/programmes')).data,
  register: async (data) => (await apiClient.post('/desk/registrations', data)).data,
  list: async (params = {}) => (await apiClient.get('/desk/registrations', { params })).data,
  get: async (slip, params) => (await apiClient.get(`/desk/registrations/${encodeURIComponent(slip)}`, { params })).data,
  update: async (slip, data) =>
    (await apiClient.patch(`/desk/registrations/${encodeURIComponent(slip)}`, data)).data,
  exportCsv: async () => (await apiClient.get('/desk/registrations/export', { responseType: 'blob' })).data,
  issuePin: async (slip) => (await apiClient.post('/admin/desk/issue-pin', { student_id: slip })).data,
};

export const setupApi = {
  studentTemplate: async () => (await apiClient.get('/setup/student-template', { responseType: 'text', transformResponse: (d) => d })).data,
  programmeTemplate: async () => (await apiClient.get('/setup/programme-template', { responseType: 'text', transformResponse: (d) => d })).data,
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
