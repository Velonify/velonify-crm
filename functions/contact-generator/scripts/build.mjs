// Bundles the function's own code together with ../gemeinsam (shared with the other functions). npm packages stay
// external and are installed by Cloud Build from package.json. Deploy after `npm run build`; gcp-build is empty on purpose.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node24',
  logLevel: 'info',
});
