// Applies db/migrationen to crm, crm_test, a tenant's hub_<id> or an own instance's hub as crm_owner, signed in with your
// own IAM user (gcloud ADC) or, with DB_NUTZER, as another IAM user (e.g. an instance's migration account in GitHub Actions).
// crm and crm_test also get the platform tables from db/plattform (tenants, logins, lead releases); tenants and instances never do.
//   npm run db:migrieren -- crm_test
//   npm run db:migrieren -- hub_vennie
//   DB_INSTANZ=velonify-<kennung>:europe-west3:hub npm run db:migrieren -- hub   (own instance, see INSTANZ.md)
import { leseMigrationen, lesePlattformMigrationen } from '../db/test/testDb';
import { verbinde } from '../db/verbindung';
import { migriere } from '../src/data/postgres/migrationen';

const datenbank = process.argv[2];
// hub_<id>: a tenant on velonify-db; hub: the database of an own instance (own project and Cloud SQL). Neither gets platform tables.
const ohnePlattform = /^hub(_[a-z0-9_]{2,30})?$/.test(datenbank ?? '');
if (datenbank !== 'crm' && datenbank !== 'crm_test' && !ohnePlattform) throw new Error('Datenbank angeben: crm, crm_test, hub_<mandant> oder hub (eigene Instanz)');
// An instance always has its own Cloud SQL; never fall back to velonify-db for it.
if (datenbank === 'hub' && !process.env.DB_INSTANZ) throw new Error('Für hub DB_INSTANZ setzen, z. B. velonify-<kennung>:europe-west3:hub');
const nutzer = process.env.DB_NUTZER ?? 'lukas@velonify.de';

// One connection, so SET ROLE crm_owner applies to every statement.
const { pool, schliessen } = await verbinde({ instanz: process.env.DB_INSTANZ ?? 'velonify-apps:europe-west3:velonify-db', datenbank, nutzer, max: 1 });
try {
  const neu = await migriere(pool, ohnePlattform ? leseMigrationen() : [...leseMigrationen(), ...lesePlattformMigrationen()], 'crm_owner');
  console.log(neu.length ? `Ausgeführt in ${datenbank}: ${neu.join(', ')}` : `${datenbank} ist aktuell.`);
} finally {
  await schliessen();
}
