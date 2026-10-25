import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCrm } from '../data/CrmContext';
import { ansichtSchluessel, leseAnsicht, schreibeAnsicht, type Ansicht } from '../data/ansicht';
import { errorMessage } from './errors';

const KEY = 'velonify-crm.ansicht';
/** Tells every user of the hook (rail, start page, page heads) about a change right away. */
const GEAENDERT = 'velonify-ansicht';

function ausCache(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * The signed-in person's view. Stored per address in "einstellungen", so it follows the person to every device;
 * a copy in this browser lets the rail and start page look right before the data has loaded.
 */
export function useAnsicht(): { ansicht: Ansicht; setze(teil: Partial<Ansicht>): void; fehler: string | null } {
  const { state } = useAuth();
  const { db, service, mutate } = useCrm();
  const email = state.status === 'signedOut' ? '' : state.user.email;
  const gespeichert = email ? db?.einstellungen[ansichtSchluessel(email)] : undefined;
  const [lokal, setLokal] = useState<string | null>(ausCache);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const neu = (e: Event) => setLokal((e as CustomEvent<string>).detail);
    window.addEventListener(GEAENDERT, neu);
    return () => window.removeEventListener(GEAENDERT, neu);
  }, []);

  // Once the stored value arrives it wins over this browser's copy (e.g. changed on another device).
  useEffect(() => {
    if (gespeichert === undefined || gespeichert === lokal) return;
    setLokal(gespeichert);
    try {
      localStorage.setItem(KEY, gespeichert);
    } catch {
      // Storage blocked: fine, the stored value is used.
    }
  }, [gespeichert]);

  const ansicht = leseAnsicht(lokal ?? gespeichert);

  const setze = useCallback(
    (teil: Partial<Ansicht>) => {
      const roh = schreibeAnsicht({ ...leseAnsicht(ausCache() ?? gespeichert), ...teil });
      try {
        localStorage.setItem(KEY, roh);
      } catch {
        // Storage blocked: the change still reaches the hub below.
      }
      window.dispatchEvent(new CustomEvent(GEAENDERT, { detail: roh }));
      setFehler(null);
      if (!email || !service) return;
      mutate((s) => s.saveEinstellungen({ [ansichtSchluessel(email)]: roh })).catch((err) => setFehler(errorMessage(err)));
    },
    [email, gespeichert, service, mutate],
  );

  return { ansicht, setze, fehler };
}
