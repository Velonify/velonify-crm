import type { BausteinId, InstanzRolleMitSupport, InstanzSicht } from '../../../../src/data/instanz';
import type { DbPool } from '../../../../src/data/postgres/postgresStore';
import type { Antwort } from '../routen';
import type { Ki } from './ki';
import type { Geheimnisse } from './geheimnisse';

/**
 * Modules of the creator profile (Bauplan: Vault `Hub-Intern/Matsu-Instanz - Bauplan.md`, section 11). Each module owns
 * a path prefix below /c/ for signed-in people, may answer public paths below /oeffentlich/ (forms, media kit, OAuth
 * callbacks) and may run timed jobs below /takt/ (Cloud Scheduler with TAKT_TOKEN). The shared tables are in migration 015.
 */
export interface CreatorKontext {
  /** The instance's own database. */
  pool: DbPool;
  email: string;
  /** Team name of the person (first name), as in the team list and in `zustaendig` fields. */
  person: string;
  rolle: InstanzRolleMitSupport;
  /** Tools, building blocks and whether amounts are visible, exactly as the hub got them from /instanz/ich. */
  sicht: InstanzSicht;
  ki: Ki;
  geheimnisse: Geheimnisse;
  umgebung: Umgebung;
  jetzt(): Date;
}

/** For public paths (no login): no person, no role. */
export interface OeffentlichKontext {
  pool: DbPool;
  ki: Ki;
  geheimnisse: Geheimnisse;
  umgebung: Umgebung;
  /** Switched-on building blocks: public pages of a block that is off answer 404. */
  bausteine: BausteinId[];
  /** Caller's address for rate limits (x-forwarded-for), may be empty. */
  herkunft: string;
  jetzt(): Date;
}

export type TaktKontext = Omit<OeffentlichKontext, 'herkunft'>;

/** Settings of the instance's deployment that modules need (all from environment variables of crm-api). */
export interface Umgebung {
  /** Public address of the hub, e.g. https://<kennung>.velonify.de (HUB_URL). */
  hubUrl: string;
  /** Public address of crm-api itself, for OAuth callbacks (CRM_API_URL). */
  apiUrl: string;
  /** Any other variable a module reads, e.g. YOUTUBE_CLIENT_ID; modules check for missing ones and answer 503. */
  wert(name: string): string | undefined;
}

export interface Modul {
  /** First path segment below /c/, e.g. "content" for /c/content/… */
  praefix: string;
  routen?(methode: string, pfad: string, body: unknown, ctx: CreatorKontext): Promise<Antwort | null>;
  /** Paths below /oeffentlich/<praefix>/… */
  oeffentlich?(methode: string, pfad: string, body: unknown, ctx: OeffentlichKontext, query: Record<string, string>): Promise<Antwort | null>;
  /** Timed jobs by name, started with POST /takt/<name>. */
  takte?: Record<string, (ctx: TaktKontext) => Promise<unknown>>;
}

export const istObjekt = (wert: unknown): wert is Record<string, unknown> => typeof wert === 'object' && wert !== null && !Array.isArray(wert);
export const fehler = (status: number, meldung: string): Antwort => ({ status, daten: { fehler: meldung } });
export const ok = (daten: unknown = { ok: true }): Antwort => ({ status: 200, daten });

/** 403 unless the building block is switched on in this instance. */
export function baustein(ctx: Pick<CreatorKontext, 'sicht'>, id: BausteinId): Antwort | null {
  return ctx.sicht.bausteine.includes(id) ? null : fehler(403, 'Dieser Baustein ist in eurem Hub nicht eingeschaltet.');
}

/** 403 for people who must not see amounts (schnitt, partner without amounts). Use before returning or writing money fields. */
export function betraege(ctx: Pick<CreatorKontext, 'sicht'>): boolean {
  return ctx.sicht.betraege;
}

/** Short random id with a prefix, like the hub's ids (e.g. I-7KD2M9XQ). */
export function neueId(praefix: string): string {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += zeichen[Math.floor(Math.random() * zeichen.length)];
  return `${praefix}-${id}`;
}
