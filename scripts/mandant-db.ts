// Creates a tenant's database hub_<id> on velonify-db with the same rights as crm (see Vault: velonify-db - Rechte.sql),
// signed in with your own IAM user. Then run: npm run db:migrieren -- hub_<id>
//   npx tsx scripts/mandant-db.ts vennie
import { verbinde } from '../db/verbindung';

const id = process.argv[2] ?? '';
if (!/^[a-z0-9_]{2,30}$/.test(id)) throw new Error('Kennung angeben, z. B. vennie');
const datenbank = `hub_${id}`;
const instanz = process.env.DB_INSTANZ ?? 'velonify-apps:europe-west3:velonify-db';
const nutzer = process.env.DB_NUTZER ?? 'lukas@velonify.de';

const postgres = await verbinde({ instanz, datenbank: 'postgres', nutzer, max: 1 });
try {
  const { rows } = await postgres.pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [datenbank]);
  if (rows.length === 0) await postgres.pool.exec(`CREATE DATABASE ${datenbank}`);
  await postgres.pool.exec(`
    REVOKE ALL ON DATABASE ${datenbank} FROM PUBLIC;
    GRANT CONNECT, TEMPORARY ON DATABASE ${datenbank} TO "crm-api@velonify-crm.iam";
    GRANT CONNECT ON DATABASE ${datenbank} TO "lukas@velonify.de", "julian@velonify.de";`);
} finally {
  await postgres.schliessen();
}

const neu = await verbinde({ instanz, datenbank, nutzer, max: 1 });
try {
  await neu.pool.exec(`
    ALTER SCHEMA public OWNER TO crm_owner;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO "crm-api@velonify-crm.iam";
    ALTER DEFAULT PRIVILEGES FOR ROLE crm_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO "crm-api@velonify-crm.iam";
    ALTER DEFAULT PRIVILEGES FOR ROLE crm_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "crm-api@velonify-crm.iam";`);
  console.log(`${datenbank} ist angelegt. Jetzt: npm run db:migrieren -- ${datenbank}`);
} finally {
  await neu.schliessen();
}
