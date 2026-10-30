import apiClient from './axiosConfig';

export const resultsApi = {
  adminResults: async (electionId) => (await apiClient.get(`/admin/elections/${electionId}/results`)).data,
  createPublicLink: async (electionId) => (await apiClient.post(`/admin/elections/${electionId}/public-link`)).data,
  deletePublicLink: async (electionId) => (await apiClient.delete(`/admin/elections/${electionId}/public-link`)).data,
  publicResults: async (token) => (await apiClient.get(`/results/public/${encodeURIComponent(token)}`)).data,
};

export default resultsApi;
