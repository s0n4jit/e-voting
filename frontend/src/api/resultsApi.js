import apiClient from './axiosConfig';

export const resultsApi = {
  getElectionResults: async (electionId) => {
    const response = await apiClient.get(`/results/${electionId}`);
    return response.data;
  },

  getElectionStats: async (electionId) => {
    const response = await apiClient.get(`/results/${electionId}/stats`);
    return response.data;
  },
};

export default resultsApi;
