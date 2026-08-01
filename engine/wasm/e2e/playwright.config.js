// Minimal Playwright config for the WASM golden path. BASE_URL points at the
// nginx container serving the built module (run-e2e.sh sets it).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8789',
  },
  reporter: [['list']],
});
