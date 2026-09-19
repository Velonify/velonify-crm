import { useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCrm } from '../data/CrmContext';
import { AuthExpiredError } from '../data/errors';
import type { WordleErgebnis } from '../data/types';
import { normalisiere, WORT_LAENGE } from '../data/wordle';
import { useLoad } from '../lib/useLoad';

/** All results of the word game; `reload` after a game was saved. */
export function useWordleErgebnisse() {
  const { service } = useCrm();
  return useLoad(() => (service ? service.loadWordle() : new Promise<never>(() => {})), [service]);
}

/** Saves a finished game without reloading the whole CRM. */
export function useWordleSpeichern() {
  const { service } = useCrm();
  const { expire } = useAuth();
  return useCallback(
    async (input: Pick<WordleErgebnis, 'datum' | 'spieler' | 'versuche' | 'geloest' | 'muster'>) => {
      if (!service) throw new Error('Die Daten sind noch nicht geladen.');
      try {
        return await service.speichereWordle(input);
      } catch (err) {
        if (err instanceof AuthExpiredError) expire();
        throw err;
      }
    },
    [service, expire],
  );
}

/*
 * Attempts of a running game live in this browser, so a reload keeps the board. Only the finished result goes to
 * the sheet, as colours without letters.
 */
const schluessel = (tag: string, spieler: string) => `velonify-crm.wordle.${tag}.${spieler}`;

export function leseVersuche(tag: string, spieler: string): string[] {
  try {
    const wert: unknown = JSON.parse(localStorage.getItem(schluessel(tag, spieler)) ?? '[]');
    return Array.isArray(wert) ? wert.filter((v): v is string => typeof v === 'string' && normalisiere(v) === v && v.length === WORT_LAENGE) : [];
  } catch {
    return [];
  }
}

export function speichereVersuche(tag: string, spieler: string, versuche: readonly string[]): void {
  try {
    localStorage.setItem(schluessel(tag, spieler), JSON.stringify(versuche));
  } catch {
    // Storage blocked: the board lasts until reload, the result still goes to the sheet.
  }
}
