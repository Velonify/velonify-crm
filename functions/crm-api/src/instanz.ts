import {
  BAUSTEINE,
  darfEinrichten,
  INSTANZ_EINSTELLUNG,
  instanzBausteine,
  instanzWerkzeuge,
  istBaustein,
  istInstanzRolle,
  partnerWerkzeuge,
  teamName,
  type InstanzRolleMitSupport,
  type InstanzSicht,
  type InstanzZugang,
  type Profil,
} from '../../../src/data/instanz';
import { InstanzFehler, type InstanzStore } from '../../../src/data/postgres/instanzStore';
import { MitarbeiterStore } from '../../../src/data/postgres/mitarbeiterStore';
import { PostgresStore, type DbPool } from '../../../src/data/postgres/postgresStore';
import { LISTEN_DEFAULTS } from '../../../src/data/schema';
import type { TodoDaten } from '../../../src/data/types';
import { MODUL_WERKZEUG, MODULE } from './creator';
import type { Geheimnisse } from './creator/geheimnisse';
import type { Ki } from './creator/ki';
import type { Umgebung } from './creator/modul';
import { behandle, behandleDaten, type Antwort } from './routen';

const istObjekt = (wert: unknown): wert is Record<string, unknown> => typeof wert === 'object' && wert !== null && !Array.isArray(wert);
const fehler = (status: number, meldung: string): Antwort => ({ status, daten: { fehler: meldung } });
const istListe = (wert: unknown): wert is string[] => Array.isArray(wert) && wert.every((w) => typeof w === 'string');

/** What every request in an instance has, signed in or not. */
export interface InstanzDienste {
  profil: Profil;
  instanz: InstanzStore;
  /** The instance's own database. */
  pool: DbPool;
  ki: Ki;
  geheimnisse: Geheimnisse;
  umgebung: Umgebung;
  jetzt?: () => Date;
}

export interface InstanzKontext extends InstanzDienste {
  email: string;
  rolle: InstanzRolleMitSupport;
}

/** Data groups a partner may load: the core (settings, team list) always, the To-Dos only with the tool. */
const PARTNER_DATEN: Record<string, string> = { kern: 'home', todos: 'todo', erwaehnungen: 'home', whiteboards: 'whiteboard' };

/**
 * Who the address is in the instance: its login in instanz_zugaenge, else Velonify's support (crm-api's ADMINS) as long as
 * the instance's admins have not switched that off, else nobody.
 */
export async function instanzRolle(instanz: InstanzStore, email: string, support: readonly string[]): Promise<InstanzRolleMitSupport | null> {
  const zugang = await instanz.zugang(email);
  if (zugang) return zugang.rolle;
  if (support.includes(email.toLowerCase()) && (await instanz.velonifyZugangAn())) return 'velonify';
  return null;
}

/** The team of an instance is its logins (ergaenzeTeam), never Velonify's default team. */
const INSTANZ_LISTEN = { ...LISTEN_DEFAULTS, team: [] };

/**
 * Requests in an own instance: who am I, team and logins, the instance's settings, the creator modules below /c/ and the
 * hub's normal data routes on the instance's database. "schnitt" and partners without amounts work like Velonify's
 * employees; partners only reach their tools and boards; Velonify-only routes stay closed.
 */
export async function behandleInstanz(methode: string, pfad: string, body: unknown, ctx: InstanzKontext): Promise<Antwort> {
  const { instanz, email, rolle } = ctx;
  try {
    const zugang = rolle === 'velonify' ? null : await instanz.zugang(email);
    const s = await sicht(ctx, zugang);
    const store = s.betraege ? new PostgresStore(ctx.pool, () => email, INSTANZ_LISTEN) : new MitarbeiterStore(ctx.pool, () => email, INSTANZ_LISTEN);

    switch (pfad) {
      case '/instanz/ich': {
        if (methode !== 'GET') return fehler(405, 'Nur GET.');
        if (rolle !== 'velonify') await instanz.meldeAnmeldung(email);
        await ergaenzeTeam(ctx, store);
        return { status: 200, daten: s };
      }
      case '/instanz/zugaenge': {
        if (!darfEinrichten(rolle)) return fehler(403, 'Nur für Admins.');
        const einstellungen = await instanz.einstellungen();
        return {
          status: 200,
          daten: {
            zugaenge: await instanz.zugaenge(),
            name: einstellungen[INSTANZ_EINSTELLUNG.name] ?? '',
            velonify_zugang: einstellungen[INSTANZ_EINSTELLUNG.velonifyZugang] !== 'aus',
          },
        };
      }
      case '/instanz/zugang': {
        if (methode !== 'POST') return fehler(405, 'Nur POST.');
        if (!darfEinrichten(rolle)) return fehler(403, 'Nur für Admins.');
        if (!istObjekt(body) || typeof body.email !== 'string') return fehler(400, 'E-Mail-Adresse fehlt.');
        if (body.rolle !== undefined && !istInstanzRolle(body.rolle)) return fehler(400, 'Unbekannte Rolle.');
        if (body.rolle === 'partner' && !s.bausteine.includes('partner')) return fehler(403, 'Zugänge für Partner sind in eurem Hub nicht eingeschaltet.');
        if ((body.werkzeuge !== undefined && !istListe(body.werkzeuge)) || (body.boards !== undefined && !istListe(body.boards))) return fehler(400, 'Werkzeuge oder Boards ungültig.');
        const gespeichert = await instanz.speichereZugang(
          {
            email: body.email,
            name: typeof body.name === 'string' ? body.name : undefined,
            rolle: istInstanzRolle(body.rolle) ? body.rolle : undefined,
            aktiv: typeof body.aktiv === 'boolean' ? body.aktiv : undefined,
            werkzeuge: body.werkzeuge as string[] | undefined,
            boards: body.boards as string[] | undefined,
            ohne_betraege: typeof body.ohne_betraege === 'boolean' ? body.ohne_betraege : undefined,
          },
          email,
        );
        await ergaenzeTeam(ctx, store);
        return { status: 200, daten: { zugang: gespeichert } };
      }
      case '/instanz/einstellungen': {
        if (methode !== 'POST') return fehler(405, 'Nur POST.');
        if (!darfEinrichten(rolle)) return fehler(403, 'Nur für Admins.');
        if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
        const werte: Record<string, string> = {};
        if (body.name !== undefined) {
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name || name.length > 60) return fehler(400, 'Der Name braucht 1 bis 60 Zeichen.');
          werte[INSTANZ_EINSTELLUNG.name] = name;
        }
        if (body.velonify_zugang !== undefined) {
          if (typeof body.velonify_zugang !== 'boolean') return fehler(400, 'Velonify-Zugang ist an oder aus.');
          werte[INSTANZ_EINSTELLUNG.velonifyZugang] = body.velonify_zugang ? 'an' : 'aus';
        }
        if (body.bausteine !== undefined) {
          // Building blocks are switched by Velonify (also from the platform tool), not by the instance's own admins.
          if (rolle !== 'velonify') return fehler(403, 'Bausteine schaltet Velonify frei.');
          if (!istObjekt(body.bausteine) || !Object.entries(body.bausteine).every(([b, an]) => istBaustein(b) && typeof an === 'boolean')) return fehler(400, 'Unbekannter Baustein.');
          const bisher = Object.fromEntries(BAUSTEINE.map((b) => [b.id, s.bausteine.includes(b.id)]));
          werte[INSTANZ_EINSTELLUNG.funktionen] = JSON.stringify({ ...bisher, ...body.bausteine });
        }
        if (Object.keys(werte).length === 0) return fehler(400, 'Nichts zu speichern.');
        await store.saveEinstellungen(werte);
        return { status: 200, daten: await sicht(ctx, zugang) };
      }
    }

    // The creator modules: /c/<praefix>/…, closed when the module's tool is off for this person.
    const modulPfad = /^\/c\/([a-z]+)(\/|$)/.exec(pfad);
    if (modulPfad) {
      const modul = MODULE.find((m) => m.praefix === modulPfad[1]);
      if (!modul) return fehler(404, 'Unbekannte Route.');
      if (!s.werkzeuge.includes(MODUL_WERKZEUG[modul.praefix] ?? modul.praefix)) return fehler(403, 'Dieses Werkzeug ist für dich nicht freigeschaltet.');
      if (!modul.routen) return fehler(404, 'Unbekannte Route.');
      const antwort = await modul.routen(methode, pfad, body, {
        pool: ctx.pool,
        email,
        person: s.person,
        rolle,
        sicht: s,
        ki: ctx.ki,
        geheimnisse: ctx.geheimnisse,
        umgebung: ctx.umgebung,
        jetzt: ctx.jetzt ?? (() => new Date()),
      });
      return antwort ?? fehler(404, 'Unbekannte Route.');
    }

    // The data view hands out whole tables: only for whoever runs the Einrichtung.
    if (pfad.startsWith('/tabelle/') && !darfEinrichten(rolle)) return fehler(403, 'Die Datenansicht gibt es nur für Admins.');
    if (pfad.startsWith('/admin/') || pfad.startsWith('/plattform/') || pfad.startsWith('/ki/')) return fehler(403, 'Gibt es in dieser Instanz nicht.');

    if (rolle === 'partner' && zugang) return await partnerDaten(methode, pfad, body, store, s, zugang);
    return (await behandleDaten(methode, pfad, body, store)) ?? (await behandle(methode, pfad, body, store));
  } catch (err) {
    if (err instanceof InstanzFehler) return fehler(err.status, err.message);
    throw err;
  }
}

/** Partners: only their data groups, only their boards (and the cards and comments on them); no data view, no settings. */
async function partnerDaten(methode: string, pfad: string, body: unknown, store: PostgresStore, s: InstanzSicht, zugang: InstanzZugang): Promise<Antwort> {
  const gruppe = /^\/daten\/([a-z]+)$/.exec(pfad)?.[1];
  if (gruppe) {
    const werkzeug = PARTNER_DATEN[gruppe];
    if (!werkzeug || !s.werkzeuge.includes(werkzeug)) return fehler(403, 'Dieser Bereich ist für dich nicht freigeschaltet.');
    const antwort = await behandle(methode, pfad, body, store);
    if (gruppe === 'todos' && antwort.status === 200) {
      const daten = antwort.daten as TodoDaten;
      const boards = daten.boards.filter((b) => zugang.boards.includes(b.id));
      const karten = daten.aufgaben.filter((a) => zugang.boards.includes(a.board_id));
      const kartenIds = new Set(karten.map((k) => k.id));
      return { status: 200, daten: { ...daten, boards, aufgaben: karten, kommentare: daten.kommentare.filter((k) => kartenIds.has(k.aufgabe_id)) } };
    }
    return antwort;
  }
  if (pfad.startsWith('/tabelle/') || pfad.startsWith('/verlauf/') || pfad === '/einstellungen' || pfad === '/listen') return fehler(403, 'Für Partner nicht freigeschaltet.');
  if (pfad === '/einfuegen' || pfad === '/aendern') {
    if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
    const erlaubt = s.werkzeuge.includes('todo') ? ['aufgaben', 'aufgaben_kommentare', 'erwaehnungen'] : ['erwaehnungen'];
    if (typeof body.tab !== 'string' || !erlaubt.includes(body.tab)) return fehler(403, 'Für Partner nicht freigeschaltet.');
    // Cards only on their own boards.
    if (body.tab === 'aufgaben') {
      const zeilen = [...(Array.isArray(body.records) ? body.records : []), ...(Array.isArray(body.updates) ? body.updates.map((u) => (istObjekt(u) ? u.changes : null)) : [])];
      if (zeilen.some((z) => istObjekt(z) && 'board_id' in z && !zugang.boards.includes(String(z.board_id)))) return fehler(403, 'Dieses Board ist für dich nicht freigeschaltet.');
    }
  }
  return (await behandleDaten(methode, pfad, body, store)) ?? (await behandle(methode, pfad, body, store));
}

async function sicht(ctx: InstanzKontext, zugang: InstanzZugang | null): Promise<InstanzSicht> {
  const einstellungen = await ctx.instanz.einstellungen();
  const werkzeuge = instanzWerkzeuge(ctx.profil, einstellungen);
  const partner = ctx.rolle === 'partner' && zugang;
  return {
    profil: ctx.profil,
    name: einstellungen[INSTANZ_EINSTELLUNG.name] ?? '',
    email: ctx.email,
    person: teamName(zugang ?? { name: '', email: ctx.email }),
    rolle: ctx.rolle,
    werkzeuge: partner ? partnerWerkzeuge(werkzeuge, zugang) : werkzeuge,
    bausteine: instanzBausteine(einstellungen),
    betraege: ctx.rolle !== 'schnitt' && !(partner && zugang.ohne_betraege),
    velonify_zugang: einstellungen[INSTANZ_EINSTELLUNG.velonifyZugang] !== 'aus',
  };
}

/** Public paths of the modules (/oeffentlich/<praefix>/…): forms, media kit, ICS feed, OAuth callbacks. No login. */
export async function behandleOeffentlich(
  methode: string,
  pfad: string,
  body: unknown,
  query: Record<string, string>,
  dienste: InstanzDienste,
  herkunft: string,
): Promise<Antwort> {
  const treffer = /^\/oeffentlich\/([a-z]+)(\/|$)/.exec(pfad);
  const modul = treffer && MODULE.find((m) => m.praefix === treffer[1]);
  if (!modul?.oeffentlich) return fehler(404, 'Unbekannte Seite.');
  try {
    const bausteine = instanzBausteine(await dienste.instanz.einstellungen());
    const ctx = { pool: dienste.pool, ki: dienste.ki, geheimnisse: dienste.geheimnisse, umgebung: dienste.umgebung, bausteine, herkunft, jetzt: dienste.jetzt ?? (() => new Date()) };
    return (await modul.oeffentlich(methode, pfad, body, ctx, query)) ?? fehler(404, 'Unbekannte Seite.');
  } catch (err) {
    if (err instanceof InstanzFehler) return fehler(err.status, err.message);
    throw err;
  }
}

/** Timed jobs (POST /takt/<name>, Cloud Scheduler with TAKT_TOKEN): the module that knows the name runs it. */
export async function behandleTakt(name: string, dienste: InstanzDienste): Promise<Antwort> {
  const modul = MODULE.find((m) => m.takte?.[name]);
  if (!modul) return fehler(404, 'Unbekannter Takt.');
  const bausteine = instanzBausteine(await dienste.instanz.einstellungen());
  const ergebnis = await modul.takte![name]({ pool: dienste.pool, ki: dienste.ki, geheimnisse: dienste.geheimnisse, umgebung: dienste.umgebung, bausteine, jetzt: dienste.jetzt ?? (() => new Date()) });
  return { status: 200, daten: { ok: true, ergebnis } };
}

/** Every active login's first name is in the team list, so assignments and @-mentions work from day one. */
async function ergaenzeTeam(ctx: InstanzKontext, store: PostgresStore): Promise<void> {
  const namen = await ctx.instanz.teamNamen();
  const { rows } = await ctx.pool.query<{ wert: string }>(`SELECT wert FROM listen WHERE liste = 'team' ORDER BY nr`);
  const team = rows.map((r) => r.wert);
  const fehlt = namen.filter((n) => !team.includes(n));
  if (fehlt.length > 0) await store.setzeListe('team', [...team, ...fehlt]);
}
