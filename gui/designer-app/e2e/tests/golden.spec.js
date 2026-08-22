// The app golden path: open the standalone shell, pick a preset from the
// catalog, let the embedded Designer boot the engine + paint a preview, and
// export the template — asserting the loop held with no console/page errors.
const { test, expect } = require('@playwright/test');

test('open a preset, preview it client-side, and export', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');

  // Catalog: the default (en-US) locale surfaces the receipt-us preset.
  const card = page.getByRole('button').filter({ hasText: 'Receipt' }).first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.click();

  // Editor: the menubar mounts (Back to templates now lives in File) and the
  // Designer paints a preview canvas (the engine booted + rendered client-side).
  await expect(page.getByRole('button', { name: 'File' })).toBeVisible({
    timeout: 30000,
  });
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 30000 });

  // The panel's text field shows its edit on the CANVAS as it is typed, with no
  // blur and no commit. jsdom has no canvas or layout backend, so this is the
  // only place the deliverable is observable at all: a unit test can assert the
  // transport was CALLED with the pending template, never that the page moved.
  // `items[1]` is the receipt's static-text line (`items[0]` is data-bound, so
  // its panel shows the binding picker rather than a text field).
  await page.getByRole('button', { name: 'sections.body.items[1]', exact: true }).click();
  const textField = page.getByRole('textbox', { name: 'Text' });
  await expect(textField).toBeVisible({ timeout: 30000 });
  const painted = () => canvas.evaluate((el) => el.toDataURL());
  const beforeTyping = await painted();
  await textField.click();
  await textField.pressSequentially('CANARY');
  await expect.poll(painted, { timeout: 30000 }).not.toBe(beforeTyping);
  // Still focused: nothing committed, and the document was never edited.
  await expect(textField).toBeFocused();

  // Tweak: page setup lives in the fullscreen document-settings view now,
  // reached from the 「全体」 layer-tree root row. Open it, change the page size,
  // and the live preview re-renders at the new dimensions (the receipt-us preset
  // is a custom 80mm size, so Legal is a visible jump).
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const preview = page.locator('canvas').first();
  await expect(preview).toBeVisible({ timeout: 30000 });
  const widthBefore = await preview.getAttribute('width');
  // /^Size/: a bare 'Size' substring-matches the 'Resize panel' handle too.
  await page.getByLabel(/^Size/).selectOption('Legal');
  await expect.poll(() => preview.getAttribute('width'), { timeout: 30000 }).not.toBe(widthBefore);

  // Export (a File-menu entry) downloads the edited template YAML. It routes
  // through the save/export REVIEW pane first. The two labels differ by exactly
  // the HIG ellipsis (gui/STYLE.md § Actions): the menu row PROMISES a view
  // (`Export…`), the review pane's confirm ACTS (`Export`) — so both are
  // matched exactly here rather than leaning on substring matching.
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Export…', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('templates.yml');

  // The real deliverable: the engine renders the PDF client-side, the preview
  // shows it, and the download hands over the same bytes. This is the only
  // place the browser's own PDF viewer is exercised end to end.
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /Download as PDF/ }).click();
  const frame = page.locator('iframe[title="PDF preview of the document"]');
  await expect(frame).toBeVisible({ timeout: 30000 });
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  expect(pdf.suggestedFilename()).toContain('.pdf');

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

// zh-TW has no engine builtin: this preset renders only if the app fetched
// packs/locale/zh-tw.yml from the assembled data tree and passed it to
// setLocale, then fetched the (OTF/CFF, ~11 MB) Traditional Chinese face. The
// node integration test proves the seam against the engine; this proves the
// whole browser path — real HTTP, real CSP, real wasm.
test('open a shipped-locale preset whose pack and CJK font are fetched', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');

  // Switch the UI to Traditional Chinese (the language switcher is a menu
  // button now); the catalog is strictly per-locale, so the zh-TW receipt
  // appears only under it.
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitem', { name: '繁體中文' }).click();
  const card = page.getByRole('button').filter({ hasText: '收據' }).first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.click();

  // The engine booted with the fetched pack + TC font and painted a preview.
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 60000 });
  await expect.poll(() => canvas.getAttribute('width'), { timeout: 60000 }).not.toBe('0');

  // A missing pack/font surfaces as an engine throw or a diagnostics banner,
  // both of which land here.
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
