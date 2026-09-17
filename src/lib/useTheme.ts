import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** "light" is the design system's light theme; "dark" the app's own, eye-friendly dark mode. */
export type Theme = 'light' | 'dark';

const KEY = 'velonify-crm.theme';
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs the theme change as a soft crossfade: the View Transitions API where the browser has it,
 * otherwise a short colour transition (class "theme-switching", see styles.css). None with reduced motion.
 */
function mitUebergang(change: () => void) {
  if (reducedMotion()) return change();
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(change);
    return;
  }
  const root = document.documentElement;
  root.classList.add('theme-switching');
  change();
  window.setTimeout(() => root.classList.remove('theme-switching'), 400);
}

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

  // Layout effect: the attribute must change in the same commit as the sidebar, so the transition captures both.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    if (next === document.documentElement.dataset.theme) return;
    mitUebergang(() => flushSync(() => setGewaehlt(next)));
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
  }, []);

  return [theme, setTheme];
}
