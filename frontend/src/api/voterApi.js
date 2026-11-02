import apiClient from './axiosConfig';

export const voterApi = {
  endSession: async (token) => (await apiClient.post('/auth/voter-session-end', null, { headers: { Authorization: `Bearer ${token}` } })).data,

  getActiveElections: async () => {
    try {
      const response = await apiClient.get('/voter/elections/active');
      return response.data;
    } catch (err) {
      // Fallback in case endpoint returns all voter-visible elections
      const fallback = await apiClient.get('/voter/elections');
      return fallback.data;
    }
  },

  getElectionCandidates: async (electionId) => {
    const response = await apiClient.get(`/voter/elections/${electionId}/candidates`);
    return response.data;
  },

  castVote: async (electionId, candidateId) => {
    const response = await apiClient.post(`/voter/elections/${electionId}/vote`, {
      candidate_id: candidateId,
    });
    return response.data;
  },

  getVoterStatus: async (electionId) => {
    const params = electionId ? { election_id: electionId } : {};
    const response = await apiClient.get('/voter/status', { params });
    return response.data;
  },

  // Multi-position ballot & Kiosk casting
  getElectionBallot: async (electionId) => (await apiClient.get(`/voter/elections/${electionId}/ballot`)).data,

  castMultiPositionBallot: async (electionId, selections, kioskToken) => {
    const response = await apiClient.post(`/voter/elections/${electionId}/cast-ballot`, {
      selections,
      kiosk_token: kioskToken,
    });
    return response.data;
  },
};

export default voterApi;
