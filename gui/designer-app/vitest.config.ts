import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom for the component tests; the real-engine integration test opts into
    // the node environment with a `@vitest-environment node` docblock.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Only the package's own unit/integration tests — never the Playwright
    // golden path under e2e/ (a separate on-demand harness).
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // main.tsx + src/browser/ are the browser entry (wires real browser
      // globals to the injected-dependency modules — untestable without a DOM
      // host); the wasm module loader is a thin dynamic-import shim exercised
      // only by the browser and the node integration test; type-only files
      // carry no code; test files are not coverage targets themselves.
      // src/testkit/ is the shared EditorScreen-suite substrate (fixtures +
      // mount harness) — test-only code, no more a coverage target than the
      // test files that import it.
      exclude: [
        'src/main.tsx',
        'src/browser/**',
        'src/engine/wasmModule.ts',
        'src/**/*.test.{ts,tsx}',
        'src/testkit/**',
      ],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      reporter: ['text', 'lcov'],
    },
  },
});
