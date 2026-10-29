import apiClient from './axiosConfig';

export const voterApi = {
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
};

export default voterApi;
