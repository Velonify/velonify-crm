import { AuthExpiredError } from '../errors';
import type { Aenderung } from '../postgres/postgresStore';
import type { TabName } from '../schema';
import type { Datensatz } from '../datenansicht';

/** Calls of the data view to crm-api; record edits go through ApiStore.update like everywhere else. */
export class DatenApi {
  constructor(
    private readonly url: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  private async anfrage<T>(pfad: string, body?: unknown): Promise<T> {
    const antwort = await fetch(`${this.url.replace(/\/$/, '')}${pfad}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${await this.getToken()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const daten = (await antwort.json().catch(() => null)) as (T & { fehler?: string }) | null;
    if (antwort.status === 401) throw new AuthExpiredError();
    if (!antwort.ok || !daten) throw new Error(daten?.fehler ?? `Die CRM-Datenbank hat mit Fehler ${antwort.status} geantwortet.`);
    return daten;
  }

  async tabelle(tab: TabName): Promise<Datensatz[]> {
    return (await this.anfrage<{ records: Datensatz[] }>(`/tabelle/${tab}`)).records;
  }

  async verlauf(tab: TabName, id: string): Promise<Aenderung[]> {
    return (await this.anfrage<{ eintraege: Aenderung[] }>(`/verlauf/${tab}/${encodeURIComponent(id)}`)).eintraege;
  }

  async setzeListe(liste: string, werte: string[]): Promise<void> {
    await this.anfrage('/listen', { liste, werte });
  }
}
