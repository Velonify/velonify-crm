import { dienstkontoToken } from '../../../gemeinsam/google';
import { darfEinrichten } from '../../../../src/data/instanz';
import type { Db } from '../../../../src/data/postgres/postgresStore';
import {
  ABLAGE_VORLAGE,
  driveIdAusLink,
  driveOrdnerUrl,
  elternVon,
  HAUPTORDNER,
  istDriveId,
  JAHRES_ORDNER,
  schluesselTeil,
  UNTERORDNER_BEREICHE,
  type AblageEintrag,
  type AblageOrdner,
} from '../../../../src/creator/ablage/typen';
import { fehler, istObjekt, ok, type CreatorKontext } from './modul';
import type { Antwort } from '../routen';

/**
 * Ablage als Explorer (Noels Feedback 11/2026): Der Hauptordner liegt in der Drive der Instanz und ist einmal mit dem
 * Dienstkonto von crm-api geteilt. crm-api listet, legt Ordner an, benennt um und verschiebt mit dessen Token (Scope drive);
 * die Dateien bleiben in der Drive der Instanz, der Hub speichert nur Ordner-Ids. Hochladen läuft direkt in Google Drive,
 * weil ein Dienstkonto in einer persönlichen Drive keinen Speicher hat.
 */

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const ORDNER_MIME = 'application/vnd.google-apps.folder';
const METADATA_EMAIL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email';
const GESPERRT = /^(buchhaltung|vertraege|gesellschaft)(\/|$)/;
const PARTNER_BEREICHE = /^(content|branding)(\/|$)/;

export interface DriveNetz {
  holen: typeof fetch;
  token(): Promise<string>;
  /** Address of the service account, for the sharing hint. */
  konto(): Promise<string>;
}

function standardNetz(): DriveNetz {
  const holen: typeof fetch = (...a) => fetch(...a);
  let konto: Promise<string> | null = null;
  return {
    holen,
    token: dienstkontoToken(holen, ['https://www.googleapis.com/auth/drive']),
    konto: () =>
      (konto ??= holen(METADATA_EMAIL, { headers: { 'Metadata-Flavor': 'Google' } })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '')),
  };
}

let netz: DriveNetz | null = null;
const aktuellesNetz = () => (netz ??= standardNetz());
/** Tests replace Google Drive. */
export function setzeDriveNetz(n: DriveNetz | null) {
  netz = n;
}

class DriveProblem extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface DriveDatei {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  trashed?: boolean;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  lastModifyingUser?: { displayName?: string };
}

const FELDER = 'id,name,mimeType,parents,trashed,size,modifiedTime,webViewLink,iconLink,lastModifyingUser(displayName)';

async function drive<T>(pfad: string, init: RequestInit = {}): Promise<T> {
  const n = aktuellesNetz();
  const r = await n.holen(`${DRIVE}${pfad}`, { ...init, headers: { authorization: `Bearer ${await n.token()}`, 'content-type': 'application/json', ...init.headers } });
  if (r.ok) return (await r.json()) as T;
  const daten = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (r.status === 404) throw new DriveProblem(404, 'Diesen Ordner oder diese Datei sieht der Hub nicht (mehr). Vielleicht wurde sie verschoben, gelöscht oder nicht geteilt.');
  if (r.status === 403) throw new DriveProblem(403, `Google Drive hat den Zugriff abgelehnt: ${daten?.error?.message ?? 'ohne Meldung'}`);
  throw new DriveProblem(502, `Google Drive antwortet mit Fehler ${r.status}. Bitte erneut versuchen.`);
}

const datei = (id: string) => drive<DriveDatei>(`/${encodeURIComponent(id)}?fields=${FELDER}&supportsAllDrives=true`);

function zuEintrag(d: DriveDatei): AblageEintrag {
  return {
    id: d.id,
    name: d.name,
    ordner: d.mimeType === ORDNER_MIME,
    mime: d.mimeType,
    groesse: d.size ? Number(d.size) : null,
    geaendert_am: d.modifiedTime ?? '',
    geaendert_von: d.lastModifyingUser?.displayName ?? '',
    link: d.webViewLink ?? (d.mimeType === ORDNER_MIME ? driveOrdnerUrl(d.id) : `https://drive.google.com/file/d/${encodeURIComponent(d.id)}/view`),
  };
}

const text = (w: unknown) => (typeof w === 'string' ? w.trim() : '');
function name(w: unknown): string {
  const n = text(w);
  if (!n || n.length > 200 || /[\r\n]/.test(n)) throw new DriveProblem(400, 'Bitte einen Namen mit 1 bis 200 Zeichen angeben.');
  return n;
}

async function ordnerListe(db: Db): Promise<AblageOrdner[]> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM ablage_ordner WHERE bereit ORDER BY schluessel');
  return rows.map((z) => ({
    schluessel: String(z.schluessel),
    name: String(z.name),
    drive_id: String(z.drive_id),
    url: driveOrdnerUrl(String(z.drive_id)),
    art: z.art === 'verknuepft' ? 'verknuepft' : 'angelegt',
    bereit: true,
    erstellt_am: z.erstellt_am ? new Date(z.erstellt_am as string).toISOString() : '',
    erstellt_von: String(z.erstellt_von ?? ''),
  }));
}

/** Which linked areas a person may enter: partners only content and branding, without amounts no bookkeeping. */
function erlaubt(ctx: CreatorKontext, schluessel: string) {
  if (ctx.rolle === 'partner') return PARTNER_BEREICHE.test(schluessel);
  return ctx.sicht.betraege || !GESPERRT.test(schluessel);
}

interface Lage {
  haupt: AblageOrdner;
  ordner: AblageOrdner[];
}

async function lage(ctx: CreatorKontext): Promise<Lage> {
  const ordner = await ordnerListe(ctx.pool);
  const haupt = ordner.find((o) => o.schluessel === HAUPTORDNER);
  if (!haupt) throw new DriveProblem(409, 'Die Ablage ist noch nicht eingerichtet. Ein Admin verbindet den Hauptordner unter Einrichtung.');
  return { haupt, ordner };
}

/**
 * The path from the main folder to `id` (both included). Anything outside the main folder does not exist for the hub,
 * and areas the person may not see answer 403.
 */
async function pfadZu(ctx: CreatorKontext, l: Lage, id: string): Promise<DriveDatei[]> {
  const kette: DriveDatei[] = [];
  let aktuell = id;
  for (let i = 0; i < 30; i++) {
    const d = await datei(aktuell);
    if (d.trashed) throw new DriveProblem(404, 'Dieser Ordner liegt im Papierkorb.');
    kette.unshift(d);
    if (d.id === l.haupt.drive_id) break;
    const eltern = d.parents?.[0];
    if (!eltern) throw new DriveProblem(404, 'Dieser Ordner liegt nicht in eurer Ablage.');
    aktuell = eltern;
  }
  if (kette[0]?.id !== l.haupt.drive_id) throw new DriveProblem(404, 'Dieser Ordner liegt nicht in eurer Ablage.');
  const bereiche = kette.map((d) => l.ordner.find((o) => o.drive_id === d.id)?.schluessel).filter((s): s is string => Boolean(s && s !== HAUPTORDNER));
  if (bereiche.some((s) => !erlaubt(ctx, s))) throw new DriveProblem(403, 'Dieser Bereich der Ablage ist für dich nicht freigegeben.');
  if (ctx.rolle === 'partner' && !bereiche.length) throw new DriveProblem(403, 'Für dich sind die Bereiche Content und Branding freigegeben.');
  return kette;
}

async function inhalt(id: string): Promise<AblageEintrag[]> {
  const eintraege: AblageEintrag[] = [];
  let seite = '';
  do {
    const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
    const r = await drive<{ files?: DriveDatei[]; nextPageToken?: string }>(
      `?q=${q}&fields=nextPageToken,files(${FELDER})&orderBy=folder,name_natural&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${seite ? `&pageToken=${encodeURIComponent(seite)}` : ''}`,
    );
    eintraege.push(...(r.files ?? []).map(zuEintrag));
    seite = r.nextPageToken ?? '';
  } while (seite && eintraege.length < 5000);
  return eintraege;
}

async function neuerOrdner(eltern: string, n: string, schluessel?: string): Promise<DriveDatei> {
  return drive<DriveDatei>(`?fields=${FELDER}&supportsAllDrives=true`, {
    method: 'POST',
    body: JSON.stringify({ name: n, mimeType: ORDNER_MIME, parents: [eltern], ...(schluessel ? { appProperties: { hubAblage: schluessel } } : {}) }),
  });
}

/** A folder of the fixed structure: reuses a linked one, else creates it below its parent and links it. */
async function strukturOrdner(ctx: CreatorKontext, schluessel: string, n: string): Promise<AblageOrdner> {
  const ordner = await ordnerListe(ctx.pool);
  const vorhanden = ordner.find((o) => o.schluessel === schluessel);
  if (vorhanden) {
    const d = await datei(vorhanden.drive_id).catch(() => null);
    if (d && !d.trashed) return vorhanden;
  }
  const eltern = ordner.find((o) => o.schluessel === elternVon(schluessel));
  if (!eltern) throw new DriveProblem(409, 'Der übergeordnete Ordner ist in der Ablage noch nicht eingerichtet.');
  const d = await neuerOrdner(eltern.drive_id, n, schluessel);
  const { rows } = await ctx.pool.query<Record<string, unknown>>(
    `INSERT INTO ablage_ordner (schluessel, name, drive_id, art, erstellt_von, bereit) VALUES ($1, $2, $3, 'angelegt', $4, true)
     ON CONFLICT (schluessel) DO UPDATE SET name = $2, drive_id = $3, art = 'angelegt', bereit = true RETURNING *`,
    [schluessel, n, d.id, ctx.person],
  );
  return { schluessel, name: n, drive_id: String(rows[0].drive_id), url: driveOrdnerUrl(d.id), art: 'angelegt', bereit: true, erstellt_am: '', erstellt_von: ctx.person };
}

/** A stable suffix also distinguishes titles whose Latin transliteration is empty or identical (as in the hub before). */
function kennung(n: string) {
  let h = 2166136261;
  for (const c of n.normalize('NFC')) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return `${schluesselTeil(n) || 'ordner'}-${(h >>> 0).toString(36)}`;
}

async function routen(methode: string, pfad: string, body: unknown, ctx: CreatorKontext): Promise<Antwort | null> {
  if (methode !== 'POST' && !(methode === 'GET' && pfad === '/c/ablage/explorer/konto')) return null;
  const b = istObjekt(body) ? body : {};

  if (pfad === '/c/ablage/explorer/konto') return ok({ konto: await aktuellesNetz().konto() });

  if (pfad === '/c/ablage/explorer') {
    const l = await lage(ctx);
    const sichtbar = l.ordner.filter((o) => o.schluessel !== HAUPTORDNER && erlaubt(ctx, o.schluessel));
    // Partners start in their first area, everybody else in the main folder.
    const start = ctx.rolle === 'partner' ? sichtbar.find((o) => !o.schluessel.includes('/'))?.drive_id : l.haupt.drive_id;
    const id = istDriveId(b.ordner) ? b.ordner : start;
    if (!id) return fehler(403, 'Für dich ist in der Ablage noch kein Bereich freigegeben.');
    const kette = await pfadZu(ctx, l, id);
    if (kette[kette.length - 1].mimeType !== ORDNER_MIME) return fehler(400, 'Das ist eine Datei, kein Ordner.');
    const fest = new Set(l.ordner.map((o) => o.drive_id));
    const eintraege = (await inhalt(id)).map((e) => ({ ...e, fest: fest.has(e.id) }));
    // Partners never see the folders above their area.
    const ab = ctx.rolle === 'partner' ? kette.findIndex((d) => sichtbar.some((o) => o.drive_id === d.id)) : 0;
    const verborgen = new Set(l.ordner.filter((o) => o.schluessel !== HAUPTORDNER && !erlaubt(ctx, o.schluessel)).map((o) => o.drive_id));
    return ok({
      ordner: { id, name: kette[kette.length - 1].name, link: driveOrdnerUrl(id), fest: fest.has(id) },
      pfad: kette.slice(Math.max(ab, 0)).map((d) => ({ id: d.id, name: d.id === l.haupt.drive_id ? 'Ablage' : d.name })),
      eintraege: eintraege.filter((e) => !verborgen.has(e.id)),
      bereiche: sichtbar.map((o) => ({ schluessel: o.schluessel, name: o.name, id: o.drive_id })),
    });
  }

  if (ctx.rolle === 'partner' && pfad !== '/c/ablage/explorer/neu') return fehler(403, 'Die Ablage verwaltet das interne Team.');

  if (pfad === '/c/ablage/explorer/neu') {
    const l = await lage(ctx);
    if (!istDriveId(b.eltern)) return fehler(400, 'Übergeordneter Ordner fehlt.');
    await pfadZu(ctx, l, b.eltern);
    return ok({ eintrag: zuEintrag(await neuerOrdner(b.eltern, name(b.name))) });
  }

  if (pfad === '/c/ablage/explorer/umbenennen' || pfad === '/c/ablage/explorer/verschieben') {
    const l = await lage(ctx);
    if (!istDriveId(b.id)) return fehler(400, 'Datei oder Ordner fehlt.');
    if (l.ordner.some((o) => o.drive_id === b.id)) return fehler(409, 'Dieser Ordner gehört zur festen Struktur der Ablage. Umbenennen oder verschieben bitte unter Einrichtung.');
    const kette = await pfadZu(ctx, l, b.id);
    const d = kette[kette.length - 1];
    if (pfad.endsWith('umbenennen')) {
      return ok({ eintrag: zuEintrag(await drive<DriveDatei>(`/${encodeURIComponent(d.id)}?fields=${FELDER}&supportsAllDrives=true`, { method: 'PATCH', body: JSON.stringify({ name: name(b.name) }) })) });
    }
    if (!istDriveId(b.ziel)) return fehler(400, 'Zielordner fehlt.');
    const ziel = await pfadZu(ctx, l, b.ziel);
    if (ziel[ziel.length - 1].mimeType !== ORDNER_MIME) return fehler(400, 'Das Ziel ist kein Ordner.');
    if (ziel.some((z) => z.id === d.id)) return fehler(400, 'Ein Ordner kann nicht in sich selbst verschoben werden.');
    const weg = (d.parents ?? []).join(',');
    return ok({
      eintrag: zuEintrag(
        await drive<DriveDatei>(`/${encodeURIComponent(d.id)}?addParents=${encodeURIComponent(b.ziel)}&removeParents=${encodeURIComponent(weg)}&fields=${FELDER}&supportsAllDrives=true`, { method: 'PATCH', body: '{}' }),
      ),
    });
  }

  if (pfad === '/c/ablage/explorer/unterordner') {
    // One folder per video or cooperation, made once: whoever comes second gets the existing one.
    const bereich = text(b.bereich);
    if (!(UNTERORDNER_BEREICHE as readonly string[]).includes(bereich)) return fehler(400, 'Unbekannter Bereich.');
    if (!erlaubt(ctx, bereich)) return fehler(403, 'Dieser Ablagebereich ist für dich nicht freigegeben.');
    await lage(ctx);
    const n = name(b.name);
    return ok({ ordner: await strukturOrdner(ctx, `${bereich}/${kennung(n)}`, n) });
  }

  if (pfad === '/c/ablage/explorer/einrichten') {
    if (!darfEinrichten(ctx.rolle)) return fehler(403, 'Die Ablage richten Admins ein.');
    const db = ctx.pool;
    if (b.link !== undefined) {
      const id = driveIdAusLink(text(b.link));
      if (!id) return fehler(400, 'Bitte den Link des Ordners aus Google Drive einfügen (drive.google.com/drive/folders/…).');
      const d = await datei(id).catch((e: unknown) => {
        if (e instanceof DriveProblem && e.status === 404) throw new DriveProblem(412, 'Der Hub sieht diesen Ordner noch nicht. Bitte den Ordner in Google Drive mit dem technischen Konto teilen (Bearbeiter) und es dann erneut versuchen.');
        throw e;
      });
      if (d.mimeType !== ORDNER_MIME || d.trashed) return fehler(400, 'Bitte einen Ordner wählen, der nicht im Papierkorb liegt.');
      const { rows } = await db.query<{ drive_id: string }>('SELECT drive_id FROM ablage_ordner WHERE schluessel = $1', [HAUPTORDNER]);
      if (rows[0] && rows[0].drive_id !== d.id) {
        const { rows: kinder } = await db.query("SELECT 1 FROM ablage_ordner WHERE schluessel <> 'haupt' LIMIT 1");
        if (kinder.length) return fehler(409, 'Zu diesem Hauptordner bestehen schon Unterordner. Bitte erst die Verknüpfungen lösen.');
      }
      await db.query(
        `INSERT INTO ablage_ordner (schluessel, name, drive_id, art, erstellt_von, bereit) VALUES ('haupt', $1, $2, 'verknuepft', $3, true)
         ON CONFLICT (schluessel) DO UPDATE SET name = $1, drive_id = $2, art = 'verknuepft', bereit = true`,
        [d.name, d.id, ctx.person],
      );
    }
    if (b.struktur === true) {
      await lage(ctx);
      for (const v of ABLAGE_VORLAGE) await strukturOrdner(ctx, v.schluessel, v.name);
      const jahr = String(ctx.jetzt().getFullYear());
      await strukturOrdner(ctx, `${JAHRES_ORDNER}/${jahr}`, jahr);
    }
    return ok({ ordner: await ordnerListe(db) });
  }
  return null;
}

/** Answers of the explorer, with Drive problems as readable errors. */
export async function explorerRouten(methode: string, pfad: string, body: unknown, ctx: CreatorKontext): Promise<Antwort | null> {
  if (!pfad.startsWith('/c/ablage/explorer')) return null;
  try {
    return await routen(methode, pfad, body, ctx);
  } catch (e) {
    if (e instanceof DriveProblem) {
      // Without a folder the explorer opens the main folder: then the sharing is missing.
      if (e.status === 404 && pfad === '/c/ablage/explorer' && !(istObjekt(body) && body.ordner)) {
        const konto = await aktuellesNetz().konto();
        return fehler(412, `Der Hub sieht den Ordner nicht. Bitte den Hauptordner in Google Drive mit ${konto || 'dem technischen Konto des Hubs'} teilen (Bearbeiter).`);
      }
      return fehler(e.status, e.message);
    }
    throw e;
  }
}
