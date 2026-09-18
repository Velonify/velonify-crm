import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo } from '../config';
import { baueAuditAnfrage, domainSchluessel, type AuditErgebnis } from '../data/audit';
import { useCrm } from '../data/CrmContext';
import { AuthExpiredError, SchemaError } from '../data/errors';
import { CloudShopAudit, DemoShopAudit, type ShopAuditApi } from '../data/shopAudit';
import type { Audit, Firma, OutreachLeistung } from '../data/types';
import { useLoad } from '../lib/useLoad';

/** All audits; `reload` after a new one was saved. */
export function useAudits() {
  const { service } = useCrm();
  return useLoad(() => (service ? service.loadAudits() : new Promise<never>(() => {})), [service]);
}

/** The Cloud Function in production, made-up audits in demo mode; null while the address is not configured. */
export function useShopAuditApi(): ShopAuditApi | null {
  const { getToken } = useAuth();
  return useMemo(() => {
    if (isDemo) return new DemoShopAudit();
    return config.shopAuditUrl ? new CloudShopAudit(config.shopAuditUrl, getToken) : null;
  }, [getToken]);
}

/**
 * Runs an audit and stores it. The outreach services of the Contact Generator go along so Claude can write hooks
 * for them; without the Contact Generator set up, the audit runs without hooks.
 */
export function useAuditPruefen() {
  const { service, mutate } = useCrm();
  const { expire } = useAuth();
  const api = useShopAuditApi();
  const leistungen = useRef<Promise<OutreachLeistung[]> | null>(null);

  const pruefe = useCallback(
    async (domain: string, firmaId = ''): Promise<{ audit: Audit; ergebnis: AuditErgebnis }> => {
      if (!api) throw new Error('Die Adresse des Shop-Audits ist noch nicht hinterlegt (Repo-Variable SHOP_AUDIT_URL).');
      if (!service) throw new Error('Die Daten sind noch nicht geladen.');
      leistungen.current ??= service.loadContactDaten().then(
        (d) => d.leistungen,
        (err: unknown) => {
          if (err instanceof SchemaError) return [];
          leistungen.current = null;
          throw err;
        },
      );
      try {
        const ergebnis = await api.pruefe(baueAuditAnfrage(domain, await leistungen.current));
        const audit = await mutate((s) => s.speichereAudit(ergebnis, firmaId));
        return { audit, ergebnis };
      } catch (err) {
        if (err instanceof AuthExpiredError) expire();
        throw err;
      }
    },
    [api, service, mutate, expire],
  );

  return { pruefe, bereit: Boolean(api) };
}

export interface StapelStand {
  /** Company ids still waiting. */
  warteschlange: string[];
  laufend: string[];
  erledigt: number;
  fehler: { firmaId: string; meldung: string }[];
  gesamt: number;
}

const LEER: StapelStand = { warteschlange: [], laufend: [], erledigt: 0, fehler: [], gesamt: 0 };
const GLEICHZEITIG = 2;

/**
 * Checks several companies one after another, two at a time. Runs in this browser tab: leaving the page stops it
 * after the audits already running.
 */
export function useStapelPruefung(firmen: readonly Firma[], onGespeichert: () => void) {
  const { pruefe } = useAuditPruefen();
  const [stand, setStand] = useState<StapelStand>(LEER);
  const abbrechen = useRef(false);
  const aktiv = useRef(false);
  const firmenRef = useRef(firmen);
  firmenRef.current = firmen;

  const laeuft = stand.laufend.length > 0 || stand.warteschlange.length > 0;

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
    async (ids: string[]) => {
      if (aktiv.current || ids.length === 0) return;
      aktiv.current = true;
      abbrechen.current = false;
      const queue = [...ids];
      setStand({ ...LEER, warteschlange: [...queue], gesamt: queue.length });

      const arbeiter = async () => {
        while (queue.length > 0 && !abbrechen.current) {
          const id = queue.shift()!;
          setStand((s) => ({ ...s, warteschlange: s.warteschlange.filter((x) => x !== id), laufend: [...s.laufend, id] }));
          const firma = firmenRef.current.find((f) => f.id === id);
          try {
            if (!firma?.domain) throw new Error('Keine Domain hinterlegt.');
            await pruefe(domainSchluessel(firma.domain), firma.id);
            setStand((s) => ({ ...s, laufend: s.laufend.filter((x) => x !== id), erledigt: s.erledigt + 1 }));
            onGespeichert();
          } catch (err) {
            const meldung = err instanceof Error ? err.message : String(err);
            setStand((s) => ({ ...s, laufend: s.laufend.filter((x) => x !== id), fehler: [...s.fehler, { firmaId: id, meldung }] }));
            // Without a valid login every further audit would fail the same way.
            if (err instanceof AuthExpiredError) abbrechen.current = true;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(GLEICHZEITIG, ids.length) }, arbeiter));
      setStand((s) => ({ ...s, warteschlange: [] }));
      aktiv.current = false;
    },
    [pruefe, onGespeichert],
  );

  const stoppe = useCallback(() => {
    abbrechen.current = true;
    setStand((s) => ({ ...s, warteschlange: [] }));
  }, []);

  return { stand, laeuft, starte, stoppe };
}
