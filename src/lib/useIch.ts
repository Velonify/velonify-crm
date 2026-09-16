import { useCallback, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { findeTeamMitglied } from '../data/selectors';

const KEY = 'velonify-crm.ich';

function read(): string | null {
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

  const ich = gewaehlt && team.includes(gewaehlt) ? gewaehlt : user ? findeTeamMitglied(team, user.name, user.email) : null;

  const setIch = useCallback((name: string) => {
    setGewaehlt(name || null);
    try {
      if (name) localStorage.setItem(KEY, name);
      else localStorage.removeItem(KEY);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
  }, []);

  return [ich, setIch];
}
