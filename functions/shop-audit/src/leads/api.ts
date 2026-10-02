import { z } from 'zod';
import { normalisiereDomain } from '../laden.js';
import { backlogSql, brancheTabelleSql, branchenVonSql, detailSql, detailsSql, ENTSCHEIDUNGEN, manuellSql, naechsteSql, ohneBrancheSql, statistikSql, tabellenSql, zaehlerSql } from './backlog-sql.js';
import { mergeSql, neuesteQuellenSql, poolTabelleSql, prioViewSql } from './pool-sql.js';
import { nutzerNachrichtBranche, startseitenAuszug, type BrancheId } from './branche.js';
import { ladeStartseite, pruefeKandidat, type Abhaengigkeiten, type Kandidat, type PoolDaten } from './pruefen.js';

/** The little of BigQuery the lead routes need; faked in tests. */
export interface Bq {
  query<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>): Promise<T[]>;
  insert(tabelle: string, zeilen: Record<string, unknown>[]): Promise<void>;
}

export class AnfrageFehler extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const PoolSchema = z.object({
  rang_de: z.number().int().nullable(),
  lcp_ms: z.number().int().nullable(),
  system: z.string().max(40).nullable(),
  version: z.string().max(40).nullable(),
  system_seit: z.string().max(10).nullable(),
  system_vorher: z.string().max(40).nullable(),
  technik: z.array(z.string().max(120)).max(400).nullable().optional(),
});

const Schemas = {
  branchen: z.object({
    n: z.number().int().min(1).max(30).default(12),
    /** Firms already in the CRM: their industries, classified where the lead finder does not know them yet. */
    domains: z.array(z.string().trim().min(3).max(300)).min(1).max(12).optional(),
  }),
  naechste: z.object({ n: z.number().int().min(1).max(500).default(200), bereich: z.enum(['migration', 'ads', 'klaviyo']).default('migration') }),
  pruefen: z.object({ domain: z.string().trim().min(3).max(300), pool: PoolSchema.nullable().default(null) }),
  detail: z.object({ domain: z.string().trim().min(3).max(300) }),
  details: z.object({ domains: z.array(z.string().trim().min(3).max(300)).min(1).max(500) }),
  entscheiden: z.object({
    eintraege: z
      .array(
        z.object({
          domain: z.string().trim().min(3).max(300),
          entscheidung: z.enum(ENTSCHEIDUNGEN as [string, ...string[]]),
          grund: z.string().trim().max(500).default(''),
          firma_id: z.string().trim().max(60).default(''),
          /** Contact e-mail a person found on the shop; required when releasing a shop by hand. */
          email: z.union([z.string().trim().toLowerCase().email().max(200), z.literal('')]).default(''),
        })
        .refine((e) => e.entscheidung !== 'freigegeben' || e.email !== '', { message: 'Zum Freigeben wird eine Kontakt-E-Mail gebraucht.', path: ['email'] }),
      )
      .min(1)
      .max(500),
  }),
} as const;

export const ROUTEN = ['naechste', 'pruefen', 'backlog', 'manuell', 'detail', 'details', 'entscheiden', 'statistik', 'zaehler', 'branchen', 'import', 'einrichten'] as const;
export type Route = (typeof ROUTEN)[number];

export interface Kontext {
  bq: Bq;
  dataset: string;
  email: string;
  pruefDeps: Abhaengigkeiten;
  /** Claude picks the industry from what the homepage says; unset when no API key is configured. */
  einordnen?: (nachricht: string) => Promise<{ branche: BrancheId; modell: string }>;
}

/** Homepages loaded and classified at the same time by one /leads/branchen call. */
const BRANCHEN_GLEICHZEITIG = 6;

// The backlog joins the industry table, so it has to exist before the first list is read. Once per instance.
const brancheTabelleDa = new Set<string>();
async function brancheTabelle(bq: Bq, dataset: string) {
  if (brancheTabelleDa.has(dataset)) return;
  await bq.query(brancheTabelleSql(dataset));
  brancheTabelleDa.add(dataset);
}

const parse = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new AnfrageFehler(r.error.issues.map((i) => `${i.path.join('.') || 'Anfrage'}: ${i.message}`).join('; '));
  return r.data;
};

const domainOder400 = (roh: string) => {
  try {
    return normalisiereDomain(roh).replace(/^www\./, '');
  } catch (error) {
    throw new AnfrageFehler(error instanceof Error ? error.message : 'Ungültige Domain.');
  }
};

/** One row of `pruefungen`: the columns the lists need, plus the whole result as JSON for the detail page. */
export function pruefZeile(k: Kandidat, von: string): Record<string, unknown> {
  return {
    domain: k.domain,
    geprueft_am: k.geprueft_am,
    von,
    qualifiziert: k.qualifiziert,
    score: k.score,
    bereiche: k.bereiche,
    score_migration: k.scores.migration,
    score_ads: k.scores.ads,
    score_klaviyo: k.scores.klaviyo,
    werbung: k.werbung,
    gtm: k.gtm,
    email_tools: k.email_tools,
    ausschluss: k.ausschluss.map((a) => a.id),
    anlaesse: k.anlaesse.map((a) => a.id),
    anlass_texte: k.anlaesse.map((a) => a.text),
    system: k.system,
    version: k.version,
    rang_de: k.rang_de,
    firma: k.firma.name,
    plz: k.firma.plz,
    ort: k.firma.ort,
    daten: JSON.stringify(k),
  };
}

/** Fills the contact e-mail a person entered on release into a check whose Impressum had none. */
function mitEmail(k: Kandidat, email: unknown): Kandidat {
  if (!k.firma || k.firma.email || typeof email !== 'string' || !email) return k;
  return { ...k, firma: { ...k.firma, email } };
}

/** Handles POST /leads/<route>. Returns the JSON body. */
export async function leadRoute(route: Route, body: unknown, ctx: Kontext): Promise<unknown> {
  const { bq, dataset } = ctx;
  switch (route) {
    case 'naechste': {
      const { n, bereich } = parse(Schemas.naechste, body);
      return { kandidaten: await bq.query(naechsteSql(dataset, bereich), { n }) };
    }
    case 'pruefen': {
      const anfrage = parse(Schemas.pruefen, body);
      const domain = domainOder400(anfrage.domain);
      const pool: PoolDaten | null = anfrage.pool;
      const kandidat = await pruefeKandidat(domain, pool, { ...ctx.pruefDeps, heute: new Date() });
      await bq.insert('pruefungen', [pruefZeile(kandidat, ctx.email)]);
      return kandidat;
    }
    case 'backlog':
      await brancheTabelle(bq, dataset);
      return { zeilen: await bq.query(backlogSql(dataset)) };
    case 'manuell':
      await brancheTabelle(bq, dataset);
      return { zeilen: await bq.query(manuellSql(dataset)) };
    case 'branchen': {
      // Shops without an industry: load the homepage, let Claude pick one, append it. Either the next n of the
      // backlog, or given domains of CRM firms, where industries the lead finder already knows are just returned.
      const { n, domains } = parse(Schemas.branchen, body);
      const einordnen = ctx.einordnen;
      if (!einordnen) throw new AnfrageFehler('Die Branchen-Einordnung ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt).', 500);
      await brancheTabelle(bq, dataset);
      let bekannt: { domain: string; branche: string }[] = [];
      let offen: { domain: string; firma: string | null; offen?: number }[];
      if (domains) {
        const gefragt = [...new Set(domains.map(domainOder400))];
        bekannt = await bq.query<{ domain: string; branche: string }>(branchenVonSql(dataset), { domains: gefragt });
        offen = gefragt.filter((d) => !bekannt.some((b) => b.domain === d)).map((domain) => ({ domain, firma: null }));
      } else {
        offen = await bq.query<{ domain: string; firma: string | null; offen: number }>(ohneBrancheSql(dataset), { n });
      }
      const zeilen: Record<string, unknown>[] = [];
      let fehler = 0;
      const warteschlange = [...offen];
      const arbeiter = async () => {
        for (let shop = warteschlange.shift(); shop; shop = warteschlange.shift()) {
          try {
            const home = await ladeStartseite(shop.domain, ctx.pruefDeps.laden);
            const auszug = startseitenAuszug(home);
            const { branche, modell } = await einordnen(nutzerNachrichtBranche(shop.domain, shop.firma ?? '', auszug));
            zeilen.push({ domain: shop.domain, branche, modell, am: new Date().toISOString() });
          } catch (error) {
            fehler += 1;
            console.error(`Branche für ${shop.domain} fehlgeschlagen`, error instanceof Error ? error.message : error);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(BRANCHEN_GLEICHZEITIG, offen.length) }, arbeiter));
      await bq.insert('branchen', zeilen);
      const neu = zeilen.map((z) => ({ domain: z.domain as string, branche: z.branche as string }));
      if (domains) return { eingeordnet: [...bekannt, ...neu], fehler, offen: 0 };
      const gesamt = Number(offen[0]?.offen ?? 0);
      return { eingeordnet: neu, fehler, offen: Math.max(0, gesamt - zeilen.length) };
    }
    case 'detail': {
      const domain = domainOder400(parse(Schemas.detail, body).domain);
      const [zeile] = await bq.query<{ daten: string; branche?: string | null } & Record<string, unknown>>(detailSql(dataset), { domain });
      if (!zeile) throw new AnfrageFehler('Diese Domain wurde noch nicht geprüft.', 404);
      const { daten, email, branche, ...rest } = zeile;
      return { ...rest, kandidat: { ...mitEmail(JSON.parse(daten) as Kandidat, email), branche: branche ?? null } };
    }
    case 'details': {
      const domains = parse(Schemas.details, body).domains.map(domainOder400);
      const zeilen = await bq.query<{ domain: string; daten: string; email: string | null; branche?: string | null }>(detailsSql(dataset), { domains });
      return { kandidaten: zeilen.map((z) => ({ ...mitEmail(JSON.parse(z.daten) as Kandidat, z.email), branche: z.branche ?? null })) };
    }
    case 'entscheiden': {
      const { eintraege } = parse(Schemas.entscheiden, body);
      const am = new Date().toISOString();
      await bq.insert('entscheidungen', eintraege.map((e) => ({ ...e, domain: domainOder400(e.domain), von: ctx.email, am })));
      return { gespeichert: eintraege.length };
    }
    case 'zaehler':
      // Only the signed-in user's own decisions; nobody can ask for someone else's count.
      return { tage: await bq.query(zaehlerSql(dataset), { von: ctx.email }) };
    case 'statistik': {
      const [zeile] = await bq.query(statistikSql(dataset));
      return zeile ?? {};
    }
    case 'einrichten':
      for (const sql of [poolTabelleSql(dataset), ...tabellenSql(dataset)]) await bq.query(sql);
      return { ok: true };
    case 'import': {
      // Latest complete crawl and CrUX month, then upsert the pool (~9 GB scan, 1–2 minutes).
      const [quellen] = await bq.query<{ crawl_datum: string; crux_monat: number }>(neuesteQuellenSql());
      if (!quellen?.crawl_datum) throw new AnfrageFehler('Kein vollständiger HTTP-Archive-Crawl gefunden.', 502);
      await bq.query(poolTabelleSql(dataset));
      await bq.query(mergeSql(dataset, { nurDe: true }), { crawl: { typ: 'DATE', wert: quellen.crawl_datum }, crux: quellen.crux_monat });
      await bq.query(prioViewSql(dataset));
      for (const sql of tabellenSql(dataset)) await bq.query(sql);
      return { crawl_datum: quellen.crawl_datum, crux_monat: quellen.crux_monat };
    }
  }
}
