import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { findeTeamMitglied } from '../data/selectors';

const KEY = 'velonify-crm.ich';
/** Tells the other users of the hook (e.g. the bell) about a new choice. */
const GEWECHSELT = 'velonify-ich';

/** The team member picked in this browser, if any (the service uses it so nobody gets notified about their own mention). */
export function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Which team member the signed-in person is ("Lugge", "Julian" …). Guessed from the Google profile,
 * or picked once and remembered in this browser.
 */
export function useIch(team: readonly string[]): [string | null, (name: string) => void] {
  const { state } = useAuth();
  const [gewaehlt, setGewaehlt] = useState<string | null>(read);
  const user = state.status === 'signedOut' ? null : state.user;

  useEffect(() => {
    const neu = (e: Event) => setGewaehlt((e as CustomEvent<string | null>).detail);
    window.addEventListener(GEWECHSELT, neu);
    return () => window.removeEventListener(GEWECHSELT, neu);
  }, []);

  const ich = gewaehlt && team.includes(gewaehlt) ? gewaehlt : user ? findeTeamMitglied(team, user.name, user.email) : null;

  const setIch = useCallback((name: string) => {
    setGewaehlt(name || null);
    try {
      if (name) localStorage.setItem(KEY, name);
      else localStorage.removeItem(KEY);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
    window.dispatchEvent(new CustomEvent(GEWECHSELT, { detail: name || null }));
  }, []);

  return [ich, setIch];
}
