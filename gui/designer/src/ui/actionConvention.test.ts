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
//      outlined button, including the confirm for both Save and Export.
//
// Neither rule is visible to tsc, Biome, or a render test: every violating file
// was valid TSX that rendered a working button.

import { describe, expect, it } from 'vitest';
import {
  APP_SRC,
  codeLines,
  DESIGNER_SRC,
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
// covering more than it does: this ranks `footer={…}` props. A dialog placing
// its confirming action in the BODY is not seen — today that is the
// restore-points dialog, which is also where two fills can appear at once (its
// capture button plus an armed row's restore). Pre-existing; gui/STYLE.md
// § Actions carries the note.
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
