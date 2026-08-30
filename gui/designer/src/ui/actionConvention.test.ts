// @vitest-environment node
//
// The action-convention gate (gui/STYLE.md § Actions: emphasis and the
// ellipsis). Two rules, both source-walked, both previously broken in ways no
// component test could see because each violation was individually plausible:
//
//   1. the FILLED accent is minted in exactly one place — `ui/Button.tsx`'s
//      `primary` variant. Five controls had hand-rolled the same class string,
//      so `grep 'variant="primary"'` under-reported the real emphasis surface
//      by more than half;
//   2. a dialog's footer is built from the `Button` primitive and carries
//      EXACTLY ONE primary (Material 3: one primary per screen; filled >
//      outlined > text, and never as interchangeable cosmetics). Six of
//      thirteen footers painted their confirming action as a merely-larger
//      outlined button, including the confirm for both Save and Export;
//
//   3. a primary lives ONLY in a dialog footer — the WORK SURFACE (toolbar,
//      menubar, property panel, layer tree, canvas) carries none. Rule 2 ranks
//      what is inside a `footer={…}`; nothing ranked what is outside one, so a
//      filled button added to the toolbar or the panel passed every check.
//      This is that complement, pinned against an exact list of sanctioned
//      out-of-footer primaries.
//
// None of the three is visible to tsc, Biome, or a render test: every violating
// file was valid TSX that rendered a working button.

import { describe, expect, it } from 'vitest';
import {
  APP_SRC,
  codeLines,
  DESIGNER_SRC,
  GUI_ROOT,
  hits,
  nearestOpenTag,
  sourceFiles,
} from '../testkit/sourceWalk';

const ROOTS = [DESIGNER_SRC, APP_SRC];

/** The filled accent: an UNPREFIXED `bg-accent` (so `aria-checked:bg-accent`
 * and friends — toggle STATE, not emphasis — are not this rule's business, nor
 * is the tinted `bg-accent/15`) beside `text-on-accent` on the same line. */
const FILLED_ACCENT = /(?<![:\w-])bg-accent(?![\w/-])/;

/** True when the line at `index` sits on a `<button>` opening tag. A filled
 * accent on a `<span>` is a BADGE (the advisory pill, the loading dot) — not a
 * control, and not what the emphasis hierarchy ranks. */
function onButtonTag(lines: string[], index: number): boolean {
  return nearestOpenTag(lines, index) === 'button';
}

/** Every `footer={ … }` prop body in `file`, brace-balanced, read from the
 * COMMENT-BLANKED source so prose inside a footer cannot trip the rule. */
function footerSlices(file: string): string[] {
  const text = codeLines(file).join('\n');
  const found: string[] = [];
  for (const match of text.matchAll(/\bfooter=\{/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    let i = open;
    while (i < text.length) {
      if (text[i] === '{') depth += 1;
      if (text[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
      i += 1;
    }
    found.push(text.slice(open + 1, i));
  }
  return found;
}

/** `[gui-relative path, slice]` for every dialog footer in the two packages. */
function everyFooter(): [string, string][] {
  const found: [string, string][] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = codeLines(file).join('\n');
      if (!text.includes('<Modal') && !text.includes('<Offcanvas')) continue;
      for (const slice of footerSlices(file)) {
        found.push([file.slice(DESIGNER_SRC.length), slice]);
      }
    }
  }
  return found;
}

describe('the filled accent is minted in one place', () => {
  it('walks BOTH packages (the guard is never silently empty)', () => {
    // The app host is read as well as the component package: a rule about a
    // shared PRIMITIVE has to hold wherever chrome is painted.
    const files = ROOTS.flatMap((root) => sourceFiles(root));
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('ui/Button.tsx'))).toBe(true);
    expect(files.some((f) => f.includes('designer-app/'))).toBe(true);
  });

  it('matches a hand-rolled control (a green zero would otherwise prove nothing)', () => {
    // The positive control. Every assertion below is an expected-EMPTY sweep,
    // and an empty sweep and a broken pattern look identical — so pin that the
    // pattern still recognises the exact shape this rule was written against.
    const handRolled =
      '  className="cursor-pointer rounded-md border border-accent bg-accent px-2 py-1 text-on-accent"';
    expect(FILLED_ACCENT.test(handRolled) && handRolled.includes('text-on-accent')).toBe(true);
  });

  it('does not match a state-prefixed accent, nor the tinted one', () => {
    // Pinned because dropping either exclusion reddens shipped, correct code:
    // the align/format toggles paint `aria-checked:bg-accent`, and the
    // container picker's chosen cell is `bg-accent/15`.
    expect(FILLED_ACCENT.test('aria-checked:bg-accent aria-checked:text-on-accent')).toBe(false);
    expect(FILLED_ACCENT.test('border-accent bg-accent/15 text-accent')).toBe(false);
  });

  it('leaves a non-interactive BADGE alone (it is not in the emphasis ranking)', () => {
    // The advisory pill is a filled-accent `<span>` INSIDE a button, and is
    // deliberately filled so an engine diagnostic and a Designer reading are
    // separable at a glance. A rule keyed on the line alone would flag it.
    const badges = hits(
      ROOTS,
      FILLED_ACCENT,
      (lines, index, file) =>
        (lines[index] ?? '').includes('text-on-accent') &&
        !onButtonTag(lines, index) &&
        !file.endsWith('ui/Button.tsx'),
    );
    expect(badges.some((h) => h.includes('diagnostics/AdvisoryRow.tsx:'))).toBe(true);
  });

  it('composes the filled accent on no <button> outside ui/Button.tsx', () => {
    // Deliberately NOT also requiring `text-on-accent` on the line: the two
    // tokens live in one className string that the formatter may wrap apart,
    // and a rule that needed both on one line would go quiet exactly when the
    // string got long. Measured over the tree, the looser predicate flags
    // nothing extra — the only unprefixed `bg-accent` outside `ui/Button.tsx`
    // sits on a progress bar and a status dot, neither of them a control.
    expect(
      hits(
        ROOTS,
        FILLED_ACCENT,
        (lines, index, file) => onButtonTag(lines, index) && !file.endsWith('ui/Button.tsx'),
      ),
    ).toEqual([]);
  });
});

// SCOPE, stated because a gate that does not name its blind spot reads as
// covering more than it does: this describe ranks what is INSIDE a `footer={…}`
// prop. What sits outside one is rule 3's business, below.
describe('a dialog footer ranks its actions', () => {
  it('finds every dialog footer (the guard is never silently empty)', () => {
    const footers = everyFooter();
    expect(footers.length).toBeGreaterThanOrEqual(12);
    expect(footers.every(([, slice]) => slice.trim().length > 0)).toBe(true);
    expect(footers.some(([file]) => file.endsWith('review/SaveReviewModal.tsx'))).toBe(true);
  });

  it('builds every footer from the Button primitive', () => {
    const raw = everyFooter().filter(
      ([, slice]) => slice.includes('<button') || /\bBTN(_SM)?\b/.test(slice),
    );
    expect(raw.map(([file]) => file)).toEqual([]);
  });

  it('gives every footer exactly one primary (Material 3: one per screen)', () => {
    const wrong = everyFooter()
      .map(([file, slice]) => [file, slice.split('variant="primary"').length - 1] as const)
      .filter(([, count]) => count !== 1);
    expect(wrong).toEqual([]);
  });
});

/** A primary as it is actually AUTHORED — the literal prop, and the prop whose
 * expression selects it (the restore-points capture button steps down while a
 * row's restore is armed). A rule about a visual role has to enumerate every
 * spelling of that role, not the one it was written against.
 *
 * A single-quoted JSX attribute (`variant='primary'`) is not matched, and that
 * is safe in both directions: Biome's `jsxQuoteStyle` defaults to double, so
 * the spelling cannot survive `gui:lint`, and if it somehow did, rule 3b below
 * would report it as a token off a `variant=` — this fails CLOSED, never open. */
const PRIMARY_VARIANT = /\bvariant=(?:"primary"|\{[^}]*['"]primary['"])/;

/** The bare emphasis TOKEN. Rule 3b below requires every one of these to sit on
 * a `variant=`, so hiding the fill behind an indirection (`const e = … ?
 * 'primary' : …`) cannot make it invisible to `PRIMARY_VARIANT`. */
const PRIMARY_TOKEN = /['"]primary['"]/;

/** The `'primary'` tokens that are not an emphasis at all: the variant UNION
 * that defines the word, and the font-pack TIER, which is a homonym (a pack is
 * primary- or lazy-tier). Exact `path:line`, so the homonym is declared rather
 * than pattern-excluded. */
const NOT_AN_EMPHASIS = [
  'designer/src/ui/Button.tsx:11',
  'designer-app/src/assets/manifest.ts:66',
  'designer-app/src/build/assemble.ts:49',
  'designer-app/src/engine/boot.ts:119',
];

/** The primaries that deliberately sit OUTSIDE a dialog footer, as exact
 * `path:line` — the same form as the chrome gate's one sanctioned `title=`, so
 * the rule reads as "exactly these", never as a loosened pattern.
 *
 *  - the EMPTY-STATE CTA: with no body items it is the only thing on the page,
 *    so it is that screen's primary rather than one voice among peers;
 *  - the RESTORE-POINTS dialog, which has no `footer` at all — its capture
 *    control belongs beside the name input it commits. Its one-fill-at-a-time
 *    rule is runtime state (arming a row's restore steps the capture button
 *    down), which no source walk can see; `SnapshotDialog.test.tsx` pins it.
 */
const OUTSIDE_A_FOOTER = [
  'designer/src/shell/CanvasArea.tsx:154',
  'designer-app/src/app/SnapshotDialog.tsx:109',
  'designer-app/src/app/SnapshotList.tsx:66',
];

/** The line indices of `file` that fall inside some `footer={…}` prop body,
 * brace-balanced over the COMMENT-BLANKED source. Line-keyed rather than
 * offset-keyed so it composes with `hits`, which reports `path:line`. */
function footerLines(file: string): Set<number> {
  const lines = codeLines(file);
  const text = lines.join('\n');
  const covered = new Set<number>();
  for (const match of text.matchAll(/\bfooter=\{/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    let i = open;
    while (i < text.length) {
      if (text[i] === '{') depth += 1;
      if (text[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
      i += 1;
    }
    const from = text.slice(0, open).split('\n').length - 1;
    const to = text.slice(0, i).split('\n').length - 1;
    for (let line = from; line <= to; line += 1) covered.add(line);
  }
  return covered;
}

const footerLineCache = new Map<string, Set<number>>();

function outsideAFooter(_lines: string[], index: number, file: string): boolean {
  let covered = footerLineCache.get(file);
  if (covered === undefined) {
    covered = footerLines(file);
    footerLineCache.set(file, covered);
  }
  return !covered.has(index);
}

describe('a primary lives only in a dialog footer', () => {
  it('recognises every spelling of the prop, and only the prop', () => {
    // The positive control for an otherwise expected-EMPTY sweep: a broken
    // pattern and a clean tree are the same green.
    expect(PRIMARY_VARIANT.test('<Button variant="primary" onClick={x}>')).toBe(true);
    expect(PRIMARY_VARIANT.test("variant={confirmId === null ? 'primary' : 'default'}")).toBe(true);
    expect(PRIMARY_VARIANT.test('<Button variant="default" onClick={x}>')).toBe(false);
  });

  it('finds the primaries at all (the guard is never silently empty)', () => {
    expect(hits(ROOTS, PRIMARY_VARIANT).length).toBeGreaterThanOrEqual(15);
  });

  it('does not report a primary that IS in a footer', () => {
    // The positive control for `footerLines` itself — an expected-empty sweep
    // over an always-true predicate would pass just as green.
    const inFooter = hits(
      ROOTS,
      PRIMARY_VARIANT,
      (lines, index, file) => !outsideAFooter(lines, index, file),
    );
    expect(inFooter.some((h) => h.includes('review/SaveReviewModal.tsx:'))).toBe(true);
  });

  it('places every primary outside a footer on the sanctioned list', () => {
    expect(hits(ROOTS, PRIMARY_VARIANT, outsideAFooter)).toEqual(OUTSIDE_A_FOOTER);
  });

  it('keeps that list honest — each entry still carries a primary', () => {
    // Without this an exception decays into an alibi: the line moves, the rule
    // still passes, and the list now sanctions something that is not there.
    for (const entry of OUTSIDE_A_FOOTER) {
      const [path, line] = entry.split(':');
      const source = codeLines(`${GUI_ROOT}${path}`);
      expect(PRIMARY_VARIANT.test(source[Number(line) - 1] ?? ''), entry).toBe(true);
    }
  });

  it('hides no primary behind an indirection', () => {
    // Rule 3b: the emphasis token appears on a `variant=` or on the declared
    // homonym list. A `const e = cond ? 'primary' : 'default'` read three lines
    // above the JSX would otherwise be invisible to `PRIMARY_VARIANT`.
    const stray = hits(
      ROOTS,
      PRIMARY_TOKEN,
      (lines, index) => !PRIMARY_VARIANT.test(lines[index] ?? ''),
    );
    expect(stray).toEqual(NOT_AN_EMPHASIS);
  });
});
