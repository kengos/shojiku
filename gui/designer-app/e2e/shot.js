// Capture the Designer's surfaces as PNGs, so a change to the chrome can be
// LOOKED at instead of only measured. Geometry asserts that two boxes align
// say nothing about a pill overlapping the border it sits under — that one
// shipped, green, and a screenshot showed it in a second.
//
// Not a test and not in `verify`: it asserts nothing, it produces images (for
// the author, and for a zero-context reader asked "does this look broken?").
// The golden-path assertions live in `tests/golden.spec.js`.
//
// Runs inside the repo's Playwright image against a running `make gui-dev`;
// `run-shot.sh` is the wrapper that knows how to reach it.
// `@playwright/test` rather than `playwright`: it is the dependency this
// directory already declares (and the one `npm install` puts in place here).
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE_URL;
const OUT = process.env.OUT_DIR || '/out';
// The preset the shots are taken in, and (optionally) the layer-tree entry to
// select before the panel shot — both by visible text.
const PRESET = process.env.SHOT_PRESET || '納品書';
const ITEM = process.env.SHOT_ITEM || '';
// The catalog is locale-keyed off Accept-Language: a default en-US context
// lands on the English presets, so a Japanese preset name would never match.
const LOCALE = process.env.SHOT_LOCALE || 'ja-JP';
const SCHEME = process.env.SHOT_SCHEME === 'light' ? 'light' : 'dark';

const byText = (page, text) => page.locator('button', { hasText: text }).first();

async function shoot(page, name, locator) {
  await (locator ?? page).screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${OUT}/${name}.png`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: SCHEME,
    locale: LOCALE,
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shoot(page, 'catalog');

  await byText(page, PRESET).click();
  await page.waitForTimeout(2500);
  // A draft left by an earlier session would restore instead of the preset.
  const discard = page.locator('button', { hasText: /^破棄$|^Discard$/ });
  if (await discard.count()) {
    await discard.first().click();
    await page.waitForTimeout(2000);
  }
  await shoot(page, 'editor');

  const panel = page.locator('aside').last();
  if (ITEM !== '') {
    await byText(page, ITEM).click();
    await page.waitForTimeout(1200);
  }
  await shoot(page, 'panel', panel);

  // Through the File menu, not the panel's no-selection button: that button is
  // gone the moment an item is selected, which the panel shot just did.
  await byText(page, /^ファイル$|^File$/).click();
  const settings = page.getByRole('menuitem', { name: /文書設定|Document settings/ });
  if (await settings.count()) {
    await settings.first().click();
    await page.waitForTimeout(1500);
    await shoot(page, 'doc-settings');
  }
  await browser.close();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
