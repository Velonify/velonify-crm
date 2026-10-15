// Holt einmalig einen Gmail-Refresh-Token (nur gmail.send) für die Mails der Lead-Magnete und legt ihn direkt im
// Secret Manager ab, ohne ihn anzuzeigen. Ersetzt den Versand per MailApp aus dem alten Apps Script.
//
//   GOOGLE_CLIENT_SECRET=$(gcloud secrets versions access latest --secret=crm-mcp-google-secret) \
//     node scripts/gmail-token.mjs <CLIENT-ID>
//
// Voraussetzung: Beim OAuth-Client (APIs & Dienste → Anmeldedaten, „CRM MCP“) ist die Weiterleitungs-URI
// http://localhost:8765/gmail-callback eingetragen, und die Gmail-API ist im Projekt aktiv.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const clientId = process.argv[2];
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const secret = process.env.SECRET_NAME || 'crm-api-gmail-token';
const konto = process.env.KONTO || 'lukas@velonify.de';
if (!clientId || !clientSecret) {
  console.error('Aufruf: GOOGLE_CLIENT_SECRET=… node scripts/gmail-token.mjs <CLIENT-ID>');
  process.exit(1);
}
const redirect = 'http://localhost:8765/gmail-callback';
const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirect,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/gmail.send',
  access_type: 'offline',
  prompt: 'consent',
  login_hint: konto,
})}`;

function speichere(token) {
  // Erst versuchen, ein neues Secret anzulegen; gibt es das schon, eine neue Version.
  const lauf = (args) =>
    new Promise((resolve) => {
      const p = spawn('gcloud', args, { stdio: ['pipe', 'ignore', 'inherit'] });
      p.stdin.end(token);
      p.on('close', resolve);
    });
  return lauf(['secrets', 'create', secret, '--data-file=-', '--project=velonify-crm']).then((code) =>
    code === 0 ? 0 : lauf(['secrets', 'versions', 'add', secret, '--data-file=-', '--project=velonify-crm']),
  );
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== '/gmail-callback') return void res.writeHead(404).end();
  const code = u.searchParams.get('code');
  const antwort = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: code ?? '', client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const daten = await antwort.json();
  if (!daten.refresh_token) {
    res.end('Kein Refresh-Token bekommen. Details im Terminal.');
    console.error('Fehler:', daten.error, daten.error_description);
    return void server.close();
  }
  const ergebnis = await speichere(daten.refresh_token);
  res.end(ergebnis === 0 ? 'Gespeichert. Das Fenster kann zu.' : 'Speichern im Secret Manager fehlgeschlagen, siehe Terminal.');
  console.log(ergebnis === 0 ? `Refresh-Token als Secret ${secret} gespeichert.` : 'Speichern fehlgeschlagen.');
  server.close();
});
server.listen(8765, () => {
  console.log(`Im Browser als ${konto} anmelden und „Senden“ erlauben:\n\n${url}\n`);
  spawn('open', [url]);
});
