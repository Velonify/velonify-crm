// Local preview of an own instance without Google and Cloud SQL: crm-api's instance routes on PGlite.
//   npx tsx scripts/instanz-vorschau.ts            (port 8092)
// Hub: VITE_PROFIL=creator VITE_CRM_API_URL=http://localhost:8092 VITE_GOOGLE_CLIENT_ID=vorschau npm run dev -- --port 5213
// The bearer token is the address: "admin@beispiel.example" (admin), "team@beispiel.example" (team),
// "schnitt@beispiel.example" (schnitt), "lukas@velonify.de" (Velonify support). Invented names only, never real data.
import { createServer } from 'node:http';
import { testDb } from '../db/test/testDb';
import { InstanzStore } from '../src/data/postgres/instanzStore';
import { PostgresStore } from '../src/data/postgres/postgresStore';
import { behandleInstanz, instanzRolle } from '../functions/crm-api/src/instanz';

const SUPPORT = ['lukas@velonify.de', 'julian@velonify.de'];
const { pool } = await testDb();
const instanz = new InstanzStore(pool);
await new PostgresStore(pool, () => 'lukas@velonify.de').saveEinstellungen({ instanz_name: 'Beispiel' });
await instanz.speichereZugang({ email: 'admin@beispiel.example', name: 'Mara Beispiel', rolle: 'admin' }, 'lukas@velonify.de');
await instanz.speichereZugang({ email: 'team@beispiel.example', name: 'Kim Vorschau', rolle: 'team' }, 'lukas@velonify.de');
await instanz.speichereZugang({ email: 'schnitt@beispiel.example', name: 'Jo Schnitt', rolle: 'schnitt' }, 'lukas@velonify.de');

const lesen = (req: import('node:http').IncomingMessage) =>
  new Promise<unknown>((ok) => {
    let roh = '';
    req.on('data', (d) => (roh += d));
    req.on('end', () => ok(roh ? JSON.parse(roh) : undefined));
  });

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pfad = url.pathname.replace(/\/+$/, '') || '/';
  const email = (req.headers.authorization ?? '').replace(/^Bearer /, '').toLowerCase();
  const body = req.method === 'POST' ? await lesen(req) : undefined;
  const sende = (status: number, daten: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(daten));
  try {
    const rolle = await instanzRolle(instanz, email, SUPPORT);
    if (!rolle) return sende(403, { fehler: 'Für diese Adresse gibt es keinen Zugang. Bittet einen Admin eures Teams, euch einzuladen.' });
    if (pfad === '/praesenz') return sende(200, { anwesende: [] });
    const a = await behandleInstanz(req.method ?? 'GET', pfad, body, { profil: 'creator', instanz, pool, email, rolle });
    sende(a.status, a.daten);
  } catch (err) {
    console.error(err);
    sende(500, { fehler: String(err) });
  }
}).listen(8092, () => console.log('Instanz-Vorschau-API auf http://localhost:8092'));
