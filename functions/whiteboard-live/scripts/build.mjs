// Bundles the relay with the shared login check from ../gemeinsam; Cloud Build only installs ws.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['ws'],
  logLevel: 'info',
});
