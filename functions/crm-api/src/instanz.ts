import {
  darfEinrichten,
  INSTANZ_EINSTELLUNG,
  instanzWerkzeuge,
  istInstanzRolle,
  PROFIL_WERKZEUGE,
  type InstanzRolleMitSupport,
  type InstanzSicht,
  type Profil,
} from '../../../src/data/instanz';
import { InstanzFehler, type InstanzStore } from '../../../src/data/postgres/instanzStore';
import { MitarbeiterStore } from '../../../src/data/postgres/mitarbeiterStore';
import { PostgresStore, type DbPool } from '../../../src/data/postgres/postgresStore';
import { behandle, behandleDaten, type Antwort } from './routen';

const istObjekt = (wert: unknown): wert is Record<string, unknown> => typeof wert === 'object' && wert !== null && !Array.isArray(wert);
const fehler = (status: number, meldung: string): Antwort => ({ status, daten: { fehler: meldung } });

export interface InstanzKontext {
  profil: Profil;
  instanz: InstanzStore;
  /** The instance's own database. */
  pool: DbPool;
  email: string;
  rolle: InstanzRolleMitSupport;
}

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

/**
 * Requests in an own instance: who am I, team and logins, the instance's settings, and the hub's normal data routes on the
 * instance's database. "schnitt" works without amounts like Velonify's employees; Velonify-only routes stay closed.
 */
export async function behandleInstanz(methode: string, pfad: string, body: unknown, ctx: InstanzKontext): Promise<Antwort> {
  const { instanz, email, rolle } = ctx;
  const store = rolle === 'schnitt' ? new MitarbeiterStore(ctx.pool, () => email) : new PostgresStore(ctx.pool, () => email);
  try {
    switch (pfad) {
      case '/instanz/ich': {
        if (methode !== 'GET') return fehler(405, 'Nur GET.');
        if (rolle !== 'velonify') await instanz.meldeAnmeldung(email);
        await ergaenzeTeam(ctx, store);
        return { status: 200, daten: await sicht(ctx) };
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
        const zugang = await instanz.speichereZugang(
          {
            email: body.email,
            name: typeof body.name === 'string' ? body.name : undefined,
            rolle: istInstanzRolle(body.rolle) ? body.rolle : undefined,
            aktiv: typeof body.aktiv === 'boolean' ? body.aktiv : undefined,
          },
          email,
        );
        await ergaenzeTeam(ctx, store);
        return { status: 200, daten: { zugang } };
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
        if (body.funktionen !== undefined) {
          // Tools are switched by Velonify (later from the platform tool), not by the instance's own admins.
          if (rolle !== 'velonify') return fehler(403, 'Werkzeuge schaltet Velonify frei.');
          const erlaubt = PROFIL_WERKZEUGE[ctx.profil];
          if (!istObjekt(body.funktionen) || !Object.entries(body.funktionen).every(([w, an]) => erlaubt.includes(w) && typeof an === 'boolean')) {
            return fehler(400, 'Unbekanntes Werkzeug.');
          }
          werte[INSTANZ_EINSTELLUNG.funktionen] = JSON.stringify(body.funktionen);
        }
        if (Object.keys(werte).length === 0) return fehler(400, 'Nichts zu speichern.');
        await store.saveEinstellungen(werte);
        return { status: 200, daten: await sicht(ctx) };
      }
    }

    // The data view hands out whole tables: only for whoever runs the Einrichtung.
    if (pfad.startsWith('/tabelle/') && !darfEinrichten(rolle)) return fehler(403, 'Die Datenansicht gibt es nur für Admins.');
    if (pfad.startsWith('/admin/') || pfad.startsWith('/plattform/') || pfad.startsWith('/ki/')) return fehler(403, 'Gibt es in dieser Instanz nicht.');

    return (await behandleDaten(methode, pfad, body, store)) ?? (await behandle(methode, pfad, body, store));
  } catch (err) {
    if (err instanceof InstanzFehler) return fehler(err.status, err.message);
    throw err;
  }
}

async function sicht(ctx: InstanzKontext): Promise<InstanzSicht> {
  const einstellungen = await ctx.instanz.einstellungen();
  return {
    profil: ctx.profil,
    name: einstellungen[INSTANZ_EINSTELLUNG.name] ?? '',
    email: ctx.email,
    rolle: ctx.rolle,
    werkzeuge: instanzWerkzeuge(ctx.profil, einstellungen),
    velonify_zugang: einstellungen[INSTANZ_EINSTELLUNG.velonifyZugang] !== 'aus',
  };
}

/** Every active login's first name is in the team list, so assignments and @-mentions work from day one. */
async function ergaenzeTeam(ctx: InstanzKontext, store: PostgresStore): Promise<void> {
  const namen = await ctx.instanz.teamNamen();
  const { rows } = await ctx.pool.query<{ wert: string }>(`SELECT wert FROM listen WHERE liste = 'team' ORDER BY nr`);
  const team = rows.map((r) => r.wert);
  const fehlt = namen.filter((n) => !team.includes(n));
  if (fehlt.length > 0) await store.setzeListe('team', [...team, ...fehlt]);
}
