import { defineConfig } from "vitest/config";

// Coverage bar: the pure lib modules carry 100%×4 (the gui posture). The
// scripts/ drivers are thin fs/process compositions over those modules and
// stay excluded, like gui/designer-app's browser-entry group.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
