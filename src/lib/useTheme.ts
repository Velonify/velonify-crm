import { useCallback, useEffect, useState } from 'react';

/** Velonify themes: "light" for official documents, "espresso" for internal and design work. */
export type Theme = 'light' | 'espresso';

const KEY = 'velonify-crm.theme';
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

function read(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'espresso' ? value : null;
  } catch {
    return null;
  }
}

/** The active theme: picked once in this browser, otherwise light or espresso following the system's dark mode. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [gewaehlt, setGewaehlt] = useState<Theme | null>(read);
  const [system, setSystem] = useState<Theme>(() => (dark().matches ? 'espresso' : 'light'));
  const theme = gewaehlt ?? system;

  useEffect(() => {
    const media = dark();
    const onChange = () => setSystem(media.matches ? 'espresso' : 'light');
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
