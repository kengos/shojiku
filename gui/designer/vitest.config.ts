import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom for the component tests; the real-engine integration test opts into
    // the node environment with a `@vitest-environment node` docblock.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // types.ts is type-only (erased at build); test files are not coverage
      // targets themselves. designer-core rides in via the workspace source
      // import — its own suite carries its 100% gate (vitest 4 stopped
      // honoring `include` as an out-of-package fence).
      // src/testkit/ is the shared Designer-suite substrate (fixtures +
      // mount harness) — test-only code, no more a coverage target than the
      // test files that import it.
      exclude: [
        'src/engine/types.ts',
        'src/**/*.test.{ts,tsx}',
        'src/testkit/**',
        '**/designer-core/**',
      ],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      reporter: ['text', 'lcov'],
    },
  },
});
