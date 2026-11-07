import apiClient from './axiosConfig';

export const adminApi = {
  // Elections
  getElections: async (params) => {
    const response = await apiClient.get('/admin/elections', { params });
    return response.data;
  },

  createElection: async (electionData) => {
    const response = await apiClient.post('/admin/elections', electionData);
    return response.data;
  },

  updateElection: async (electionId, electionData) => {
    const response = await apiClient.put(`/admin/elections/${electionId}`, electionData);
    return response.data;
  },

  deleteElection: async (electionId) => {
    const response = await apiClient.delete(`/admin/elections/${electionId}`);
    return response.data;
  },

  // Candidates
  getElection: async (electionId) => (await apiClient.get(`/admin/elections/${electionId}`)).data,

  addCandidate: async (electionId, candidateData) => {
    // multipart: the photo file travels with the fields in one request, so a failure stores nothing
    const form = new FormData();
    Object.entries(candidateData).forEach(([k, v]) => {
      if (v !== null && v !== undefined) form.append(k, v);
    });
    const response = await apiClient.post(`/admin/elections/${electionId}/candidates`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updateCandidate: async (candidateId, electionId, candidateData) => {
    const form = new FormData();
    Object.entries(candidateData).forEach(([k, v]) => {
      if (v !== null && v !== undefined && k !== 'id') form.append(k, v);
    });
    const url = electionId
      ? `/admin/elections/${electionId}/candidates/${candidateId}`
      : `/admin/candidates/${candidateId}`;
    const response = await apiClient.put(url, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteCandidate: async (candidateId, electionId) => {
    try {
      const response = await apiClient.delete(`/admin/candidates/${candidateId}`);
      return response.data;
    } catch (err) {
      if (electionId) {
        const response = await apiClient.delete(`/admin/elections/${electionId}/candidates/${candidateId}`);
        return response.data;
      }
      throw err;
    }
  },

  // Voters
  getVoters: async (params = {}) => {
    const response = await apiClient.get('/admin/voters', { params });
    return response.data;
  },

  // Audit Logs
  getAuditLogs: async (params = {}) => {
    const response = await apiClient.get('/admin/audit-logs', { params });
    return response.data;
  },

  // Polling Desk
  issueDeskPin: async (studentId, electionId, name = null, department = null) => {
    const payload = typeof studentId === 'object' ? studentId : {
      student_id: studentId,
      election_id: electionId,
      name,
      department,
    };
    const response = await apiClient.post('/admin/desk/issue-pin', payload);
    return response.data;
  },
  exportAuditLogsUrl: () => `/api/admin/audit-logs/export`,

  getDeskVoters: async (queryOrParams) => {
    let params = {};
    if (typeof queryOrParams === 'string') {
      params = { query: queryOrParams };
    } else if (queryOrParams && typeof queryOrParams === 'object') {
      params = queryOrParams;
    }
    const response = await apiClient.get('/admin/desk/voters', { params });
    return response.data;
  },

  // Officer dashboard, lifecycle, positions, programmes, settings
  getPrinting: async () => (await apiClient.get('/admin/settings/printing')).data,
  savePrinting: async (data) => (await apiClient.put('/admin/settings/printing', data)).data,
  startMock: async (id, data) => (await apiClient.post(id ? `/admin/elections/${id}/mock/start` : '/admin/mock/start', data || {})).data,
  endMock: async (id) => (await apiClient.post(id ? `/admin/elections/${id}/mock/end` : '/admin/mock/end', { confirm: 'RESET' })).data,
  pauseMock: async (id) => (await apiClient.post(id ? `/admin/elections/${id}/mock/pause` : '/admin/mock/pause')).data,
  resumeMock: async (id) => (await apiClient.post(id ? `/admin/elections/${id}/mock/resume` : '/admin/mock/resume')).data,
  stopMock: async (id) => (await apiClient.post(id ? `/admin/elections/${id}/mock/stop` : '/admin/mock/stop')).data,
  publishMock: async (id) => (await apiClient.post(id ? `/admin/elections/${id}/mock/publish` : '/admin/mock/publish')).data,
  getMockStatus: async () => (await apiClient.get('/admin/mock/status')).data,
  getOverview: async () => (await apiClient.get('/admin/overview')).data,
  pauseVoting: async (electionId) => (await apiClient.post(`/admin/elections/${electionId}/pause`)).data,
  resumeVoting: async (electionId) => (await apiClient.post(`/admin/elections/${electionId}/resume`)).data,
  setElectionStatus: async (electionId, status) =>
    (await apiClient.post(`/admin/elections/${electionId}/status`, { status })).data,
  setPositions: async (electionId, positions) =>
    (await apiClient.put(`/admin/elections/${electionId}/positions`, { positions })).data,
  getProgrammes: async () => (await apiClient.get('/admin/programmes')).data,
  createProgramme: async (data) => (await apiClient.post('/admin/programmes', data)).data,
  updateProgramme: async (id, data) => (await apiClient.put(`/admin/programmes/${id}`, data)).data,
  deleteProgramme: async (id) => (await apiClient.delete(`/admin/programmes/${id}`)).data,
  importProgrammes: async (file) => {
    const form = new FormData();
    form.append('file', file);
    return (await apiClient.post('/admin/programmes/import', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  exportSystem: async () => (await apiClient.post('/admin/system/export', null, { responseType: 'blob', timeout: 120000 })).data,
  resetSystem: async (code, confirm) => (await apiClient.post('/admin/system/reset', { code, confirm }, { timeout: 120000 })).data,
  importSystem: async (file, code, confirm) => {
    const form = new FormData();
    form.append('file', file);
    form.append('code', code);
    form.append('confirm', confirm);
    return (await apiClient.post('/admin/system/import', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 })).data;
  },
  getSettings: async () => (await apiClient.get('/admin/settings')).data,
  saveSettings: async (data) => (await apiClient.put('/admin/settings', data)).data,
  updateOfficer: async (id, data) => (await apiClient.patch(`/admin/officers/${id}`, data)).data,
  downloadReport: async (electionId) => {
    const res = await apiClient.get(`/admin/elections/${electionId}/report`, { responseType: 'blob' });
    return res.data;
  },

  // Booth Kiosks
  registerKiosk: async (deviceName) => {
    const response = await apiClient.post('/admin/kiosk/register', {
      device_name: deviceName,
    });
    return response.data;
  },
  createBoothToken: async (config = {}) => (await apiClient.post('/admin/booth-tokens', config)).data,
  getNextAvailableBooth: async () => (await apiClient.get('/admin/booths/next-available')).data,
  getBoothSlipsList: async (params = {}) => (await apiClient.get('/admin/booths/slips', { params })).data,

  getKiosks: async () => {
    const response = await apiClient.get('/admin/kiosk/list');
    return response.data;
  },

  deleteKiosk: async (id) => {
    const response = await apiClient.delete(`/admin/kiosk/${id}`);
    return response.data;
  },

  revokeKiosk: async (id) => (await apiClient.post(`/admin/kiosk/${id}/revoke`)).data,
  getKioskSetupToken: async (id) => (await apiClient.post(`/admin/kiosk/${id}/setup-token`)).data,
  manageKioskSlips: async (id, data) => (await apiClient.post(`/admin/kiosk/${id}/slips`, data)).data,

  // Polling Desk Officers
  getOfficers: async () => {
    const response = await apiClient.get('/admin/officers');
    return response.data;
  },

  createOfficer: async (officerData) => {
    const response = await apiClient.post('/admin/officers', officerData);
    return response.data;
  },

  deleteOfficer: async (id) => {
    const response = await apiClient.delete(`/admin/officers/${id}`);
    return response.data;
  },

  // Central Server Receipts & Audit
  getReceipts: async (params = {}) => (await apiClient.get('/officer/receipts', { params })).data,
  downloadReceiptPdf: async (slipId) => {
    const res = await apiClient.get(`/officer/receipts/${encodeURIComponent(slipId)}/pdf`, { responseType: 'blob' });
    return res.data;
  },
  downloadReceiptsZip: async (params = {}) => {
    const res = await apiClient.get('/officer/receipts/export-zip', { params, responseType: 'blob' });
    return res.data;
  },
  markReceiptPrinted: async (slipId) => (await apiClient.post(`/officer/receipts/${encodeURIComponent(slipId)}/mark-printed`)).data,

  // Pre-generated Booth Slips & PDF Export
  getBoothSlipsMetrics: async (electionId) => {
    const params = electionId ? { election_id: electionId } : {};
    return (await apiClient.get('/admin/booths/slips-metrics', { params })).data;
  },

  generateBoothSlips: async (boothNumber, count = 50, electionId = null) => {
    return (await apiClient.post(`/admin/booths/${boothNumber}/generate-slips`, { count, election_id: electionId }, { timeout: 120000 })).data;
  },

  generateAllBoothSlips: async (countPerBooth = 50, electionId = null) => {
    return (await apiClient.post('/admin/booths/generate-all-slips', { count_per_booth: countPerBooth, election_id: electionId }, { timeout: 120000 })).data;
  },

  downloadBoothSlipsPdf: async (boothNumber, electionId = null) => {
    const params = electionId ? { election_id: electionId } : {};
    const res = await apiClient.get(`/admin/booths/${boothNumber}/slips-pdf`, { params, responseType: 'blob' });
    return res.data;
  },

  downloadSingleSlipPdf: async (slipId) => {
    const res = await apiClient.get(`/admin/slips/${slipId}/pdf`, { responseType: 'blob' });
    return res.data;
  },

  downloadAllSlipsPdf: async (electionId = null) => {
    const id = typeof electionId === 'object' && electionId !== null ? electionId.election_id : electionId;
    const params = id ? { election_id: id } : {};
    const res = await apiClient.get('/admin/booths/all-slips-pdf', { params, responseType: 'blob' });
    return res.data;
  },

  generateSlips: async (count = 50, boothNumber = null, electionId = null) => {
    return (await apiClient.post('/admin/slips/generate', { count, booth_number: boothNumber, election_id: electionId }, { timeout: 120000 })).data;
  },

  cancelSlip: async (slipId) => (await apiClient.post(`/admin/slips/${slipId}/cancel`)).data,
  clearMockReceipts: async (params = {}) => (await apiClient.delete('/officer/receipts/mock', { params })).data,
};

export default adminApi;
