import apiClient from './axiosConfig';

export const deskApi = {
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
  programmeTemplate: async () => (await apiClient.get('/setup/programme-template', { responseType: 'text', transformResponse: (d) => d })).data,
  validate: async (step, data, token) =>
    (await apiClient.post('/setup/validate', { step, data }, token ? { headers: { 'X-Setup-Token': token } } : undefined)).data,
  complete: async (payload, token) =>
    (await apiClient.post('/setup/complete', payload, token ? { headers: { 'X-Setup-Token': token } } : undefined)).data,
};

export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
