// @vitest-environment node
//
// The ellipsis gate (gui/STYLE.md § Actions: emphasis and the ellipsis).
//
// Apple HIG: a control whose label ends in `…` opens another view and asks for
// more; one without it acts immediately. Two consequences are mechanically
// checkable, and each caught a real defect:
//
//   1. the ellipsis is a property of the ACTION, not of the language — so the
//      set of chrome keys carrying it must be IDENTICAL in every catalog. It
//      was not: `panel.visible.title` read "Show only when…" in en and fil
//      against a noun phrase (表示する条件 / 显示条件 / …) in the other four;
//   2. it therefore belongs on a control and nowhere else. That same key is an
//      `<h3>` SECTION HEADING, so two of six locales were promising a dialog
//      that no heading can open.
//
// NOT every trailing `…` is a control label: a progress or placeholder string
// ("Saving…", "Paste here…") uses it in its ordinary sense and is exempt from
// the HIG reading by being neither a control nor a heading. Rule 1 covers them
// anyway — a status string's ellipsis must still be consistent across locales —
// which is why this gate keys on PARITY and on HEADINGS rather than trying to
// classify a key as a control.
//
// (Node env: rule 2 reads the package source off disk.)

import { describe, expect, it } from 'vitest';
import { SECTION_TITLE_KEYS } from '../panel/docSections';
import { APP_SRC, codeLines, DESIGNER_SRC, sourceFiles } from '../testkit/sourceWalk';
import { DEFAULT_CATALOG } from './catalog';

/** A label that PROMISES another view: the value ends in an ellipsis. Keyed on
 * "ends with", never "contains" — a value quoting an ellipsis mid-sentence is
 * ordinary prose, and a gate that flagged it would be relaxed into uselessness. */
function promisesAView(value: string): boolean {
  return value.trimEnd().endsWith('…');
}

function ellipsisKeys(lang: string): string[] {
  return Object.entries(DEFAULT_CATALOG[lang].chrome)
    .filter(([, value]) => promisesAView(value))
    .map(([key]) => key)
    .sort();
}

/** Every chrome key NAMED as a title, whether or not a source line shows it.
 *
 * The walk below reads EVERY `t('key')` inside a `title={…}` prop, not the
 * first — the create/edit forms pick theirs with a ternary
 * (`title={isCreate ? t('styles.newStyle') : t('styles.editTitle')}`), and a
 * walker that stopped at the first match saw neither arm.
 *
 * Seven sites still reach a `Modal`/`HelpHint` title through a VARIABLE and are
 * invisible to any line-based walker: `labels.title` (the tutorial launcher,
 * whose bare `tutorial.title` is what makes `Tutorial…` → "Tutorial" the HIG
 * pair), `currentStep.title` (the coach mark), the composed
 * `` t(`help.${topic}.title`) `` at two sites, `t(keys.title)` (the review
 * pane), `t(titleKey)` at two more, and `sectionTitle` (the box section). The
 * `.title` NAMING CONVENTION covers those — 44 keys today, none carrying an
 * ellipsis, so it ships green rather than as a repair.
 *
 * It does NOT cover everything: `styles.newStyle` / `styles.editTitle` /
 * `formats.newFormat` / `formats.editTitle` end in neither `.title` nor a
 * variable, and are reachable only because the walk now reads both ternary
 * arms. Say that rather than claiming the convention catches whatever the
 * regex misses — it is the regex that catches those four.
 *
 * The two openers that double as their own dialog's title — `shortcuts.title`
 * and `glossary.title` — are in this set deliberately: gui/STYLE.md § Actions
 * says giving either an ellipsis costs a key split, and this is the gate that
 * would say so. */
function titleConventionKeys(): string[] {
  return Object.keys(DEFAULT_CATALOG.en.chrome).filter((key) => key.endsWith('.title'));
}

/** Every chrome key rendered as a heading, across BOTH packages:
 *
 *  - the single-line `<hN …>{t('key')}` shape the panel uses throughout;
 *  - a `<Modal>`/`<Offcanvas>` `title={t('key')}`. Headless UI's `DialogTitle`
 *    renders an `<h2>`, so a dialog title IS a heading — and it is the heading
 *    most at risk, because the HIG's other half wants it to match the label
 *    that opened it (which DOES carry the ellipsis). A regex over `<hN>` alone
 *    cannot see it: the tag is a component and the value arrives as a prop.
 *  - the document-settings rail's indirect table, imported rather than parsed
 *    (it is a plain exported const).
 */
function headingKeys(): string[] {
  const found = new Set<string>([...Object.values(SECTION_TITLE_KEYS), ...titleConventionKeys()]);
  for (const root of [DESIGNER_SRC, APP_SRC]) {
    for (const file of sourceFiles(root)) {
      for (const line of codeLines(file)) {
        const heading = /<h[1-6][^>]*>\{t\('([^']+)'\)/.exec(line);
        if (heading?.[1] !== undefined) found.add(heading[1]);
        for (const prop of line.matchAll(/\btitle=\{([^}]*)/g)) {
          for (const call of (prop[1] ?? '').matchAll(/\bt\('([^']+)'/g)) {
            if (call[1] !== undefined) found.add(call[1]);
          }
        }
      }
    }
  }
  return [...found].sort();
}

describe('the ellipsis is a property of the action', () => {
  it('reads a trailing ellipsis, not a quoted one', () => {
    // The predicate is the whole rule; pin both directions rather than trusting
    // an expected-empty sweep, which a broken predicate satisfies for free.
    expect(promisesAView('Download as PDF…')).toBe(true);
    expect(promisesAView('Type … to continue typing')).toBe(false);
  });

  it('finds the ellipsis labels at all (the guard is never silently empty)', () => {
    expect(ellipsisKeys('en').length).toBeGreaterThanOrEqual(20);
  });

  it('carries the same ellipsis key set in every catalog', () => {
    const base = ellipsisKeys('en');
    for (const lang of Object.keys(DEFAULT_CATALOG)) {
      expect(ellipsisKeys(lang), `${lang} ellipsis labels`).toEqual(base);
    }
  });
});

describe('no heading promises a view', () => {
  it('finds the headings at all (the guard is never silently empty)', () => {
    const keys = headingKeys();
    expect(keys.length).toBeGreaterThanOrEqual(20);
    expect(keys).toContain('panel.visible.title');
  });

  it('reads BOTH arms of a ternary title', () => {
    // The create/edit forms choose their title with `isCreate ? … : …`. A walker
    // that stopped at the first match on the line saw neither arm, and these
    // four keys end in neither `.title` nor a variable — so nothing else in this
    // file reaches them.
    const keys = headingKeys();
    for (const key of [
      'styles.newStyle',
      'styles.editTitle',
      'formats.newFormat',
      'formats.editTitle',
    ]) {
      expect(keys, `${key} is rendered as a dialog title`).toContain(key);
    }
  });

  it('covers the titles that arrive through a variable', () => {
    // The source walk cannot follow `labels.title` or a composed
    // `` `help.${topic}.title` ``; the naming convention is what does. Pinned
    // by NAME, because an expected-empty offender sweep passes just as green
    // whether these keys are in the set or not.
    const keys = headingKeys();
    expect(titleConventionKeys().length).toBeGreaterThanOrEqual(40);
    expect(keys).toContain('tutorial.title');
    expect(keys).toContain('help.content.title');
    expect(keys).toContain('review.save.title');
  });

  it('renders no ellipsis label as a heading, in any language', () => {
    const headings = new Set(headingKeys());
    const offenders: string[] = [];
    for (const lang of Object.keys(DEFAULT_CATALOG)) {
      for (const key of ellipsisKeys(lang)) {
        if (headings.has(key)) offenders.push(`${lang}:${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The HIG rule's SECOND half: "the dialog's title then matches the label that
// opened it, minus the ellipsis". A copy fix alone leaves nothing stopping the
// next pair from drifting, so the rule ships as a table whose COMPLEMENT is
// checked too — every ellipsis label must be classified, either as a titled
// pair or as an exemption carrying its reason. That is the same shape
// `ui/actionConvention.test.ts` uses for the emphasis rule, and it is why this
// is a red gate rather than a design-time read.

/** Opener label key → the title key of the view it opens. Asserted in EVERY
 * catalog, because the ellipsis is a property of the action, not of the
 * language (see the parity rule above) — and so is the pairing.
 *
 * `insert.saveBlock` and `contextMenu.saveBlock` both mount `BlockDialog`: one
 * dialog cannot match two different labels, which is why those two labels are
 * deliberately identical rather than accidentally duplicated.
 *
 * What this does NOT cover, said out loud because the green would otherwise
 * imply it: the walk starts from labels that ALREADY carry an ellipsis, so a
 * label that should have one and does not is invisible to it. Running
 * gui/STYLE.md's own predicate ("an opener earns the ellipsis by ASKING") over
 * the tree finds four such labels today — `copilot.open` "Ask AI",
 * `panel.columns.editSheet` "Edit in a sheet", `styles.newStyle` "New style"
 * and `formats.newFormat` "New format", each opening a view that asks for a
 * name or a prompt. That is the FIRST half's question — which labels earn the
 * ellipsis — and gui/STYLE.md § Actions decides it per label. Four is what the
 * predicate returned, not a claim that there is no fifth. */
const OPENER_TITLES: Readonly<Record<string, string>> = {
  'insert.container': 'containerPicker.title',
  'insert.field': 'field.title',
  'insert.iterable': 'iterable.title',
  'insert.manageBlock': 'block.manage.title',
  'insert.paste': 'paste.title',
  'insert.saveBlock': 'block.title',
  'contextMenu.saveBlock': 'block.title',
  'field.create.tail': 'field.title',
  'menu.dataEditor': 'data.editorTitle',
  'menu.documentSettings': 'docSettings.title',
  'menu.help.tutorial': 'tutorial.title',
  'menu.pdf': 'pdf.title',
  'styleCapture.fromSelection': 'styleCapture.createTitle',
  'styleCapture.updateFrom': 'styleCapture.updateTitle',
};

/** The openers with no titled view to match, each with the reason. A reason is
 * required so the exemption stays a decision rather than a place to park a
 * failure. */
const EXEMPT: Readonly<Record<string, string>> = {
  // Ordinary-sense ellipsis: a progress or placeholder string, not a control.
  'copilot.busy': 'progress string',
  'pdf.notice.rendering': 'progress string',
  'title.saving': 'progress string',
  'paste.placeholder': 'placeholder text',
  // Opens the host/OS file picker, which the Designer does not title.
  'menu.open': 'host file picker',
  'insert.image': 'host file picker',
  'panel.image.replace': 'host file picker',
  // Opens something with no title to match.
  'contextMenu.border': 'anchored popover, no title',
  'formats.writePattern': 'reveals an inline field in place',
  // A `<select>` option, not a control label.
  'pageSetup.custom': 'select option that reveals inline size fields',
  'panel.line.pickItem': 'select placeholder option',
  'panel.ellipse.pickItem': 'select placeholder option',
  // Interstitial: the review pane titles the REVIEW it is asking for, and the
  // label reappears verbatim on the confirming action. Self-checked below, so
  // this reason cannot quietly become a free pass.
  'app.save': 'interstitial review; the confirm carries the label',
  'menu.export': 'interstitial review; the confirm carries the label',
  // The destination lives in `gui/designer-app`; the pair is gated there
  // (`i18n/appCatalog.test.ts`), which is the only package that can see both.
  'menu.addFont': 'destination titled in designer-app',
  'menu.snapshots': 'destination titled in designer-app',
};

/** The interstitial exemption's own check: opener → the confirming action. */
const INTERSTITIAL_CONFIRMS: Readonly<Record<string, string>> = {
  'app.save': 'review.confirm.save',
  'menu.export': 'review.confirm.export',
};

function withoutEllipsis(value: string): string {
  return value.trimEnd().replace(/…$/, '').trimEnd();
}

/** The pair walk itself, over ONE language's chrome — a named function so the
 * positive control below can run it against a deliberately broken catalog. */
function unpairedIn(chrome: Record<string, string>, lang: string): string[] {
  return Object.entries(OPENER_TITLES)
    .filter(([opener, titleKey]) => withoutEllipsis(chrome[opener] ?? '') !== chrome[titleKey])
    .map(([opener, titleKey]) => `${lang}:${opener} → ${titleKey}`);
}

describe('a dialog title matches the label that opened it', () => {
  it('classifies every ellipsis label exactly once', () => {
    const classified = new Set([...Object.keys(OPENER_TITLES), ...Object.keys(EXEMPT)]);
    expect(classified.size).toBe(Object.keys(OPENER_TITLES).length + Object.keys(EXEMPT).length);
    expect(ellipsisKeys('en').filter((key) => !classified.has(key))).toEqual([]);
    // The other direction: a table entry for a label that no longer carries an
    // ellipsis is stale, and stale is how a table stops describing the app.
    const ellipsis = new Set(ellipsisKeys('en'));
    expect([...classified].filter((key) => !ellipsis.has(key)).sort()).toEqual([]);
  });

  it('finds the pairs at all (the guard is never silently empty)', () => {
    expect(Object.keys(OPENER_TITLES).length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(EXEMPT).length).toBeGreaterThanOrEqual(12);
  });

  it('states a reason for every exemption', () => {
    expect(Object.entries(EXEMPT).filter(([, reason]) => reason.trim() === '')).toEqual([]);
  });

  it('titles the view with the opener’s label, in every language', () => {
    const offenders = Object.keys(DEFAULT_CATALOG).flatMap((lang) =>
      unpairedIn(DEFAULT_CATALOG[lang].chrome, lang),
    );
    expect(offenders).toEqual([]);
  });

  it('would catch one (the positive control for an expected-empty sweep)', () => {
    // Run the REAL walk over a catalog with one title broken. An expected-empty
    // offender list passes just as green when the walk reaches nothing, so the
    // control has to exercise the same function rather than assert around it.
    const broken = { ...DEFAULT_CATALOG.en.chrome, 'containerPicker.title': 'Something else' };
    expect(unpairedIn(broken, 'en')).toEqual(['en:insert.container → containerPicker.title']);
    // A key that goes MISSING is caught too, rather than silently skipped.
    const gone = { ...DEFAULT_CATALOG.en.chrome };
    delete gone['menu.pdf'];
    expect(unpairedIn(gone, 'en')).toEqual(['en:menu.pdf → pdf.title']);
  });

  it('makes the interstitial exemption carry the label on its confirm', () => {
    // `Save…` does not title its view "Save" — it opens a review pane titled
    // for the review. The pair is honoured on the CONFIRMING action instead,
    // and that is what keeps this exemption honest.
    const offenders: string[] = [];
    for (const lang of Object.keys(DEFAULT_CATALOG)) {
      const chrome = DEFAULT_CATALOG[lang].chrome;
      for (const [opener, confirm] of Object.entries(INTERSTITIAL_CONFIRMS)) {
        if (withoutEllipsis(chrome[opener] ?? '') !== chrome[confirm]) {
          offenders.push(`${lang}:${opener} → ${confirm}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
