import type { BausteinId } from '../../../../../src/data/instanz';
import type { DbPool } from '../../../../../src/data/postgres/postgresStore';
import type { Geheimnisse } from '../geheimnisse';
import type { Ki } from '../ki';
import type { Umgebung } from '../modul';

/** Platforms with their own channel; "facebook" is only the access for Instagram Business Discovery (benchmarking). */
export const PLATTFORMEN = ['youtube', 'instagram', 'tiktok', 'twitch'] as const;
export type Plattform = (typeof PLATTFORMEN)[number];
export type OauthPlattform = Plattform | 'facebook';
export const istPlattform = (w: unknown): w is Plattform => typeof w === 'string' && (PLATTFORMEN as readonly string[]).includes(w);
export const istOauthPlattform = (w: unknown): w is OauthPlattform => w === 'facebook' || istPlattform(w);

export const PLATTFORM_LABEL: Record<OauthPlattform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  facebook: 'Instagram-Benchmarking (Facebook Login)',
};

/** HTTP is injected so tests run without network. */
export type Holen = typeof fetch;

/** Everything the jobs of this module need, signed in or timed. */
export interface Dienste {
  pool: DbPool;
  ki: Ki;
  geheimnisse: Geheimnisse;
  umgebung: Umgebung;
  bausteine: readonly BausteinId[];
  holen: Holen;
  jetzt(): Date;
  /** Who triggered it (team name), empty for timed jobs. */
  person?: string;
  email?: string;
}

/** An error of a platform's API with its HTTP status, so a 401 can trigger a token refresh. */
export class ApiFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** JSON from a platform; throws ApiFehler with the platform's own message on any non-2xx answer. */
export async function holeJson<T>(holen: Holen, url: string, init: RequestInit = {}, wer = 'Plattform'): Promise<T> {
  const antwort = await holen(url, init);
  const text = await antwort.text();
  let daten: unknown = null;
  try {
    daten = text ? JSON.parse(text) : null;
  } catch {
    daten = null;
  }
  if (!antwort.ok) {
    const d = daten as { error?: unknown; error_description?: string; message?: string } | null;
    const fehlerObjekt = d && typeof d.error === 'object' && d.error !== null ? (d.error as { message?: string; error_user_msg?: string }) : null;
    const meldung = fehlerObjekt?.error_user_msg ?? fehlerObjekt?.message ?? d?.error_description ?? d?.message ?? (typeof d?.error === 'string' ? d.error : '') ?? '';
    throw new ApiFehler(`${wer} antwortet mit ${antwort.status}${meldung ? `: ${meldung}` : ''}`, antwort.status);
  }
  return daten as T;
}

export const formular = (werte: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(werte).toString(),
});

/** Calendar day in Europe/Berlin (the instance's time zone), YYYY-MM-DD. */
export function tag(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function plusTage(datum: string, tage: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Days between two YYYY-MM-DD dates. */
export const tageZwischen = (von: string, bis: string) => Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86_400_000);

/** Numbers from Postgres: bigint and numeric arrive as strings with node-postgres. */
export const zahl = (w: unknown): number | null => (w === null || w === undefined || w === '' ? null : Number.isFinite(Number(w)) ? Number(w) : null);
export const text = (w: unknown) => (w === null || w === undefined ? '' : String(w));
export const zeit = (w: unknown) => (w ? new Date(w as string).toISOString() : '');
export const datumText = (w: unknown) => (!w ? '' : w instanceof Date ? tagUtc(w) : String(w).slice(0, 10));
/** A DATE column comes back as a Date at local midnight (pg) or UTC midnight (PGlite); both mean the same calendar day. */
function tagUtc(d: Date): string {
  const lokal = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return d.getUTCHours() === 0 ? d.toISOString().slice(0, 10) : lokal.toISOString().slice(0, 10);
}

export function median(werte: number[]): number | null {
  const z = werte.filter((w) => Number.isFinite(w)).sort((a, b) => a - b);
  if (z.length === 0) return null;
  const m = Math.floor(z.length / 2);
  return z.length % 2 ? z[m] : (z[m - 1] + z[m]) / 2;
}

export const summe = (werte: (number | null | undefined)[]) => werte.reduce<number>((s, w) => s + (w ?? 0), 0);

/** Interactions per view; null without views. */
export function rate(w: { aufrufe?: number | null; likes?: number | null; kommentare?: number | null; shares?: number | null; saves?: number | null }): number | null {
  if (!w.aufrufe) return null;
  return ((w.likes ?? 0) + (w.kommentare ?? 0) + (w.shares ?? 0) + (w.saves ?? 0)) / w.aufrufe;
}

/** Inserts many rows in one statement (works the same on node-postgres and PGlite). */
export async function vieleEinfuegen(
  db: { query(sql: string, werte?: unknown[]): Promise<unknown> },
  tabelle: string,
  spalten: Record<string, string>,
  zeilen: Record<string, unknown>[],
  konflikt = '',
): Promise<void> {
  if (zeilen.length === 0) return;
  const namen = Object.keys(spalten);
  const definition = namen.map((n) => `${n} ${spalten[n]}`).join(', ');
  for (let i = 0; i < zeilen.length; i += 1000) {
    await db.query(`INSERT INTO ${tabelle} (${namen.join(', ')}) SELECT ${namen.join(', ')} FROM jsonb_to_recordset($1::jsonb) AS x(${definition}) ${konflikt}`, [
      JSON.stringify(zeilen.slice(i, i + 1000)),
    ]);
  }
}
