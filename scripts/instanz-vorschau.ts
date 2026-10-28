// Local preview of an own instance without Google and Cloud SQL: crm-api's instance routes on PGlite.
//   npx tsx scripts/instanz-vorschau.ts            (port 8092)
// Hub: VITE_PROFIL=creator VITE_CRM_API_URL=http://localhost:8092 VITE_GOOGLE_CLIENT_ID=vorschau npm run dev -- --port 5213
// The bearer token is the address: "admin@beispiel.example" (admin), "team@beispiel.example" (team),
// "schnitt@beispiel.example" (schnitt), "lukas@velonify.de" (Velonify support). Invented names only, never real data.
import { createServer } from 'node:http';
import { testDb } from '../db/test/testDb';
import { InstanzStore } from '../src/data/postgres/instanzStore';
import { PostgresStore } from '../src/data/postgres/postgresStore';
import { behandleInstanz, behandleOeffentlich, behandleTakt, instanzRolle, type InstanzDienste } from '../functions/crm-api/src/instanz';
import { speicherGeheimnisse } from '../functions/crm-api/src/creator/geheimnisse';
import { claudeKi, testKi } from '../functions/crm-api/src/creator/ki';

const SUPPORT = ['lukas@velonify.de', 'julian@velonify.de'];
const { pool } = await testDb();
const instanz = new InstanzStore(pool);
// With ANTHROPIC_API_KEY the preview asks the real Claude (costs money); without, a stand-in answers with empty JSON.
const dienste: InstanzDienste = {
  profil: 'creator',
  instanz,
  pool,
  ki: process.env.ANTHROPIC_API_KEY ? claudeKi(process.env.ANTHROPIC_API_KEY, pool) : testKi(() => '{}'),
  geheimnisse: speicherGeheimnisse(),
  umgebung: { hubUrl: 'http://localhost:5213', apiUrl: 'http://localhost:8092', wert: (name) => process.env[name] },
};
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
    if (pfad.startsWith('/oeffentlich/')) {
      const a = await behandleOeffentlich(req.method ?? 'GET', pfad, body, Object.fromEntries(url.searchParams), dienste, 'vorschau');
      const d = a.daten as { umleiten?: string; inhalt?: string; typ?: string } | null;
      if (d?.umleiten) return void res.writeHead(302, { Location: d.umleiten }).end();
      if (d && typeof d.inhalt === 'string' && d.typ) return void res.writeHead(a.status, { 'Content-Type': d.typ }).end(d.inhalt);
      return sende(a.status, a.daten);
    }
    // Timed jobs by hand: curl -X POST http://localhost:8092/takt/<name>
    if (pfad.startsWith('/takt/')) return sende(...Object.values(await behandleTakt(pfad.slice(6), dienste)) as [number, unknown]);
    const rolle = await instanzRolle(instanz, email, SUPPORT);
    if (!rolle) return sende(403, { fehler: 'Für diese Adresse gibt es keinen Zugang. Bittet einen Admin eures Teams, euch einzuladen.' });
    if (pfad === '/praesenz') return sende(200, { anwesende: [] });
    const a = await behandleInstanz(req.method ?? 'GET', pfad, body, { ...dienste, email, rolle });
    sende(a.status, a.daten);
  } catch (err) {
    console.error(err);
    sende(500, { fehler: String(err) });
  }
}).listen(8092, () => console.log('Instanz-Vorschau-API auf http://localhost:8092'));
