import { AuthExpiredError, ConflictError, NotFoundError } from '../errors';
import type { EntityTab } from '../schema';
import type { RecordUpdate, Store } from '../store';
import type { Anfrage, AngebotsDaten, Audit, ContactDaten, Database, Einstellungen, EntityMap, KundenDaten, MagnetDaten, MonsteraEintrag, PortalDaten, SocialDaten, SpieleDaten, TodoDaten, WordleErgebnis } from '../types';

/**
 * The hub's store when the data lives in Postgres: every call goes to the crm-api function with the Google token the
 * app already holds. Errors come back as the same classes SheetStore throws, so nothing above notices the difference.
 */
export class ApiStore implements Store {
  private readonly url: string;
  private readonly getToken: () => Promise<string>;

  constructor(url: string, getToken: () => Promise<string>) {
    this.url = url.replace(/\/$/, '');
    this.getToken = getToken;
  }

  private async anfrage<T>(pfad: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    let antwort: Response;
    try {
      antwort = await fetch(`${this.url}${pfad}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('Die CRM-Datenbank ist gerade nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.');
    }
    const daten = (await antwort.json().catch(() => null)) as (T & { fehler?: string; geaendert_von?: string; geaendert_am?: string }) | null;
    if (antwort.ok && daten) return daten;
    if (antwort.status === 401) throw new AuthExpiredError();
    if (antwort.status === 409) throw new ConflictError(daten?.geaendert_von ?? '', daten?.geaendert_am ?? '');
    if (antwort.status === 404 && pfad === '/aendern') throw new NotFoundError();
    throw new Error(daten?.fehler ?? `Die CRM-Datenbank hat mit Fehler ${antwort.status} geantwortet.`);
  }

  load(): Promise<Database> {
    return this.anfrage('/daten/kern');
  }
  loadAngebotsDaten(): Promise<AngebotsDaten> {
    return this.anfrage('/daten/angebote');
  }
  loadContactDaten(): Promise<ContactDaten> {
    return this.anfrage('/daten/contact');
  }
  loadAudits(): Promise<Audit[]> {
    return this.anfrage('/daten/audits');
  }
  loadWordle(): Promise<WordleErgebnis[]> {
    return this.anfrage('/daten/wordle');
  }
  loadMonstera(): Promise<MonsteraEintrag[]> {
    return this.anfrage('/daten/monstera');
  }
  loadEingang(): Promise<Anfrage[]> {
    return this.anfrage('/daten/eingang');
  }
  loadSpiele(): Promise<SpieleDaten> {
    return this.anfrage('/daten/spiele');
  }
  loadSocialDaten(): Promise<SocialDaten> {
    return this.anfrage('/daten/social');
  }
  loadMagnetDaten(): Promise<MagnetDaten> {
    return this.anfrage('/daten/magnete');
  }
  loadKundenDaten(): Promise<KundenDaten> {
    return this.anfrage('/daten/kunden');
  }
  loadTodoDaten(): Promise<TodoDaten> {
    return this.anfrage('/daten/todos');
  }
  loadPortalDaten(): Promise<PortalDaten> {
    return this.anfrage('/daten/portal');
  }

  vergissStruktur(): void {}

  async insert<K extends EntityTab>(tab: K, records: EntityMap[K][]): Promise<void> {
    if (records.length === 0) return;
    await this.anfrage('/einfuegen', { tab, records });
  }

  async update<K extends EntityTab>(tab: K, updates: RecordUpdate<EntityMap[K]>[]): Promise<EntityMap[K][]> {
    if (updates.length === 0) return [];
    return (await this.anfrage<{ records: EntityMap[K][] }>('/aendern', { tab, updates })).records;
  }

  async saveEinstellungen(values: Einstellungen): Promise<void> {
    await this.anfrage('/einstellungen', { werte: values });
  }
}
