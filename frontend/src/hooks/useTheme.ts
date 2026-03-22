import { useCallback, useEffect, useState } from 'react';

export type Theme = 'pv-light' | 'pv-dark';

const STORAGE_KEY = 'pv-theme';

function readStored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'pv-dark' ? 'pv-dark' : 'pv-light';
  } catch {
    return 'pv-light';
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'pv-light' ? 'pv-dark' : 'pv-light'));
  }, []);

  return { theme, toggleTheme, isDark: theme === 'pv-dark' };
}
