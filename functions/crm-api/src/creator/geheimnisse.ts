import { dienstkontoToken } from '../../../gemeinsam/google';

/**
 * Secrets of the instance that change at runtime, above all the OAuth tokens of the connected channels. They never go into
 * the database: kanal_konten only keeps the secret's name. In production Secret Manager of the instance's own project.
 */
export interface Geheimnisse {
  lesen(name: string): Promise<string | null>;
  /** Creates the secret if needed and adds a new version. */
  schreiben(name: string, wert: string): Promise<void>;
  /** Deletes the secret with all versions (disconnecting a channel). Missing secrets are fine. */
  loeschen?(name: string): Promise<void>;
}

/** In memory: tests and the local preview. */
export function speicherGeheimnisse(start: Record<string, string> = {}): Geheimnisse & { werte: Map<string, string> } {
  const werte = new Map(Object.entries(start));
  return {
    werte,
    lesen: async (name) => werte.get(name) ?? null,
    schreiben: async (name, wert) => void werte.set(name, wert),
    loeschen: async (name) => void werte.delete(name),
  };
}

/** Only these secrets are managed at runtime; the service account's IAM condition allows exactly this prefix. */
export const GEHEIMNIS_PRAEFIX = 'kanal-';
const BASIS = 'https://secretmanager.googleapis.com/v1';
const SCOPE = ['https://www.googleapis.com/auth/cloud-platform'];

function pruefeName(name: string): void {
  if (!name.startsWith(GEHEIMNIS_PRAEFIX) || !/^[A-Za-z0-9_-]{1,255}$/.test(name)) {
    throw new Error(`Secret „${name}“ ist nicht erlaubt: nur Namen mit dem Präfix ${GEHEIMNIS_PRAEFIX}.`);
  }
}

/**
 * Secret Manager of the given project over REST, signed in as the function's service account (metadata server).
 * The service account needs roles/secretmanager.admin limited by an IAM condition to secrets named "kanal-*" (INSTANZ.md).
 * Version retention is configured separately; writes never destroy a concurrently refreshed credential.
 */
export function secretManagerGeheimnisse(projekt: string, holen: typeof fetch = fetch, token: () => Promise<string> = dienstkontoToken(holen, SCOPE)): Geheimnisse {
  const projektPfad = `${BASIS}/projects/${encodeURIComponent(projekt)}`;
  const secretPfad = (name: string) => `${projektPfad}/secrets/${encodeURIComponent(name)}`;
  const aufruf = async (url: string, init: RequestInit = {}) =>
    holen(url, { ...init, headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' } });
  const fehlerText = async (antwort: Response, was: string) => {
    const daten = (await antwort.json().catch(() => null)) as { error?: { message?: string } } | null;
    return new Error(`Secret Manager (${was}) antwortet mit ${antwort.status}: ${daten?.error?.message ?? 'ohne Meldung'}`);
  };

  return {
    async lesen(name) {
      pruefeName(name);
      const antwort = await aufruf(`${secretPfad(name)}/versions/latest:access`);
      if (antwort.status === 404) return null;
      if (!antwort.ok) throw await fehlerText(antwort, 'lesen');
      const daten = (await antwort.json()) as { payload?: { data?: string } };
      return daten.payload?.data ? Buffer.from(daten.payload.data, 'base64').toString('utf8') : null;
    },

    async schreiben(name, wert) {
      pruefeName(name);
      const angelegt = await aufruf(`${projektPfad}/secrets?secretId=${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify({ replication: { automatic: {} }, labels: { zweck: 'kanal' } }),
      });
      if (!angelegt.ok && angelegt.status !== 409) throw await fehlerText(angelegt, 'anlegen');
      const version = await aufruf(`${secretPfad(name)}:addVersion`, {
        method: 'POST',
        body: JSON.stringify({ payload: { data: Buffer.from(wert, 'utf8').toString('base64') } }),
      });
      if (!version.ok) throw await fehlerText(version, 'speichern');
      // Keep existing versions; a deployment's retention policy owns cleanup. A concurrent refresh
      // must never have its newly written version destroyed by another request.

    },

    async loeschen(name) {
      pruefeName(name);
      const antwort = await aufruf(secretPfad(name), { method: 'DELETE' });
      if (!antwort.ok && antwort.status !== 404) throw await fehlerText(antwort, 'löschen');
    },
  };
}
