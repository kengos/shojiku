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
  const found = new Set<string>(Object.values(SECTION_TITLE_KEYS));
  for (const root of [DESIGNER_SRC, APP_SRC]) {
    for (const file of sourceFiles(root)) {
      for (const line of codeLines(file)) {
        for (const re of [/<h[1-6][^>]*>\{t\('([^']+)'\)/, /\btitle=\{t\('([^']+)'\)\}/]) {
          const match = re.exec(line);
          if (match?.[1] !== undefined) found.add(match[1]);
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
