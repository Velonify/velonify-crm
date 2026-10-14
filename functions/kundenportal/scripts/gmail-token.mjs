// One-time: fetches a refresh token that lets the portal send mail as hallo@velonify.de (scope gmail.send only).
// Usage: GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… node scripts/gmail-token.mjs
// Open the printed link, sign in with the mailbox that sends as hallo@velonify.de, allow – the token is printed here.
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
    console.log('\nRefresh-Token (als Secret kundenportal-gmail-token speichern, nicht weitergeben):\n');
    console.log(daten.refresh_token);
  } else console.error(daten);
  server.close();
});

let redirectUri = '';
server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline',
    prompt: 'consent',
    login_hint: 'hallo@velonify.de',
    state,
  });
  console.log(`Im Browser öffnen und mit dem Postfach von hallo@velonify.de anmelden:\n\nhttps://accounts.google.com/o/oauth2/v2/auth?${params}\n`);
});
