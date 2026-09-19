import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { DemoLeadFinder } from '../data/demo/leadFinderDemo';
import { AuthExpiredError } from '../data/errors';
import { planeImport } from '../data/importCsv';
import { CloudLeadFinder, importZeilen, type EntscheidungEintrag, type LeadFinderApi, type LeadKandidat } from '../data/leadFinder';

// One demo instance for the whole session, so decisions survive switching pages.
let demo: DemoLeadFinder | null = null;

/** The Cloud Function in production, invented shops in demo mode; null while its address is not configured. */
export function useLeadFinderApi(): LeadFinderApi | null {
  const { getToken } = useAuth();
  return useMemo(() => {
    if (isDemo) return (demo ??= new DemoLeadFinder());
    return config.shopAuditUrl ? new CloudLeadFinder(config.shopAuditUrl, getToken) : null;
  }, [getToken]);
}

export const NICHT_EINGERICHTET = 'Die Adresse der Function fehlt noch (Repo-Variable SHOP_AUDIT_URL).';

export interface LeadStapel {
  gesamt: number;
  erledigt: number;
  qualifiziert: number;
  manuell: number;
  fehler: { domain: string; meldung: string }[];
  laufend: string[];
  /** Last results, newest first, for the live list. */
  zuletzt: LeadKandidat[];
}

const LEER: LeadStapel = { gesamt: 0, erledigt: 0, qualifiziert: 0, manuell: 0, fehler: [], laufend: [], zuletzt: [] };
const GLEICHZEITIG = 6;

/**
 * Checks the next n candidates of the pool, in priority order and six at a time. Runs in this browser tab; closing
 * it stops after the checks already running, and the next start simply continues where the pool is unchecked.
 */
export function useLeadStapel(api: LeadFinderApi | null, onFertig: () => void) {
  const { expire } = useAuth();
  const [stand, setStand] = useState<LeadStapel>(LEER);
  const [laeuft, setLaeuft] = useState(false);
  const abbrechen = useRef(false);

  useEffect(() => {
    if (!laeuft) return;
    const warnen = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [laeuft]);

  useEffect(
    () => () => {
      abbrechen.current = true;
    },
    [],
  );

  const starte = useCallback(
    async (n: number) => {
      if (!api || laeuft) return;
      abbrechen.current = false;
      setLaeuft(true);
      try {
        const queue = await api.naechste(n);
        setStand({ ...LEER, gesamt: queue.length });
        const arbeiter = async () => {
          while (queue.length > 0 && !abbrechen.current) {
            const kandidat = queue.shift()!;
            setStand((s) => ({ ...s, laufend: [...s.laufend, kandidat.domain] }));
            try {
              const k = await api.pruefe(kandidat);
              const manuell = k.ausschluss.some((a) => a.id === 'blockiert' || a.id === 'adresse_unklar');
              setStand((s) => ({
                ...s,
                laufend: s.laufend.filter((d) => d !== kandidat.domain),
                erledigt: s.erledigt + 1,
                qualifiziert: s.qualifiziert + (k.qualifiziert ? 1 : 0),
                manuell: s.manuell + (manuell ? 1 : 0),
                zuletzt: [k, ...s.zuletzt].slice(0, 8),
              }));
            } catch (err) {
              const meldung = err instanceof Error ? err.message : String(err);
              setStand((s) => ({ ...s, laufend: s.laufend.filter((d) => d !== kandidat.domain), fehler: [...s.fehler, { domain: kandidat.domain, meldung }] }));
              if (err instanceof AuthExpiredError) {
                abbrechen.current = true;
                expire();
              }
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(GLEICHZEITIG, queue.length) }, arbeiter));
      } catch (err) {
        if (err instanceof AuthExpiredError) expire();
        setStand((s) => ({ ...s, fehler: [...s.fehler, { domain: '', meldung: err instanceof Error ? err.message : String(err) }] }));
      } finally {
        setLaeuft(false);
        onFertig();
      }
    },
    [api, laeuft, expire, onFertig],
  );

  const stoppe = useCallback(() => {
    abbrechen.current = true;
  }, []);

  return { stand, laeuft, starte, stoppe };
}

export type Ziel = 'pipeline' | 'firma';

export interface UebernahmeErgebnis {
  neu: number;
  ergaenzt: number;
  deals: number;
  /** Rows the import planning held back as possible duplicates; they stay in the backlog. */
  dubletten: { domain: string; hinweis: string }[];
}

/**
 * Takes checked shops over into the CRM through the regular import planning (duplicate check, never overwrite),
 * then records the decision so they leave the backlog.
 */
export function useUebernahme(api: LeadFinderApi | null) {
  const { db, mutate } = useCrm();
  const { expire } = useAuth();

  return useCallback(
    async (domains: string[], ziel: Ziel, zustaendig: string): Promise<UebernahmeErgebnis> => {
      if (!api) throw new Error(NICHT_EINGERICHTET);
      if (!db) throw new Error('Die CRM-Daten sind noch nicht geladen.');
      try {
        const kandidaten = await api.details(domains);
        const plan = planeImport(importZeilen(kandidaten), db, { tiers: ['A', 'B', 'C', 'D', 'sonstige'], zustaendig, dealAnlegen: ziel === 'pipeline', dealTitel: '' });
        const ergebnis = await mutate((s) => s.importiere(plan));
        const eintraege: EntscheidungEintrag[] = plan.zeilen
          .filter((z) => ergebnis.firmen[z.domain])
          .map((z) => ({ domain: z.domain, entscheidung: ziel, firma_id: ergebnis.firmen[z.domain], grund: z.aktion === 'ergaenzen' ? 'war schon im CRM, leere Felder ergänzt' : '' }));
        if (eintraege.length > 0) await api.entscheide(eintraege);
        return {
          neu: ergebnis.neu,
          ergaenzt: ergebnis.ergaenzt,
          deals: ergebnis.deals,
          dubletten: plan.zeilen.filter((z) => z.aktion === 'dublette').map((z) => ({ domain: z.domain, hinweis: z.hinweis })),
        };
      } catch (err) {
        if (err instanceof AuthExpiredError) expire();
        throw err;
      }
    },
    [api, db, mutate, expire],
  );
}
