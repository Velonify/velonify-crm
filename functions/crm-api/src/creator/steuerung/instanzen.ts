import { istBaustein } from '../../../../../src/data/instanz';
import { heuteBerlin, type InstanzCommit, type InstanzLauf, type InstanzNeuigkeit, type InstanzStatus, type PlattformInstanz } from '../../../../../src/data/plattform';
import type { PlattformStore } from '../../../../../src/data/postgres/plattformStore';
import type { Antwort } from '../../routen';

/**
 * Velonify's side of the steering (Plattform → Instanzen, admins only): calls each instance's /steuerung/* with its own
 * token and GitHub for "Update ausrollen" (compare, tag, workflow_dispatch of instanz.yml). All HTTP goes through
 * `holen`, so tests run with a fake.
 */
export interface SteuerDienste {
  holen: typeof fetch;
  /** Steering token per instance id (secret INSTANZ_STEUER_TOKENS, JSON {kennung: token}). */
  tokens: Record<string, string>;
  /** Set when INSTANZ_STEUER_TOKENS is not valid JSON. */
  tokensFehler?: string;
  /**
   * Fine-grained GitHub token (secret GITHUB_TOKEN_INSTANZEN): Actions read/write on the instance repos, Contents
   * read/write on the hub repo for the tags. Empty: status works, updates do not.
   */
  github: string;
  /** Where the hub code lives (HUB_REPO, default Velonify/velonify-crm) and the branch updates come from. */
  hubRepo: string;
  hubBranch: string;
  jetzt(): Date;
}

/** Workflow file in every instance repo and the branch it runs on (workflow_dispatch always runs on the default branch). */
export const INSTANZ_WORKFLOW = 'instanz.yml';
const INSTANZ_BRANCH = 'main';
const GITHUB = 'https://api.github.com';
/** An instance that does not answer within this time shows as unreachable instead of holding up the list. */
const WARTEZEIT_MS = 10_000;

export function steuerDiensteAusUmgebung(umgebung: Record<string, string | undefined> = process.env, holen: typeof fetch = fetch): SteuerDienste {
  let tokens: Record<string, string> = {};
  let tokensFehler: string | undefined;
  try {
    const roh: unknown = JSON.parse(umgebung.INSTANZ_STEUER_TOKENS?.trim() || '{}');
    if (typeof roh !== 'object' || roh === null || Array.isArray(roh)) throw new Error('kein Objekt');
    tokens = Object.fromEntries(Object.entries(roh).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '').map(([k, v]) => [k, v.trim()]));
  } catch {
    tokensFehler = 'INSTANZ_STEUER_TOKENS ist kein gültiges JSON der Form {"kennung": "token"}.';
  }
  return {
    holen,
    tokens,
    tokensFehler,
    github: umgebung.GITHUB_TOKEN_INSTANZEN?.trim() ?? '',
    hubRepo: umgebung.HUB_REPO?.trim() || 'Velonify/velonify-crm',
    hubBranch: umgebung.HUB_BRANCH?.trim() || 'main',
    jetzt: () => new Date(),
  };
}

/** A failed call to an instance or to GitHub, with the status crm-api answers. */
export class SteuerFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const istObjekt = (wert: unknown): wert is Record<string, unknown> => typeof wert === 'object' && wert !== null && !Array.isArray(wert);
const fehler = (status: number, meldung: string): Antwort => ({ status, daten: { fehler: meldung } });

async function rufeInstanz<T>(d: SteuerDienste, instanz: PlattformInstanz, methode: 'GET' | 'POST', pfad: string, body?: unknown): Promise<T> {
  if (d.tokensFehler) throw new SteuerFehler(d.tokensFehler, 503);
  const token = d.tokens[instanz.kennung];
  if (!token) throw new SteuerFehler(`Für ${instanz.kennung} fehlt das Steuer-Token in INSTANZ_STEUER_TOKENS.`, 503);
  let antwort: Response;
  try {
    antwort = await d.holen(`${instanz.api_url}${pfad}`, {
      method: methode,
      headers: { 'x-velonify-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(WARTEZEIT_MS),
    });
  } catch (err) {
    throw new SteuerFehler(`${instanz.name} ist nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  const daten = (await antwort.json().catch(() => null)) as (T & { fehler?: string }) | null;
  if (!antwort.ok || !daten) {
    const grund = antwort.status === 403 ? 'Steuer-Token passt nicht' : (daten?.fehler ?? 'ohne Inhalt');
    throw new SteuerFehler(`${instanz.name} antwortet mit ${antwort.status}: ${grund}`, antwort.status === 400 ? 400 : 502);
  }
  return daten;
}

async function rufeGithub<T>(d: SteuerDienste, methode: 'GET' | 'POST', pfad: string, body?: unknown): Promise<{ status: number; daten: T | null }> {
  if (!d.github) throw new SteuerFehler('GITHUB_TOKEN_INSTANZEN ist nicht gesetzt: Updates lassen sich nur mit dem GitHub-Token ausrollen.', 503);
  let antwort: Response;
  try {
    antwort = await d.holen(`${GITHUB}${pfad}`, {
      method: methode,
      headers: {
        authorization: `Bearer ${d.github}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'velonify-hub',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(WARTEZEIT_MS),
    });
  } catch (err) {
    throw new SteuerFehler(`GitHub ist nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  return { status: antwort.status, daten: antwort.status === 204 ? null : ((await antwort.json().catch(() => null)) as T | null) };
}

function githubFehler(was: string, status: number, daten: unknown): SteuerFehler {
  const meldung = istObjekt(daten) && typeof daten.message === 'string' ? daten.message : 'ohne Meldung';
  const hinweis = status === 401 || status === 403 || status === 404 ? ' (Rechte des Tokens GITHUB_TOKEN_INSTANZEN prüfen)' : '';
  return new SteuerFehler(`GitHub: ${was} ging nicht (${status}: ${meldung})${hinweis}.`, 502);
}

const repoPfad = (repo: string) => repo.split('/').map(encodeURIComponent).join('/');

interface GithubVergleich {
  status: string;
  ahead_by: number;
  behind_by: number;
  html_url: string;
  commits: { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } | null } }[];
}

/** The commits on the hub branch since the instance's version (oldest first), and the newest commit as the target. */
export async function vergleiche(d: SteuerDienste, version: string): Promise<{ commits: InstanzCommit[]; ziel: string | null; vor: number; zurueck: number; url: string }> {
  if (!/^[0-9a-f]{7,40}$/.test(version)) throw new SteuerFehler('Die Instanz meldet keine Version (HUB_VERSION fehlt). Einmal mit dem Workflow ausrollen, dann steht sie da.', 409);
  const { status, daten } = await rufeGithub<GithubVergleich>(d, 'GET', `/repos/${repoPfad(d.hubRepo)}/compare/${version}...${encodeURIComponent(d.hubBranch)}`);
  if (status !== 200 || !daten) throw githubFehler('Vergleich der Stände', status, daten);
  const commits = daten.commits.map((c) => ({
    sha: c.sha,
    titel: c.commit.message.split('\n')[0],
    autor: c.commit.author?.name ?? '',
    am: c.commit.author?.date ?? '',
    url: c.html_url,
  }));
  return { commits, ziel: commits.at(-1)?.sha ?? null, vor: daten.ahead_by, zurueck: daten.behind_by, url: daten.html_url };
}

/** Sets the tag instanz-JJJJ-MM-TT on the commit; a tag of the same day on another commit gets -2, -3 … */
async function setzeTag(d: SteuerDienste, sha: string): Promise<string> {
  const basis = `instanz-${heuteBerlin(d.jetzt())}`;
  for (let i = 1; i <= 9; i++) {
    const tag = i === 1 ? basis : `${basis}-${i}`;
    const neu = await rufeGithub(d, 'POST', `/repos/${repoPfad(d.hubRepo)}/git/refs`, { ref: `refs/tags/${tag}`, sha });
    if (neu.status === 201) return tag;
    if (neu.status !== 422) throw githubFehler(`Tag ${tag} setzen`, neu.status, neu.daten);
    // Exists already: fine when it points at the same commit.
    const da = await rufeGithub<{ object?: { sha?: string } }>(d, 'GET', `/repos/${repoPfad(d.hubRepo)}/git/ref/tags/${encodeURIComponent(tag)}`);
    if (da.status === 200 && da.daten?.object?.sha === sha) return tag;
  }
  throw new SteuerFehler(`Heute gibt es schon neun Tags ${basis}…; bitte morgen ausrollen oder Tags aufräumen.`, 409);
}

async function laeufe(d: SteuerDienste, instanz: PlattformInstanz): Promise<InstanzLauf[]> {
  const { status, daten } = await rufeGithub<{ workflow_runs: { id: number; status: string; conclusion: string | null; created_at: string; html_url: string }[] }>(
    d,
    'GET',
    `/repos/${repoPfad(instanz.repo)}/actions/workflows/${INSTANZ_WORKFLOW}/runs?per_page=8`,
  );
  if (status !== 200 || !daten) throw githubFehler('Läufe des Workflows lesen', status, daten);
  return daten.workflow_runs.map((l) => ({ id: l.id, status: l.status, ergebnis: l.conclusion ?? '', am: l.created_at, url: l.html_url }));
}

/** Status of one instance, or why there is none; never throws, so one broken instance does not break the list. */
async function statusVon(d: SteuerDienste, plattform: PlattformStore, instanz: PlattformInstanz): Promise<{ status: InstanzStatus | null; fehler: string; tag: string }> {
  if (!instanz.aktiv) return { status: null, fehler: '', tag: '' };
  try {
    const status = await rufeInstanz<InstanzStatus>(d, instanz, 'GET', '/steuerung/status');
    return { status, fehler: '', tag: await plattform.tagFuer(instanz.kennung, status.version) };
  } catch (err) {
    return { status: null, fehler: err instanceof Error ? err.message : String(err), tag: '' };
  }
}

/**
 * Routes below /plattform/instanz… (admins only, checked by index.ts). Returns null for any other path so
 * behandlePlattformAdmin can go on.
 */
export async function behandleInstanzen(
  methode: string,
  pfad: string,
  query: Record<string, unknown>,
  body: unknown,
  plattform: PlattformStore,
  email: string,
  d: SteuerDienste,
): Promise<Antwort | null> {
  if (!/^\/plattform\/instanz(en|\/|$)/.test(pfad)) return null;
  try {
    if (methode === 'GET') {
      if (pfad === '/plattform/instanzen') {
        const instanzen = await plattform.instanzen();
        const stati = await Promise.all(instanzen.map((i) => statusVon(d, plattform, i)));
        return { status: 200, daten: { instanzen: instanzen.map((instanz, n) => ({ instanz, ...stati[n] })), github: Boolean(d.github), tokens_fehler: d.tokensFehler ?? '' } };
      }
      const instanz = await plattform.instanz(String(query.kennung ?? ''));
      if (!instanz) return fehler(404, 'Unbekannte Instanz.');
      switch (pfad) {
        case '/plattform/instanz': {
          const stand = await statusVon(d, plattform, instanz);
          let neuigkeiten: InstanzNeuigkeit[] = [];
          if (stand.status) neuigkeiten = (await rufeInstanz<{ neuigkeiten: InstanzNeuigkeit[] }>(d, instanz, 'GET', '/steuerung/neuigkeiten')).neuigkeiten;
          return {
            status: 200,
            daten: { instanz, ...stand, neuigkeiten, protokoll: await plattform.instanzProtokoll(instanz.kennung), github: Boolean(d.github), token: Boolean(d.tokens[instanz.kennung]) },
          };
        }
        case '/plattform/instanz/commits': {
          const { status } = await statusVon(d, plattform, instanz);
          if (!status) return fehler(502, `${instanz.name} antwortet gerade nicht, deshalb ist ihr Stand unbekannt.`);
          const vergleich = await vergleiche(d, status.version);
          return { status: 200, daten: { version: status.version, tag: await plattform.tagFuer(instanz.kennung, status.version), branch: d.hubBranch, ...vergleich } };
        }
        case '/plattform/instanz/laeufe':
          return { status: 200, daten: { laeufe: await laeufe(d, instanz) } };
      }
      return fehler(404, 'Unbekannte Route.');
    }

    if (methode !== 'POST') return fehler(405, 'Nur GET und POST.');
    if (!istObjekt(body) || typeof body.kennung !== 'string') return fehler(400, 'Kennung der Instanz fehlt.');
    if (pfad === '/plattform/instanz') {
      const eingabe = body as Record<string, unknown>;
      const textFeld = (f: string) => (typeof eingabe[f] === 'string' ? (eingabe[f] as string) : undefined);
      const instanz = await plattform.speichereInstanz(
        {
          kennung: body.kennung,
          name: textFeld('name'),
          domain: textFeld('domain'),
          api_url: textFeld('api_url'),
          repo: textFeld('repo'),
          notiz: textFeld('notiz'),
          aktiv: typeof eingabe.aktiv === 'boolean' ? eingabe.aktiv : undefined,
        },
        email,
      );
      return { status: 200, daten: { instanz } };
    }
    const instanz = await plattform.instanz(body.kennung);
    if (!instanz) return fehler(404, 'Unbekannte Instanz.');
    if (!instanz.aktiv) return fehler(409, 'Diese Instanz ist hier abgeschaltet. Erst wieder aktiv setzen.');

    switch (pfad) {
      case '/plattform/instanz/bausteine': {
        if (!istObjekt(body.bausteine) || !Object.entries(body.bausteine).every(([b, an]) => istBaustein(b) && typeof an === 'boolean')) return fehler(400, 'Unbekannter Baustein.');
        const ergebnis = await rufeInstanz<{ bausteine: string[]; werkzeuge: string[] }>(d, instanz, 'POST', '/steuerung/bausteine', { bausteine: body.bausteine });
        await plattform.protokolliereInstanz(instanz.kennung, 'bausteine', body.bausteine, email);
        return { status: 200, daten: ergebnis };
      }
      case '/plattform/instanz/neuigkeit': {
        const ergebnis = await rufeInstanz<{ neuigkeit: InstanzNeuigkeit }>(d, instanz, 'POST', '/steuerung/neuigkeit', {
          titel: body.titel,
          text: body.text,
          link: body.link,
          werkzeug: body.werkzeug,
          von: 'Velonify',
        });
        await plattform.protokolliereInstanz(instanz.kennung, 'neuigkeit', { id: ergebnis.neuigkeit.id, titel: ergebnis.neuigkeit.titel }, email);
        return { status: 200, daten: ergebnis };
      }
      case '/plattform/instanz/neuigkeit/archivieren': {
        if (typeof body.id !== 'string') return fehler(400, 'Neuigkeit fehlt.');
        const ergebnis = await rufeInstanz<{ neuigkeit: InstanzNeuigkeit }>(d, instanz, 'POST', '/steuerung/neuigkeit/archivieren', { id: body.id });
        await plattform.protokolliereInstanz(instanz.kennung, 'neuigkeit', { id: body.id, titel: ergebnis.neuigkeit.titel, zurueckgezogen: true }, email);
        return { status: 200, daten: ergebnis };
      }
      case '/plattform/instanz/ausrollen': {
        if (typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/.test(body.sha)) return fehler(400, 'Commit fehlt.');
        const status = await rufeInstanz<InstanzStatus>(d, instanz, 'GET', '/steuerung/status');
        // Only what was shown: the newest commit of the branch since the running version.
        const vergleich = await vergleiche(d, status.version);
        if (!vergleich.ziel) return fehler(409, `${instanz.name} ist schon auf dem neuesten Stand.`);
        if (vergleich.ziel !== body.sha) return fehler(409, `Auf ${d.hubBranch} sind inzwischen neue Commits dazugekommen. Bitte die Liste neu laden und prüfen.`);
        const tag = await setzeTag(d, body.sha);
        const start = await rufeGithub(d, 'POST', `/repos/${repoPfad(instanz.repo)}/actions/workflows/${INSTANZ_WORKFLOW}/dispatches`, { ref: INSTANZ_BRANCH, inputs: { ref: tag } });
        if (start.status !== 204) throw githubFehler(`Workflow ${INSTANZ_WORKFLOW} starten`, start.status, start.daten);
        const detail = { tag, sha: body.sha, vorher: status.version, commits: vergleich.commits.length };
        await plattform.protokolliereInstanz(instanz.kennung, 'update', detail, email);
        return { status: 200, daten: detail };
      }
    }
    return fehler(404, 'Unbekannte Route.');
  } catch (err) {
    if (err instanceof SteuerFehler) return fehler(err.status, err.message);
    throw err;
  }
}
