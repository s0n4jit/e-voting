import apiClient from './axiosConfig';

export const boothApi = {
  activate: async (createToken, code) => (await apiClient.post('/booth/activate', { create_token: createToken, code })).data,
  status: async () => (await apiClient.get('/booth/status', { timeout: 3000 })).data,
};

export default boothApi;
