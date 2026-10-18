import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base: the build works both at velonify.github.io/velonify-crm/ and at crm.velonify.de/.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        // React and the router change rarely: their own chunk stays cached across deploys of the hub.
        codeSplitting: {
          groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\\/]/ }],
        },
      },
    },
  },
  // Cloud Functions have their own dependencies and tests.
  test: { exclude: [...configDefaults.exclude, 'functions/**'] },
});
