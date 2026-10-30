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

  toggleElectionActive: async (electionId, makeActive) => {
    const endpoint = makeActive ? `/admin/elections/${electionId}/activate` : `/admin/elections/${electionId}/close`;
    try {
      const response = await apiClient.post(endpoint);
      return response.data;
    } catch (err) {
      // Fallback to PUT if specific toggle endpoint is not present
      const response = await apiClient.put(`/admin/elections/${electionId}`, {
        is_active: makeActive,
      });
      return response.data;
    }
  },

  publishResults: async (electionId) => {
    try {
      const response = await apiClient.post(`/admin/elections/${electionId}/publish`);
      return response.data;
    } catch (err) {
      // Fallback to PUT
      const response = await apiClient.put(`/admin/elections/${electionId}`, {
        results_published: true,
      });
      return response.data;
    }
  },

  // Candidates
  getCandidates: async (electionId) => {
    try {
      const response = await apiClient.get(`/admin/elections/${electionId}/candidates`);
      return response.data;
    } catch (err) {
      // Also fallback to public/voter candidates endpoint if admin-specific is alias
      const response = await apiClient.get(`/voter/elections/${electionId}/candidates`);
      return response.data;
    }
  },

  addCandidate: async (electionId, candidateData) => {
    const response = await apiClient.post(`/admin/elections/${electionId}/candidates`, candidateData);
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

  addVoter: async (voterData) => {
    const response = await apiClient.post('/admin/voters', voterData);
    return response.data;
  },

  importVotersCsv: async (fileOrFormData) => {
    let payload = fileOrFormData;
    let headers = {};

    if (fileOrFormData instanceof File) {
      const formData = new FormData();
      formData.append('file', fileOrFormData);
      payload = formData;
      headers = { 'Content-Type': 'multipart/form-data' };
    } else if (fileOrFormData instanceof FormData) {
      payload = fileOrFormData;
      headers = { 'Content-Type': 'multipart/form-data' };
    }

    const response = await apiClient.post('/admin/voters/import', payload, { headers });
    return response.data;
  },

  // Audit Logs
  getAuditLogs: async (params = {}) => {
    const response = await apiClient.get('/admin/audit-logs', { params });
    return response.data;
  },

  // Polling Desk
  issueDeskPin: async (studentId, electionId) => {
    const response = await apiClient.post('/admin/desk/issue-pin', {
      student_id: studentId,
      election_id: electionId,
    });
    return response.data;
  },

  getDeskVoters: async (queryOrParams) => {
    let params = {};
    if (typeof queryOrParams === 'string') {
      params = { query: queryOrParams };
    } else if (queryOrParams && typeof queryOrParams === 'object') {
      params = queryOrParams;
    }
    try {
      const response = await apiClient.get('/admin/desk/voters', { params });
      return response.data;
    } catch (err) {
      // Fallback to standard voters list with client filtering if desk endpoint not yet available
      const fallback = await apiClient.get('/admin/voters', { params });
      return fallback.data;
    }
  },

  // Booth Kiosks
  registerKiosk: async (deviceName) => {
    const response = await apiClient.post('/admin/kiosk/register', {
      device_name: deviceName,
    });
    return response.data;
  },

  getKiosks: async () => {
    const response = await apiClient.get('/admin/kiosk/list');
    return response.data;
  },

  deleteKiosk: async (id) => {
    const response = await apiClient.delete(`/admin/kiosk/${id}`);
    return response.data;
  },
};

export default adminApi;
