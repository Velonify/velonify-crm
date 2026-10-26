// Local preview of the tenants' hub without Google and Cloud SQL: crm-api's tenant and admin routes on PGlite.
//   npx tsx scripts/mandant-vorschau.ts            (port 8091)
// Hub: VITE_MANDANTEN=1 VITE_CRM_API_URL=http://localhost:8091 VITE_GOOGLE_CLIENT_ID=vorschau npm run dev
// The bearer token is the address: "leon@vennie.tech" for the tenant, "lukas@velonify.de" for the admin tool.
// Invented shops only (*.example), never real data.
import { createServer } from 'node:http';
import { testDb } from '../db/test/testDb';
import { PlattformStore } from '../src/data/postgres/plattformStore';
import { PostgresStore } from '../src/data/postgres/postgresStore';
import { behandleMandant, behandlePlattformAdmin } from '../functions/crm-api/src/plattform';
import { behandle, behandleDaten } from '../functions/crm-api/src/routen';

const crm = await testDb({ plattform: true });
const hub = await testDb();
const plattform = new PlattformStore(crm.pool);
await plattform.speichereMandant({ id: 'vennie', name: 'vennie', test_start: new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10) }, 'lukas@velonify.de');
await plattform.speichereZugang({ email: 'leon@vennie.tech', mandant_id: 'vennie', name: 'Leon Vorschau', rolle: 'inhaber' });
const branchen = ['mode', 'beauty', 'sport', 'wohnen', 'lebensmittel', 'tiere'];
const helpdesks = [['Zendesk'], ['Gorgias'], [], ['Freshdesk'], ['Zendesk'], ['Tidio'], []];
await plattform.marktAufnehmen(
  Array.from({ length: 34 }, (_, i) => ({
    domain: `vorschau-shop-${i + 1}.example`,
    vorschau: {
      branche: branchen[i % branchen.length], plz_bereich: String(i % 10), land: 'DE', rang_de: [10_000, 50_000, 100_000, 500_000][i % 4],
      lcp_ms: 1800 + (i % 5) * 400, shopify_plus: i % 6 === 0, helpdesk: helpdesks[i % helpdesks.length], email_tools: i % 2 ? ['Klaviyo'] : [],
      zahlarten: ['PayPal', 'Klarna', 'Apple Pay'], bewertungen: [], sprachen: ['de'], apps: 30 + i, produkte: 100 + i * 37,
    },
    daten: {
      domain: `vorschau-shop-${i + 1}.example`, firma: `Vorschau Shop ${i + 1} GmbH`, rechtsform: 'GmbH', email: `info@vorschau-shop-${i + 1}.example`,
      telefon: '', ansprechpartner: 'Erika Beispiel', strasse: '', plz: `${i % 10}0000`, ort: 'Musterstadt', register: '', ust_id: '',
    },
  })),
);

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
  const email = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const body = req.method === 'POST' ? await lesen(req) : undefined;
  const sende = (status: number, daten: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(daten));
  try {
    if (pfad === '/praesenz') return sende(200, { anwesende: [] });
    if (email.endsWith('@velonify.de')) {
      if (pfad.startsWith('/plattform/')) {
        const a = await behandlePlattformAdmin(req.method ?? 'GET', pfad, Object.fromEntries(url.searchParams), body, plattform, email);
        return sende(a.status, a.daten);
      }
      const store = new PostgresStore(crm.pool, () => email);
      const a = (await behandleDaten(req.method ?? 'GET', pfad, body, store)) ?? (await behandle(req.method ?? 'GET', pfad, body, store));
      return sende(a.status, a.daten);
    }
    const treffer = await plattform.zugang(email);
    if (!treffer) return sende(403, { fehler: 'Für diese Adresse gibt es keinen Zugang.' });
    if (pfad.startsWith('/ki/')) return sende(503, { fehler: 'KI gibt es in der Vorschau nicht.' });
    const a = await behandleMandant(req.method ?? 'GET', pfad, body, {
      plattform, ...treffer, pool: hub.pool, store: new PostgresStore(hub.pool, () => email), melde: async (t) => console.log('[Slack]', t),
    });
    sende(a.status, a.daten);
  } catch (err) {
    console.error(err);
    sende(500, { fehler: String(err) });
  }
}).listen(8091, () => console.log('Vorschau-API auf http://localhost:8091'));
