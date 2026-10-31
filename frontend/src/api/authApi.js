import apiClient from './axiosConfig';

export const authApi = {
  login: async (identifier, password) => {
    const response = await apiClient.post('/auth/login', {
      student_id: identifier,
      email: identifier,
      identifier,
      password,
    });
    return response.data;
  },

  verifyOtp: async ({ temp_token, otp, student_id }) => {
    const payload = { otp };
    if (temp_token) payload.temp_token = temp_token;
    if (student_id) payload.student_id = student_id;
    const response = await apiClient.post('/auth/verify-otp', payload);
    return response.data;
  },

  logout: async () => {
    try {
      const response = await apiClient.post('/auth/logout', { refresh_token: localStorage.getItem('refresh_token') });
      return response.data;
    } catch (err) {
      // In case server fails or is unreachable, client will still clear tokens
      return { success: true };
    }
  },

  getMe: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  refreshToken: async (refreshToken) => {
    const response = await apiClient.post('/auth/refresh', null, {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
      },
    });
    return response.data;
  },

  // Booth Kiosk Voter PIN Login
  voterPinLogin: async (studentId, votingPin, electionId, kioskToken) => {
    const payload = {
      student_id: studentId,
      voting_pin: votingPin,
      kiosk_token: kioskToken,
    };
    if (electionId) {
      payload.election_id = electionId;
    }
    const response = await apiClient.post('/auth/voter-pin-login', payload);
    return response.data;
  },

  getActiveElection: async () => {
    const response = await apiClient.get('/auth/active-election');
    return response.data;
  },

  forgotPassword: async (identifier, code, newPassword) =>
    (await apiClient.post('/auth/forgot-password', { identifier, code, new_password: newPassword })).data,

  getLastLogin: async () => (await apiClient.get('/auth/last-login')).data,

  setPhoto: async (photo) => (await apiClient.put('/auth/photo', { photo })).data,

  changePassword: async (currentPassword, newPassword, code) =>
    (await apiClient.post('/auth/change-password', code ? { code, new_password: newPassword } : { current_password: currentPassword, new_password: newPassword })).data,

  // Two-step verification (authenticator app)
  setupTotp: async () => {
    const response = await apiClient.get('/auth/totp/setup');
    return response.data;
  },

  enableTotp: async (code) => {
    const response = await apiClient.post('/auth/totp/enable', { code });
    return response.data;
  },

  disableTotp: async (password) => {
    const response = await apiClient.post('/auth/totp/disable', { password });
    return response.data;
  },
};

export default authApi;
