import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base: the build works both at velonify.github.io/velonify-crm/ and at crm.velonify.de/.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // Cloud Functions have their own dependencies and tests.
  test: { exclude: [...configDefaults.exclude, 'functions/**'] },
});
