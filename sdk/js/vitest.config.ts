import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Scoped deliberately: vitest's default include also collects `*.spec.js`,
    // which would sweep in anything a future e2e folder puts beside the suite.
    include: ['test/**/*.test.ts'],
    // The process-wide `configure` slot is shared state and every suite touches
    // it, so the suites run one at a time rather than racing each other.
    fileParallelism: false,
    // These tests drive the REAL engine — a render plus a signature is several
    // seconds of honest work, well past vitest's 5s default.
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'lcovonly'],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
});
