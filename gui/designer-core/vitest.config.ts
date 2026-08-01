import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // wire.ts is type-only (interfaces/type aliases erased at build) — it has
      // no executable lines to cover.
      exclude: ['src/wire.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      reporter: ['text', 'lcov'],
    },
  },
});
