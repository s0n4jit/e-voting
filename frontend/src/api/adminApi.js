import apiClient from './axiosConfig';

export const adminApi = {
  // Elections
  getElections: async () => {
    const response = await apiClient.get('/admin/elections');
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
    Object.entries(candidateData).forEach(([k, v]) => form.append(k, v));
    const response = await apiClient.post(`/admin/elections/${electionId}/candidates`, form, {
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
  createBoothToken: async () => (await apiClient.post('/admin/booth-tokens')).data,

  getKiosks: async () => {
    const response = await apiClient.get('/admin/kiosk/list');
    return response.data;
  },

  deleteKiosk: async (id) => {
    const response = await apiClient.delete(`/admin/kiosk/${id}`);
    return response.data;
  },

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
};

export default adminApi;
