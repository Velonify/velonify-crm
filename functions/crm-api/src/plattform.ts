import { PlattformFehler, type PlattformStore } from '../../../src/data/postgres/plattformStore';
import type { DbPool, PostgresStore } from '../../../src/data/postgres/postgresStore';
import { FEEDBACK_FRAGEN, PAKETE, zugriff, type FeedbackAnlass, type Mandant, type Paket, type Zugang } from '../../../src/data/plattform';
import { behandle, behandleDaten, type Antwort } from './routen';

const istObjekt = (wert: unknown): wert is Record<string, unknown> => typeof wert === 'object' && wert !== null && !Array.isArray(wert);
const fehler = (status: number, meldung: string): Antwort => ({ status, daten: { fehler: meldung } });

/** Routes that write a tenant's data; closed while the hub is read-only. */
const SCHREIBEND = new Set(['/einfuegen', '/aendern', '/einstellungen', '/listen']);
/** What still works when a tenant is locked: who am I, feedback, booking. */
const IMMER_ERLAUBT = new Set(['/ich', '/feedback', '/buchen']);

export interface MandantKontext {
  plattform: PlattformStore;
  zugang: Zugang;
  mandant: Mandant;
  /** The tenant's own database hub_<id>. */
  pool: DbPool;
  store: PostgresStore;
  /** Message to the Velonify team (Slack), e.g. on feedback or a booking. Errors are only logged by the caller. */
  melde?: (text: string) => Promise<void>;
}

/**
 * Requests of a tenant (tester or customer): the hub's normal data routes on the tenant's own database, plus who am I,
 * the Lead-Markt, feedback and booking. The data view (whole tables as CSV) and everything Velonify-only stay closed.
 */
export async function behandleMandant(methode: string, pfad: string, body: unknown, ctx: MandantKontext): Promise<Antwort> {
  const { plattform, zugang, mandant } = ctx;
  const stand = zugriff(mandant, plattform.heute());
  if (stand === 'gesperrt' && !IMMER_ERLAUBT.has(pfad)) return fehler(403, 'Euer Zugang ist gesperrt. Meldet euch bei Velonify, um ihn wieder freizuschalten.');
  if (stand === 'nur_lesen' && SCHREIBEND.has(pfad)) return fehler(403, 'Der Testzeitraum ist abgelaufen: Ihr könnt alles ansehen, aber nichts mehr ändern, bis ihr ein Paket bucht.');

  try {
    switch (pfad) {
      case '/ich': {
        if (methode !== 'GET') return fehler(405, 'Nur GET.');
        await plattform.meldeAnmeldung(zugang);
        await ergaenzeTeam(ctx);
        return { status: 200, daten: await plattform.sicht(zugang, mandant, ctx.pool) };
      }
      case '/bedingungen':
        await plattform.bedingungen(mandant, zugang.email);
        await ctx.melde?.(`${mandant.name}: ${zugang.email} hat die Testbedingungen bestätigt.`);
        return { status: 200, daten: { ok: true } };
      case '/nutzung': {
        // Which tool a person opened; the hub sends it once per tool and session.
        if (!istObjekt(body) || typeof body.werkzeug !== 'string' || !/^[a-z]{2,20}$/.test(body.werkzeug)) return fehler(400, 'Werkzeug fehlt.');
        await plattform.protokolliere(mandant.id, zugang.email, 'seite', body.werkzeug);
        return { status: 200, daten: { ok: true } };
      }
      case '/feedback': {
        if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
        const anlass = String(body.anlass ?? 'frei') as FeedbackAnlass;
        if (anlass !== 'frei' && !(anlass in FEEDBACK_FRAGEN)) return fehler(400, 'Unbekannte Frage.');
        const wert = body.wert === null || body.wert === undefined || body.wert === '' ? null : Number(body.wert);
        if (wert !== null && (!Number.isInteger(wert) || wert < 0 || wert > 10)) return fehler(400, 'Bewertung von 0 bis 10.');
        const text = String(body.text ?? '').trim();
        if (!text && wert === null) return fehler(400, 'Bitte etwas eintragen.');
        await plattform.feedback(mandant, zugang.email, anlass, wert, text);
        await ctx.melde?.(`Feedback von ${zugang.name || zugang.email} (${mandant.name}, ${anlass}${wert !== null ? `, ${wert}` : ''}): ${text || '–'}`);
        return { status: 200, daten: { ok: true } };
      }
      case '/buchen': {
        if (!istObjekt(body) || typeof body.paket !== 'string' || !(body.paket in PAKETE) || body.paket === 'test') return fehler(400, 'Unbekanntes Paket.');
        const paket = body.paket as Paket;
        await plattform.buchen(mandant, zugang.email, paket);
        await ctx.melde?.(`${mandant.name} will ${PAKETE[paket].name} (${PAKETE[paket].preis}) buchen – angefragt von ${zugang.name || zugang.email}. Rechnung schreiben und im Hub unter Plattform auf „aktiv“ stellen.`);
        return { status: 200, daten: { ok: true } };
      }
      case '/leadmarkt': {
        if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
        return {
          status: 200,
          daten: await plattform.markt(mandant.id, {
            branche: typeof body.branche === 'string' ? body.branche : undefined,
            plz_bereich: typeof body.plz_bereich === 'string' ? body.plz_bereich : undefined,
            nur_helpdesk: body.nur_helpdesk === true,
            helpdesk: typeof body.helpdesk === 'string' ? body.helpdesk : undefined,
            seite: Number(body.seite) || 1,
          }),
        };
      }
      case '/leadmarkt/freischalten': {
        if (!istObjekt(body) || typeof body.id !== 'string') return fehler(400, 'Lead fehlt.');
        if (!mandant.bedingungen_am) return fehler(409, 'Bitte bestätigt erst die Testbedingungen.');
        const { firma_id, neu, koeder } = await plattform.freischalten(zugang, mandant, body.id, ctx.pool);
        if (koeder) await ctx.melde?.(`Achtung: ${mandant.name} (${zugang.email}) hat den Köder-Lead ${koeder} freigeschaltet. Mails an diese Adresse kommen von dort.`);
        return { status: 200, daten: { firma_id, neu } };
      }
    }

    // The data view would hand out whole tables as CSV: not for tenants.
    if (pfad.startsWith('/tabelle/')) return fehler(403, 'Die Datenansicht gibt es im Velonify-Hub nur intern.');
    if (pfad.startsWith('/admin/') || pfad.startsWith('/plattform/')) return fehler(403, 'Nur für Velonify.');

    const daten = await behandleDaten(methode, pfad, body, ctx.store);
    if (daten) return daten;
    const antwort = await behandle(methode, pfad, body, ctx.store);
    if (antwort.status === 200 && pfad === '/aendern' && istObjekt(body) && body.tab === 'deals' && Array.isArray(body.updates)) {
      // Pipeline movement feeds the health score in the admin tool.
      const bewegungen = body.updates.filter((u) => istObjekt(u) && istObjekt(u.changes) && 'phase' in u.changes);
      for (const u of bewegungen) await plattform.protokolliere(mandant.id, zugang.email, 'bewegung', String((u as { changes: { phase: unknown } }).changes.phase));
    }
    return antwort;
  } catch (err) {
    if (err instanceof PlattformFehler) return fehler(err.status, err.message);
    throw err;
  }
}

/** Every active login's first name is in the tenant's team list, so assignments and @-mentions work from day one. */
async function ergaenzeTeam(ctx: MandantKontext): Promise<void> {
  const namen = await ctx.plattform.teamNamen(ctx.mandant.id);
  const { rows } = await ctx.pool.query<{ wert: string }>(`SELECT wert FROM listen WHERE liste = 'team' ORDER BY nr`);
  const team = rows.map((r) => r.wert);
  const fehlt = namen.filter((n) => !team.includes(n));
  if (fehlt.length > 0) await ctx.store.setzeListe('team', [...team, ...fehlt]);
}

/** Admin tool "Plattform" in Velonify's hub (admins only, checked by the caller): GET and POST /plattform/<route>. */
export async function behandlePlattformAdmin(methode: string, pfad: string, query: Record<string, unknown>, body: unknown, plattform: PlattformStore, email: string): Promise<Antwort> {
  try {
    if (methode === 'GET') {
      switch (pfad) {
        case '/plattform/mandanten':
          return { status: 200, daten: { mandanten: await plattform.mandanten(), markt: await plattform.marktStatistik() } };
        case '/plattform/mandant':
          return { status: 200, daten: await plattform.mandantDetail(String(query.id ?? '')) };
        case '/plattform/ausschluss':
          return { status: 200, daten: { domains: await plattform.ausschluss() } };
      }
      return fehler(404, 'Unbekannte Route.');
    }
    if (methode !== 'POST') return fehler(405, 'Nur GET und POST.');
    if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
    switch (pfad) {
      case '/plattform/mandant':
        if (typeof body.id !== 'string') return fehler(400, 'Kennung fehlt.');
        return { status: 200, daten: { mandant: await plattform.speichereMandant(body as Partial<Mandant> & { id: string }, email) } };
      case '/plattform/zugang':
        if (typeof body.email !== 'string' || typeof body.mandant_id !== 'string') return fehler(400, 'E-Mail und Mandant angeben.');
        return {
          status: 200,
          daten: {
            zugang: await plattform.speichereZugang({
              email: body.email,
              mandant_id: body.mandant_id,
              name: typeof body.name === 'string' ? body.name : undefined,
              rolle: body.rolle === 'inhaber' ? 'inhaber' : 'mitarbeiter',
              aktiv: body.aktiv !== false,
            }),
          },
        };
      case '/plattform/markt': {
        if (!Array.isArray(body.eintraege) || body.eintraege.length > 200 || !body.eintraege.every(istObjekt)) return fehler(400, 'Einträge fehlen.');
        return { status: 200, daten: { neu: await plattform.marktAufnehmen(body.eintraege as never[]) } };
      }
      case '/plattform/koeder': {
        if (typeof body.mandant_id !== 'string' || typeof body.domain !== 'string' || typeof body.firma !== 'string' || typeof body.email !== 'string') {
          return fehler(400, 'Mandant, Domain, Firma und E-Mail angeben.');
        }
        // A decoy looks like a real shop of the market: it takes over the preview of a random entry.
        const { eintraege } = await plattform.markt(body.mandant_id, { seite: 1 + Math.floor(Math.random() * 3) });
        const vorlage = eintraege[Math.floor(Math.random() * eintraege.length)]?.vorschau;
        if (!vorlage) return fehler(409, 'Erst den Lead-Markt füllen, dann Köder anlegen.');
        await plattform.koederAnlegen(
          body.mandant_id,
          {
            domain: body.domain,
            firma: body.firma,
            email: body.email,
            plz: typeof body.plz === 'string' ? body.plz : undefined,
            ort: typeof body.ort === 'string' ? body.ort : undefined,
            ansprechpartner: typeof body.ansprechpartner === 'string' ? body.ansprechpartner : undefined,
          },
          vorlage,
        );
        return { status: 200, daten: { ok: true } };
      }
    }
    return fehler(404, 'Unbekannte Route.');
  } catch (err) {
    if (err instanceof PlattformFehler) return fehler(err.status, err.message);
    throw err;
  }
}

/** Where a tenant's KI request goes: Contact Generator or Shop-Audit, and which of their paths a tenant may use. */
export const KI_ZIELE = {
  contact: { werkzeug: 'contact', pfade: [/^\/?$/, /^\/frage\/?$/] },
  audit: { werkzeug: 'audit', pfade: [/^\/?$/, /^\/ergebnis\/?$/] },
} as const;

/**
 * Checks a KI request of a tenant: tool on, path allowed, quota left (counts it). Returns the path to forward to, or an
 * answer that ends the request.
 */
export async function pruefeKi(ziel: string, rest: string, ctx: Pick<MandantKontext, 'plattform' | 'mandant' | 'zugang'>, werkzeuge: string[]): Promise<{ pfad: string } | Antwort> {
  const eintrag = KI_ZIELE[ziel as keyof typeof KI_ZIELE];
  if (!eintrag) return fehler(404, 'Unbekanntes Ziel.');
  if (!werkzeuge.includes(eintrag.werkzeug)) return fehler(403, 'Dieses Werkzeug ist für euch nicht freigeschaltet.');
  if (!eintrag.pfade.some((p) => p.test(rest))) return fehler(403, 'Nur für Velonify.');
  if (zugriff(ctx.mandant, ctx.plattform.heute()) !== 'voll') return fehler(403, 'Der Testzeitraum ist abgelaufen.');
  // Fetching the result of an audit that already ran costs nothing.
  if (/^\/ergebnis\/?$/.test(rest)) return { pfad: rest };
  try {
    await ctx.plattform.verbraucheKi(ctx.mandant, ctx.zugang.email, `${ziel}${rest === '/' ? '' : rest}`);
  } catch (err) {
    if (err instanceof PlattformFehler) return fehler(err.status, err.message);
    throw err;
  }
  return { pfad: rest || '/' };
}
