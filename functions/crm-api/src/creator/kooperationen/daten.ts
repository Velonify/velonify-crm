import type { Db } from '../../../../../src/data/postgres/postgresStore';
import { istObjekt } from '../modul';

/** Pipeline phases in order (Konzept: "Anfrage, Verhandlung, Vertrag, Briefing, Umsetzung, Freigabe, Reporting an den Partner, Rechnung"). */
export const PHASEN = ['anfrage', 'verhandlung', 'vertrag', 'briefing', 'umsetzung', 'freigabe', 'reporting', 'rechnung'] as const;
/** End states outside the board. */
export const ENDE = ['abgeschlossen', 'abgesagt'] as const;
export type Stand = (typeof PHASEN)[number] | (typeof ENDE)[number];
export const STAENDE: readonly Stand[] = [...PHASEN, ...ENDE];
export const istStand = (w: unknown): w is Stand => typeof w === 'string' && (STAENDE as readonly string[]).includes(w);

export const ZAHLUNGEN = ['offen', 'rechnung_gestellt', 'bezahlt'] as const;
export type Zahlung = (typeof ZAHLUNGEN)[number];
export const istZahlung = (w: unknown): w is Zahlung => typeof w === 'string' && (ZAHLUNGEN as readonly string[]).includes(w);

export const KANAELE = ['tiktok', 'instagram', 'youtube', 'twitch'] as const;
export const KANAL_NAME: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', twitch: 'Twitch' };
export const WAEHRUNGEN = ['EUR', 'JPY'] as const;
export type Waehrung = (typeof WAEHRUNGEN)[number];
export const istWaehrung = (w: unknown): w is Waehrung => w === 'EUR' || w === 'JPY';

export const text = (w: unknown): string => (w === null || w === undefined ? '' : String(w));
export const zeit = (w: unknown): string => (w ? new Date(w as string).toISOString() : '');
/** Postgres date (Date at local midnight or string) → "YYYY-MM-DD". */
export function tag(w: unknown): string {
  if (!w) return '';
  if (w instanceof Date) {
    const j = w.getFullYear();
    const m = String(w.getMonth() + 1).padStart(2, '0');
    const d = String(w.getDate()).padStart(2, '0');
    return `${j}-${m}-${d}`;
  }
  return String(w).slice(0, 10);
}
export const zahl = (w: unknown): number | null => (w === null || w === undefined || w === '' ? null : Number(w));
export const istTag = (w: unknown): w is string => typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w) && !Number.isNaN(new Date(`${w}T00:00:00Z`).getTime()) && new Date(`${w}T00:00:00Z`).toISOString().slice(0, 10) === w;
/** "YYYY-MM-DD" of a Date in Europe/Berlin. */
export const heuteIn = (d: Date): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);

/** Optional date field: undefined = not sent, null = cleared, string = set; throws on garbage. */
export function optTag(w: unknown, feld: string): string | null | undefined {
  if (w === undefined) return undefined;
  if (w === null || w === '') return null;
  if (!istTag(w)) throw new Eingabefehler(`${feld}: Datum im Format JJJJ-MM-TT.`);
  return w;
}
export function optText(w: unknown, feld: string, max = 2000): string | null | undefined {
  if (w === undefined) return undefined;
  if (w === null) return null;
  if (typeof w !== 'string') throw new Eingabefehler(`${feld} muss Text sein.`);
  const t = w.trim();
  if (t.length > max) throw new Eingabefehler(`${feld} ist zu lang (höchstens ${max} Zeichen).`);
  return t || null;
}
export function kanalListe(w: unknown): string[] {
  if (!Array.isArray(w)) throw new Eingabefehler('Kanäle als Liste.');
  const liste = [...new Set(w.map(String))];
  if (!liste.every((k) => (KANAELE as readonly string[]).includes(k))) throw new Eingabefehler('Unbekannter Kanal.');
  return liste;
}

export class Eingabefehler extends Error {
  status = 400;
}

/** Settings of the module (kooperation_einstellungen). */
export const EINSTELLUNG = { agentur: 'agentur_name', ruecklagenquote: 'ruecklagenquote' } as const;

export async function einstellungen(db: Db): Promise<Record<string, string>> {
  const { rows } = await db.query<{ schluessel: string; wert: string }>('SELECT schluessel, wert FROM kooperation_einstellungen');
  return Object.fromEntries(rows.map((r) => [r.schluessel, r.wert]));
}

export async function setzeEinstellung(db: Db, schluessel: string, wert: string, von: string): Promise<void> {
  await db.query(
    `INSERT INTO kooperation_einstellungen (schluessel, wert, geaendert_am, geaendert_von) VALUES ($1, $2, now(), $3)
     ON CONFLICT (schluessel) DO UPDATE SET wert = $2, geaendert_am = now(), geaendert_von = $3`,
    [schluessel, wert, von],
  );
}

/** Name of the instance for public pages ("<Name> HUB"). */
export async function instanzName(db: Db): Promise<string> {
  const { rows } = await db.query<{ wert: string | null }>(`SELECT wert FROM einstellungen WHERE schluessel = 'instanz_name'`);
  return rows[0]?.wert?.trim() ?? '';
}

export const istObjektMit = istObjekt;
