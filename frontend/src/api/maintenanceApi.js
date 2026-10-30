import apiClient from './axiosConfig';

export const maintenanceApi = {
  /**
   * Authenticate staff member using high-entropy staff PIN
   */
  verifyStaffPin: async (code) => {
    const response = await apiClient.post('/maintenance/auth', { code });
    return response.data;
  },

  /**
   * Retrieve multi-tier hardware, network, and service diagnostics
   */
  getDiagnostics: async (token) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await apiClient.get('/maintenance/diagnostics', { headers });
    return response.data;
  },

  /**
   * Execute an authorized privileged maintenance action (restart browser, reboot, etc.)
   */
  executeAction: async (action, token) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await apiClient.post('/maintenance/action', { action }, { headers });
    return response.data;
  },

  /**
   * Lightweight connection ping to verify backend reachability
   */
  pingBackend: async () => {
    try {
      const response = await apiClient.get('/health', { timeout: 3000 });
      return response.status === 200;
    } catch (err) {
      return false;
    }
  },
};

export default maintenanceApi;
