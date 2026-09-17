import { useCallback, useEffect, useState } from 'react';

/** "light" is the design system's light theme; "dark" the app's own, eye-friendly dark mode. */
export type Theme = 'light' | 'dark';

const KEY = 'velonify-crm.theme';
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

function read(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'espresso') return 'dark'; // stored by the first redesign draft
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** The active theme: picked once in this browser, otherwise light or dark following the system's dark mode. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [gewaehlt, setGewaehlt] = useState<Theme | null>(read);
  const [system, setSystem] = useState<Theme>(() => (dark().matches ? 'dark' : 'light'));
  const theme = gewaehlt ?? system;

  useEffect(() => {
    const media = dark();
    const onChange = () => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setGewaehlt(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
  }, []);

  return [theme, setTheme];
}
