import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import apiClient from '../api/axiosConfig';

/** Browser tab icon: the institution's uploaded logo, otherwise the default Campus E-Voting mark. */
export const setFavicon = (logo) => {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = logo ? logo.slice(5, logo.indexOf(';')) : 'image/svg+xml';
  link.href = logo || '/favicon.svg';
};

const DEFAULT = { institution_name: '', system_name: 'Election Portal', logo: '', language: 'en' };
const BrandContext = createContext({ ready: false, installed: true, branding: DEFAULT, refresh: () => {} });

/** Loads installation state and public branding once; every screen reads from here. */
export const BrandProvider = ({ children }) => {
  const [state, setState] = useState({ ready: false, installed: true, branding: DEFAULT, requiresToken: false });

  const refresh = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/setup/status');
      setState({
        ready: true,
        installed: data.installed,
        branding: { ...DEFAULT, ...(data.branding || {}) },
        requiresToken: Boolean(data.requires_token),
      });
    } catch {
      setState((s) => ({ ...s, ready: true }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const b = state.branding;
    document.title = [b.system_name, b.institution_name].filter(Boolean).join(' · ') || 'Election Portal';
    setFavicon(b.logo);
  }, [state.branding]);

  return <BrandContext.Provider value={{ ...state, refresh }}>{children}</BrandContext.Provider>;
};

export const useBrand = () => useContext(BrandContext);
