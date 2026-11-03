import React, { createContext, useContext, useEffect, useState } from 'react';
import { useBrand } from './BrandContext';

const ThemeContext = createContext({ theme: 'light', toggle: () => {}, enabled: false });

// Light unless enabled and user explicitly chose dark.
const KEY = 'theme-choice';

export const ThemeProvider = ({ children }) => {
  const { branding } = useBrand();
  const enabled = branding?.enable_theme_toggle === 'true' || branding?.enable_theme_toggle === true;

  const [theme, setTheme] = useState(() => {
    if (!enabled) return 'light';
    try {
      return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    // When disabled, strictly lock to White (light theme)
    if (!enabled) {
      document.documentElement.classList.remove('dark');
      setTheme('light');
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [enabled, theme]);

  const toggle = () => {
    if (!enabled) return;
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch {}
      return next;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggle, enabled }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
