// The production CSP (see ../csp.js) as a subject of its own: the check is
// live at all, and a placed image's `blob:` URL loads under it (the PDF
// preview's `blob:` frame is the golden path's).
const { readFileSync } = require('node:fs');
const { test, expect } = require('../csp');

// A 16×16 opaque red PNG — a raster the image codec must DECODE (to measure
// it), which is the step that goes through a `blob:` URL.
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mP4z8BAEmIY1TCqYfhqAACQ+f8B8u7oVwAAAABJRU5ErkJggg==',
  'base64',
);

// The control every other test's silence rests on: if the header were not
// applied, or the listener not live, every test would pass with no violation
// and say nothing. A cross-origin image is refused by `img-src` before any
// request leaves, so this needs no network.
test('a load the production CSP forbids is reported as a violation', async ({
  page,
  cspViolations,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const img = document.createElement('img');
    img.src = 'https://example.invalid/probe.png';
    document.body.append(img);
  });
  await expect.poll(() => cspViolations.length, { timeout: 10000 }).toBe(1);
  expect(cspViolations[0]).toMatchObject({
    directive: 'img-src',
    blocked: 'https://example.invalid/probe.png',
  });
  // Expected, so it must not fail this test's own teardown check.
  cspViolations.length = 0;
});

// The PDF preview's `blob:` frame is walked by the golden path; this is the
// other object URL the app mints. Placing an image decodes it through
// `new Image()` on a Blob URL, which `img-src` must admit.
test('place an image, decoded through a blob: URL', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('button').filter({ hasText: 'Receipt' }).first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Insert' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Place image…' }).click(),
  ]);
  await chooser.setFiles({ name: 'red.png', mimeType: 'image/png', buffer: RED_PNG });

  // The placed image comes up selected, so its panel offers a replacement; a
  // refused decode places nothing and shows a notice instead. A repaint is NOT
  // the evidence: the canvas was measured to change on the refused path too.
  await expect(page.getByRole('button', { name: 'Replace image…' })).toBeVisible({
    timeout: 30000,
  });
  // And the document holds THESE bytes: a PNG this small is embedded as is.
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Export…', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  const exported = readFileSync(await download.path(), 'utf8');
  expect(exported).toContain(`data:image/png;base64,${RED_PNG.toString('base64')}`);
});
