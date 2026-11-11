import axios from 'axios';

// Same-origin "/api" by default (nginx / Vite proxy). Set VITE_API_URL at build time when the API
// lives on another host (e.g. Vercel frontend + Render backend).
let rawApiUrl =
  (typeof window !== 'undefined' && window.__API_URL__) || import.meta.env.VITE_API_URL || '/api';
if (rawApiUrl && !rawApiUrl.startsWith('http://') && !rawApiUrl.startsWith('https://') && !rawApiUrl.startsWith('/')) {
  rawApiUrl = `https://${rawApiUrl}`;
}
export const API_BASE_URL = rawApiUrl.endsWith('/api')
  ? rawApiUrl
  : `${rawApiUrl.replace(/\/+$/, '')}/api`;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request interceptor: attach Authorization header if access token exists
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token && !config.headers.Authorization) {  // a call may carry its own (the refresh token)
      config.headers.Authorization = `Bearer ${token}`;
    }
    const booth = localStorage.getItem('kiosk_token');
    if (booth) config.headers['X-Kiosk-Token'] = booth;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 Unauthorized responses & network disconnects
apiClient.interceptors.response.use(
  (response) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:network-online'));
    }
    return response;
  },
  (error) => {
    if (typeof window !== 'undefined') {
      if (!error.response || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.message?.includes('Network Error')) {
        window.dispatchEvent(new CustomEvent('app:network-offline'));
      }
    }
    if (error.response && error.response.status === 401) {
      // If unauthorized on auth check or protected route (except login attempt itself), clear token
      const requestUrl = error.config?.url || '';
      if (
        !requestUrl.includes('/auth/login') &&
        !requestUrl.includes('/auth/verify-otp') &&
        !requestUrl.includes('/auth/voter-pin-login') &&
        !requestUrl.includes('/auth/booth-pin-login')
      ) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        // Dispatch custom event so AuthContext can handle state update
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
