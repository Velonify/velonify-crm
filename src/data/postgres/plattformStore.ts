// Node only: the platform tables in the database crm (db/plattform) – tenants, their logins, the Lead-Markt and what
// each tenant used. crm-api reads them on every tenant request; the admin tool "Plattform" in Velonify's hub edits them.
import { newId, ID_PREFIX } from '../ids';
import {
  aktiveWerkzeuge,
  faelligeFrage,
  gesundheit,
  heuteBerlin,
  ist_mandanten_id,
  kontingentAb,
  PAKETE,
  plusTage,
  TEST_TAGE,
  testTag,
  testTageUebrig,
  zugriff,
  type FeedbackAnlass,
  type Mandant,
  type MandantSicht,
  type Paket,
  type Rolle,
  type Zugang,
} from '../plattform';
import type { Db, DbPool } from './postgresStore';
import { PostgresStore } from './postgresStore';

export class PlattformFehler extends Error {
  constructor(
    message: string,
    readonly status: 400 | 402 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

const MANDANT_SPALTEN = `id, name, status, paket, to_char(test_start, 'YYYY-MM-DD') AS test_start, to_char(test_ende, 'YYYY-MM-DD') AS test_ende,
  funktionen, lead_kontingent, lead_zeitraum, ki_kontingent, notiz, bedingungen_am, bedingungen_von, buchung_paket, buchung_am, buchung_von,
  angelegt_am, geaendert_am`;

const text = (wert: unknown) => (wert === null || wert === undefined ? '' : wert instanceof Date ? wert.toISOString() : String(wert));

function zuMandant(z: Record<string, unknown>): Mandant {
  return {
    id: text(z.id),
    name: text(z.name),
    status: text(z.status) as Mandant['status'],
    paket: text(z.paket) as Paket,
    test_start: text(z.test_start),
    test_ende: text(z.test_ende),
    funktionen: (typeof z.funktionen === 'string' ? JSON.parse(z.funktionen) : (z.funktionen ?? {})) as Record<string, boolean>,
    lead_kontingent: Number(z.lead_kontingent ?? 0),
    lead_zeitraum: text(z.lead_zeitraum) === 'monat' ? 'monat' : 'gesamt',
    ki_kontingent: Number(z.ki_kontingent ?? 0),
    notiz: text(z.notiz),
    bedingungen_am: text(z.bedingungen_am),
    bedingungen_von: text(z.bedingungen_von),
    buchung_paket: text(z.buchung_paket),
    buchung_am: text(z.buchung_am),
    buchung_von: text(z.buchung_von),
    angelegt_am: text(z.angelegt_am),
    geaendert_am: text(z.geaendert_am),
  };
}

function zuZugang(z: Record<string, unknown>): Zugang {
  return {
    email: text(z.email),
    mandant_id: text(z.mandant_id),
    name: text(z.name),
    rolle: text(z.rolle) === 'inhaber' ? 'inhaber' : 'mitarbeiter',
    aktiv: z.aktiv === true,
    letzter_login: text(z.letzter_login),
  };
}

const json = (wert: unknown) => (typeof wert === 'string' ? JSON.parse(wert) : wert);

/** Preview of a Lead-Markt entry as stored (see functions/shop-audit/src/leads/markt.ts). */
export interface MarktVorschau {
  branche: string | null;
  plz_bereich: string;
  land: string;
  rang_de: number | null;
  lcp_ms: number | null;
  shopify_plus: boolean;
  helpdesk: string[];
  email_tools: string[];
  zahlarten: string[];
  bewertungen: string[];
  sprachen: string[];
  apps: number;
  produkte: number | null;
}

export interface MarktDaten {
  domain: string;
  firma: string;
  rechtsform: string;
  email: string;
  telefon: string;
  ansprechpartner: string;
  strasse: string;
  plz: string;
  ort: string;
  register: string;
  ust_id: string;
}

export interface MarktFilter {
  branche?: string;
  plz_bereich?: string;
  nur_helpdesk?: boolean;
  helpdesk?: string;
  seite?: number;
}

/** Previews per page; the hub never gets the whole market at once. */
export const MARKT_SEITE = 25;

/** Deal phases that count as a success of a Lead-Markt lead, from the furthest back. */
const ERFOLGS_PHASEN = ['gespraech', 'angebot', 'gewonnen'] as const;

export interface MandantUebersicht {
  mandant: Mandant;
  zugriff: ReturnType<typeof zugriff>;
  tage_uebrig: number | null;
  personen: number;
  letzter_login: string;
  leads_verbraucht: number;
  ki_verbraucht: number;
  aktive_tage_7: number;
  gesundheit: number;
  feedback: number;
  /** Something the team should act on: booking requested, quota used up, decoy lead unlocked, trial ending. */
  signale: string[];
}

export class PlattformStore {
  constructor(
    private readonly db: DbPool,
    private readonly jetzt: () => Date = () => new Date(),
  ) {}

  heute(): string {
    return heuteBerlin(this.jetzt());
  }

  async mandant(id: string): Promise<Mandant | null> {
    const { rows } = await this.db.query(`SELECT ${MANDANT_SPALTEN} FROM plattform_mandanten WHERE id = $1`, [id]);
    return rows[0] ? zuMandant(rows[0]) : null;
  }

  /** The active login of this address with its tenant, or null: the whitelist. */
  async zugang(email: string): Promise<{ zugang: Zugang; mandant: Mandant } | null> {
    const { rows } = await this.db.query('SELECT * FROM plattform_zugaenge WHERE email = $1 AND aktiv', [email.toLowerCase()]);
    if (!rows[0]) return null;
    const zugang = zuZugang(rows[0]);
    const mandant = await this.mandant(zugang.mandant_id);
    return mandant ? { zugang, mandant } : null;
  }

  async protokolliere(mandantId: string, email: string, art: string, detail = ''): Promise<void> {
    await this.db.query('INSERT INTO plattform_nutzung (mandant_id, email, art, detail) VALUES ($1, $2, $3, $4)', [mandantId, email, art, detail.slice(0, 500)]);
  }

  /** Records a login at most every 30 minutes per person, so the hub's reloads do not count as logins. */
  async meldeAnmeldung(zugang: Zugang): Promise<void> {
    const { rows } = await this.db.query<{ email: string }>(
      `UPDATE plattform_zugaenge SET letzter_login = now()
       WHERE email = $1 AND (letzter_login IS NULL OR letzter_login < now() - interval '30 minutes') RETURNING email`,
      [zugang.email],
    );
    if (rows.length > 0) await this.protokolliere(zugang.mandant_id, zugang.email, 'login');
  }

  async leadsVerbraucht(m: Mandant, db: Db = this.db): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM plattform_lead_freigaben WHERE mandant_id = $1 AND NOT koeder AND am >= $2::date',
      [m.id, kontingentAb(m, this.heute())],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async kiVerbraucht(m: Mandant): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM plattform_nutzung WHERE mandant_id = $1 AND art = 'ki' AND am >= $2::date`,
      [m.id, kontingentAb(m, this.heute())],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Counts a call of Claude (Contact Generator, Shop-Audit, "Frag den Hub"); throws when the quota is used up. */
  async verbraucheKi(m: Mandant, email: string, wofuer: string): Promise<void> {
    if ((await this.kiVerbraucht(m)) >= m.ki_kontingent) {
      throw new PlattformFehler(`Das KI-Kontingent (${m.ki_kontingent}) ist aufgebraucht. Mit einem größeren Paket geht es weiter.`, 402);
    }
    await this.protokolliere(m.id, email, 'ki', wofuer);
  }

  /** Successes of unlocked leads in the tenant's own database: deals in conversation, offer or won. */
  async erfolge(m: Mandant, mandantDb: Db): Promise<MandantSicht['erfolge']> {
    const { rows } = await this.db.query<{ firma_id: string }>(
      'SELECT firma_id FROM plattform_lead_freigaben WHERE mandant_id = $1 AND NOT koeder AND firma_id IS NOT NULL',
      [m.id],
    );
    const ids = rows.map((r) => r.firma_id);
    const erfolge = { leads: ids.length, gespraeche: 0, angebote: 0, gewonnen: 0 };
    if (ids.length === 0) return erfolge;
    const { rows: deals } = await mandantDb.query<{ firma_id: string; phase: string }>(
      'SELECT firma_id, phase FROM deals WHERE firma_id = ANY($1) AND NOT archiviert',
      [ids],
    );
    // Per firm the furthest phase counts once; a won deal has also been a conversation and an offer.
    const weiteste = new Map<string, number>();
    for (const d of deals) {
      const stufe = ERFOLGS_PHASEN.indexOf(d.phase as (typeof ERFOLGS_PHASEN)[number]);
      if (stufe >= 0) weiteste.set(d.firma_id, Math.max(weiteste.get(d.firma_id) ?? -1, stufe));
    }
    for (const stufe of weiteste.values()) {
      erfolge.gespraeche += 1;
      if (stufe >= 1) erfolge.angebote += 1;
      if (stufe >= 2) erfolge.gewonnen += 1;
    }
    return erfolge;
  }

  async sicht(zugang: Zugang, m: Mandant, mandantDb: Db): Promise<MandantSicht> {
    const heute = this.heute();
    const tag = testTag(m, heute);
    const [leads, ki, beantwortet, erfolge] = await Promise.all([
      this.leadsVerbraucht(m),
      this.kiVerbraucht(m),
      this.db.query<{ anlass: string }>('SELECT DISTINCT anlass FROM plattform_feedback WHERE mandant_id = $1 AND email = $2', [m.id, zugang.email]),
      this.erfolge(m, mandantDb),
    ]);
    return {
      mandant: {
        id: m.id,
        name: m.name,
        status: m.status,
        paket: m.paket,
        test_start: m.test_start,
        test_ende: m.test_ende,
        bedingungen_am: m.bedingungen_am,
        buchung_paket: m.buchung_paket,
        buchung_am: m.buchung_am,
      },
      rolle: zugang.rolle,
      zugriff: zugriff(m, heute),
      heute,
      tage_uebrig: testTageUebrig(m, heute),
      test_tag: tag,
      werkzeuge: aktiveWerkzeuge(m),
      leads: { kontingent: m.lead_kontingent, verbraucht: leads, zeitraum: m.lead_zeitraum },
      ki: { kontingent: m.ki_kontingent, verbraucht: ki },
      feedback_frage: m.status === 'test' ? faelligeFrage(tag, beantwortet.rows.map((r) => r.anlass)) : null,
      erfolge,
    };
  }

  /** One page of previews: no name, no domain, no contact. Unlocked shops and other tenants' decoys are left out. */
  async markt(mandantId: string, filter: MarktFilter): Promise<{ eintraege: { id: string; vorschau: MarktVorschau }[]; gesamt: number; seite: number; seiten: number }> {
    const bedingungen = [
      'm.aktiv',
      '(m.koeder_fuer IS NULL OR m.koeder_fuer = $1)',
      'NOT EXISTS (SELECT 1 FROM plattform_lead_freigaben f WHERE f.domain = m.domain AND (NOT f.koeder OR f.mandant_id = $1))',
      'NOT EXISTS (SELECT 1 FROM firmen v WHERE lower(v.domain) = m.domain)',
    ];
    const werte: unknown[] = [mandantId];
    if (filter.branche) {
      werte.push(filter.branche);
      bedingungen.push(`m.vorschau->>'branche' = $${werte.length}`);
    }
    if (filter.plz_bereich) {
      werte.push(filter.plz_bereich);
      bedingungen.push(`m.vorschau->>'plz_bereich' = $${werte.length}`);
    }
    if (filter.nur_helpdesk) bedingungen.push(`jsonb_array_length(m.vorschau->'helpdesk') > 0`);
    if (filter.helpdesk) {
      werte.push(JSON.stringify([filter.helpdesk]));
      bedingungen.push(`m.vorschau->'helpdesk' @> $${werte.length}::jsonb`);
    }
    const wo = bedingungen.join(' AND ');
    const { rows: zahl } = await this.db.query<{ n: string }>(`SELECT count(*) AS n FROM plattform_lead_markt m WHERE ${wo}`, werte);
    const gesamt = Number(zahl[0]?.n ?? 0);
    const seiten = Math.max(1, Math.ceil(gesamt / MARKT_SEITE));
    const seite = Math.min(Math.max(1, Math.floor(filter.seite ?? 1)), seiten);
    // Decoys sort in like any shop: by id, which is random enough since they are added between real entries.
    const { rows } = await this.db.query<{ id: string; vorschau: unknown }>(
      `SELECT m.id::text AS id, m.vorschau FROM plattform_lead_markt m WHERE ${wo}
       ORDER BY jsonb_array_length(m.vorschau->'helpdesk') > 0 DESC, (m.vorschau->>'rang_de')::int NULLS LAST, m.id
       LIMIT ${MARKT_SEITE} OFFSET ${(seite - 1) * MARKT_SEITE}`,
      werte,
    );
    return { eintraege: rows.map((r) => ({ id: r.id, vorschau: json(r.vorschau) as MarktVorschau })), gesamt, seite, seiten };
  }

  /**
   * Unlocks one shop for a tenant: checks access and quota, records the release and writes firm, contact, deal and a
   * history entry into the tenant's own database, all in the platform transaction (a failed copy rolls it back).
   */
  async freischalten(zugang: Zugang, m: Mandant, marktId: string, mandantDb: DbPool): Promise<{ firma_id: string; neu: boolean; koeder: string | null }> {
    if (zugriff(m, this.heute()) !== 'voll') throw new PlattformFehler('Der Testzeitraum ist abgelaufen. Leads lassen sich erst nach der Buchung wieder freischalten.', 403);
    if (!aktiveWerkzeuge(m).includes('leadmarkt')) throw new PlattformFehler('Der Lead-Markt ist für euch nicht freigeschaltet.', 403);
    if (!/^\d{1,18}$/.test(marktId)) throw new PlattformFehler('Unbekannter Lead.', 404);

    return this.db.transaktion(async (tx) => {
      // One unlock at a time per tenant, so two clicks cannot both take the last lead of the quota.
      await tx.query('SELECT id FROM plattform_mandanten WHERE id = $1 FOR UPDATE', [m.id]);
      const { rows } = await tx.query<{ id: string; domain: string; vorschau: unknown; daten: unknown; koeder_fuer: string | null }>(
        'SELECT id::text AS id, domain, vorschau, daten, koeder_fuer FROM plattform_lead_markt WHERE id = $1::bigint AND aktiv FOR UPDATE',
        [marktId],
      );
      const eintrag = rows[0];
      if (!eintrag || (eintrag.koeder_fuer && eintrag.koeder_fuer !== m.id)) throw new PlattformFehler('Diesen Lead gibt es nicht mehr.', 404);
      const koeder = eintrag.koeder_fuer === m.id;

      const { rows: vorhanden } = await tx.query<{ mandant_id: string; firma_id: string | null }>(
        'SELECT mandant_id, firma_id FROM plattform_lead_freigaben WHERE domain = $1 AND (NOT koeder OR mandant_id = $2)',
        [eintrag.domain, m.id],
      );
      const eigene = vorhanden.find((v) => v.mandant_id === m.id);
      if (eigene?.firma_id) return { firma_id: eigene.firma_id, neu: false, koeder: null };
      if (vorhanden.length > 0) throw new PlattformFehler('Dieser Lead ist gerade an jemand anderen gegangen.', 409);
      if (!koeder) {
        const { rows: velonify } = await tx.query('SELECT 1 FROM firmen WHERE lower(domain) = $1 LIMIT 1', [eintrag.domain]);
        if (velonify.length > 0) {
          await tx.query('UPDATE plattform_lead_markt SET aktiv = false WHERE id = $1::bigint', [marktId]);
          throw new PlattformFehler('Diesen Lead gibt es nicht mehr.', 404);
        }
        if ((await this.leadsVerbraucht(m, tx)) >= m.lead_kontingent) {
          throw new PlattformFehler(`Alle ${m.lead_kontingent} Leads sind freigeschaltet. Mit einem Paket bekommt ihr jeden Monat neue.`, 402);
        }
      }

      const daten = json(eintrag.daten) as MarktDaten;
      const vorschau = json(eintrag.vorschau) as MarktVorschau;
      const { rows: schonDa } = await mandantDb.query<{ id: string }>('SELECT id FROM firmen WHERE lower(domain) = $1 LIMIT 1', [eintrag.domain]);
      if (schonDa[0]) throw new PlattformFehler('Diese Firma steht schon in eurem Hub. Der Lead wurde nicht gezählt.', 409);

      const firmaId = await this.schreibeLead(zugang, daten, vorschau, mandantDb);
      await tx.query('INSERT INTO plattform_lead_freigaben (mandant_id, markt_id, domain, firma_id, koeder, von) VALUES ($1, $2::bigint, $3, $4, $5, $6)', [
        m.id,
        marktId,
        eintrag.domain,
        firmaId,
        koeder,
        zugang.email,
      ]);
      await tx.query('INSERT INTO plattform_nutzung (mandant_id, email, art, detail) VALUES ($1, $2, $3, $4)', [m.id, zugang.email, koeder ? 'koeder' : 'lead', eintrag.domain]);
      // `koeder` is for crm-api's alert only and must never reach the tenant.
      return { firma_id: firmaId, neu: true, koeder: koeder ? eintrag.domain : null };
    });
  }

  /** Firm, contact, deal and a history entry in the tenant's database, like the lead finder's takeover. */
  private async schreibeLead(zugang: Zugang, d: MarktDaten, v: MarktVorschau, mandantDb: DbPool): Promise<string> {
    const store = new PostgresStore(mandantDb, () => zugang.email);
    const am = this.jetzt().toISOString();
    const meta = { erstellt_am: am, erstellt_von: zugang.email, geaendert_am: am, geaendert_von: zugang.email };
    const person = zugang.name.split(/\s+/)[0] || zugang.email.split('@')[0];
    const firmaId = newId(ID_PREFIX.firmen);
    const technik = [
      v.shopify_plus ? 'Shopify Plus' : 'Shopify',
      v.helpdesk.length ? `Helpdesk: ${v.helpdesk.join(', ')}` : 'kein Helpdesk erkannt',
      v.email_tools.length ? `E-Mail: ${v.email_tools.join(', ')}` : '',
      v.zahlarten.length ? `Zahlarten: ${v.zahlarten.join(', ')}` : '',
    ].filter(Boolean);
    await store.insert('firmen', [
      {
        id: firmaId, name: d.firma || d.domain, domain: d.domain, kuerzel: '', status: 'lead', tier: '', score: null,
        plattform: v.shopify_plus ? 'Shopify Plus' : 'Shopify', version: '', eol: '', ort: [d.plz, d.ort].filter(Boolean).join(' '),
        register: d.register, ust_id: d.ust_id, email_allgemein: d.email, telefon_allgemein: d.telefon, tech_info: technik.join(' · '),
        quelle: 'Velonify Lead-Markt', zustaendig: person, drive_ordner_id: '', slack_channel: '', notiz: '', archiviert: false,
        branche: v.branche ?? '', tags: 'Lead-Markt', ...meta,
      },
    ]);
    let kontaktId = '';
    if (d.ansprechpartner) {
      const teile = d.ansprechpartner.trim().split(/\s+/);
      kontaktId = newId(ID_PREFIX.kontakte);
      await store.insert('kontakte', [
        {
          id: kontaktId, firma_id: firmaId, vorname: teile.length > 1 ? teile.slice(0, -1).join(' ') : '', nachname: teile[teile.length - 1],
          rolle: 'Geschäftsführung', email: '', telefon: '', linkedin: '', hauptkontakt: true, notiz: '', archiviert: false, ...meta,
        },
      ]);
    }
    await store.insert('deals', [
      {
        id: newId(ID_PREFIX.deals), firma_id: firmaId, kontakt_id: kontaktId, titel: 'Lead-Markt', phase: 'neu', wert_eur: null,
        wahrscheinlichkeit: null, zustaendig: person, naechster_schritt: 'Erstkontakt', naechster_schritt_am: '', verlustgrund: '',
        abgeschlossen_am: '', archiviert: false, ...meta,
      },
    ]);
    await store.insert('aktivitaeten', [
      { id: newId(ID_PREFIX.aktivitaeten), firma_id: firmaId, kontakt_id: '', deal_id: '', typ: 'system', datum: am, text: 'Aus dem Lead-Markt freigeschaltet', von: zugang.email, kalender_termin_id: '' },
    ]);
    return firmaId;
  }

  /** First names of the tenant's active logins, for the team list in its database. */
  async teamNamen(mandantId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ name: string | null; email: string }>(
      'SELECT name, email FROM plattform_zugaenge WHERE mandant_id = $1 AND aktiv ORDER BY angelegt_am',
      [mandantId],
    );
    return rows.map((z) => (z.name?.trim().split(/\s+/)[0] || z.email.split('@')[0]).replace(/^./, (c) => c.toUpperCase()));
  }

  async feedback(m: Mandant, email: string, anlass: FeedbackAnlass, wert: number | null, text: string): Promise<void> {
    await this.db.query('INSERT INTO plattform_feedback (mandant_id, email, anlass, wert, text) VALUES ($1, $2, $3, $4, $5)', [m.id, email, anlass, wert, text.slice(0, 4000)]);
  }

  async buchen(m: Mandant, email: string, paket: Paket): Promise<void> {
    await this.db.query('UPDATE plattform_mandanten SET buchung_paket = $2, buchung_am = now(), buchung_von = $3 WHERE id = $1', [m.id, paket, email]);
    await this.protokolliere(m.id, email, 'buchung', paket);
  }

  async bedingungen(m: Mandant, email: string): Promise<void> {
    await this.db.query('UPDATE plattform_mandanten SET bedingungen_am = now(), bedingungen_von = $2 WHERE id = $1 AND bedingungen_am IS NULL', [m.id, email]);
  }

  // ---- Admin tool (Velonify admins only, checked by crm-api) ----

  async mandanten(): Promise<MandantUebersicht[]> {
    const heute = this.heute();
    const { rows } = await this.db.query(`SELECT ${MANDANT_SPALTEN} FROM plattform_mandanten ORDER BY angelegt_am DESC`);
    const { rows: werte } = await this.db.query<{ mandant_id: string; personen: string; letzter_login: unknown; aktive_tage_7: string; bewegungen_7: string; koeder: string; feedback: string }>(`
      SELECT m.id AS mandant_id,
        (SELECT count(*) FROM plattform_zugaenge z WHERE z.mandant_id = m.id AND z.aktiv) AS personen,
        (SELECT max(letzter_login) FROM plattform_zugaenge z WHERE z.mandant_id = m.id) AS letzter_login,
        (SELECT count(DISTINCT (n.am AT TIME ZONE 'Europe/Berlin')::date) FROM plattform_nutzung n WHERE n.mandant_id = m.id AND n.am > now() - interval '7 days') AS aktive_tage_7,
        (SELECT count(*) FROM plattform_nutzung n WHERE n.mandant_id = m.id AND n.art = 'bewegung' AND n.am > now() - interval '7 days') AS bewegungen_7,
        (SELECT count(*) FROM plattform_lead_freigaben f WHERE f.mandant_id = m.id AND f.koeder) AS koeder,
        (SELECT count(*) FROM plattform_feedback f WHERE f.mandant_id = m.id) AS feedback
      FROM plattform_mandanten m`);
    const jeMandant = new Map(werte.map((w) => [w.mandant_id, w]));
    return Promise.all(
      rows.map(async (zeile) => {
        const m = zuMandant(zeile);
        const w = jeMandant.get(m.id);
        const [leads, ki] = await Promise.all([this.leadsVerbraucht(m), this.kiVerbraucht(m)]);
        const letzterLogin = text(w?.letzter_login);
        const tageSeitLogin = letzterLogin ? Math.floor((this.jetzt().getTime() - Date.parse(letzterLogin)) / 86_400_000) : null;
        const uebrig = testTageUebrig(m, heute);
        const signale: string[] = [];
        if (m.buchung_am && m.status !== 'aktiv') signale.push(`Will ${PAKETE[m.buchung_paket as Paket]?.name ?? m.buchung_paket} buchen`);
        if (m.lead_kontingent > 0 && leads >= m.lead_kontingent) signale.push('Lead-Kontingent aufgebraucht');
        if (Number(w?.koeder ?? 0) > 0) signale.push('Köder-Lead freigeschaltet');
        if (uebrig !== null && uebrig <= 5 && uebrig > 0) signale.push(`Test endet in ${uebrig} Tagen`);
        if (zugriff(m, heute) === 'nur_lesen' && m.status === 'test') signale.push('Test abgelaufen, nur lesen');
        return {
          mandant: m,
          zugriff: zugriff(m, heute),
          tage_uebrig: uebrig,
          personen: Number(w?.personen ?? 0),
          letzter_login: letzterLogin,
          leads_verbraucht: leads,
          ki_verbraucht: ki,
          aktive_tage_7: Number(w?.aktive_tage_7 ?? 0),
          gesundheit: gesundheit({
            aktive_tage_7: Number(w?.aktive_tage_7 ?? 0),
            leads_anteil: m.lead_kontingent > 0 ? leads / m.lead_kontingent : 0,
            bewegungen_7: Number(w?.bewegungen_7 ?? 0),
            tage_seit_login: tageSeitLogin,
          }),
          feedback: Number(w?.feedback ?? 0),
          signale,
        };
      }),
    );
  }

  async mandantDetail(id: string) {
    const m = await this.mandant(id);
    if (!m) throw new PlattformFehler('Unbekannter Mandant.', 404);
    const [zugaenge, nutzung, feedback, freigaben, werkzeuge] = await Promise.all([
      this.db.query('SELECT * FROM plattform_zugaenge WHERE mandant_id = $1 ORDER BY angelegt_am', [id]),
      this.db.query('SELECT art, email, detail, am FROM plattform_nutzung WHERE mandant_id = $1 ORDER BY am DESC LIMIT 200', [id]),
      this.db.query('SELECT anlass, email, wert, text, am FROM plattform_feedback WHERE mandant_id = $1 ORDER BY am DESC', [id]),
      this.db.query('SELECT domain, firma_id, koeder, von, am FROM plattform_lead_freigaben WHERE mandant_id = $1 ORDER BY am DESC', [id]),
      this.db.query<{ detail: string; n: string }>(
        `SELECT detail, count(*) AS n FROM plattform_nutzung WHERE mandant_id = $1 AND art = 'seite' GROUP BY detail ORDER BY n DESC`,
        [id],
      ),
    ]);
    const zeit = (z: Record<string, unknown>) => ({ ...z, am: text(z.am) });
    return {
      mandant: m,
      zugaenge: zugaenge.rows.map(zuZugang),
      nutzung: nutzung.rows.map(zeit),
      feedback: feedback.rows.map(zeit),
      freigaben: freigaben.rows.map(zeit),
      werkzeuge_genutzt: werkzeuge.rows.map((w) => ({ werkzeug: w.detail, aufrufe: Number(w.n) })),
    };
  }

  /** Creates or updates a tenant. A new trial starts today and runs TEST_TAGE days unless dates are given. */
  async speichereMandant(eingabe: Partial<Mandant> & { id: string }, von: string): Promise<Mandant> {
    if (!ist_mandanten_id(eingabe.id)) throw new PlattformFehler('Die Kennung darf nur a–z, 0–9 und _ enthalten (2–30 Zeichen).');
    const bisher = await this.mandant(eingabe.id);
    const heute = this.heute();
    const paket = (eingabe.paket ?? bisher?.paket ?? 'test') as Paket;
    if (!PAKETE[paket]) throw new PlattformFehler('Unbekanntes Paket.');
    const status = eingabe.status ?? bisher?.status ?? 'test';
    if (!['test', 'aktiv', 'nur_lesen', 'gesperrt'].includes(status)) throw new PlattformFehler('Unbekannter Status.');
    const testStart = eingabe.test_start ?? bisher?.test_start ?? heute;
    const neu: Mandant = {
      ...(bisher ?? ({} as Mandant)),
      id: eingabe.id,
      name: (eingabe.name ?? bisher?.name ?? '').trim(),
      status,
      paket,
      test_start: testStart,
      test_ende: eingabe.test_ende ?? bisher?.test_ende ?? plusTage(testStart, TEST_TAGE - 1),
      funktionen: eingabe.funktionen ?? bisher?.funktionen ?? {},
      lead_kontingent: eingabe.lead_kontingent ?? bisher?.lead_kontingent ?? PAKETE[paket].leads,
      lead_zeitraum: eingabe.lead_zeitraum ?? bisher?.lead_zeitraum ?? (paket === 'test' ? 'gesamt' : 'monat'),
      ki_kontingent: eingabe.ki_kontingent ?? bisher?.ki_kontingent ?? PAKETE[paket].ki,
      notiz: eingabe.notiz ?? bisher?.notiz ?? '',
    };
    if (!neu.name) throw new PlattformFehler('Der Mandant braucht einen Namen.');
    for (const datum of [neu.test_start, neu.test_ende]) if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new PlattformFehler('Daten im Format JJJJ-MM-TT.');
    // A booking is done once the tenant is active; the request no longer shows as a signal.
    const buchungErledigt = status === 'aktiv' && bisher?.status !== 'aktiv';
    await this.db.query(
      `INSERT INTO plattform_mandanten (id, name, status, paket, test_start, test_ende, funktionen, lead_kontingent, lead_zeitraum, ki_kontingent, notiz, geaendert_von)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::jsonb, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET name = $2, status = $3, paket = $4, test_start = $5::date, test_ende = $6::date, funktionen = $7::jsonb,
         lead_kontingent = $8, lead_zeitraum = $9, ki_kontingent = $10, notiz = $11, geaendert_von = $12, geaendert_am = now()
         ${buchungErledigt ? ', buchung_paket = NULL, buchung_am = NULL, buchung_von = NULL' : ''}`,
      [neu.id, neu.name, neu.status, neu.paket, neu.test_start, neu.test_ende, JSON.stringify(neu.funktionen), neu.lead_kontingent, neu.lead_zeitraum, neu.ki_kontingent, neu.notiz, von],
    );
    return (await this.mandant(neu.id))!;
  }

  /** Adds, changes or deactivates a login. An address belongs to one tenant only. */
  async speichereZugang(eingabe: { email: string; mandant_id: string; name?: string; rolle?: Rolle; aktiv?: boolean }): Promise<Zugang> {
    const email = eingabe.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) throw new PlattformFehler('Keine gültige E-Mail-Adresse.');
    if (email.endsWith('@velonify.de')) throw new PlattformFehler('Velonify-Adressen melden sich im eigenen Hub an.');
    if (!(await this.mandant(eingabe.mandant_id))) throw new PlattformFehler('Unbekannter Mandant.', 404);
    const { rows: bisher } = await this.db.query<{ mandant_id: string }>('SELECT mandant_id FROM plattform_zugaenge WHERE email = $1', [email]);
    if (bisher[0] && bisher[0].mandant_id !== eingabe.mandant_id) throw new PlattformFehler('Diese Adresse gehört schon zu einem anderen Mandanten.', 409);
    const { rows } = await this.db.query(
      `INSERT INTO plattform_zugaenge (email, mandant_id, name, rolle, aktiv) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE($3, plattform_zugaenge.name), rolle = $4, aktiv = $5 RETURNING *`,
      [email, eingabe.mandant_id, eingabe.name?.trim() || null, eingabe.rolle === 'inhaber' ? 'inhaber' : 'mitarbeiter', eingabe.aktiv ?? true],
    );
    return zuZugang(rows[0]);
  }

  /** Domains the market must not offer: Velonify's own firms and everything already in the market. For marktfuellen. */
  async ausschluss(): Promise<string[]> {
    const { rows } = await this.db.query<{ domain: string }>(`
      SELECT lower(regexp_replace(domain, '^www\\.', '')) AS domain FROM firmen WHERE coalesce(domain, '') <> ''
      UNION SELECT domain FROM plattform_lead_markt`);
    return rows.map((r) => r.domain);
  }

  /** Stores checked shops from shop-audit's marktfuellen; known domains and Velonify's firms are skipped. */
  async marktAufnehmen(eintraege: { domain: string; vorschau: MarktVorschau; daten: MarktDaten; geprueft_am?: string }[]): Promise<number> {
    const ausschluss = new Set(await this.ausschluss());
    let neu = 0;
    for (const e of eintraege) {
      const domain = e.domain.toLowerCase().replace(/^www\./, '');
      if (!domain || ausschluss.has(domain) || !e.daten?.email) continue;
      await this.db.query(
        'INSERT INTO plattform_lead_markt (domain, vorschau, daten, geprueft_am) VALUES ($1, $2::jsonb, $3::jsonb, $4) ON CONFLICT (domain) DO NOTHING',
        [domain, JSON.stringify(e.vorschau), JSON.stringify({ ...e.daten, domain }), e.geprueft_am || null],
      );
      ausschluss.add(domain);
      neu += 1;
    }
    return neu;
  }

  /** A made-up shop with an address that reaches Velonify, only visible to one tenant. */
  async koederAnlegen(mandantId: string, k: { domain: string; firma: string; email: string; ort?: string; plz?: string; ansprechpartner?: string }, vorlage: MarktVorschau): Promise<void> {
    if (!(await this.mandant(mandantId))) throw new PlattformFehler('Unbekannter Mandant.', 404);
    const domain = k.domain.trim().toLowerCase().replace(/^www\./, '');
    if (!domain || !k.email.includes('@') || !k.firma.trim()) throw new PlattformFehler('Domain, Firma und E-Mail angeben.');
    const daten: MarktDaten = {
      domain, firma: k.firma.trim(), rechtsform: '', email: k.email.trim().toLowerCase(), telefon: '', ansprechpartner: k.ansprechpartner?.trim() ?? '',
      strasse: '', plz: k.plz ?? '', ort: k.ort ?? '', register: '', ust_id: '',
    };
    await this.db.query('INSERT INTO plattform_lead_markt (domain, vorschau, daten, koeder_fuer) VALUES ($1, $2::jsonb, $3::jsonb, $4)', [
      domain,
      JSON.stringify({ ...vorlage, plz_bereich: /^\d/.test(daten.plz) ? daten.plz[0] : vorlage.plz_bereich }),
      JSON.stringify(daten),
      mandantId,
    ]);
  }

  async marktStatistik(): Promise<{ gesamt: number; frei: number; mit_helpdesk: number; vergeben: number; koeder: number }> {
    const { rows } = await this.db.query<Record<string, string>>(`
      SELECT
        count(*) FILTER (WHERE koeder_fuer IS NULL) AS gesamt,
        count(*) FILTER (WHERE koeder_fuer IS NULL AND aktiv AND NOT EXISTS (SELECT 1 FROM plattform_lead_freigaben f WHERE f.domain = m.domain AND NOT f.koeder)) AS frei,
        count(*) FILTER (WHERE koeder_fuer IS NULL AND jsonb_array_length(vorschau->'helpdesk') > 0) AS mit_helpdesk,
        (SELECT count(*) FROM plattform_lead_freigaben WHERE NOT koeder) AS vergeben,
        count(*) FILTER (WHERE koeder_fuer IS NOT NULL) AS koeder
      FROM plattform_lead_markt m`);
    const z = rows[0] ?? {};
    return { gesamt: Number(z.gesamt ?? 0), frei: Number(z.frei ?? 0), mit_helpdesk: Number(z.mit_helpdesk ?? 0), vergeben: Number(z.vergeben ?? 0), koeder: Number(z.koeder ?? 0) };
  }
}
