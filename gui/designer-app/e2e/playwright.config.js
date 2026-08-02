// Minimal Playwright config for the app golden path. BASE_URL points at the
// nginx container serving the built + assembled app (run-e2e.sh sets it).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8790',
  },
  reporter: [['list']],
});
