import { DEFAULT_DEAL_TITEL, EINSTELLUNG, isAbgeschlossen, phaseLabel, PHASEN, type Phase } from './constants';
import { NotConfiguredError, NotFoundError, ValidationError } from './errors';
import type { CalendarApi, CalendarEvent, TerminDaten } from './google/calendar';
import { isFolder, SPREADSHEET_MIME, type DriveApi, type DriveFile } from './google/drive';
import { addDays, ID_PREFIX, isIsoDate, isoDate, newId } from './ids';
import { anzahlPosten, parseAuswahl, prepareAngebot, statusLabel } from './angebote';
import { auditVerlaufText, auditZeile, firmaAbgleich, type AuditErgebnis } from './audit';
import { ANSCHREIBEN_STATUS, prepareAnschreiben, prepareOutreachLeistung, verlaufText, type AnschreibenInput } from './anschreiben';
import type { ImportPlan } from './importCsv';
import { baueKalkulation, kalkulationsThema } from './kalkulation';
import type { SheetsApi } from './sheets/sheetsClient';
import { dateiname } from '../lib/dateiname';
import { naechsteSortierung, prepareKategorie, prepareLeistung, verschiebe } from './katalog';
import {
  driveFolderName,
  isValidEmail,
  kontaktName,
  prepareDeal,
  prepareFirma,
  prepareKontakt,
  prepareWiedervorlage,
} from './rules';
import { driveKonfiguration } from './selectors';
import { OUTREACH_STARTLISTE } from './outreachStart';
import { STARTKATALOG } from './startkatalog';
import type { Store } from './store';
import type {
  Aktivitaet,
  Audit,
  Angebot,
  AngebotInput,
  Anschreiben,
  ContactDaten,
  AngebotsDaten,
  AktivitaetInput,
  Database,
  Deal,
  DealInput,
  Einstellungen,
  Firma,
  FirmaInput,
  Kontakt,
  KontaktInput,
  Leistung,
  LeistungInput,
  Leistungskategorie,
  LeistungskategorieInput,
  Meta,
  OutreachLeistung,
  OutreachLeistungInput,
  Wiedervorlage,
  WiedervorlageInput,
} from './types';

export interface CrmDeps {
  store: Store;
  drive: DriveApi;
  calendar: CalendarApi;
  currentUser: () => string;
  now?: () => Date;
  /** Sheets access to another spreadsheet than the CRM database, e.g. an offer's calculation sheet. */
  tabelle?: (spreadsheetId: string) => SheetsApi;
}

export interface KalkulationsErgebnis {
  angebot: Angebot;
  datei: DriveFile;
  /** Where the file was put: the firm's folder (or its 00_Account) or the central proposals folder */
  ort: 'firma' | 'proposals';
}

export type OrdnerOrt = 'leads' | 'clients' | 'andere';

export interface TerminEingabe {
  /** Optional: a firm the appointment is about; new appointments are logged there. */
  firma_id: string;
  kontakt_ids: string[];
  /** Colleagues and other guests */
  weitere_emails: string[];
  titel: string;
  ganztaegig: boolean;
  /** Local dates and times as entered, e.g. "2026-09-17" and "10:00". All-day events use the dates only, both inclusive. */
  von_datum: string;
  von_zeit: string;
  bis_datum: string;
  bis_zeit: string;
  ort: string;
  beschreibung: string;
  meet: boolean;
  einladungSenden: boolean;
}

export interface ImportErgebnis {
  neu: number;
  ergaenzt: number;
  kontakte: number;
  deals: number;
}

/**
 * All business operations of the CRM. Validation and side effects (activity log, firm status, Drive folders)
 * live here, so the UI stays a thin layer and every entry point behaves the same.
 */
export class CrmService {
  private readonly store: Store;
  private readonly drive: DriveApi;
  private readonly calendar: CalendarApi;
  private readonly currentUser: () => string;
  private readonly now: () => Date;
  private readonly tabelle?: (spreadsheetId: string) => SheetsApi;

  constructor(deps: CrmDeps) {
    this.store = deps.store;
    this.drive = deps.drive;
    this.calendar = deps.calendar;
    this.currentUser = deps.currentUser;
    this.now = deps.now ?? (() => new Date());
    this.tabelle = deps.tabelle;
  }

  load(): Promise<Database> {
    return this.store.load();
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private today(): string {
    return isoDate(this.now());
  }

  private created(): Meta {
    const now = this.timestamp();
    const user = this.currentUser();
    return { erstellt_am: now, erstellt_von: user, geaendert_am: now, geaendert_von: user };
  }

  private changed(): Pick<Meta, 'geaendert_am' | 'geaendert_von'> {
    return { geaendert_am: this.timestamp(), geaendert_von: this.currentUser() };
  }

  private aktivitaet(input: Omit<AktivitaetInput, 'datum'> & { datum?: string; kalender_termin_id?: string }): Aktivitaet {
    return {
      id: newId(ID_PREFIX.aktivitaeten),
      firma_id: input.firma_id,
      kontakt_id: input.kontakt_id,
      deal_id: input.deal_id,
      typ: input.typ,
      datum: input.datum || this.timestamp(),
      text: input.text,
      von: this.currentUser(),
      kalender_termin_id: input.kalender_termin_id ?? '',
    };
  }

  private async log(input: Omit<AktivitaetInput, 'datum'> & { kalender_termin_id?: string }): Promise<void> {
    await this.store.insert('aktivitaeten', [this.aktivitaet(input)]);
  }

  private static find<T extends { id: string }>(items: readonly T[], id: string): T {
    const item = items.find((i) => i.id === id);
    if (!item) throw new NotFoundError();
    return item;
  }

  // ─── Firmen ────────────────────────────────────────────────────────────────

  async createFirma(input: FirmaInput): Promise<Firma> {
    const db = await this.store.load();
    const firma: Firma = { ...prepareFirma(input, db.firmen), id: newId(ID_PREFIX.firmen), archiviert: false, ...this.created() };
    await this.store.insert('firmen', [firma]);
    return firma;
  }

  async updateFirma(id: string, changes: Partial<FirmaInput>, expectedGeaendertAm: string): Promise<Firma> {
    const db = await this.store.load();
    const [firma] = await this.store.update('firmen', [
      { id, changes: { ...prepareFirma(changes, db.firmen, id), ...this.changed() }, expectedGeaendertAm },
    ]);
    return firma;
  }

  async setFirmaArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<Firma> {
    const [firma] = await this.store.update('firmen', [{ id, changes: { archiviert, ...this.changed() }, expectedGeaendertAm }]);
    return firma;
  }

  // ─── Kontakte ──────────────────────────────────────────────────────────────

  async saveKontakt(firmaId: string, input: KontaktInput, existing?: { id: string; expectedGeaendertAm: string }): Promise<Kontakt> {
    const clean = prepareKontakt(input);
    const db = await this.store.load();
    CrmService.find(db.firmen, firmaId);

    let kontakt: Kontakt;
    if (existing) {
      [kontakt] = await this.store.update('kontakte', [
        { id: existing.id, changes: { ...clean, ...this.changed() }, expectedGeaendertAm: existing.expectedGeaendertAm },
      ]);
    } else {
      const erster = !db.kontakte.some((k) => k.firma_id === firmaId && !k.archiviert);
      kontakt = { ...clean, hauptkontakt: clean.hauptkontakt || erster, id: newId(ID_PREFIX.kontakte), firma_id: firmaId, archiviert: false, ...this.created() };
      await this.store.insert('kontakte', [kontakt]);
    }

    // Only one main contact per firm.
    if (kontakt.hauptkontakt) {
      const andere = db.kontakte.filter((k) => k.firma_id === firmaId && k.id !== kontakt.id && k.hauptkontakt);
      await this.store.update('kontakte', andere.map((k) => ({ id: k.id, changes: { hauptkontakt: false } })));
    }
    return kontakt;
  }

  async setKontaktArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<Kontakt> {
    const changes: Partial<Kontakt> = { archiviert, ...this.changed() };
    if (archiviert) changes.hauptkontakt = false;
    const [kontakt] = await this.store.update('kontakte', [{ id, changes, expectedGeaendertAm }]);
    return kontakt;
  }

  // ─── Deals ─────────────────────────────────────────────────────────────────

  async saveDeal(firmaId: string, input: DealInput, existing?: { id: string; expectedGeaendertAm: string }): Promise<Deal> {
    const clean = prepareDeal(input);
    const db = await this.store.load();
    CrmService.find(db.firmen, firmaId);
    if (clean.kontakt_id) CrmService.find(db.kontakte, clean.kontakt_id);

    if (existing) {
      const [deal] = await this.store.update('deals', [
        { id: existing.id, changes: { ...clean, ...this.changed() }, expectedGeaendertAm: existing.expectedGeaendertAm },
      ]);
      return deal;
    }
    const deal: Deal = {
      ...clean,
      id: newId(ID_PREFIX.deals),
      firma_id: firmaId,
      phase: 'neu',
      verlustgrund: '',
      abgeschlossen_am: '',
      archiviert: false,
      ...this.created(),
    };
    await this.store.insert('deals', [deal]);
    await this.log({ firma_id: firmaId, kontakt_id: '', deal_id: deal.id, typ: 'phasenwechsel', text: `Deal „${deal.titel}“ angelegt` });
    return deal;
  }

  async setDealArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<Deal> {
    const [deal] = await this.store.update('deals', [{ id, changes: { archiviert, ...this.changed() }, expectedGeaendertAm }]);
    return deal;
  }

  /** Moves a deal to another phase, logs it and marks the firm as customer when the deal is won. */
  async changePhase(dealId: string, phase: string, expectedGeaendertAm: string, verlustgrund = ''): Promise<Deal> {
    if (!(PHASEN as readonly string[]).includes(phase)) throw new ValidationError('phase', `Unbekannte Phase „${phase}“.`);
    if (phase === 'verloren' && !verlustgrund.trim()) throw new ValidationError('verlustgrund', 'Bitte einen Grund angeben, warum der Deal verloren ist.');

    const db = await this.store.load();
    const alt = CrmService.find(db.deals, dealId);
    const firma = CrmService.find(db.firmen, alt.firma_id);
    if (alt.phase === phase) return alt;

    const [deal] = await this.store.update('deals', [
      {
        id: dealId,
        changes: {
          phase,
          verlustgrund: phase === 'verloren' ? verlustgrund.trim() : '',
          abgeschlossen_am: isAbgeschlossen(phase) ? this.today() : '',
          ...this.changed(),
        },
        expectedGeaendertAm,
      },
    ]);

    const grund = phase === 'verloren' ? ` (Grund: ${verlustgrund.trim()})` : '';
    await this.log({
      firma_id: firma.id,
      kontakt_id: '',
      deal_id: dealId,
      typ: 'phasenwechsel',
      text: `„${deal.titel}“: ${phaseLabel(alt.phase)} → ${phaseLabel(phase as Phase)}${grund}`,
    });

    if (phase === 'gewonnen' && firma.status !== 'kunde') {
      await this.store.update('firmen', [{ id: firma.id, changes: { status: 'kunde', ...this.changed() } }]);
    }
    return deal;
  }

  // ─── Verlauf & Wiedervorlagen ──────────────────────────────────────────────

  async addAktivitaet(input: AktivitaetInput): Promise<Aktivitaet> {
    if (!input.text.trim()) throw new ValidationError('text', 'Bitte etwas eintragen.');
    const aktivitaet = this.aktivitaet({ ...input, text: input.text.trim() });
    await this.store.insert('aktivitaeten', [aktivitaet]);
    return aktivitaet;
  }

  async saveWiedervorlage(input: WiedervorlageInput, existingId?: string): Promise<Wiedervorlage> {
    const clean = prepareWiedervorlage(input);
    if (existingId) {
      const [w] = await this.store.update('wiedervorlagen', [{ id: existingId, changes: clean }]);
      return w;
    }
    const w: Wiedervorlage = {
      ...clean,
      id: newId(ID_PREFIX.wiedervorlagen),
      erledigt_am: '',
      erledigt_von: '',
      erstellt_von: this.currentUser(),
      erstellt_am: this.timestamp(),
    };
    await this.store.insert('wiedervorlagen', [w]);
    return w;
  }

  async setWiedervorlageErledigt(id: string, erledigt: boolean): Promise<Wiedervorlage> {
    const [w] = await this.store.update('wiedervorlagen', [
      { id, changes: erledigt ? { erledigt_am: this.timestamp(), erledigt_von: this.currentUser() } : { erledigt_am: '', erledigt_von: '' } },
    ]);
    return w;
  }

  saveEinstellungen(values: Einstellungen): Promise<void> {
    return this.store.saveEinstellungen(values);
  }

  // ─── Leistungskatalog ──────────────────────────────────────────────────────

  loadAngebotsDaten(): Promise<AngebotsDaten> {
    return this.store.loadAngebotsDaten();
  }

  async saveKategorie(input: LeistungskategorieInput, existing?: { id: string; expectedGeaendertAm: string }): Promise<Leistungskategorie> {
    const clean = prepareKategorie(input);
    if (existing) {
      const [kategorie] = await this.store.update('leistungskategorien', [
        { id: existing.id, changes: { ...clean, ...this.changed() }, expectedGeaendertAm: existing.expectedGeaendertAm },
      ]);
      return kategorie;
    }
    const katalog = await this.store.loadAngebotsDaten();
    const kategorie: Leistungskategorie = {
      ...clean,
      id: newId(ID_PREFIX.leistungskategorien),
      sortierung: naechsteSortierung(katalog.kategorien),
      archiviert: false,
      ...this.created(),
    };
    await this.store.insert('leistungskategorien', [kategorie]);
    return kategorie;
  }

  async saveLeistung(input: LeistungInput, existing?: { id: string; expectedGeaendertAm: string }): Promise<Leistung> {
    const clean = prepareLeistung(input);
    const katalog = await this.store.loadAngebotsDaten();
    CrmService.find(katalog.kategorien, clean.kategorie_id);
    const inKategorie = katalog.leistungen.filter((l) => l.kategorie_id === clean.kategorie_id && l.id !== existing?.id);

    if (existing) {
      const vorher = CrmService.find(katalog.leistungen, existing.id);
      // Moved to another category: append at its end.
      const sortierung = vorher.kategorie_id === clean.kategorie_id ? {} : { sortierung: naechsteSortierung(inKategorie) };
      const [leistung] = await this.store.update('leistungen', [
        { id: existing.id, changes: { ...clean, ...sortierung, ...this.changed() }, expectedGeaendertAm: existing.expectedGeaendertAm },
      ]);
      return leistung;
    }
    const leistung: Leistung = { ...clean, id: newId(ID_PREFIX.leistungen), sortierung: naechsteSortierung(inKategorie), archiviert: false, ...this.created() };
    await this.store.insert('leistungen', [leistung]);
    return leistung;
  }

  async setKategorieArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<Leistungskategorie> {
    const [kategorie] = await this.store.update('leistungskategorien', [{ id, changes: { archiviert, ...this.changed() }, expectedGeaendertAm }]);
    return kategorie;
  }

  async setLeistungArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<Leistung> {
    const [leistung] = await this.store.update('leistungen', [{ id, changes: { archiviert, ...this.changed() }, expectedGeaendertAm }]);
    return leistung;
  }

  /** Moves a category one place up or down among the active categories. */
  async verschiebeKategorie(id: string, richtung: -1 | 1): Promise<void> {
    const katalog = await this.store.loadAngebotsDaten();
    const aktive = katalog.kategorien.filter((k) => !k.archiviert);
    await this.store.update('leistungskategorien', verschiebe(aktive, id, richtung).map(({ id: kid, sortierung }) => ({ id: kid, changes: { sortierung } })));
  }

  /** Moves a sub-item one place up or down within its category. */
  async verschiebeLeistung(id: string, richtung: -1 | 1): Promise<void> {
    const katalog = await this.store.loadAngebotsDaten();
    const leistung = CrmService.find(katalog.leistungen, id);
    const geschwister = katalog.leistungen.filter((l) => l.kategorie_id === leistung.kategorie_id && !l.archiviert);
    await this.store.update('leistungen', verschiebe(geschwister, id, richtung).map(({ id: lid, sortierung }) => ({ id: lid, changes: { sortierung } })));
  }

  /** Fills an empty catalogue with the start catalogue. Refuses once anything exists, so nothing is duplicated. */
  async uebernimmStartkatalog(): Promise<{ kategorien: number; leistungen: number }> {
    const katalog = await this.store.loadAngebotsDaten();
    if (katalog.kategorien.length > 0) {
      throw new ValidationError('katalog', 'Der Katalog enthält schon Hauptkategorien. Der Startkatalog wird nur in einen leeren Katalog übernommen.');
    }
    const meta = this.created();
    const kategorien: Leistungskategorie[] = [];
    const leistungen: Leistung[] = [];
    STARTKATALOG.forEach((start, i) => {
      const kategorie: Leistungskategorie = {
        id: newId(ID_PREFIX.leistungskategorien),
        titel_de: start.titel[0],
        titel_en: start.titel[1],
        umfang_de: start.umfang[0],
        umfang_en: start.umfang[1],
        abrechnung: start.abrechnung,
        sortierung: (i + 1) * 10,
        archiviert: false,
        ...meta,
      };
      kategorien.push(kategorie);
      start.leistungen.forEach((l, j) => {
        leistungen.push({
          id: newId(ID_PREFIX.leistungen),
          kategorie_id: kategorie.id,
          titel_de: l.titel[0],
          titel_en: l.titel[1],
          text_de: l.text[0],
          text_en: l.text[1],
          sortierung: (j + 1) * 10,
          archiviert: false,
          ...meta,
        });
      });
    });
    await this.store.insert('leistungskategorien', kategorien);
    await this.store.insert('leistungen', leistungen);
    return { kategorien: kategorien.length, leistungen: leistungen.length };
  }

  // ─── Angebote ──────────────────────────────────────────────────────────────

  async saveAngebot(input: AngebotInput, existing?: { id: string; expectedGeaendertAm: string }): Promise<Angebot> {
    const daten = await this.store.loadAngebotsDaten();
    const clean = prepareAngebot(input, daten.angebote, existing?.id);
    const db = await this.store.load();
    const firma = CrmService.find(db.firmen, clean.firma_id);
    if (clean.deal_id && CrmService.find(db.deals, clean.deal_id).firma_id !== firma.id) {
      throw new ValidationError('deal_id', 'Der Deal gehört zu einer anderen Firma.');
    }
    if (clean.kontakt_id && CrmService.find(db.kontakte, clean.kontakt_id).firma_id !== firma.id) {
      throw new ValidationError('kontakt_id', 'Der Ansprechpartner gehört zu einer anderen Firma.');
    }
    const felder = { ...clean, auswahl: JSON.stringify(clean.auswahl) };

    if (existing) {
      const [angebot] = await this.store.update('angebote', [
        { id: existing.id, changes: { ...felder, ...this.changed() }, expectedGeaendertAm: existing.expectedGeaendertAm },
      ]);
      return angebot;
    }
    const angebot: Angebot = {
      ...felder,
      id: newId(ID_PREFIX.angebote),
      version: 1,
      status: 'entwurf',
      sheet_id: '',
      pdf_id: '',
      summe_einmalig_eur: null,
      summe_monatlich_eur: null,
      summe_optional_eur: null,
      archiviert: false,
      ...this.created(),
    };
    await this.store.insert('angebote', [angebot]);
    await this.log({
      firma_id: firma.id,
      kontakt_id: clean.kontakt_id,
      deal_id: clean.deal_id,
      typ: 'system',
      text: `Angebot ${angebot.nummer} angelegt: ${angebot.titel} (${anzahlPosten(clean.auswahl)} Leistungen, ${statusLabel(angebot.status)})`,
    });
    return angebot;
  }

  /** Folder for an offer's files: the firm's 00_Account (or the firm folder itself), otherwise 02_Sales/02_Proposals. */
  async angebotsOrdner(db: Database, firma: Firma): Promise<{ id: string; ort: 'firma' | 'proposals' } | null> {
    if (firma.drive_ordner_id) {
      const account = (await this.drive.listChildren(firma.drive_ordner_id)).find((f) => isFolder(f) && f.name === '00_Account');
      return { id: account?.id ?? firma.drive_ordner_id, ort: 'firma' };
    }
    const proposals = db.einstellungen[EINSTELLUNG.proposalsOrdner];
    return proposals ? { id: proposals, ort: 'proposals' } : null;
  }

  /** Creates the calculation sheet for a saved offer: selected services as rows, prices to be filled in by hand. */
  async legeKalkulationAn(angebotId: string, expectedGeaendertAm: string): Promise<KalkulationsErgebnis> {
    if (!this.tabelle) throw new NotConfiguredError('Kalkulations-Sheets können hier nicht angelegt werden.');
    const daten = await this.store.loadAngebotsDaten();
    const angebot = CrmService.find(daten.angebote, angebotId);
    if (angebot.geaendert_am !== expectedGeaendertAm) {
      throw new ValidationError('angebot', 'Das Angebot wurde inzwischen geändert. Bitte neu laden und erneut versuchen.');
    }
    if (angebot.sheet_id) throw new ValidationError('sheet_id', 'Für dieses Angebot gibt es schon ein Kalkulations-Sheet.');
    const auswahl = parseAuswahl(angebot.auswahl);
    if (anzahlPosten(auswahl) === 0) throw new ValidationError('auswahl', 'Das Angebot enthält keine Leistungen.');

    const db = await this.store.load();
    const firma = CrmService.find(db.firmen, angebot.firma_id);
    const ordner = await this.angebotsOrdner(db, firma);
    if (!ordner) {
      throw new NotConfiguredError(`„${firma.name}“ hat keinen Drive-Ordner, und der Ordner „02_Proposals“ ist noch nicht eingerichtet (Einrichtung → Google Drive).`);
    }
    const kontakt = db.kontakte.find((k) => k.id === angebot.kontakt_id);
    const heute = this.today();
    const name = dateiname({ datum: heute, kuerzel: firma.kuerzel, thema: kalkulationsThema(angebot.titel), version: angebot.version ?? 1 });

    const datei = await this.drive.createFile(name, SPREADSHEET_MIME, ordner.id);
    try {
      await this.tabelle(datei.id).batchUpdate(
      baueKalkulation({
        nummer: angebot.nummer,
        version: angebot.version ?? 1,
        datum: heute,
        gueltigBis: addDays(heute, 30),
        firma: firma.name,
        ansprechpartner: kontakt ? kontaktName(kontakt) : '',
        titel: angebot.titel,
        sprache: angebot.sprache === 'en' ? 'en' : 'de',
        auswahl,
      }),
      );
    } catch (err) {
      // The empty file stays in Drive (nothing is deleted automatically); say so, so nobody keeps a half-built sheet.
      const grund = err instanceof Error ? err.message : String(err);
      throw new Error(`Die Datei „${name}“ wurde angelegt, konnte aber nicht befüllt werden: ${grund} Bitte die leere Datei in Drive archivieren und erneut versuchen.`);
    }

    const [aktualisiert] = await this.store.update('angebote', [
      {
        id: angebot.id,
        changes: { sheet_id: datei.id, status: angebot.status === 'entwurf' ? 'kalkulation' : angebot.status, ...this.changed() },
        expectedGeaendertAm,
      },
    ]);
    await this.log({
      firma_id: firma.id,
      kontakt_id: angebot.kontakt_id,
      deal_id: angebot.deal_id,
      typ: 'system',
      text: `Kalkulations-Sheet für Angebot ${angebot.nummer} angelegt: ${name}${ordner.ort === 'proposals' ? ' (in 02_Proposals)' : ''}`,
    });
    return { angebot: aktualisiert, datei, ort: ordner.ort };
  }

  async setAngebotArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<Angebot> {
    const [angebot] = await this.store.update('angebote', [{ id, changes: { archiviert, ...this.changed() }, expectedGeaendertAm }]);
    return angebot;
  }

  // ─── Contact Generator ─────────────────────────────────────────────────────

  loadContactDaten(): Promise<ContactDaten> {
    return this.store.loadContactDaten();
  }

  async saveOutreachLeistung(input: OutreachLeistungInput, existing?: { id: string; expectedGeaendertAm: string }): Promise<OutreachLeistung> {
    const clean = prepareOutreachLeistung(input);
    if (existing) {
      const [leistung] = await this.store.update('outreach_leistungen', [
        { id: existing.id, changes: { ...clean, ...this.changed() }, expectedGeaendertAm: existing.expectedGeaendertAm },
      ]);
      return leistung;
    }
    const { leistungen } = await this.store.loadContactDaten();
    const leistung: OutreachLeistung = { ...clean, id: newId(ID_PREFIX.outreach_leistungen), sortierung: naechsteSortierung(leistungen), archiviert: false, ...this.created() };
    await this.store.insert('outreach_leistungen', [leistung]);
    return leistung;
  }

  async setOutreachLeistungArchiviert(id: string, archiviert: boolean, expectedGeaendertAm: string): Promise<OutreachLeistung> {
    const [leistung] = await this.store.update('outreach_leistungen', [{ id, changes: { archiviert, ...this.changed() }, expectedGeaendertAm }]);
    return leistung;
  }

  /** Fills an empty service list with the start list. Refuses once anything exists, so nothing is duplicated. */
  async uebernimmOutreachStartliste(): Promise<number> {
    const { leistungen } = await this.store.loadContactDaten();
    if (leistungen.length > 0) throw new ValidationError('leistungen', 'Die Liste enthält schon Leistungen. Die Startliste wird nur in eine leere Liste übernommen.');
    const meta = this.created();
    const neu: OutreachLeistung[] = OUTREACH_STARTLISTE.map((start, i) => ({
      ...start,
      id: newId(ID_PREFIX.outreach_leistungen),
      sortierung: (i + 1) * 10,
      archiviert: false,
      ...meta,
    }));
    await this.store.insert('outreach_leistungen', neu);
    return neu.length;
  }

  /**
   * Records a message that was sent by hand: stores it, logs it in the firm's history and moves an early deal
   * to "kontaktiert". Without an open deal one can be created on the way.
   */
  async markiereGesendet(input: AnschreibenInput, optionen: { neuerDeal?: { titel: string; zustaendig: string } } = {}): Promise<Anschreiben> {
    const clean = prepareAnschreiben(input);
    // Fails with SchemaError before anything is written while the tabs are missing.
    await this.store.loadContactDaten();
    const db = await this.store.load();
    const firma = CrmService.find(db.firmen, clean.firma_id);
    if (clean.kontakt_id && CrmService.find(db.kontakte, clean.kontakt_id).firma_id !== firma.id) {
      throw new ValidationError('kontakt_id', 'Der Ansprechpartner gehört zu einer anderen Firma.');
    }
    let deal = clean.deal_id ? CrmService.find(db.deals, clean.deal_id) : undefined;
    if (deal && deal.firma_id !== firma.id) throw new ValidationError('deal_id', 'Der Deal gehört zu einer anderen Firma.');
    if (!deal && optionen.neuerDeal) {
      deal = await this.saveDeal(firma.id, {
        titel: optionen.neuerDeal.titel,
        kontakt_id: clean.kontakt_id,
        wert_eur: null,
        wahrscheinlichkeit: null,
        zustaendig: optionen.neuerDeal.zustaendig,
        naechster_schritt: '',
        naechster_schritt_am: '',
      });
    }

    const anschreiben: Anschreiben = {
      ...clean,
      id: newId(ID_PREFIX.anschreiben),
      deal_id: deal?.id ?? '',
      status: 'gesendet',
      gesendet_am: this.timestamp(),
      von: this.currentUser(),
      archiviert: false,
      ...this.created(),
    };
    await this.store.insert('anschreiben', [anschreiben]);
    await this.log({
      firma_id: firma.id,
      kontakt_id: clean.kontakt_id,
      deal_id: anschreiben.deal_id,
      typ: clean.kanal === 'email' ? 'mail' : 'notiz',
      text: verlaufText(anschreiben),
    });
    if (deal && (deal.phase === 'neu' || deal.phase === 'qualifiziert')) {
      await this.changePhase(deal.id, 'kontaktiert', deal.geaendert_am);
    }
    return anschreiben;
  }

  async setAnschreibenStatus(id: string, status: string, expectedGeaendertAm: string): Promise<Anschreiben> {
    if (!ANSCHREIBEN_STATUS.some((s) => s.wert === status)) throw new ValidationError('status', `Unbekannter Status „${status}“.`);
    const [anschreiben] = await this.store.update('anschreiben', [{ id, changes: { status, ...this.changed() }, expectedGeaendertAm }]);
    return anschreiben;
  }

  // ─── Shop-Audit ────────────────────────────────────────────────────────────

  loadAudits(): Promise<Audit[]> {
    return this.store.loadAudits();
  }

  /**
   * Stores an audit result. For a company it also writes a history entry and updates platform, version and
   * support status when the audit found something certain that differs.
   */
  async speichereAudit(ergebnis: AuditErgebnis, firmaId = ''): Promise<Audit> {
    // Fails with SchemaError before anything is written while the tab is missing.
    await this.store.loadAudits();
    const firma = firmaId ? CrmService.find((await this.store.load()).firmen, firmaId) : undefined;
    const audit: Audit = { ...auditZeile(ergebnis, firma?.id ?? ''), id: newId(ID_PREFIX.audits), von: this.currentUser(), archiviert: false, ...this.created() };
    await this.store.insert('audits', [audit]);
    if (firma) {
      const abgleich = firmaAbgleich(firma, ergebnis);
      if (abgleich) await this.updateFirma(firma.id, abgleich.changes, firma.geaendert_am);
      await this.log({ firma_id: firma.id, kontakt_id: '', deal_id: '', typ: 'notiz', text: [auditVerlaufText(ergebnis), abgleich?.text].filter(Boolean).join('\n') });
    }
    return audit;
  }

  /** Links an audit of a domain that was not in the CRM to the company created for it. */
  async ordneAuditZu(auditId: string, firmaId: string, expectedGeaendertAm: string): Promise<Audit> {
    CrmService.find((await this.store.load()).firmen, firmaId);
    const [audit] = await this.store.update('audits', [{ id: auditId, changes: { firma_id: firmaId, ...this.changed() }, expectedGeaendertAm }]);
    return audit;
  }

  // ─── Google Drive ──────────────────────────────────────────────────────────

  private konfiguration(db: Database) {
    const konfig = driveKonfiguration(db.einstellungen);
    if (!konfig) throw new NotConfiguredError('Die Drive-Ordner sind noch nicht eingerichtet (Einrichtung → Google Drive).');
    return konfig;
  }

  findeDriveOrdner(name: string): Promise<DriveFile[]> {
    return this.drive.findFoldersByName(name);
  }

  getDriveOrdner(id: string): Promise<DriveFile> {
    return this.drive.getFile(id);
  }

  async ordnerOrt(db: Database, firma: Firma): Promise<OrdnerOrt | null> {
    if (!firma.drive_ordner_id) return null;
    const konfig = driveKonfiguration(db.einstellungen);
    const ordner = await this.drive.getFile(firma.drive_ordner_id);
    if (konfig && ordner.parents?.includes(konfig.leads)) return 'leads';
    if (konfig && ordner.parents?.includes(konfig.clients)) return 'clients';
    return 'andere';
  }

  async ordnerInhalt(firma: Firma): Promise<DriveFile[]> {
    if (!firma.drive_ordner_id) return [];
    const dateien = await this.drive.listChildren(firma.drive_ordner_id);
    return dateien.sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name, 'de'));
  }

  /** Creates `02_Sales/01_Leads/<KÜRZEL>_<Name>` (or links an existing folder of that name) and stores Kürzel and folder on the firm. */
  async legeLeadOrdnerAn(firmaId: string, kuerzel: string, ordnerName?: string): Promise<Firma> {
    const db = await this.store.load();
    const konfig = this.konfiguration(db);
    const firma = CrmService.find(db.firmen, firmaId);
    if (firma.drive_ordner_id) throw new ValidationError('drive_ordner_id', `„${firma.name}“ hat schon einen Drive-Ordner.`);

    const { kuerzel: clean = '' } = prepareFirma({ kuerzel }, db.firmen, firmaId);
    if (!clean) throw new ValidationError('kuerzel', 'Für den Ordner wird ein Kürzel gebraucht.');
    const name = (ordnerName ?? '').trim() || driveFolderName(clean, firma.name);

    const vorhanden = (await this.drive.listChildren(konfig.leads)).find((f) => isFolder(f) && f.name === name);
    const ordner = vorhanden ?? (await this.drive.createFolder(name, konfig.leads));

    const [aktualisiert] = await this.store.update('firmen', [
      { id: firmaId, changes: { kuerzel: clean, drive_ordner_id: ordner.id, ...this.changed() } },
    ]);
    await this.log({
      firma_id: firmaId,
      kontakt_id: '',
      deal_id: '',
      typ: 'system',
      text: vorhanden ? `Vorhandenen Lead-Ordner „${name}“ verknüpft` : `Lead-Ordner „${name}“ in 01_Leads angelegt`,
    });
    return aktualisiert;
  }

  /** Moves the firm's folder from 01_Leads to 01_Clients and adds whatever the client folder template has that is missing. */
  async verschiebeNachClients(firmaId: string): Promise<void> {
    const db = await this.store.load();
    const konfig = this.konfiguration(db);
    const firma = CrmService.find(db.firmen, firmaId);
    if (!firma.drive_ordner_id) throw new ValidationError('drive_ordner_id', `„${firma.name}“ hat noch keinen Drive-Ordner.`);

    const ordner = await this.drive.getFile(firma.drive_ordner_id);
    const bereitsDort = ordner.parents?.includes(konfig.clients) ?? false;
    if (!bereitsDort) {
      const von = ordner.parents?.[0];
      if (!von) throw new ValidationError('drive_ordner_id', 'Der Ordner liegt nicht in einem verschiebbaren Ordner.');
      await this.drive.move(ordner.id, von, konfig.clients);
    }
    const ergaenzt = konfig.vorlage ? await this.ergaenzeAusVorlage(konfig.vorlage, ordner.id) : 0;
    const teile = [bereitsDort ? '' : `Ordner „${ordner.name}“ nach 01_Clients verschoben`, ergaenzt > 0 ? `${ergaenzt} Elemente aus der Vorlage ergänzt` : ''];
    const text = teile.filter(Boolean).join(', ');
    if (text) await this.log({ firma_id: firmaId, kontakt_id: '', deal_id: '', typ: 'system', text });
  }

  private async ergaenzeAusVorlage(vorlageId: string, zielId: string, tiefe = 0): Promise<number> {
    if (tiefe > 4) return 0;
    const [vorlage, ziel] = await Promise.all([this.drive.listChildren(vorlageId), this.drive.listChildren(zielId)]);
    let anzahl = 0;
    for (const eintrag of vorlage) {
      const gleich = ziel.find((z) => z.name === eintrag.name && isFolder(z) === isFolder(eintrag));
      if (isFolder(eintrag)) {
        const unterordner = gleich ?? (await this.drive.createFolder(eintrag.name, zielId));
        if (!gleich) anzahl++;
        anzahl += await this.ergaenzeAusVorlage(eintrag.id, unterordner.id, tiefe + 1);
      } else if (!gleich) {
        await this.drive.copyFile(eintrag.id, eintrag.name, zielId);
        anzahl++;
      }
    }
    return anzahl;
  }

  // ─── Google Kalender / Meet ────────────────────────────────────────────────

  private terminDaten(db: Database, eingabe: TerminEingabe) {
    const firma = eingabe.firma_id ? CrmService.find(db.firmen, eingabe.firma_id) : undefined;
    const kontakte = eingabe.kontakt_ids.map((id) => CrmService.find(db.kontakte, id));
    const emails = [...new Set([...kontakte.map((k) => k.email), ...eingabe.weitere_emails].map((e) => e.trim().toLowerCase()).filter(Boolean))];

    if (!eingabe.titel.trim()) throw new ValidationError('titel', 'Bitte einen Titel angeben.');
    const ungueltig = emails.find((e) => !isValidEmail(e));
    if (ungueltig) throw new ValidationError('weitere_emails', `„${ungueltig}“ ist keine gültige E-Mail-Adresse.`);
    if (!isIsoDate(eingabe.von_datum)) throw new ValidationError('von_datum', 'Bitte ein Datum angeben.');
    if (!isIsoDate(eingabe.bis_datum)) throw new ValidationError('bis_datum', 'Bitte ein Enddatum angeben.');

    let start: string;
    let ende: string;
    if (eingabe.ganztaegig) {
      if (eingabe.bis_datum < eingabe.von_datum) throw new ValidationError('bis_datum', 'Das Ende liegt vor dem Beginn.');
      start = eingabe.von_datum;
      // Google expects the day after the last day.
      ende = addDays(eingabe.bis_datum, 1);
    } else {
      const von = new Date(`${eingabe.von_datum}T${eingabe.von_zeit}`);
      const bis = new Date(`${eingabe.bis_datum}T${eingabe.bis_zeit}`);
      if (!/^\d{2}:\d{2}$/.test(eingabe.von_zeit) || Number.isNaN(von.getTime())) throw new ValidationError('von_zeit', 'Bitte eine Uhrzeit angeben.');
      if (!/^\d{2}:\d{2}$/.test(eingabe.bis_zeit) || Number.isNaN(bis.getTime())) throw new ValidationError('bis_zeit', 'Bitte eine Uhrzeit angeben.');
      if (bis.getTime() <= von.getTime()) throw new ValidationError('bis_zeit', 'Das Ende muss nach dem Beginn liegen.');
      start = von.toISOString();
      ende = bis.toISOString();
    }

    const daten: TerminDaten = {
      titel: eingabe.titel.trim(),
      beschreibung: eingabe.beschreibung.trim(),
      ort: eingabe.ort.trim(),
      ganztaegig: eingabe.ganztaegig,
      start,
      ende,
      teilnehmer: emails,
      meet: eingabe.meet,
      einladungSenden: eingabe.einladungSenden && emails.length > 0,
    };
    return { daten, firma, kontakte };
  }

  /** Creates an appointment in the signed-in person's calendar; with a firm, it is also logged in the firm's history. */
  async planeTermin(eingabe: TerminEingabe): Promise<CalendarEvent> {
    const db = await this.store.load();
    const { daten, firma, kontakte } = this.terminDaten(db, eingabe);
    const termin = await this.calendar.createEvent(daten);
    if (!firma) return termin;

    const wann = eingabe.ganztaegig
      ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(`${eingabe.von_datum}T00:00`))
      : new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(daten.start));
    const personen = kontakte.map(kontaktName).concat(eingabe.weitere_emails.map((e) => e.trim()).filter(Boolean));
    await this.log({
      firma_id: firma.id,
      kontakt_id: kontakte[0]?.id ?? '',
      deal_id: '',
      typ: 'meeting',
      text: `Termin „${termin.titel}“ am ${wann}${personen.length ? ` mit ${personen.join(', ')}` : ''}${termin.meetLink ? ` – ${termin.meetLink}` : ''}`,
      kalender_termin_id: termin.id,
    });
    return termin;
  }

  async aendereTermin(bisher: CalendarEvent, eingabe: TerminEingabe): Promise<CalendarEvent> {
    if (bisher.bearbeitbar === false) throw new ValidationError('termin', 'Diesen Termin kann nur die Person ändern, die ihn angelegt hat.');
    const db = await this.store.load();
    return this.calendar.updateEvent(bisher, this.terminDaten(db, eingabe).daten);
  }

  async loescheTermin(bisher: CalendarEvent, benachrichtigen: boolean): Promise<void> {
    if (bisher.bearbeitbar === false) throw new ValidationError('termin', 'Diesen Termin kann nur die Person löschen, die ihn angelegt hat.');
    return this.calendar.deleteEvent(bisher, benachrichtigen && (bisher.gaeste ?? []).length > 0);
  }

  /** Everything in the signed-in person's primary calendar between two ISO timestamps. */
  termine(von: string, bis: string): Promise<CalendarEvent[]> {
    return this.calendar.listEvents(von, bis);
  }

  /** Calendar events of the signed-in person with any (max. 5) contacts of the firm, from 6 months back to 3 months ahead. */
  async termineMitFirma(db: Database, firmaId: string): Promise<CalendarEvent[]> {
    const emails = db.kontakte
      .filter((k) => k.firma_id === firmaId && !k.archiviert && k.email)
      .sort((a, b) => Number(b.hauptkontakt) - Number(a.hauptkontakt))
      .slice(0, 5)
      .map((k) => k.email);
    if (emails.length === 0) return [];
    const jetzt = this.now().getTime();
    const von = new Date(jetzt - 183 * 86_400_000).toISOString();
    const bis = new Date(jetzt + 92 * 86_400_000).toISOString();
    const listen = await Promise.all(emails.map((email) => this.calendar.findEvents(email, von, bis)));
    const eindeutig = new Map(listen.flat().map((e) => [e.id, e]));
    return [...eindeutig.values()].filter((e) => !e.abgesagt).sort((a, b) => b.start.localeCompare(a.start));
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  /** Writes a previewed import plan: one append per tab for new records, one batch update for filled fields. */
  async importiere(plan: ImportPlan): Promise<ImportErgebnis> {
    const db = await this.store.load();
    const meta = this.created();
    const firmen: Firma[] = [];
    const kontakte: Kontakt[] = [];
    const deals: Deal[] = [];
    const aktivitaeten: Aktivitaet[] = [];
    const updates: { id: string; changes: Partial<Firma> }[] = [];
    const dealTitel = plan.optionen.dealTitel.trim() || db.einstellungen[EINSTELLUNG.dealTitel] || DEFAULT_DEAL_TITEL;
    const alleFirmen = [...db.firmen];

    for (const zeile of plan.zeilen) {
      if (zeile.aktion === 'neu' && zeile.firma) {
        // Re-validate against the current data – someone may have added the domain since the preview.
        let clean: FirmaInput;
        try {
          clean = prepareFirma(zeile.firma, alleFirmen);
        } catch {
          continue;
        }
        const firma: Firma = { ...clean, id: newId(ID_PREFIX.firmen), archiviert: false, ...meta };
        firmen.push(firma);
        alleFirmen.push(firma);
        let kontaktId = '';
        if (zeile.kontakt) {
          const kontakt: Kontakt = { ...prepareKontakt(zeile.kontakt), id: newId(ID_PREFIX.kontakte), firma_id: firma.id, archiviert: false, ...meta };
          kontakte.push(kontakt);
          kontaktId = kontakt.id;
        }
        if (plan.optionen.dealAnlegen) {
          deals.push({
            id: newId(ID_PREFIX.deals), firma_id: firma.id, kontakt_id: kontaktId,
            titel: dealTitel, phase: 'neu', wert_eur: null, wahrscheinlichkeit: null, zustaendig: plan.optionen.zustaendig,
            naechster_schritt: '', naechster_schritt_am: '', verlustgrund: '', abgeschlossen_am: '', archiviert: false, ...meta,
          });
        }
        aktivitaeten.push(this.aktivitaet({ firma_id: firma.id, kontakt_id: '', deal_id: '', typ: 'system', text: `Importiert (${firma.quelle})` }));
      } else if (zeile.aktion === 'ergaenzen' && zeile.firmaId) {
        const aktuell = db.firmen.find((f) => f.id === zeile.firmaId);
        if (!aktuell) continue;
        // Only fields that are still empty now – someone may have filled them since the preview.
        const nochLeer = Object.fromEntries(
          Object.entries(zeile.aenderungen ?? {}).filter(([feld]) => {
            const wert = aktuell[feld as keyof Firma];
            return wert === null || wert === '';
          }),
        ) as Partial<Firma>;
        if (Object.keys(nochLeer).length > 0) {
          updates.push({ id: zeile.firmaId, changes: { ...nochLeer, ...this.changed() } });
        }
        if (zeile.kontakt) {
          kontakte.push({ ...prepareKontakt(zeile.kontakt), id: newId(ID_PREFIX.kontakte), firma_id: zeile.firmaId, archiviert: false, ...meta });
        }
        aktivitaeten.push(this.aktivitaet({ firma_id: zeile.firmaId, kontakt_id: '', deal_id: '', typ: 'system', text: `Durch Import ergänzt: ${zeile.hinweis}` }));
      }
    }

    await this.store.insert('firmen', firmen);
    await this.store.update('firmen', updates);
    await this.store.insert('kontakte', kontakte);
    await this.store.insert('deals', deals);
    await this.store.insert('aktivitaeten', aktivitaeten);
    return { neu: firmen.length, ergaenzt: updates.length, kontakte: kontakte.length, deals: deals.length };
  }
}
