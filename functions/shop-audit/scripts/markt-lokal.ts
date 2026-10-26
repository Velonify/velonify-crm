// Lead-Markt from your own machine, without the hub: rebuild the market pool, or check the next Shopify shops and
// store them in crm's plattform_lead_markt. Signed in with gcloud ADC (BigQuery, Cloud SQL as crm_owner).
//   npx tsx scripts/markt-lokal.ts pool
//   ANTHROPIC_API_KEY=$(gcloud secrets versions access latest --secret=anthropic-api-key --project=velonify-crm) \
//     npx tsx scripts/markt-lokal.ts fuellen 20 [helpdesk]
import Anthropic from '@anthropic-ai/sdk';
import { verbinde } from '../../../db/verbindung';
import { PlattformStore } from '../../../src/data/postgres/plattformStore';
import { ladeSeite } from '../src/laden.js';
import { katalog } from '../src/technik.js';
import { echteBq } from '../src/leads/bq.js';
import { neuesteQuellenSql } from '../src/leads/pool-sql.js';
import { fuelleMarkt, marktPoolSql } from '../src/leads/markt.js';
import { AUSGABE_SCHEMA_BRANCHE, BrancheSchema, MODELL_BRANCHE, nutzerNachrichtBranche, startseitenAuszug, SYSTEM_PROMPT_BRANCHE } from '../src/leads/branche.js';
import { ladeStartseite } from '../src/leads/pruefen.js';

const DATASET = process.env.LEADS_DATASET ?? 'velonify-crm.leads';
const bq = echteBq(DATASET);
const [modus, anzahl = '20', nur] = process.argv.slice(2);

async function crm<T>(arbeit: (p: PlattformStore) => Promise<T>): Promise<T> {
  const v = await verbinde({ instanz: 'velonify-apps:europe-west3:velonify-db', datenbank: process.env.DB_NAME ?? 'crm', nutzer: process.env.DB_NUTZER ?? 'lukas@velonify.de', max: 1 });
  try {
    await v.pool.exec('SET ROLE crm_owner');
    return await arbeit(new PlattformStore(v.pool));
  } finally {
    await v.schliessen();
  }
}

if (modus === 'pool') {
  const [quellen] = await bq.query<{ crawl_datum: string; crux_monat: number }>(neuesteQuellenSql());
  await bq.query(marktPoolSql(DATASET), { crawl: { typ: 'DATE', wert: quellen.crawl_datum }, crux: quellen.crux_monat });
  const [zahl] = await bq.query(`SELECT COUNT(*) AS shops, COUNTIF(helpdesk) AS mit_helpdesk FROM \`${DATASET}.markt_pool\``);
  console.log({ ...quellen, ...zahl });
} else if (modus === 'fuellen') {
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  const ohne = await crm((p) => p.ausschluss());
  const ergebnis = await fuelleMarkt(
    { n: Number(anzahl), ohne, nur_helpdesk: nur === 'helpdesk' },
    {
      bq,
      dataset: DATASET,
      pruefDeps: { laden: ladeSeite, heute: new Date(), katalog: katalog() },
      branche: client
        ? async (domain, firma) => {
            const home = await ladeStartseite(domain, ladeSeite);
            const antwort = await client.messages.create({
              model: MODELL_BRANCHE,
              max_tokens: 1024,
              output_config: { effort: 'low', format: { type: 'json_schema', schema: AUSGABE_SCHEMA_BRANCHE } },
              system: [{ type: 'text', text: SYSTEM_PROMPT_BRANCHE, cache_control: { type: 'ephemeral' } }],
              messages: [{ role: 'user', content: nutzerNachrichtBranche(domain, firma, startseitenAuszug(home)) }],
            } as never);
            const text = (antwort as { content: { type: string; text?: string }[] }).content.flatMap((b) => (b.type === 'text' ? [b.text ?? ''] : [])).join('');
            return BrancheSchema.parse(JSON.parse(text)).branche;
          }
        : undefined,
    },
  );
  const neu = await crm((p) => p.marktAufnehmen(ergebnis.eintraege));
  console.log({ geprueft: ergebnis.geprueft, verworfen: ergebnis.verworfen, neu, statistik: await crm((p) => p.marktStatistik()) });
} else {
  console.log('Modus: pool | fuellen <n> [helpdesk]');
}
