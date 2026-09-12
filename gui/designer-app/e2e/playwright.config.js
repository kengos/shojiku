// Minimal Playwright config for the app golden path. BASE_URL points at the
// nginx container serving the built + assembled app (run-e2e.sh sets it).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90000,
  // Deliberately NO retries. A retry policy written before a single observed
  // flake is a guess, and it is the kind that makes a gate fail-open — so a red
  // here means something, and the artifacts below are what make it actionable
  // without re-running. If this does flake, the trace says why, and THAT is
  // when a retry decision has evidence behind it.
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8790',
    // These two are the per-test evidence, and they are written ONLY for a
    // test that failed — so a green run pays nothing for them.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // `list` is what a human reads in the terminal; `html` is what CI uploads.
  // The HTML report is written on every run, pass or fail (measured, not
  // assumed: a green run leaves a ~500KB `playwright-report/index.html`) —
  // it is `gui/.gitignore`d, and CI only uploads it when the job failed.
  // `open: 'never'` — the reporter otherwise tries to spawn a browser at the
  // end of the run, which in a container means it hangs.
  reporter: [['list'], ['html', { open: 'never' }]],
});
