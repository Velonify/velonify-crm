import { ConflictError, NotFoundError } from '../../../src/data/errors';
import { SCHEMA, type EntityTab } from '../../../src/data/schema';
import type { RecordUpdate, Store } from '../../../src/data/store';

/** What the hub can load, one route per Store method. */
const LADEN: Record<string, (store: Store) => Promise<unknown>> = {
  kern: (s) => s.load(),
  angebote: (s) => s.loadAngebotsDaten(),
  contact: (s) => s.loadContactDaten(),
  audits: (s) => s.loadAudits(),
  wordle: (s) => s.loadWordle(),
  monstera: (s) => s.loadMonstera(),
  eingang: (s) => s.loadEingang(),
  spiele: (s) => s.loadSpiele(),
  social: (s) => s.loadSocialDaten(),
  magnete: (s) => s.loadMagnetDaten(),
  kunden: (s) => s.loadKundenDaten(),
  todos: (s) => s.loadTodoDaten(),
  portal: (s) => s.loadPortalDaten(),
};

export interface Antwort {
  status: number;
  daten: unknown;
}

const istObjekt = (wert: unknown): wert is Record<string, unknown> => typeof wert === 'object' && wert !== null && !Array.isArray(wert);

/** Tables the hub writes through insert/update; listen and einstellungen have their own handling. */
function tabelle(wert: unknown): EntityTab | null {
  return typeof wert === 'string' && wert in SCHEMA && wert !== 'listen' && wert !== 'einstellungen' ? (wert as EntityTab) : null;
}

const fehler = (status: number, meldung: string, extra: Record<string, unknown> = {}): Antwort => ({ status, daten: { fehler: meldung, ...extra } });

/**
 * The API behind the hub, a thin layer over the Store interface: GET /daten/<gruppe>, POST /einfuegen, POST /aendern,
 * POST /einstellungen. Table and column names only ever come from SCHEMA; the store ignores unknown fields.
 */
export async function behandle(methode: string, pfad: string, body: unknown, store: Store): Promise<Antwort> {
  try {
    const laden = /^\/daten\/([a-z]+)$/.exec(pfad);
    if (laden) {
      if (methode !== 'GET') return fehler(405, 'Nur GET.');
      const gruppe = LADEN[laden[1]];
      return gruppe ? { status: 200, daten: await gruppe(store) } : fehler(404, 'Unbekannte Datengruppe.');
    }
    if (methode !== 'POST') return fehler(405, 'Nur POST.');
    if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');

    if (pfad === '/einfuegen') {
      const tab = tabelle(body.tab);
      if (!tab || !Array.isArray(body.records) || !body.records.every(istObjekt) || !body.records.every((r) => typeof r.id === 'string' && r.id)) {
        return fehler(400, 'Tabelle oder Datensätze ungültig.');
      }
      await store.insert(tab, body.records as never[]);
      return { status: 200, daten: { ok: true } };
    }
    if (pfad === '/aendern') {
      const tab = tabelle(body.tab);
      const updates = body.updates;
      if (!tab || !Array.isArray(updates) || !updates.every((u) => istObjekt(u) && typeof u.id === 'string' && istObjekt(u.changes))) {
        return fehler(400, 'Tabelle oder Änderungen ungültig.');
      }
      const ergebnis = await store.update(tab, updates as RecordUpdate<never>[]);
      return { status: 200, daten: { records: ergebnis } };
    }
    if (pfad === '/einstellungen') {
      const werte = body.werte;
      if (!istObjekt(werte) || !Object.values(werte).every((w) => typeof w === 'string')) return fehler(400, 'Einstellungen ungültig.');
      await store.saveEinstellungen(werte as Record<string, string>);
      return { status: 200, daten: { ok: true } };
    }
    return fehler(404, 'Unbekannte Route.');
  } catch (err) {
    if (err instanceof ConflictError) return fehler(409, err.message, { geaendert_von: err.geaendertVon, geaendert_am: err.geaendertAm });
    if (err instanceof NotFoundError) return fehler(404, err.message);
    throw err;
  }
}
