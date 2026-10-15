// Bundles the function together with the CRM's data layer from ../../src/data and ../../db, so Cloud Build only installs
// the Functions Framework. Deploy after `npm run build`; gcp-build is empty on purpose.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['@google-cloud/functions-framework', '@google-cloud/cloud-sql-connector', 'pg'],
  // Some dependencies still use require(); give the ESM bundle one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
