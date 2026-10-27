import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { pruefeGoogleToken, ZugriffsFehler } from '../../gemeinsam/auth';
import { pruefeNachricht, Raeume, type Teilnehmer } from './raum';

/**
 * Live collaboration of the hub's whiteboards: a WebSocket relay on Cloud Run (max one instance, so everyone on a board
 * meets in the same room). It stores nothing; drawings are saved by the clients through crm-api.
 *
 * Protocol: the first message is {t:'hallo', token, board, name}. The token is checked like in crm-api (Google, only
 * @velonify.de) and is sent in the message, not in the URL, so it never shows up in request logs.
 */

const PORT = Number(process.env.PORT ?? 8080);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const DOMAIN = process.env.ALLOWED_DOMAIN ?? 'velonify.de';
const ERLAUBTE_HERKUNFT = (process.env.ALLOWED_ORIGINS ?? 'https://crm.velonify.de,https://velonify.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
/** Local runs only (never on Cloud Run, which sets K_SERVICE): log in with just an address, for two tabs in the dev server. */
const OHNE_ANMELDUNG = process.env.ANMELDUNG === 'aus' && !process.env.K_SERVICE;
/** Addresses whose team name is not the start of the address, e.g. lukas@velonify.de=Lugge (same as crm-api). */
const TEAM = new Map(
  (process.env.TEAM_ZUORDNUNG ?? '')
    .split(',')
    .map((paar) => paar.split('=').map((s) => s.trim()))
    .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1])
    .map(([email, name]) => [email.toLowerCase(), name]),
);

const HALLO_FRIST_MS = 10_000;
const PING_MS = 25_000;
const MAX_NACHRICHT_BYTES = 8 * 1024 * 1024;

const erlaubteHerkunft = (origin: string) => ERLAUBTE_HERKUNFT.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);
const teamName = (email: string) => TEAM.get(email) ?? email.split('@')[0].replace(/^./, (b) => b.toUpperCase());

const raeume = new Raeume();

const server = createServer((req, res) => {
  if (req.url === '/gesundheit') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, raeume: raeume.anzahl, personen: raeume.personen }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_NACHRICHT_BYTES });

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin ?? '';
  if (!req.url?.startsWith('/live') || !erlaubteHerkunft(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => verbinde(ws));
});

async function anmelden(hallo: Record<string, unknown>): Promise<string> {
  if (OHNE_ANMELDUNG) {
    const email = String(hallo.email ?? '').toLowerCase();
    if (!email.includes('@')) throw new ZugriffsFehler(401, 'Adresse fehlt.');
    return email;
  }
  if (typeof hallo.token !== 'string' || !hallo.token) throw new ZugriffsFehler(401, 'Nicht angemeldet.');
  return pruefeGoogleToken(hallo.token, { clientId: CLIENT_ID, domain: DOMAIN });
}

function verbinde(ws: WebSocket): void {
  const sende = (nachricht: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(nachricht));
  const schliesse = (code: number, grund: string) => {
    sende({ t: 'fehler', meldung: grund });
    ws.close(code, grund.slice(0, 120));
  };
  let drin: { board: string; id: string } | null = null;
  let lebt = true;
  const frist = setTimeout(() => !drin && schliesse(4001, 'Keine Anmeldung.'), HALLO_FRIST_MS);
  const ping = setInterval(() => {
    if (!lebt) return void ws.terminate();
    lebt = false;
    ws.ping();
  }, PING_MS);
  ws.on('pong', () => (lebt = true));

  ws.on('message', async (daten) => {
    let roh: unknown;
    try {
      roh = JSON.parse(daten.toString());
    } catch {
      return;
    }
    if (drin) {
      const nachricht = pruefeNachricht(roh);
      if (nachricht) raeume.raum(drin.board).leite(drin.id, nachricht);
      return;
    }
    const hallo = roh as Record<string, unknown>;
    if (hallo?.t !== 'hallo' || typeof hallo.board !== 'string' || !/^[A-Z0-9-]{1,40}$/.test(hallo.board)) return schliesse(4000, 'Erst anmelden.');
    let email: string;
    try {
      email = await anmelden(hallo);
    } catch (err) {
      if (!(err instanceof ZugriffsFehler)) console.error('Anmeldung fehlgeschlagen', err);
      return schliesse(err instanceof ZugriffsFehler && err.status === 403 ? 4003 : 4001, err instanceof ZugriffsFehler ? err.message : 'Die Anmeldung konnte gerade nicht geprüft werden.');
    }
    if (ws.readyState !== ws.OPEN) return;
    const raum = raeume.raum(hallo.board);
    const name = typeof hallo.name === 'string' && hallo.name.trim() ? hallo.name.trim().slice(0, 40) : teamName(email);
    const ich: Teilnehmer = { id: randomUUID(), email, name, farbe: raum.naechsteFarbe(), seit: Date.now(), sende };
    if (!raum.betrete(ich)) return schliesse(4029, 'Das Board ist voll.');
    drin = { board: hallo.board, id: ich.id };
    console.log(JSON.stringify({ board: drin.board, email, aktion: 'betreten', im_raum: raum.anzahl }));
  });

  ws.on('close', () => {
    clearTimeout(frist);
    clearInterval(ping);
    if (drin) raeume.verlasse(drin.board, drin.id);
  });
  ws.on('error', (err) => console.error('WebSocket-Fehler', err.message));
}

server.listen(PORT, () => console.log(`whiteboard-live hört auf ${PORT}${OHNE_ANMELDUNG ? ' (ohne Anmeldung, nur lokal)' : ''}`));

// Cloud Run sends SIGTERM before it stops the instance: tell the clients to reconnect instead of waiting for a timeout.
process.on('SIGTERM', () => {
  for (const ws of wss.clients) ws.close(1012, 'Neustart');
  server.close(() => process.exit(0));
});
