import * as functions from '@google-cloud/functions-framework';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AnfrageSchema, fehlerText } from './anfrage.js';
import { Limit, pruefeGoogleToken, ZugriffsFehler } from './auth.js';
import { AUSGABE_SCHEMA, nutzerNachricht, SYSTEM_PROMPT } from './prompt.js';

const MODELL = 'claude-opus-5';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const DOMAIN = process.env.ALLOWED_DOMAIN ?? 'velonify.de';
const ERLAUBTE_HERKUNFT = (process.env.ALLOWED_ORIGINS ?? 'https://crm.velonify.de,https://velonify.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Reads ANTHROPIC_API_KEY, which Cloud Functions injects from Secret Manager.
const client = new Anthropic();
const limit = new Limit(30, 10 * 60 * 1000);

const AusgabeSchema = z.object({
  varianten: z.array(z.object({ betreff: z.string(), text: z.string().min(1) })).min(1),
});

const erlaubteHerkunft = (origin: string) =>
  ERLAUBTE_HERKUNFT.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);

functions.http('contactGenerator', async (req, res) => {
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

  if (!limit.erlaubt(email)) return fehler(429, 'Zu viele Anfragen in kurzer Zeit. Bitte in ein paar Minuten erneut versuchen.');

  const anfrage = AnfrageSchema.safeParse(req.body);
  if (!anfrage.success) return fehler(400, fehlerText(anfrage.error));

  const heute = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'long', year: 'numeric' });

  try {
    const antwort = await client.beta.messages.create({
      model: MODELL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: AUSGABE_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: nutzerNachricht(anfrage.data, heute) }],
    });

    if (antwort.stop_reason === 'refusal') {
      return fehler(422, 'Claude hat diese Anfrage abgelehnt. Bitte Aufhänger oder Notiz anpassen.');
    }
    if (antwort.stop_reason === 'max_tokens') {
      return fehler(502, 'Die Antwort wurde abgeschnitten. Bitte erneut versuchen.');
    }

    const text = antwort.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const ausgabe = AusgabeSchema.safeParse(JSON.parse(text));
    if (!ausgabe.success) {
      console.error('Unerwartetes Ausgabeformat', fehlerText(ausgabe.error));
      return fehler(502, 'Claude hat kein gültiges Ergebnis geliefert. Bitte erneut versuchen.');
    }

    const varianten = ausgabe.data.varianten.slice(0, 3).map((v) => ({
      betreff: anfrage.data.kanal === 'email' ? v.betreff.trim() : '',
      text: v.text.trim(),
    }));
    // Log usage only, never the message content or company data.
    console.log(JSON.stringify({ email, kanal: anfrage.data.kanal, modell: antwort.model, usage: antwort.usage }));
    res.json({ varianten, modell: antwort.model });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fehler(429, 'Claude ist gerade ausgelastet. Bitte gleich noch einmal versuchen.');
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('Anthropic-Key ungültig');
      return fehler(500, 'Der Anthropic-Key ist ungültig. Bitte im Secret Manager prüfen.');
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic-Fehler ${error.status}`, error.message);
      return fehler(502, 'Claude ist gerade nicht erreichbar. Bitte erneut versuchen.');
    }
    if (error instanceof SyntaxError) {
      console.error('Antwort war kein JSON');
      return fehler(502, 'Claude hat kein gültiges Ergebnis geliefert. Bitte erneut versuchen.');
    }
    console.error('Unerwarteter Fehler', error);
    return fehler(500, 'Unerwarteter Fehler.');
  }
});
