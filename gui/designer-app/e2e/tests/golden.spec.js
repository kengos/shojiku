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

// The link badge is `pointer-events: none` so it cannot steal clicks from the
// item it marks — a link-dense document would otherwise grow unclickable
// patches over its own items, and nothing would say so. jsdom performs no hit
// testing at all (`fireEvent.click(el)` dispatches straight at `el`), so the
// unit suite can only pin the DECLARATION
// (`designer/src/canvas/BoxOverlay.test.tsx`, "paints in the paper ink, not the
// accent, and stays inert"); the behaviour that declaration buys needs a
// browser, which is here.
//
// NOTE, because a permanent case reads like a guarded one: `make gui:e2e` is
// deliberately ON-DEMAND and not part of `make verify` (Makefile,
// CONTRIBUTING.md, docs/agents/gui.md); no CI job runs it either. Those three
// say the first half — and since CI is a strict SUPERSET of `verify`, the
// second does not follow from it and is stated separately. This case does not
// keep `main` honest by itself: it is what a human runs to find out.
test('a click on a link badge selects the item under it', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');
  const card = page.getByRole('button').filter({ hasText: 'Receipt' }).first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.click();
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 30000 });

  // The case AUTHORS its link rather than opening one of the eight bundled
  // presets that already carry a `link:` (invoice-en, estimate-ja, …). Two
  // reasons: authoring drives panel field → document op → re-render → the box
  // index's `linked` flag → the badge, which is the whole path the mark rests
  // on; and it keeps this case on the same preset the rest of this file drives,
  // so it shares the catalog locator instead of adding a second one.
  // `items[1]` is the receipt's static-text line, and it is the right target
  // for a further reason: it has no `w`, so it fills the margin box, and its
  // text is centred — so the badge (ink's right edge + gap + radius) lands over
  // the item's OWN rect rather than out over the page. The margin is real but
  // not generous: measured, the badge's centre sits 11.8 px inside a 144 px
  // rect, and it rides the RENDERED WIDTH of the preset's sample text (the
  // address in `examples/business/receipt-us/params.json`, not the
  // `definitions.yml` `example:`). Eleven more characters there push it off,
  // which is what the precondition below is for.
  const badge = page.locator('.sj-link-badge-disc');
  // The baseline, so "the badge appeared" is a transition rather than a state:
  // this preset authors no `link:` today, and if one is ever added to it the
  // case must be retargeted rather than quietly asserting a badge it did not
  // author.
  await expect(badge).toHaveCount(0);

  const marked = page.getByRole('button', { name: 'sections.body.items[1]', exact: true });
  await marked.click();
  // `exact` because Playwright's default name match is a case-insensitive
  // SUBSTRING, and `Link` is a strict prefix of `Link for fragment {n}` — the
  // per-fragment field `SpansSection` renders beside this one on a `spans:`
  // item. `items[1]` is plain text today, so the locator resolves to one
  // either way; this is the same trap the golden path above meets twice
  // (`/^Size/`, and the two `Export` labels).
  const linkField = page.getByRole('textbox', { name: 'Link', exact: true });
  await expect(linkField).toBeVisible({ timeout: 30000 });
  await linkField.click();
  await linkField.pressSequentially('https://example.com');

  // This field commits on BLUR and has no Enter handler — `panel/LinkUrlField`
  // delegates the blur to its wrapper so a trip into its own insert menu is not
  // a commit, and leaving the field is. Selecting another item IS that blur,
  // and it does double duty: it moves the selection AWAY, so the assertion at
  // the end cannot pass by the selection simply never having moved.
  const other = page.getByRole('button', { name: 'sections.body.items[0]', exact: true });
  await other.click();
  await expect(other).toHaveAttribute('aria-pressed', 'true');
  await expect(marked).toHaveAttribute('aria-pressed', 'false');

  await expect(badge).toHaveCount(1, { timeout: 30000 });

  const box = await badge.boundingBox();
  expect(box).not.toBeNull();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Asserted as a PRECONDITION, so the two ways this case can go red stay
  // distinguishable. Without it, a widened sample address reds the hit test
  // with `Received: "svg.sj-box-overlay"` — which reads like the pass-through
  // breaking, in a run that is on-demand and therefore likely happening inside
  // somebody else's unrelated cycle.
  const rect = await marked.boundingBox();
  expect(
    cx,
    'the badge is no longer anchored over its own item: the preset sample text widened, so the ' +
      'hit test below would be asking about the page. Retarget the case — the pass-through is ' +
      'not what broke.',
  ).toBeLessThan(rect.x + rect.width);

  // The hit test itself, asked of the browser directly: at the badge's own
  // centre, what would receive a pointer? With the layer interactive this
  // answers the badge; inert, it answers the item underneath. This runs BEFORE
  // the click because a coordinate click that misses reads exactly like a
  // broken feature, and this says which of the two happened.
  // It reports the INTERCEPTOR by name when the answer is not an item, because
  // this case is on-demand and a human reading the failure is the whole
  // mechanism: `Received: "circle.sj-link-badge-disc"` says the badge took the
  // click, where a bare `null` would only say the assertion did not hold.
  const under = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (el === null) return null;
      return (
        el.getAttribute('data-path') ??
        `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? '(no class)'}`
      );
    },
    [cx, cy],
  );
  expect(under).toBe('sections.body.items[1]');

  // The destination, which is the OTHER half of what the badge is for and the
  // only place it is observable: no unit suite hovers, and jsdom would not
  // hit-test it if one tried. The chip sits under the badge rather than beside
  // it, so it cannot cover the words it explains.
  await marked.hover();
  await expect(page.locator('.sj-link-hint-text')).toHaveText('https://example.com', {
    timeout: 30000,
  });

  // …and the consequence a user actually meets.
  await page.mouse.click(cx, cy);
  await expect(marked).toHaveAttribute('aria-pressed', 'true');
  await expect(other).toHaveAttribute('aria-pressed', 'false');

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

// Tooltips: every bubble on the editor screen is fully inside whatever clips
// it. This is the only place the claim is observable — jsdom has no layout
// backend, so a unit test can pin the DECISION and its geometry table but never
// that the running app agrees with them. It is also the only place the second
// half is observable: an overhanging bubble widens its scroller's scroll range
// even while nobody is hovering.
test('no tooltip is cut off by the box that clips it', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');
  const card = page.getByRole('button').filter({ hasText: 'Receipt' }).first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.click();
  await expect(page.getByRole('button', { name: 'File' })).toBeVisible({ timeout: 30000 });

  // Select an item so the property panel — the narrowest surface that carries
  // bubbles, and the one this change exists for — is on screen rather than the
  // no-selection card.
  await page.getByRole('button', { name: 'sections.body.items[1]', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text' })).toBeVisible({ timeout: 30000 });

  // A child of the CONTAINER at items[5], on the Layout tab: that is where the
  // placement-mode picker renders, and it is a `Segmented` — the one control
  // whose own box used to clip its tooltips away entirely. An item outside a
  // container gets no mode picker at all, so a walk that never lands here
  // cannot see them, which is half of why the earlier one-axis version of this
  // passed.
  await page.getByRole('button', { name: 'sections.body.items[5].items[0]', exact: true }).click();
  await page.getByRole('tab', { name: 'Layout' }).click();
  // The precondition, asserted rather than assumed: without the picker on
  // screen the survey below would sweep a page that cannot contain the defect
  // and report it clean.
  const modePicker = page.locator('fieldset').filter({ has: page.locator('[data-sj-tip]') });
  await expect(modePicker.first()).toBeVisible({ timeout: 30000 });

  const survey = async () =>
    page.evaluate(() => {
      const clips = /^(auto|scroll|hidden|clip|overlay)$/;
      const scrolls = /^(auto|scroll|overlay)$/;
      const clipperOf = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (clips.test(cs.overflowX) || clips.test(cs.overflowY)) return p;
        }
        return document.documentElement;
      };
      const tips = [...document.querySelectorAll('[data-sj-tip]')];
      return {
        // The POSITIVE CONTROL. A walk that reached nothing reports an empty
        // offender list, which is indistinguishable from a clean screen.
        seen: tips.length,
        cut: tips.flatMap((t) => {
          const r = t.getBoundingClientRect();
          // A bubble with no text has no box worth judging.
          if (r.width === 0) return [];
          const c = clipperOf(t);
          const cr = c.getBoundingClientRect();
          const cs = getComputedStyle(c);
          // BOTH axes, and reachability is per DIRECTION, not per axis. Past a
          // box's scroll ORIGIN is never reachable — `scrollTop`/`scrollLeft`
          // clamp at 0, so those pixels cannot be brought into view by any
          // means. Past its END is reachable only if the box scrolls that way:
          // an absolutely positioned bubble extends `scrollHeight`, so in a
          // scrolling pane it can be scrolled to, and is not cut.
          //
          // Getting this wrong in either direction is a silent gate: treating
          // every overflow as a defect reports a scrolling pane's last tooltip
          // forever, and treating none as one is how the ONE-axis version of
          // this walk passed in CI while two tooltips were invisible.
          const bad = [];
          const top = Math.round(cr.top - r.top);
          const bottom = Math.round(r.bottom - cr.bottom);
          const left = Math.round(cr.left - r.left);
          const right = Math.round(r.right - cr.right);
          if (top > 0) bad.push(`${top}px off the top`);
          if (bottom > 0 && !scrolls.test(cs.overflowY)) {
            bad.push(`${bottom}px off the bottom, in a box that cannot scroll`);
          }
          if (left > 0) bad.push(`${left}px off the left`);
          if (right > 0 && !scrolls.test(cs.overflowX)) {
            bad.push(`${right}px off the right, in a box that cannot scroll`);
          }
          return bad.length > 0 ? [`${t.textContent} (${bad.join('; ')})`] : [];
        }),
      };
    });

  const { seen, cut } = await survey();
  expect(seen).toBeGreaterThan(4);
  // Named, not counted: on failure the message is the list of hints a user
  // cannot read, which is what a human running this on demand needs.
  expect(cut).toEqual([]);

  // The same defect without a hover: an absolutely-positioned bubble hanging
  // past its scroller contributes to that scroller's scrollable overflow, so
  // the pane could be dragged sideways into empty space. Measured at 82px in
  // the layer-tree pane before this was fixed.
  const overhang = await page.evaluate(() => {
    // Scroll CONTAINERS only. A plain wrapper reports `scrollWidth` as its
    // content bounds and scrolls nowhere, so comparing the two there answers a
    // different question — the first cut did, and named seventeen elements
    // that lose nothing.
    const clips = /^(auto|scroll|hidden|clip|overlay)$/;
    const scrollers = [...document.querySelectorAll('div,aside')].filter((el) => {
      const cs = getComputedStyle(el);
      return (
        (clips.test(cs.overflowX) || clips.test(cs.overflowY)) &&
        el.querySelector('[data-sj-tip]') !== null
      );
    });
    // Causal, not correlational: a pane may scroll sideways for honest reasons
    // (a wide table, a long layer name). What must be zero is the part of that
    // range the TOOLTIPS are responsible for — measured by taking them out,
    // which is how the 82px was found in the first place.
    const blamed = scrollers.flatMap((el) => {
      const tips = [...el.querySelectorAll('[data-sj-tip]')];
      const before = el.scrollWidth;
      for (const t of tips) t.style.display = 'none';
      const after = el.scrollWidth;
      for (const t of tips) t.style.display = '';
      if (before <= after) return [];
      // Name the TOOLTIP, not just the pane. Re-hiding them one at a time says
      // which one owns the range; a bare "Properties: 90px" is a pane-sized
      // haystack, and this case is on-demand enough that a human reading the
      // failure is the whole mechanism.
      const culprits = tips
        .map((t) => {
          t.style.display = 'none';
          const drop = before - el.scrollWidth;
          t.style.display = '';
          return { text: t.textContent, drop };
        })
        .filter((c) => c.drop > 0)
        .sort((a, b) => b.drop - a.drop)
        .map((c) => `${c.text} (+${c.drop}px)`);
      const pane = el.getAttribute('aria-label') ?? el.className;
      return [
        `${pane}: ${before - after}px — ${culprits.join(', ') || 'no single tooltip accounts for it'}`,
      ];
    });
    return { scrollers: scrollers.length, blamed };
  });
  // The positive control again: zero scrollers examined would report a clean
  // result for the wrong reason.
  expect(overhang.scrollers).toBeGreaterThan(0);
  expect(overhang.blamed).toEqual([]);

  expect(pageErrors).toEqual([]);
});
