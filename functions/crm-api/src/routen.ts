import { ConflictError, GesperrtError, NotFoundError } from '../../../src/data/errors';
import { MITARBEITER_SCHLUESSEL } from '../../../src/data/rollen';
import { SCHEMA, type EntityTab } from '../../../src/data/schema';
import type { RecordUpdate, Store } from '../../../src/data/store';
import type { Erwaehnung } from '../../../src/data/types';
import type { DbPool, PostgresStore } from '../../../src/data/postgres/postgresStore';
import { uebernimm, zaehle } from '../../../src/data/postgres/uebernahme';

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
  erwaehnungen: (s) => s.loadErwaehnungen(),
  portal: (s) => s.loadPortalDaten(),
  whiteboards: (s) => s.loadWhiteboardDaten(),
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

export interface RoutenOptionen {
  /** Gets new @-mentions after they are saved, e.g. to send them to Slack. Errors are only logged. */
  erwaehnt?: (erwaehnungen: Erwaehnung[]) => Promise<void>;
  /** Whether the caller may change who is an employee (admins only). */
  darfRollen?: boolean;
}

const fehler = (status: number, meldung: string, extra: Record<string, unknown> = {}): Antwort => ({ status, daten: { fehler: meldung, ...extra } });

/**
 * The API behind the hub, a thin layer over the Store interface: GET /daten/<gruppe>, POST /einfuegen, POST /aendern,
 * POST /einstellungen. Table and column names only ever come from SCHEMA; the store ignores unknown fields.
 */
export async function behandle(methode: string, pfad: string, body: unknown, store: Store, optionen: RoutenOptionen = {}): Promise<Antwort> {
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
      if (tab === 'erwaehnungen' && optionen.erwaehnt) {
        await optionen.erwaehnt(body.records as unknown as Erwaehnung[]).catch((err) => console.error('Erwähnungen nicht an Slack gesendet', err));
      }
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
      if (MITARBEITER_SCHLUESSEL in werte && !optionen.darfRollen) return fehler(403, 'Rollen dürfen nur Admins vergeben.');
      await store.saveEinstellungen(werte as Record<string, string>);
      return { status: 200, daten: { ok: true } };
    }
    return fehler(404, 'Unbekannte Route.');
  } catch (err) {
    if (err instanceof ConflictError) return fehler(409, err.message, { geaendert_von: err.geaendertVon, geaendert_am: err.geaendertAm });
    if (err instanceof NotFoundError) return fehler(404, err.message);
    if (err instanceof GesperrtError) return fehler(403, err.message);
    throw err;
  }
}

/** Takeover from the sheet (admins only, checked by the caller): POST /admin/uebernahme, GET /admin/zaehlen. */
export async function behandleAdmin(methode: string, pfad: string, body: unknown, db: DbPool): Promise<Antwort> {
  if (pfad === '/admin/zaehlen' && methode === 'GET') return { status: 200, daten: await zaehle(db) };
  if (pfad === '/admin/uebernahme' && methode === 'POST') {
    if (!istObjekt(body) || typeof body.tab !== 'string' || !(body.tab in SCHEMA) || !Array.isArray(body.zeilen) || !body.zeilen.every(istObjekt)) {
      return fehler(400, 'Tabelle oder Zeilen ungültig.');
    }
    return { status: 200, daten: { geschrieben: await uebernimm(db, body.tab as keyof typeof SCHEMA, body.zeilen) } };
  }
  return fehler(404, 'Unbekannte Route.');
}

/**
 * Data view (Einrichtung → Daten), for the whole team: any table, the change log of a record and the select lists.
 * Edits of records go through POST /aendern like every other write, with the same conflict check.
 */
export async function behandleDaten(methode: string, pfad: string, body: unknown, store: PostgresStore): Promise<Antwort | null> {
  const tabelle = /^\/tabelle\/([a-z_]+)$/.exec(pfad);
  if (tabelle) {
    if (methode !== 'GET') return fehler(405, 'Nur GET.');
    return tabelle[1] in SCHEMA ? { status: 200, daten: { records: await store.ladeTabelle(tabelle[1] as keyof typeof SCHEMA) } } : fehler(404, 'Unbekannte Tabelle.');
  }
  const verlauf = /^\/verlauf\/([a-z_]+)\/([^/]+)$/.exec(pfad);
  if (verlauf) {
    if (methode !== 'GET') return fehler(405, 'Nur GET.');
    if (!(verlauf[1] in SCHEMA)) return fehler(404, 'Unbekannte Tabelle.');
    return { status: 200, daten: { eintraege: await store.verlauf(verlauf[1] as keyof typeof SCHEMA, decodeURIComponent(verlauf[2])) } };
  }
  if (pfad === '/listen') {
    if (methode !== 'POST') return fehler(405, 'Nur POST.');
    if (!istObjekt(body) || typeof body.liste !== 'string' || !/^[a-z_]{1,40}$/.test(body.liste) || !Array.isArray(body.werte)) return fehler(400, 'Liste ungültig.');
    const werte = [...new Set(body.werte.map((w) => String(w).trim()).filter(Boolean))];
    if (werte.length === 0 || werte.length > 100) return fehler(400, 'Eine Liste braucht 1 bis 100 Werte.');
    await store.setzeListe(body.liste, werte);
    return { status: 200, daten: { ok: true } };
  }
  return null;
}
