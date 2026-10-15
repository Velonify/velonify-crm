// Applies db/migrationen to crm or crm_test as crm_owner, signed in with your own IAM user (gcloud ADC).
//   npm run db:migrieren -- crm_test
import { leseMigrationen } from '../db/test/testDb';
import { verbinde } from '../db/verbindung';
import { migriere } from '../src/data/postgres/migrationen';

const datenbank = process.argv[2];
if (datenbank !== 'crm' && datenbank !== 'crm_test') throw new Error('Datenbank angeben: crm oder crm_test');
const nutzer = process.env.DB_NUTZER ?? 'lukas@velonify.de';

// One connection, so SET ROLE crm_owner applies to every statement.
const { pool, schliessen } = await verbinde({ instanz: process.env.DB_INSTANZ ?? 'velonify-apps:europe-west3:velonify-db', datenbank, nutzer, max: 1 });
try {
  const neu = await migriere(pool, leseMigrationen(), 'crm_owner');
  console.log(neu.length ? `Ausgeführt in ${datenbank}: ${neu.join(', ')}` : `${datenbank} ist aktuell.`);
} finally {
  await schliessen();
}
