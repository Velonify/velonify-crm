import * as functions from '@google-cloud/functions-framework';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { messeShop } from './audit.js';
import { AUSGABE_SCHEMA, AusgabeSchema, nutzerNachricht, pruefeAufhaenger, SYSTEM_PROMPT, type Aufhaenger } from './aufhaenger.js';
import { Limit, pruefeGoogleToken, ZugriffsFehler } from './auth.js';
import { DomainFehler, ladeSeite, normalisiereDomain } from './laden.js';
import { pagespeed } from './pagespeed.js';
import { katalog } from './technik.js';
import { kurzfassung } from './regeln.js';
import { AnfrageFehler, leadRoute, ROUTEN, type Route } from './leads/api.js';
import { echteBq } from './leads/bq.js';
import * as linkedin from './linkedin.js';

const MODELL = 'claude-opus-5';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const DOMAIN = process.env.ALLOWED_DOMAIN ?? 'velonify.de';
const PAGESPEED_KEY = process.env.PAGESPEED_API_KEY ?? '';
// Injected from the Secret Manager secret "apify-token"; only the LinkedIn route needs it.
const APIFY_TOKEN = process.env.APIFY_TOKEN ?? '';
const ERLAUBTE_HERKUNFT = (process.env.ALLOWED_ORIGINS ?? 'https://crm.velonify.de,https://velonify.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Reads ANTHROPIC_API_KEY, which Cloud Functions injects from Secret Manager.
const client = new Anthropic();
const limit = new Limit(60, 10 * 60 * 1000);
// The lead finder checks hundreds of shops in a row; each check is ~10 plain page loads, no PageSpeed, no Claude.
const leadLimit = new Limit(2000, 10 * 60 * 1000);
const LEADS_DATASET = process.env.LEADS_DATASET ?? 'velonify-crm.leads';
let bq: ReturnType<typeof echteBq> | null = null;

const feld = (max: number) => z.string().trim().max(max).default('');

/** What the app sends: the domain and the outreach services the hooks should be written for. */
const AnfrageSchema = z.object({
  domain: z.string().trim().min(3).max(300),
  leistungen: z
    .array(z.object({ id: z.string().trim().min(1).max(40), titel: z.string().trim().min(1).max(200), beschreibung: feld(1000), anlass: feld(1000) }))
    .max(20)
    .default([]),
});

/** A LinkedIn link and the deal titles the team uses, so Claude can pick one. */
const LinkedinAnfrageSchema = z.object({
  url: z.string().trim().min(10).max(2000),
  deal_titel: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
});

const erlaubteHerkunft = (origin: string) =>
  ERLAUBTE_HERKUNFT.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);

const fehlerText = (error: z.ZodError) => error.issues.map((i) => `${i.path.join('.') || 'Anfrage'}: ${i.message}`).join('; ');

functions.http('shopAudit', async (req, res) => {
  const origin = req.get('origin') ?? '';
  res.set('Vary', 'Origin');
  if (erlaubteHerkunft(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  const fehler = (status: number, meldung: string) => res.status(status).json({ fehler: meldung });

  if (req.method !== 'POST') return fehler(405, 'Nur POST.');
  if (!CLIENT_ID) return fehler(500, 'GOOGLE_CLIENT_ID ist nicht gesetzt.');

  let email: string;
  try {
    const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return fehler(401, 'Nicht angemeldet.');
    email = await pruefeGoogleToken(token, { clientId: CLIENT_ID, domain: DOMAIN });
  } catch (error) {
    if (error instanceof ZugriffsFehler) return fehler(error.status, error.message);
    console.error('Token-Prüfung fehlgeschlagen', error);
    return fehler(502, 'Die Anmeldung konnte nicht geprüft werden.');
  }

  const leadPfad = /^\/leads\/([a-z]+)\/?$/.exec(req.path);
  if (leadPfad) {
    const route = leadPfad[1] as Route;
    if (!(ROUTEN as readonly string[]).includes(route)) return fehler(404, 'Unbekannte Route.');
    if (!leadLimit.erlaubt(email)) return fehler(429, 'Zu viele Anfragen in kurzer Zeit. Bitte in ein paar Minuten erneut versuchen.');
    const start = Date.now();
    try {
      bq ??= echteBq(LEADS_DATASET);
      const antwort = await leadRoute(route, req.body, {
        bq,
        dataset: LEADS_DATASET,
        email,
        pruefDeps: {
          laden: ladeSeite,
          heute: new Date(),
          katalog: katalog(),
          pagespeed: PAGESPEED_KEY ? (url, strategie) => pagespeed(url, strategie, PAGESPEED_KEY) : undefined,
        },
      });
      console.log(JSON.stringify({ email, route, dauer_ms: Date.now() - start, domain: (req.body as { domain?: string })?.domain }));
      return res.json(antwort);
    } catch (error) {
      if (error instanceof AnfrageFehler) return fehler(error.status, error.message);
      console.error(`Lead-Route ${route} fehlgeschlagen`, error);
      return fehler(500, `Lead-Finder: ${route} ist fehlgeschlagen.`);
    }
  }

  if (/^\/linkedin\/?$/.test(req.path)) {
    if (!limit.erlaubt(email)) return fehler(429, 'Zu viele Abrufe in kurzer Zeit. Bitte in ein paar Minuten erneut versuchen.');
    if (!APIFY_TOKEN) return fehler(500, 'APIFY_TOKEN ist nicht gesetzt.');
    const anfrage = LinkedinAnfrageSchema.safeParse(req.body);
    if (!anfrage.success) return fehler(400, fehlerText(anfrage.error));
    const start = Date.now();
    let roh: linkedin.Rohdaten;
    try {
      roh = await linkedin.holeRohdaten(linkedin.erkenneLink(anfrage.data.url), linkedin.apifyLauf(APIFY_TOKEN));
    } catch (error) {
      if (error instanceof linkedin.LinkFehler) return fehler(400, error.message);
      if (error instanceof linkedin.AbrufFehler) return fehler(502, error.message);
      console.error('LinkedIn-Abruf fehlgeschlagen', error);
      return fehler(500, 'Der LinkedIn-Abruf ist unerwartet fehlgeschlagen.');
    }

    // Claude only reads and sorts. If it fails, the lead is still built from the LinkedIn data.
    const { deal_titel: dealTitel } = anfrage.data;
    let ausgabe: linkedin.Ausgabe | null = null;
    let hinweis = '';
    let modell = '';
    try {
      const antwort = await client.beta.messages.create({
        model: MODELL,
        max_tokens: 6000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: linkedin.AUSGABE_SCHEMA } },
        system: linkedin.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: linkedin.nutzerNachricht(roh, dealTitel) }],
      });
      modell = antwort.model;
      if (antwort.stop_reason === 'end_turn') {
        ausgabe = linkedin.AusgabeSchema.parse(JSON.parse(antwort.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')));
      } else {
        hinweis = 'Claude hat keine Einschätzung geliefert, die Felder stammen direkt aus LinkedIn.';
      }
      console.log(JSON.stringify({ email, route: 'linkedin', art: roh.art, dauer_ms: Date.now() - start, modell, usage: antwort.usage }));
    } catch (error) {
      hinweis = 'Claude war nicht erreichbar, die Felder stammen direkt aus LinkedIn.';
      console.error('LinkedIn-Einschätzung fehlgeschlagen', error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error instanceof Error ? error.message : error);
    }
    return res.json(linkedin.baueLead(roh, ausgabe, dealTitel, { hinweis, modell }));
  }

  if (!limit.erlaubt(email)) return fehler(429, 'Zu viele Prüfungen in kurzer Zeit. Bitte in ein paar Minuten erneut versuchen.');

  const anfrage = AnfrageSchema.safeParse(req.body);
  if (!anfrage.success) return fehler(400, fehlerText(anfrage.error));

  let domain: string;
  try {
    domain = normalisiereDomain(anfrage.data.domain);
  } catch (error) {
    if (error instanceof DomainFehler) return fehler(400, error.message);
    throw error;
  }

  const start = Date.now();
  let messung: Awaited<ReturnType<typeof messeShop>>;
  try {
    messung = await messeShop(domain, {
      laden: ladeSeite,
      pagespeed: (url, strategie) => pagespeed(url, strategie, PAGESPEED_KEY),
      heute: new Date(),
      katalog: katalog(),
    });
  } catch (error) {
    console.error('Audit fehlgeschlagen', error);
    return fehler(500, 'Die Prüfung ist unerwartet fehlgeschlagen.');
  }

  // Claude only adds wording. If it fails, the audit is still returned with the rule-based summary.
  let zusammenfassung = kurzfassung(messung.befunde);
  let aufhaenger: Aufhaenger[] = [];
  let hinweis = '';
  let modell = '';
  const { leistungen } = anfrage.data;
  if (messung.befunde.length > 0 && leistungen.length > 0) {
    try {
      const antwort = await client.beta.messages.create({
        model: MODELL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: AUSGABE_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: nutzerNachricht(domain, messung.befunde, leistungen) }],
      });
      modell = antwort.model;
      if (antwort.stop_reason === 'end_turn') {
        const text = antwort.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        const ausgabe = AusgabeSchema.parse(JSON.parse(text));
        aufhaenger = pruefeAufhaenger(ausgabe, messung.befunde, leistungen);
        if (ausgabe.zusammenfassung.trim()) zusammenfassung = ausgabe.zusammenfassung.trim().slice(0, 300);
      } else {
        hinweis = 'Claude hat keine Aufhänger geliefert.';
      }
      console.log(JSON.stringify({ email, domain, status: messung.status, dauer_ms: Date.now() - start, modell, usage: antwort.usage }));
    } catch (error) {
      hinweis = 'Die Aufhänger konnten nicht erstellt werden. Die Befunde sind trotzdem vollständig.';
      console.error('Aufhänger fehlgeschlagen', error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error instanceof Error ? error.message : error);
    }
  } else {
    console.log(JSON.stringify({ email, domain, status: messung.status, dauer_ms: Date.now() - start }));
  }

  res.json({ ...messung, geprueft_am: new Date().toISOString(), zusammenfassung, aufhaenger, hinweis, modell });
});
