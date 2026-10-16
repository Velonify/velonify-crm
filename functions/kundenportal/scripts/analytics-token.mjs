// One-time: fetches a refresh token that lets the portal read GA4 and Search Console as hallo@velonify.de (read only).
// Usage: GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… node scripts/analytics-token.mjs
// The CRM's OAuth client is a web client: add http://127.0.0.1:53682 once under „Autorisierte Weiterleitungs-URIs“.
// Open the printed link, sign in as hallo@velonify.de, allow – the token is printed here.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('GMAIL_CLIENT_ID und GMAIL_CLIENT_SECRET setzen (OAuth-Client vom Typ „Desktop-App“).');
  process.exit(1);
}
const state = randomBytes(16).toString('hex');

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/') return res.writeHead(404).end();
  if (url.searchParams.get('state') !== state) return res.writeHead(400).end('Falscher state.');
  const code = url.searchParams.get('code');
  if (!code) return res.writeHead(400).end(`Abgebrochen: ${url.searchParams.get('error') ?? 'kein Code'}`);
  const antwort = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  const daten = await antwort.json();
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(daten.refresh_token ? 'Fertig, das Fenster kann zu.' : 'Kein Refresh-Token bekommen, siehe Terminal.');
  if (daten.refresh_token) {
    console.log('\nRefresh-Token (als Secret kundenportal-analytics-token speichern, nicht weitergeben):\n');
    console.log(daten.refresh_token);
  } else console.error(daten);
  server.close();
});

let redirectUri = '';
// Fixed port, because a web client only accepts redirect addresses registered in advance.
const PORT = Number(process.env.PORT || 53682);
server.listen(PORT, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${PORT}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
    access_type: 'offline',
    prompt: 'consent',
    login_hint: 'hallo@velonify.de',
    state,
  });
  console.log(`Im Browser öffnen und als hallo@velonify.de anmelden:\n\nhttps://accounts.google.com/o/oauth2/v2/auth?${params}\n`);
});
