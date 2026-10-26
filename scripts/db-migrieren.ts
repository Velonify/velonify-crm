// Applies db/migrationen to crm, crm_test or a tenant's hub_<id> as crm_owner, signed in with your own IAM user (gcloud ADC).
// crm and crm_test also get the platform tables from db/plattform (tenants, logins, lead releases); tenants never do.
//   npm run db:migrieren -- crm_test
//   npm run db:migrieren -- hub_vennie
import { leseMigrationen, lesePlattformMigrationen } from '../db/test/testDb';
import { verbinde } from '../db/verbindung';
import { migriere } from '../src/data/postgres/migrationen';

const datenbank = process.argv[2];
const mandant = /^hub_[a-z0-9_]{2,30}$/.test(datenbank ?? '');
if (datenbank !== 'crm' && datenbank !== 'crm_test' && !mandant) throw new Error('Datenbank angeben: crm, crm_test oder hub_<mandant>');
const nutzer = process.env.DB_NUTZER ?? 'lukas@velonify.de';

// One connection, so SET ROLE crm_owner applies to every statement.
const { pool, schliessen } = await verbinde({ instanz: process.env.DB_INSTANZ ?? 'velonify-apps:europe-west3:velonify-db', datenbank, nutzer, max: 1 });
try {
  const neu = await migriere(pool, mandant ? leseMigrationen() : [...leseMigrationen(), ...lesePlattformMigrationen()], 'crm_owner');
  console.log(neu.length ? `Ausgeführt in ${datenbank}: ${neu.join(', ')}` : `${datenbank} ist aktuell.`);
} finally {
  await schliessen();
}
