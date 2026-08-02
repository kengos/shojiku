// Golden path: load the page, let the module instantiate + inject fonts +
// render the receipt-us example to canvas, and assert the boundary held —
// pages painted, result `ok`, no diagnostics/console/page errors.
const { test, expect } = require('@playwright/test');

test('renders the receipt-us example client-side, error-free', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');
  // The driver flips #status to done or error and sets window.__SHOJIKU__.
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'done', {
    timeout: 30000,
  });

  const result = await page.evaluate(() => window.__SHOJIKU__);
  expect(result.ok).toBe(true);
  expect(result.pages).toBeGreaterThan(0);
  expect(result.errorCount).toBe(0);

  // Single-page selection returned exactly one page, byte-identical to page 0.
  expect(result.pageSelect.pages).toBe(1);
  expect(result.pageSelect.matches).toBe(true);

  // A host-misuse throw (an out-of-range pageIndex) crosses the boundary as a
  // typed error: a stable `code` string plus typed `args`, not a bare message
  // a host would have to string-match.
  expect(result.typedError.code).toBe('page_out_of_range');
  expect(result.typedError.page).toBe(99);
  expect(result.typedError.total).toBe(result.pages);

  // A canvas was actually painted per page.
  await expect(page.locator('canvas.page')).toHaveCount(result.pages);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
