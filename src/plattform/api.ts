import { config } from '../config';
import { AuthExpiredError } from '../data/errors';
import type { InstanzRolle, InstanzSicht, InstanzZugang } from '../data/instanz';
import type { FeedbackAnlass, Mandant, MandantSicht, Paket, Rolle, Zugang } from '../data/plattform';
import type { MandantUebersicht, MarktDaten, MarktFilter, MarktVorschau } from '../data/postgres/plattformStore';

export type { MarktFilter, MarktVorschau };

/** An error of crm-api with its status, so the Lead-Markt can tell "quota used up" (402) from other errors. */
export class PlattformApiFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function anfrage<T>(getToken: () => Promise<string>, basis: string, pfad: string, body?: unknown): Promise<T> {
  const antwort = await fetch(`${basis.replace(/\/$/, '')}${pfad}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${await getToken()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const daten = (await antwort.json().catch(() => null)) as (T & { fehler?: string }) | null;
  if (antwort.status === 401) throw new AuthExpiredError();
  if (!antwort.ok || !daten) throw new PlattformApiFehler(daten?.fehler ?? `Der Hub hat mit Fehler ${antwort.status} geantwortet.`, antwort.status);
  return daten;
}

export interface MarktSeite {
  eintraege: { id: string; vorschau: MarktVorschau }[];
  gesamt: number;
  seite: number;
  seiten: number;
}

/** What a tenant's hub asks crm-api about itself. */
export class MandantApi {
  constructor(private readonly getToken: () => Promise<string>) {}

  private los<T>(pfad: string, body?: unknown) {
    return anfrage<T>(this.getToken, config.crmApiUrl, pfad, body);
  }

  ich = () => this.los<MandantSicht>('/ich');
  bedingungen = () => this.los<{ ok: true }>('/bedingungen', {});
  nutzung = (werkzeug: string) => this.los<{ ok: true }>('/nutzung', { werkzeug });
  feedback = (anlass: FeedbackAnlass, wert: number | null, text: string) => this.los<{ ok: true }>('/feedback', { anlass, wert, text });
  buchen = (paket: Paket) => this.los<{ ok: true }>('/buchen', { paket });
  markt = (filter: MarktFilter) => this.los<MarktSeite>('/leadmarkt', filter);
  freischalten = (id: string) => this.los<{ firma_id: string; neu: boolean }>('/leadmarkt/freischalten', { id });
}

/** What an own instance's hub asks its crm-api about itself, its team and its settings. */
export class InstanzApi {
  constructor(private readonly getToken: () => Promise<string>) {}

  private los<T>(pfad: string, body?: unknown) {
    return anfrage<T>(this.getToken, config.crmApiUrl, pfad, body);
  }

  ich = () => this.los<InstanzSicht>('/instanz/ich');
  zugaenge = () => this.los<{ zugaenge: InstanzZugang[]; name: string; velonify_zugang: boolean }>('/instanz/zugaenge');
  zugang = (eingabe: { email: string; name?: string; rolle?: InstanzRolle; aktiv?: boolean }) => this.los<{ zugang: InstanzZugang }>('/instanz/zugang', eingabe);
  einstellungen = (werte: { name?: string; velonify_zugang?: boolean; funktionen?: Record<string, boolean> }) => this.los<InstanzSicht>('/instanz/einstellungen', werte);
}

export interface MandantDetail {
  mandant: Mandant;
  zugaenge: Zugang[];
  nutzung: { art: string; email: string; detail: string; am: string }[];
  feedback: { anlass: string; email: string; wert: number | null; text: string; am: string }[];
  freigaben: { domain: string; firma_id: string; koeder: boolean; von: string; am: string }[];
  werkzeuge_genutzt: { werkzeug: string; aufrufe: number }[];
  /** Whether hub_<id> exists on velonify-db. */
  datenbank: boolean;
}

export interface MarktStatistik {
  gesamt: number;
  frei: number;
  mit_helpdesk: number;
  vergeben: number;
  koeder: number;
}

export interface MarktEintragRoh {
  domain: string;
  vorschau: MarktVorschau;
  daten: MarktDaten;
  geprueft_am: string;
}

/** The admin tool "Plattform" in Velonify's hub: crm-api /plattform/* and shop-audit's Lead-Markt routes. */
export class PlattformAdminApi {
  constructor(private readonly getToken: () => Promise<string>) {}

  private los<T>(pfad: string, body?: unknown) {
    return anfrage<T>(this.getToken, config.crmApiUrl, pfad, body);
  }

  mandanten = () => this.los<{ mandanten: MandantUebersicht[]; markt: MarktStatistik }>('/plattform/mandanten');
  mandant = (id: string) => this.los<MandantDetail>(`/plattform/mandant?id=${encodeURIComponent(id)}`);
  speichereMandant = (m: Partial<Mandant> & { id: string }) => this.los<{ mandant: Mandant }>('/plattform/mandant', m);
  speichereZugang = (z: { email: string; mandant_id: string; name?: string; rolle?: Rolle; aktiv?: boolean }) => this.los<{ zugang: Zugang }>('/plattform/zugang', z);
  koeder = (k: { mandant_id: string; domain: string; firma: string; email: string; plz?: string; ort?: string; ansprechpartner?: string }) =>
    this.los<{ ok: true }>('/plattform/koeder', k);

  /**
   * Fills the Lead-Markt: shop-audit checks the next Shopify shops (skipping Velonify's firms and the market), crm-api
   * stores the usable ones. Takes a few minutes for 20 shops.
   */
  async fuelleMarkt(n: number, nurHelpdesk: boolean): Promise<{ neu: number; geprueft: number; verworfen: number }> {
    const { domains } = await this.los<{ domains: string[] }>('/plattform/ausschluss');
    const ergebnis = await anfrage<{ eintraege: MarktEintragRoh[]; geprueft: number; verworfen: number }>(this.getToken, config.shopAuditUrl, '/leads/marktfuellen', {
      n,
      ohne: domains,
      nur_helpdesk: nurHelpdesk,
    });
    const { neu } = ergebnis.eintraege.length ? await this.los<{ neu: number }>('/plattform/markt', { eintraege: ergebnis.eintraege }) : { neu: 0 };
    return { neu, geprueft: ergebnis.geprueft, verworfen: ergebnis.verworfen };
  }

  /** Rebuilds the market pool from the latest crawl (BigQuery, ~1–2 minutes). */
  marktPool = () => anfrage<{ shops: number; mit_helpdesk: number; crawl_datum: string }>(this.getToken, config.shopAuditUrl, '/leads/marktpool', {});
}
