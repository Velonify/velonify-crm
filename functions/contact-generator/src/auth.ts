import { createHash } from 'node:crypto';

export class ZugriffsFehler extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

interface TokenInfo {
  aud?: string;
  azp?: string;
  email?: string;
  email_verified?: string | boolean;
  expires_in?: string | number;
}

interface Optionen {
  clientId: string;
  domain: string;
  fetch?: typeof fetch;
  jetzt?: () => number;
}

const MAX_CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { email: string; bis: number }>();

/**
 * Checks the Google access token the app already holds for Sheets and Drive: it must belong to our OAuth client
 * and to a verified @velonify.de address. Results are cached briefly so a regenerate does not ask Google again.
 */
export async function pruefeGoogleToken(token: string, optionen: Optionen): Promise<string> {
  const jetzt = optionen.jetzt?.() ?? Date.now();
  const schluessel = createHash('sha256').update(token).digest('hex');
  const bekannt = cache.get(schluessel);
  if (bekannt && bekannt.bis > jetzt) return bekannt.email;

  const antwort = await (optionen.fetch ?? fetch)(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
  );
  if (!antwort.ok) throw new ZugriffsFehler(401, 'Die Anmeldung ist abgelaufen. Bitte neu anmelden.');
  const info = (await antwort.json()) as TokenInfo;

  if (info.aud !== optionen.clientId && info.azp !== optionen.clientId) {
    throw new ZugriffsFehler(401, 'Das Token gehört nicht zur Velonify-App.');
  }
  const email = (info.email ?? '').toLowerCase();
  const verifiziert = info.email_verified === true || info.email_verified === 'true';
  if (!verifiziert || !email.endsWith(`@${optionen.domain.toLowerCase()}`)) {
    throw new ZugriffsFehler(403, `Nur für Konten mit @${optionen.domain}.`);
  }

  const gueltigMs = Number(info.expires_in ?? 0) * 1000;
  cache.set(schluessel, { email, bis: jetzt + Math.min(gueltigMs, MAX_CACHE_MS) });
  return email;
}

/** Simple per-person limit against runaway loops. Counts per instance, which is enough with at most two instances. */
export class Limit {
  private readonly aufrufe = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly fensterMs: number,
  ) {}

  erlaubt(email: string, jetzt = Date.now()): boolean {
    const juengste = (this.aufrufe.get(email) ?? []).filter((t) => t > jetzt - this.fensterMs);
    if (juengste.length >= this.max) {
      this.aufrufe.set(email, juengste);
      return false;
    }
    juengste.push(jetzt);
    this.aufrufe.set(email, juengste);
    return true;
  }
}
