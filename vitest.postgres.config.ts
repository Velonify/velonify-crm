import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// Runs the service tests a second time with PostgresStore (PGlite) in place of SheetStore: `npm run test:postgres`.
// Tests that look into the sheet itself (setup, column handling) only make sense for SheetStore and are left out.
const shim = fileURLToPath(new URL('./db/test/sheetStoreAlsPostgres.ts', import.meta.url));
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'functions/**', 'src/data/sheets/**'],
    include: ['src/data/**/*.test.ts'],
    // A missing tab (SchemaError) cannot happen with migrations.
    testNamePattern: /^(?!.*(tab is missing|tabs or columns are missing|catalogue tabs are missing))/,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  plugins: [
    {
      name: 'sheetstore-als-postgres',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (importer && !importer.includes('/postgres/') && !importer.includes('/db/test/') && /\/sheets\/sheetStore(\.ts)?$/.test(source)) return shim;
        return null;
      },
    },
  ],
});
