import { AuthExpiredError } from '../errors';
import type { TabName } from '../schema';
import { inPaketen, type Zeile } from '../uebernahme';

export type Ziel = 'crm' | 'crm_test';

async function anfrage<T>(url: string, getToken: () => Promise<string>, pfad: string, body?: unknown): Promise<T> {
  const antwort = await fetch(`${url.replace(/\/$/, '')}${pfad}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${await getToken()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const daten = (await antwort.json().catch(() => null)) as (T & { fehler?: string }) | null;
  if (antwort.status === 401) throw new AuthExpiredError();
  if (!antwort.ok || !daten) throw new Error(daten?.fehler ?? `crm-api hat mit Fehler ${antwort.status} geantwortet.`);
  return daten;
}

/** Sends one tab in packages; returns how many rows were written. */
export async function sendeTab(url: string, getToken: () => Promise<string>, ziel: Ziel, tab: TabName, zeilen: Zeile[]): Promise<number> {
  let geschrieben = 0;
  for (const paket of inPaketen(zeilen)) {
    geschrieben += (await anfrage<{ geschrieben: number }>(url, getToken, '/admin/uebernahme', { ziel, tab, zeilen: paket })).geschrieben;
  }
  return geschrieben;
}

export function zaehle(url: string, getToken: () => Promise<string>, ziel: Ziel): Promise<Record<string, number>> {
  return anfrage(url, getToken, `/admin/zaehlen?ziel=${ziel}`);
}
