import { createHash, timingSafeEqual } from 'node:crypto';

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
  /** One or more OAuth client ids, comma-separated: the hub's and the CRM MCP server's. */
  clientId: string;
  domain: string;
  fetch?: typeof fetch;
  jetzt?: () => number;
}

const MAX_CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { email: string; client: string; bis: number }>();

/**
 * Checks a Google access token against Google's tokeninfo: it must belong to one of the given OAuth clients and to a
 * verified address. Returns the address and the client it was issued for, without looking at the domain – for crm-api,
 * which lets in Velonify (own domain) and the tenants of the hub (whitelisted addresses, their own client).
 * Results are cached briefly so a regenerate does not ask Google again.
 */
export async function pruefeGoogleKonto(token: string, optionen: Omit<Optionen, 'domain'>): Promise<{ email: string; client: string }> {
  const jetzt = optionen.jetzt?.() ?? Date.now();
  const schluessel = createHash('sha256').update(token).digest('hex');
  const bekannt = cache.get(schluessel);
  if (bekannt && bekannt.bis > jetzt) return { email: bekannt.email, client: bekannt.client };

  const antwort = await (optionen.fetch ?? fetch)(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
  );
  if (!antwort.ok) throw new ZugriffsFehler(401, 'Die Anmeldung ist abgelaufen. Bitte neu anmelden.');
  const info = (await antwort.json()) as TokenInfo;

  const clients = optionen.clientId.split(',').map((id) => id.trim()).filter(Boolean);
  const client = clients.find((id) => info.aud === id || info.azp === id);
  if (!client) throw new ZugriffsFehler(401, 'Das Token gehört nicht zur Velonify-App.');
  const email = (info.email ?? '').toLowerCase();
  const verifiziert = info.email_verified === true || info.email_verified === 'true';
  if (!verifiziert || !email) throw new ZugriffsFehler(403, 'Die E-Mail-Adresse des Google-Kontos ist nicht bestätigt.');

  const gueltigMs = Number(info.expires_in ?? 0) * 1000;
  cache.set(schluessel, { email, client, bis: jetzt + Math.min(gueltigMs, MAX_CACHE_MS) });
  return { email, client };
}

/**
 * Checks the Google access token the app already holds for Sheets and Drive: it must belong to one of our OAuth clients
 * and to a verified @velonify.de address.
 */
export async function pruefeGoogleToken(token: string, optionen: Optionen): Promise<string> {
  const { email } = await pruefeGoogleKonto(token, optionen);
  if (!email.endsWith(`@${optionen.domain.toLowerCase()}`)) {
    throw new ZugriffsFehler(403, `Nur für Konten mit @${optionen.domain}.`);
  }
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

/**
 * A request crm-api forwards for a tenant of the hub (Contact Generator, Shop-Audit): crm-api has checked the login and
 * counted the KI quota, and vouches with the shared secret PLATTFORM_TOKEN. Returns the tenant's address, or null when
 * the request did not come that way.
 */
export function plattformPerson(header: (name: string) => string | undefined, geheim = process.env.PLATTFORM_TOKEN): string | null {
  const gegeben = header('x-velonify-plattform');
  const person = (header('x-velonify-person') ?? '').trim().toLowerCase();
  if (!geheim?.trim() || !gegeben || !person.includes('@')) return null;
  const a = createHash('sha256').update(gegeben).digest();
  const b = createHash('sha256').update(geheim.trim()).digest();
  return timingSafeEqual(a, b) ? person : null;
}
