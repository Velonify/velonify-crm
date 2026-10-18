import { defineConfig } from 'vitest/config';

// The shared code in ../gemeinsam is tested here, as part of the smallest function that uses it.
export default defineConfig({ test: { dir: '..', include: ['contact-generator/src/**/*.test.ts', 'gemeinsam/**/*.test.ts'] } });
