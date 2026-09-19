import { z } from 'zod';
import { normalisiereDomain } from '../laden.js';
import { backlogSql, detailSql, detailsSql, ENTSCHEIDUNGEN, manuellSql, naechsteSql, statistikSql, tabellenSql } from './backlog-sql.js';
import { mergeSql, neuesteQuellenSql, poolTabelleSql, prioViewSql } from './pool-sql.js';
import { pruefeKandidat, type Abhaengigkeiten, type Kandidat, type PoolDaten } from './pruefen.js';

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
});

const Schemas = {
  naechste: z.object({ n: z.number().int().min(1).max(500).default(200) }),
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
        }),
      )
      .min(1)
      .max(500),
  }),
} as const;

export const ROUTEN = ['naechste', 'pruefen', 'backlog', 'manuell', 'detail', 'details', 'entscheiden', 'statistik', 'import', 'einrichten'] as const;
export type Route = (typeof ROUTEN)[number];

export interface Kontext {
  bq: Bq;
  dataset: string;
  email: string;
  pruefDeps: Abhaengigkeiten;
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

/** Handles POST /leads/<route>. Returns the JSON body. */
export async function leadRoute(route: Route, body: unknown, ctx: Kontext): Promise<unknown> {
  const { bq, dataset } = ctx;
  switch (route) {
    case 'naechste': {
      const { n } = parse(Schemas.naechste, body);
      return { kandidaten: await bq.query(naechsteSql(dataset), { n }) };
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
      return { zeilen: await bq.query(backlogSql(dataset)) };
    case 'manuell':
      return { zeilen: await bq.query(manuellSql(dataset)) };
    case 'detail': {
      const domain = domainOder400(parse(Schemas.detail, body).domain);
      const [zeile] = await bq.query<{ daten: string } & Record<string, unknown>>(detailSql(dataset), { domain });
      if (!zeile) throw new AnfrageFehler('Diese Domain wurde noch nicht geprüft.', 404);
      const { daten, ...rest } = zeile;
      return { ...rest, kandidat: JSON.parse(daten) as Kandidat };
    }
    case 'details': {
      const domains = parse(Schemas.details, body).domains.map(domainOder400);
      const zeilen = await bq.query<{ domain: string; daten: string }>(detailsSql(dataset), { domains });
      return { kandidaten: zeilen.map((z) => JSON.parse(z.daten) as Kandidat) };
    }
    case 'entscheiden': {
      const { eintraege } = parse(Schemas.entscheiden, body);
      const am = new Date().toISOString();
      await bq.insert('entscheidungen', eintraege.map((e) => ({ ...e, domain: domainOder400(e.domain), von: ctx.email, am })));
      return { gespeichert: eintraege.length };
    }
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
