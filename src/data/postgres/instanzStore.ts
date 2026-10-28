import { INSTANZ_EINSTELLUNG, istInstanzRolle, teamName, type InstanzRolle, type InstanzZugang } from '../instanz';
import type { Db } from './postgresStore';

/** A refused change with the HTTP status crm-api answers. */
export class InstanzFehler extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface ZugangZeile {
  email: string;
  name: string | null;
  rolle: string;
  aktiv: boolean;
  letzter_login: Date | string | null;
  angelegt_am: Date | string;
}

const zeit = (wert: Date | string | null) => (wert ? new Date(wert).toISOString() : '');

function zuZugang(z: ZugangZeile): InstanzZugang {
  return { email: z.email, name: z.name ?? '', rolle: istInstanzRolle(z.rolle) ? z.rolle : 'team', aktiv: z.aktiv, letzter_login: zeit(z.letzter_login), angelegt_am: zeit(z.angelegt_am) };
}

/** Logins and settings of an own instance, in the instance's database (migration 014). */
export class InstanzStore {
  constructor(private readonly db: Db) {}

  async zugang(email: string): Promise<InstanzZugang | null> {
    const { rows } = await this.db.query<ZugangZeile>('SELECT * FROM instanz_zugaenge WHERE email = $1 AND aktiv', [email.trim().toLowerCase()]);
    return rows[0] ? zuZugang(rows[0]) : null;
  }

  async zugaenge(): Promise<InstanzZugang[]> {
    const { rows } = await this.db.query<ZugangZeile>('SELECT * FROM instanz_zugaenge ORDER BY aktiv DESC, angelegt_am');
    return rows.map(zuZugang);
  }

  /** Last login, at most every 30 minutes, so /ich on every reload does not write each time. */
  async meldeAnmeldung(email: string): Promise<void> {
    await this.db.query(`UPDATE instanz_zugaenge SET letzter_login = now() WHERE email = $1 AND (letzter_login IS NULL OR letzter_login < now() - interval '30 minutes')`, [email]);
  }

  async speichereZugang(eingabe: { email: string; name?: string; rolle?: InstanzRolle; aktiv?: boolean }, von: string): Promise<InstanzZugang> {
    const email = eingabe.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) throw new InstanzFehler('Keine gültige E-Mail-Adresse.');
    if (eingabe.rolle !== undefined && !istInstanzRolle(eingabe.rolle)) throw new InstanzFehler('Unbekannte Rolle.');
    if (email === von.toLowerCase() && (eingabe.aktiv === false || (eingabe.rolle && eingabe.rolle !== 'admin'))) {
      throw new InstanzFehler('Den eigenen Admin-Zugang kann man nicht selbst entfernen oder herabstufen.');
    }
    if (eingabe.aktiv === false || (eingabe.rolle && eingabe.rolle !== 'admin')) await this.pruefeLetztenAdmin(email);
    const { rows } = await this.db.query<ZugangZeile>(
      `INSERT INTO instanz_zugaenge (email, name, rolle, aktiv, angelegt_von) VALUES ($1, $2, COALESCE($3, 'team'), COALESCE($4, true), $5)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE($2, instanz_zugaenge.name), rolle = COALESCE($3, instanz_zugaenge.rolle),
         aktiv = COALESCE($4, instanz_zugaenge.aktiv), geaendert_am = now(), geaendert_von = $5
       RETURNING *`,
      [email, eingabe.name?.trim() || null, eingabe.rolle ?? null, eingabe.aktiv ?? null, von],
    );
    return zuZugang(rows[0]);
  }

  /** At least one active admin must stay, otherwise nobody at the customer could run the Einrichtung any more. */
  private async pruefeLetztenAdmin(email: string): Promise<void> {
    const { rows } = await this.db.query<{ email: string }>(`SELECT email FROM instanz_zugaenge WHERE aktiv AND rolle = 'admin'`);
    if (rows.length === 1 && rows[0].email === email) throw new InstanzFehler('Es muss mindestens einen aktiven Admin geben.', 409);
  }

  async einstellungen(): Promise<Record<string, string>> {
    const { rows } = await this.db.query<{ schluessel: string; wert: string | null }>(`SELECT schluessel, wert FROM einstellungen WHERE schluessel LIKE 'instanz\\_%'`);
    return Object.fromEntries(rows.map((r) => [r.schluessel, r.wert ?? '']));
  }

  async velonifyZugangAn(): Promise<boolean> {
    return (await this.einstellungen())[INSTANZ_EINSTELLUNG.velonifyZugang] !== 'aus';
  }

  /** First names of all active logins, for the team list (assignments, @-mentions). */
  async teamNamen(): Promise<string[]> {
    return (await this.zugaenge()).filter((z) => z.aktiv).map(teamName);
  }
}
