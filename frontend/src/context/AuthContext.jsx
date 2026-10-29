import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import authApi from '../api/authApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });

  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('access_token') || null);
  const [loading, setLoading] = useState(true);

  // Helper to parse JWT payload for role if user object doesn't have it directly
  const extractRoleFromToken = (token) => {
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        return payload.role || payload.sub?.role || null;
      }
    } catch (e) {
      console.warn('Failed to decode role from token', e);
    }
    return null;
  };

  const role = user?.role || extractRoleFromToken(accessToken) || null;
  const isAuthenticated = Boolean(accessToken && (user || role));

  const loadCurrentUser = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setUser(null);
      setAccessToken(null);
      setLoading(false);
      return null;
    }

    try {
      setAccessToken(token);
      const userData = await authApi.getMe();
      const resolvedUser = userData.user || userData;
      setUser(resolvedUser);
      localStorage.setItem('user', JSON.stringify(resolvedUser));
      return resolvedUser;
    } catch (error) {
      console.error('Error fetching current user:', error);
      // If error is 401, token will be cleaned up by axios interceptor
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentUser();

    // Listen for 401 event from axios interceptor
    const handleUnauthorized = () => {
      setUser(null);
      setAccessToken(null);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [loadCurrentUser]);

  // Step 1: Login with student_id and password
  // Returns { mfa_required, temp_token, access_token, user, ... }
  const login = async (student_id, password) => {
    const res = await authApi.login(student_id, password);
    // If no MFA is required (direct token returned)
    if (res.access_token) {
      localStorage.setItem('access_token', res.access_token);
      if (res.refresh_token) localStorage.setItem('refresh_token', res.refresh_token);
      setAccessToken(res.access_token);
      if (res.user) {
        setUser(res.user);
        localStorage.setItem('user', JSON.stringify(res.user));
      } else {
        await loadCurrentUser();
      }
    }
    return res;
  };

  // Step 2: Verify OTP
  const verifyOtp = async ({ temp_token, otp, student_id }) => {
    const res = await authApi.verifyOtp({ temp_token, otp, student_id });
    if (res.access_token) {
      localStorage.setItem('access_token', res.access_token);
      if (res.refresh_token) localStorage.setItem('refresh_token', res.refresh_token);
      setAccessToken(res.access_token);

      if (res.user) {
        setUser(res.user);
        localStorage.setItem('user', JSON.stringify(res.user));
      } else {
        await loadCurrentUser();
      }
    }
    return res;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      console.warn('Logout error ignored:', e);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      setUser(null);
      setAccessToken(null);
    }
  };

  const value = {
    user,
    accessToken,
    role,
    isAuthenticated,
    loading,
    login,
    verifyOtp,
    logout,
    loadCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
