import { defineConfig } from 'vitest/config';

// Vitest runs the pure-logic tests in src/lib; component tests in src/__tests__ stay on jest.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts'],
  },
});
