import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', toggle: () => {} });

// Light unless the user has chosen dark with the toggle (the choice is remembered).
const KEY = 'theme-choice';
const initial = () => (localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light');

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  const toggle = () =>
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      return next;
    });
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
