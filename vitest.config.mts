import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/workers/**'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
