import { ConflictError, NotFoundError } from '../errors';
import { prepareFirma } from '../firmen';
import { ID_PREFIX, newId, nowIso } from '../ids';
import type { Repository } from '../repository';
import { LISTEN_DEFAULTS } from '../schema';
import { EMPTY_FIRMA_INPUT, type Firma, type FirmaInput, type Listen } from '../types';

const DEMO_USER = 'demo@velonify.de';

// Invented companies on the reserved .example TLD – this repo is public, so never real leads or customers here.
function seed(): Firma[] {
  const base = (input: Partial<FirmaInput>, tage: number): Firma => {
    const datum = new Date(Date.now() - tage * 86_400_000).toISOString();
    return {
      ...EMPTY_FIRMA_INPUT,
      ...input,
      id: newId(ID_PREFIX.firmen),
      archiviert: false,
      erstellt_am: datum,
      erstellt_von: DEMO_USER,
      geaendert_am: datum,
      geaendert_von: DEMO_USER,
    };
  };
  return [
    base({ name: 'Nordlicht Outdoor GmbH', domain: 'nordlicht-outdoor.example', status: 'lead', tier: 'A', score: 92, plattform: 'magento2', version: '2.4.6', eol: 'eol', ort: 'Hamburg', register: 'HRB 000001 (AG Hamburg)', email_allgemein: 'info@nordlicht-outdoor.example', telefon_allgemein: '040 000000', tech_info: 'ga4, meta_pixel, trustedshops · 812 Katalog-URLs', quelle: 'Demo', zustaendig: 'Lugge' }, 9),
    base({ name: 'Bergwerk Kaffeerösterei', domain: 'bergwerk-kaffee.example', status: 'lead', tier: 'B', score: 64, plattform: 'magento1', eol: 'eol', ort: 'München', email_allgemein: 'hallo@bergwerk-kaffee.example', tech_info: 'ga4 · 140 Katalog-URLs', quelle: 'Demo', zustaendig: 'Johannes' }, 6),
    base({ name: 'Kleinod Schmuckmanufaktur', domain: 'kleinod-schmuck.example', kuerzel: 'KSM', status: 'lead', tier: 'A', score: 81, plattform: 'magento2', version: '2.4.7', eol: 'supported', ort: 'Leipzig', quelle: 'Demo', zustaendig: 'Julian', notiz: 'Erstgespräch lief gut, wartet auf Budgetfreigabe.' }, 4),
    base({ name: 'Alpenglanz Kosmetik AG', domain: 'alpenglanz.example', kuerzel: 'AGK', status: 'kunde', plattform: 'shopify_plus', ort: 'Innsbruck', quelle: 'Empfehlung', zustaendig: 'Johannes', slack_channel: 'client-agk-general' }, 30),
    base({ name: 'Feldmann Werkzeuge', domain: 'feldmann-werkzeuge.example', status: 'lead', tier: 'C', score: 38, plattform: 'magento2', version: '2.4.4', eol: 'eol', ort: 'Stuttgart', quelle: 'Demo' }, 2),
    base({ name: 'Seeblick Heimtextil', domain: 'seeblick-heimtextil.example', kuerzel: 'SBH', status: 'ehemalig', plattform: 'shopify', ort: 'Konstanz', quelle: 'Demo', zustaendig: 'Lugge' }, 60),
  ];
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 120));

/** In-memory data for trying the app without Google credentials. Resets on reload. */
export class DemoRepository implements Repository {
  private firmen: Firma[] = seed();

  async listFirmen(): Promise<Firma[]> {
    await pause();
    return this.firmen.map((f) => ({ ...f }));
  }

  async getFirma(id: string): Promise<Firma> {
    await pause();
    const firma = this.firmen.find((f) => f.id === id);
    if (!firma) throw new NotFoundError();
    return { ...firma };
  }

  async createFirma(input: FirmaInput): Promise<Firma> {
    await pause();
    const clean = prepareFirma(input, this.firmen);
    const now = nowIso();
    const firma: Firma = { ...clean, id: newId(ID_PREFIX.firmen), archiviert: false, erstellt_am: now, erstellt_von: DEMO_USER, geaendert_am: now, geaendert_von: DEMO_USER };
    this.firmen.push(firma);
    return { ...firma };
  }

  async updateFirma(id: string, changes: Partial<FirmaInput>, expectedGeaendertAm: string): Promise<Firma> {
    await pause();
    const clean = prepareFirma(changes, this.firmen, id);
    return this.write(id, clean, expectedGeaendertAm);
  }

  async setFirmaArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<Firma> {
    await pause();
    return this.write(id, { archiviert }, expectedGeaendertAm);
  }

  async getListen(): Promise<Listen> {
    return LISTEN_DEFAULTS;
  }

  private write(id: string, changes: Partial<Firma>, expectedGeaendertAm: string): Firma {
    const index = this.firmen.findIndex((f) => f.id === id);
    if (index < 0) throw new NotFoundError();
    const current = this.firmen[index];
    if (current.geaendert_am !== expectedGeaendertAm) throw new ConflictError(current.geaendert_von, current.geaendert_am);
    const next = { ...current, ...changes, geaendert_am: nowIso(), geaendert_von: DEMO_USER };
    this.firmen[index] = next;
    return { ...next };
  }
}
