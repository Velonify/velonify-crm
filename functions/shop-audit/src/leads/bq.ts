import { BigQuery } from '@google-cloud/bigquery';
import type { Bq } from './api.js';

/** Typed parameter for values the client would otherwise send as STRING, e.g. { typ: 'DATE', wert: '2026-09-01' }. */
interface Typisiert {
  typ: 'DATE';
  wert: string;
}
const istTypisiert = (w: unknown): w is Typisiert => typeof w === 'object' && w !== null && 'typ' in w && 'wert' in w;

/** BigQuery returns DATE, TIMESTAMP and friends as wrapper objects with a `value`; the app wants plain strings. */
function flach(wert: unknown): unknown {
  if (Array.isArray(wert)) return wert.map(flach);
  if (wert && typeof wert === 'object') {
    const name = wert.constructor?.name ?? '';
    if (name.startsWith('BigQuery') && 'value' in wert) return (wert as { value: unknown }).value;
    return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, flach(v)]));
  }
  return wert;
}

/**
 * BigQuery in the project of the leads dataset. The public HTTP Archive and CrUX tables live in the US multi-region,
 * so every job runs there. Authenticates as the function's service account (locally: gcloud application default).
 */
export function echteBq(dataset: string): Bq {
  const [projectId, datasetId] = dataset.split('.');
  const client = new BigQuery({ projectId });
  return {
    async query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
      const werte: Record<string, unknown> = {};
      const typen: Record<string, string> = {};
      for (const [name, wert] of Object.entries(params ?? {})) {
        if (istTypisiert(wert)) {
          werte[name] = BigQuery.date(wert.wert);
          typen[name] = wert.typ;
        } else {
          werte[name] = wert;
        }
      }
      const [zeilen] = await client.query({ query: sql, params: werte, types: Object.keys(typen).length ? typen : undefined, location: 'US' });
      return flach(zeilen) as T[];
    },
    async insert(tabelle: string, zeilen: Record<string, unknown>[]): Promise<void> {
      if (zeilen.length === 0) return;
      await client.dataset(datasetId).table(tabelle).insert(zeilen);
    },
  };
}
