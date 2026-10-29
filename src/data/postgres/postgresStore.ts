import { ConflictError, NotFoundError } from '../errors';
import { ANGEBOTS_TABS, CONTACT_TABS, ENTITY_TABS, KUNDEN_TABS, LISTEN_DEFAULTS, MAGNET_TABS, PORTAL_TABS, SCHEMA, SOCIAL_TABS, TODO_TABS, WHITEBOARD_TABS, type EntityTab, type TabName, type TabSchema } from '../schema';
import type { RecordUpdate, Store } from '../store';
import type { Anfrage, AngebotsDaten, Audit, ContactDaten, Database, Einstellungen, EntityMap, Erwaehnung, KundenDaten, Listen, MagnetDaten, MonsteraEintrag, PortalDaten, SocialDaten, SpieleDaten, TodoDaten, WhiteboardDaten, WordleErgebnis } from '../types';

/** The little of a Postgres client the store needs: node-postgres in the functions, PGlite in the tests. */
export interface Db {
  query<R = Record<string, unknown>>(sql: string, werte?: unknown[]): Promise<{ rows: R[] }>;
}

export interface DbPool extends Db {
  /** Runs `arbeit` in one transaction on one connection; rolls back when it throws. */
  transaktion<T>(arbeit: (db: Db) => Promise<T>): Promise<T>;
}

type Wert = string | number | boolean | null;

/** One entry of the change log; `vorher` is empty for inserts. */
export interface Aenderung {
  id: string;
  aktion: 'insert' | 'update';
  vorher: Record<string, unknown> | null;
  nachher: Record<string, unknown>;
  von: string | null;
  am: string;
}

/** Value for the database: '' becomes NULL, numbers and booleans are parsed like the sheet did. */
export function zuDb(schema: TabSchema, spalte: string, wert: unknown): Wert {
  if (schema.boolean?.includes(spalte)) return wert === true || String(wert ?? '').trim().toUpperCase() === 'TRUE';
  if (schema.numeric?.includes(spalte)) {
    if (wert === undefined || wert === null || String(wert).trim() === '') return null;
    const n = typeof wert === 'number' ? wert : Number(String(wert).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (wert === undefined || wert === null || wert === '') return null;
  return String(wert);
}

/** Value for the app, exactly like `rowToRecord` produced it from the sheet: NULL text becomes ''. */
function zuApp(schema: TabSchema, spalte: string, wert: unknown): Wert {
  if (schema.boolean?.includes(spalte)) return wert === true;
  if (schema.numeric?.includes(spalte)) return wert === null || wert === undefined ? null : Number(wert);
  return wert === null || wert === undefined ? '' : String(wert);
}

export function zuRecord(schema: TabSchema, zeile: Record<string, unknown>): Record<string, Wert> {
  const record: Record<string, Wert> = {};
  for (const spalte of schema.columns) record[spalte] = zuApp(schema, spalte, zeile[spalte]);
  return record;
}

const spaltenListe = (schema: TabSchema) => schema.columns.join(', ');

/**
 * Postgres as database, with the same behaviour as SheetStore: whole tabs are loaded, rows are found by id, nothing is
 * deleted, and an update fails with ConflictError when `geaendert_am` changed since it was loaded. Every write runs in a
 * transaction that tells the change log who made it.
 */
export class PostgresStore implements Store {
  private readonly db: DbPool;
  private readonly person: () => string;
  /** Values of lists the database doesn't have yet (own instances start without Velonify's team). */
  private readonly vorgaben: Listen;

  constructor(db: DbPool, person: () => string = () => '', vorgaben: Listen = LISTEN_DEFAULTS) {
    this.db = db;
    this.person = person;
    this.vorgaben = vorgaben;
  }

  private async tabelle<K extends EntityTab>(tab: K, db: Db = this.db): Promise<EntityMap[K][]> {
    const schema = SCHEMA[tab];
    const { rows } = await db.query(`SELECT ${spaltenListe(schema)} FROM ${schema.name} ORDER BY nr`);
    return rows.map((zeile) => zuRecord(schema, zeile) as unknown as EntityMap[K]);
  }

  private schreibend<T>(arbeit: (db: Db) => Promise<T>): Promise<T> {
    return this.db.transaktion(async (db) => {
      await db.query(`SELECT set_config('app.person', $1, true)`, [this.person()]);
      return arbeit(db);
    });
  }

  async load(): Promise<Database> {
    const [[firmen, kontakte, deals, aktivitaeten, wiedervorlagen], listenZeilen, einstellungenZeilen] = await Promise.all([
      Promise.all(ENTITY_TABS.map((tab) => this.tabelle(tab))),
      this.db.query<{ liste: string; wert: string }>('SELECT liste, wert FROM listen ORDER BY nr'),
      this.db.query<{ schluessel: string; wert: string | null }>('SELECT schluessel, wert FROM einstellungen ORDER BY nr'),
    ]);
    const listen: Listen = {};
    for (const { liste, wert } of listenZeilen.rows) {
      if (liste.trim() && wert.trim()) (listen[liste.trim()] ??= []).push(wert.trim());
    }
    const einstellungen: Einstellungen = {};
    for (const { schluessel, wert } of einstellungenZeilen.rows) {
      if (schluessel.trim()) einstellungen[schluessel.trim()] = (wert ?? '').trim();
    }
    return {
      firmen: firmen as Database['firmen'],
      kontakte: kontakte as Database['kontakte'],
      deals: deals as Database['deals'],
      aktivitaeten: aktivitaeten as Database['aktivitaeten'],
      wiedervorlagen: wiedervorlagen as Database['wiedervorlagen'],
      listen: { ...this.vorgaben, ...listen },
      einstellungen,
    };
  }

  async loadAngebotsDaten(): Promise<AngebotsDaten> {
    const [kategorien, leistungen, angebote] = await Promise.all(ANGEBOTS_TABS.map((tab) => this.tabelle(tab)));
    return { kategorien, leistungen, angebote } as AngebotsDaten;
  }

  async loadContactDaten(): Promise<ContactDaten> {
    const [leistungen, anschreiben] = await Promise.all(CONTACT_TABS.map((tab) => this.tabelle(tab)));
    return { leistungen, anschreiben } as ContactDaten;
  }

  loadAudits(): Promise<Audit[]> {
    return this.tabelle('audits');
  }

  loadWordle(): Promise<WordleErgebnis[]> {
    return this.tabelle('wordle');
  }

  loadMonstera(): Promise<MonsteraEintrag[]> {
    return this.tabelle('monstera');
  }

  loadEingang(): Promise<Anfrage[]> {
    return this.tabelle('eingang');
  }

  async loadSpiele(): Promise<SpieleDaten> {
    const [wordle, monstera] = await Promise.all([this.tabelle('wordle'), this.tabelle('monstera')]);
    return { wordle, monstera };
  }

  async loadSocialDaten(): Promise<SocialDaten> {
    const [plan, inhalte, hooks, aufgaben, texte, werte, dms] = await Promise.all(SOCIAL_TABS.map((tab) => this.tabelle(tab)));
    return { plan, inhalte, hooks, aufgaben, texte, werte, dms } as SocialDaten;
  }

  async loadMagnetDaten(): Promise<MagnetDaten> {
    const [magnete, leads] = await Promise.all(MAGNET_TABS.map((tab) => this.tabelle(tab)));
    return { magnete, leads } as MagnetDaten;
  }

  async loadKundenDaten(): Promise<KundenDaten> {
    const [links, news] = await Promise.all(KUNDEN_TABS.map((tab) => this.tabelle(tab)));
    return { links, news } as KundenDaten;
  }

  async loadTodoDaten(): Promise<TodoDaten> {
    const [boards, aufgaben, kommentare] = await Promise.all(TODO_TABS.map((tab) => this.tabelle(tab)));
    return { boards, aufgaben, kommentare } as TodoDaten;
  }

  loadErwaehnungen(): Promise<Erwaehnung[]> {
    return this.tabelle('erwaehnungen');
  }

  async loadPortalDaten(): Promise<PortalDaten> {
    const [zugaenge, werkzeuge, meilensteine, tracking, berichte, feedback] = await Promise.all(PORTAL_TABS.map((tab) => this.tabelle(tab)));
    return { zugaenge, werkzeuge, meilensteine, tracking, berichte, feedback } as PortalDaten;
  }

  async loadWhiteboardDaten(): Promise<WhiteboardDaten> {
    const [boards, kommentare] = await Promise.all(WHITEBOARD_TABS.map((tab) => this.tabelle(tab)));
    return { boards, kommentare } as WhiteboardDaten;
  }

  /** Any table as the app sees it, for the data view (Einrichtung → Daten). */
  ladeTabelle(tab: TabName): Promise<Record<string, Wert>[]> {
    const schema = SCHEMA[tab];
    return this.db.query(`SELECT ${spaltenListe(schema)} FROM ${schema.name} ORDER BY nr`).then(({ rows }) => rows.map((z) => zuRecord(schema, z)));
  }

  /** Change log of one record, newest first. */
  async verlauf(tab: TabName, id: string): Promise<Aenderung[]> {
    const { rows } = await this.db.query<Aenderung>(
      'SELECT id::text AS id, aktion, vorher, nachher, von, am::text AS am FROM aenderungen WHERE tabelle = $1 AND datensatz_id = $2 ORDER BY id DESC LIMIT 200',
      [tab, id],
    );
    return rows;
  }

  /** Replaces the values of one select list (team, verlustgrund, …) in the given order. */
  async setzeListe(liste: string, werte: string[]): Promise<void> {
    await this.schreibend(async (db) => {
      await db.query('DELETE FROM listen WHERE liste = $1', [liste]);
      for (const wert of werte) await db.query('INSERT INTO listen (liste, wert) VALUES ($1, $2) ON CONFLICT DO NOTHING', [liste, wert]);
    });
  }

  /** The tables always exist (migrations), so there is no structure to forget. */
  vergissStruktur(): void {}

  async insert<K extends EntityTab>(tab: K, records: EntityMap[K][]): Promise<void> {
    if (records.length === 0) return;
    const schema = SCHEMA[tab];
    const werte: Wert[] = [];
    const zeilen = records.map((record) => {
      const platzhalter = schema.columns.map((spalte) => {
        werte.push(zuDb(schema, spalte, (record as unknown as Record<string, unknown>)[spalte]));
        return `$${werte.length}`;
      });
      return `(${platzhalter.join(', ')})`;
    });
    await this.schreibend((db) => db.query(`INSERT INTO ${schema.name} (${spaltenListe(schema)}) VALUES ${zeilen.join(', ')}`, werte));
  }

  async update<K extends EntityTab>(tab: K, updates: RecordUpdate<EntityMap[K]>[]): Promise<EntityMap[K][]> {
    if (updates.length === 0) return [];
    const schema = SCHEMA[tab];
    return this.schreibend(async (db) => {
      const ids = [...new Set(updates.map((u) => u.id))];
      const { rows } = await db.query(`SELECT ${spaltenListe(schema)} FROM ${schema.name} WHERE id = ANY($1) FOR UPDATE`, [ids]);
      const aktuell = new Map(rows.map((zeile) => [String(zeile.id), zuRecord(schema, zeile)]));

      const ergebnisse: EntityMap[K][] = [];
      // Only columns named in the changes are written: a narrower UPDATE right (kundenportal) is enough, and the log stays small.
      const geaendert = new Map<string, Set<string>>();
      for (const update of updates) {
        const current = aktuell.get(update.id);
        if (!current) throw new NotFoundError();
        if (update.expectedGeaendertAm !== undefined && String(current.geaendert_am ?? '') !== update.expectedGeaendertAm) {
          throw new ConflictError(String(current.geaendert_von ?? ''), String(current.geaendert_am ?? ''));
        }
        // Normalised like a fresh read, so several updates to the same record in one call build on each other.
        const roh = { ...current, ...update.changes, id: update.id } as Record<string, unknown>;
        const next = zuRecord(schema, Object.fromEntries(schema.columns.map((s) => [s, zuDb(schema, s, roh[s])])));
        aktuell.set(update.id, next);
        const spalten = geaendert.get(update.id) ?? new Set<string>();
        for (const spalte of Object.keys(update.changes)) if (spalte !== 'id' && (schema.columns as readonly string[]).includes(spalte)) spalten.add(spalte);
        geaendert.set(update.id, spalten);
        ergebnisse.push(next as unknown as EntityMap[K]);
      }

      for (const [id, spalten] of geaendert) {
        if (spalten.size === 0) continue;
        const liste = [...spalten];
        const record = aktuell.get(id)!;
        await db.query(`UPDATE ${schema.name} SET ${liste.map((s, i) => `${s} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...liste.map((s) => zuDb(schema, s, record[s]))]);
      }
      return ergebnisse;
    });
  }

  async saveEinstellungen(values: Einstellungen): Promise<void> {
    const eintraege = Object.entries(values);
    if (eintraege.length === 0) return;
    await this.schreibend(async (db) => {
      for (const [schluessel, wert] of eintraege) {
        await db.query(
          'INSERT INTO einstellungen (schluessel, wert) VALUES ($1, $2) ON CONFLICT (schluessel) DO UPDATE SET wert = EXCLUDED.wert',
          [schluessel, wert === '' ? null : wert],
        );
      }
    });
  }
}
