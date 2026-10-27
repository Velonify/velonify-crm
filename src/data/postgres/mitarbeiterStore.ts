import { GesperrtError } from '../errors';
import { GESPERRTE_TABS, MITARBEITER_SCHLUESSEL, mitarbeiterListe, ohneGeld, ohneGeldAenderung } from '../rollen';
import type { EntityTab, TabName } from '../schema';
import type { RecordUpdate } from '../store';
import type { AngebotsDaten, Database, EntityMap, SocialDaten } from '../types';
import { PostgresStore, type Aenderung, type Db } from './postgresStore';

function pruefe(tab: TabName): void {
  if (GESPERRTE_TABS.includes(tab)) throw new GesperrtError();
}

/**
 * The store as an employee gets it (crm-api, crm-mcp): offer tables are closed, amounts read as empty
 * and are dropped from what they write, so a save from their hub never clears a stored value.
 */
export class MitarbeiterStore extends PostgresStore {
  override async load(): Promise<Database> {
    const db = await super.load();
    return { ...db, deals: db.deals.map((d) => ohneGeld('deals', d)) };
  }

  override loadAngebotsDaten(): Promise<AngebotsDaten> {
    return Promise.reject(new GesperrtError());
  }

  override async loadSocialDaten(): Promise<SocialDaten> {
    const daten = await super.loadSocialDaten();
    return { ...daten, werte: daten.werte.map((w) => ohneGeld('social_werte', w)) };
  }

  override async ladeTabelle(tab: TabName) {
    pruefe(tab);
    return (await super.ladeTabelle(tab)).map((z) => ohneGeld(tab, z));
  }

  override async verlauf(tab: TabName, id: string): Promise<Aenderung[]> {
    pruefe(tab);
    return (await super.verlauf(tab, id)).map((a) => ({ ...a, vorher: a.vorher && ohneGeld(tab, a.vorher), nachher: ohneGeld(tab, a.nachher) }));
  }

  override insert<K extends EntityTab>(tab: K, records: EntityMap[K][]): Promise<void> {
    pruefe(tab);
    return super.insert(tab, records.map((r) => ohneGeld(tab, r)));
  }

  override async update<K extends EntityTab>(tab: K, updates: RecordUpdate<EntityMap[K]>[]): Promise<EntityMap[K][]> {
    pruefe(tab);
    const ergebnis = await super.update(tab, updates.map((u) => ({ ...u, changes: ohneGeldAenderung(tab, u.changes) })));
    return ergebnis.map((r) => ohneGeld(tab, r));
  }
}

const CACHE_MS = 60_000;
const cache = new WeakMap<Db, { zeit: number; liste: Promise<string[]> }>();

/** Whether the address is an employee; read from "einstellungen", cached for a minute per database. */
export async function istMitarbeiterIn(db: Db, email: string): Promise<boolean> {
  let eintrag = cache.get(db);
  if (!eintrag || Date.now() - eintrag.zeit > CACHE_MS) {
    const liste = db
      .query<{ wert: string | null }>('SELECT wert FROM einstellungen WHERE schluessel = $1', [MITARBEITER_SCHLUESSEL])
      .then(({ rows }) => mitarbeiterListe(rows[0]?.wert));
    eintrag = { zeit: Date.now(), liste };
    cache.set(db, eintrag);
    liste.catch(() => cache.delete(db));
  }
  return (await eintrag.liste).includes(email.trim().toLowerCase());
}

/** Forget the cached list, e.g. right after an admin changed it. */
export function vergissMitarbeiter(db: Db): void {
  cache.delete(db);
}
