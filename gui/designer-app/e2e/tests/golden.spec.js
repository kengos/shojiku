// The app golden path: open the standalone shell, pick a preset from the
// catalog, let the embedded Designer boot the engine + paint a preview, and
// export the template — asserting the loop held with no console/page errors.
const { readFileSync } = require('node:fs');
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

  // A LINE BREAK, authored the way a reader authors one: Enter at the END of
  // the value, then keep typing. That is the case that used to fail — the break
  // went in, but the next character landed back on the previous line — and it
  // is invisible to jsdom, which implements no contenteditable editing and so
  // cannot tell a caret that moved from one that did not.
  const beforeBreak = await painted();
  await textField.press('Enter');
  await textField.pressSequentially('SECOND');
  await expect.poll(painted, { timeout: 30000 }).not.toBe(beforeBreak);
  // Ctrl+Enter commits — the second half of what the field's key hint promises,
  // exercised here rather than merely rendered.
  await textField.press('Control+Enter');
  await expect(textField).not.toBeFocused();

  // Bands: this preset authors neither, so the Structure tab lists a
  // placeholder row for each. Pressing one creates the band and selects it,
  // which is what arms the band-only page-number row — the whole point of the
  // affordance. Then the page repaints with the number on it. jsdom cannot see
  // any of this: only here does a real engine re-render over a created band.
  const beforeBand = await painted();
  await page.getByRole('button', { name: /^Footer/ }).click();
  await page.getByRole('button', { name: 'Insert' }).click();
  const pageNumber = page.getByRole('menuitem', { name: /Page number/ });
  await expect(pageNumber).not.toHaveAttribute('aria-disabled', 'true');
  await pageNumber.click();
  await expect.poll(painted, { timeout: 30000 }).not.toBe(beforeBand);

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

  // The break survived the whole loop — panel keystroke, document op,
  // serializer, file. The LOAD-BEARING assertion is the second one: before the
  // Enter fix this value came out `{store.phone}CANARYSECOND` on one line, so
  // that pattern is the only thing here that would have failed. The block-form
  // check is a guard, not a proof — this value holds an interpolation, and such
  // a value already took `|-` before the block-literal change existed; the
  // change itself is pinned in `designer-core/src/multilineText.test.ts`.
  const exported = readFileSync(await download.path(), 'utf8');
  // Two LINEAR patterns rather than one spanning match: a `(\s+.*\n)*`
  // between them backtracks catastrophically over a file this size when it
  // does not match, which reads as a hung run rather than a failed assertion.
  expect(exported).toContain('text: |-\n');
  expect(exported).toMatch(/CANARY\n\s+SECOND\n/);

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
  // The control's accessible name carries the CURRENT language after it
  // (WCAG 2.5.3), so match the prefix rather than the whole name.
  await page.getByRole('button', { name: /^Language:/ }).click();
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
