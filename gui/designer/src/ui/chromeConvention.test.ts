// @vitest-environment node
//
// The chrome-convention gate (gui/STYLE.md § Toolbar chrome). Two rules are
// written down and both used to be violated in SHARED code, so every new
// consumer inherited the violation rather than introducing one:
//
//   1. an icon-only control conveys its tooltip through `TipBubble`, never the
//      native `title` attribute (its OS-controlled ~1s delay reads as "no
//      tooltip");
//   2. a glyph on a control is a real SVG from `ui/icons.tsx`, never a text
//      character.
//
// A component test can only pin the primitives it happens to render; this walks
// the whole package source so the NEXT surface cannot quietly reintroduce
// either shape. The walker itself is `testkit/sourceWalk.ts`, shared with the
// action-convention and ellipsis gates.

import { describe, expect, it } from 'vitest';
import {
  APP_SRC,
  codeLines,
  DESIGNER_SRC,
  hits,
  nearestOpenTag,
  sourceFiles,
} from '../testkit/sourceWalk';

// Both packages: the app host paints chrome too, and a native `title=` or a
// text glyph is no more acceptable there than here.
const ROOTS = [DESIGNER_SRC, APP_SRC];

/** The single sanctioned native `title=` on a DOM control — see the test that
 * pins it below. Kept as a constant so the rule reads as "exactly this one",
 * not as a loosened pattern. */
const TITLE_AS_DESCRIPTION = 'designer-app/src/app/EditableTitle.tsx:106';

/** True when the JSX element the line at `index` belongs to is a DOM element
 * (a lowercase tag) rather than a React component. `title` is a legitimate
 * heading PROP on `Modal`/`HelpHint`/a tutorial step; only the DOM attribute is
 * banned, and the two are indistinguishable without knowing the owning tag.
 *
 * `<iframe>` is excluded: there `title` is the element's ACCESSIBLE NAME (the
 * a11y lint REQUIRES it and rejects `aria-label` as a substitute), not a
 * tooltip on a control — the thing this guard exists to keep out of the
 * chrome. */
function onDomElement(lines: string[], index: number): boolean {
  const tag = nearestOpenTag(lines, index);
  return tag !== null && /^[a-z]/.test(tag) && tag !== 'iframe';
}

describe('chrome conventions', () => {
  it('walks the package source (the guard is never silently empty)', () => {
    const files = ROOTS.flatMap((root) => sourceFiles(root));
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.includes('designer-app/'))).toBe(true);
    expect(files.some((f) => f.endsWith('TipBubble.tsx'))).toBe(true);
  });

  it('blanks commented-out prose so a comment about a banned shape does not count', () => {
    // The helper is what keeps this suite from flagging its own documentation;
    // pin both comment forms rather than trusting them implicitly.
    const bubble = sourceFiles(DESIGNER_SRC).find((f) => f.endsWith('TipBubble.tsx')) ?? '';
    expect(codeLines(bubble).some((l) => l.includes('title'))).toBe(false);
  });

  it('conveys no tooltip through the native title attribute', () => {
    expect(hits(ROOTS, /(^|\s)title=/, onDomElement)).toEqual([TITLE_AS_DESCRIPTION]);
  });

  it('still lets the document-title button carry its accessible DESCRIPTION', () => {
    // The one documented exception, and until this gate was widened to the app
    // package it was "enforced" only by nothing looking at it. Pinned like the
    // iframe exclusion: the button's VISIBLE TEXT is its accessible name (WCAG
    // label-in-name — a voice-control user activates it by saying the title),
    // so the rename hint has to ride `title` as a description; an `aria-label`
    // would REPLACE the name instead of describing it.
    const [file, line] = TITLE_AS_DESCRIPTION.split(':');
    expect(file).toBe('designer-app/src/app/EditableTitle.tsx');
    expect(Number(line)).toBeGreaterThan(0);
  });

  it('still allows an iframe its accessible name (the a11y lint demands it)', () => {
    // The exclusion is deliberate, so it is pinned: were it dropped, the PDF
    // preview frame would have to choose between two failing gates.
    const iframeTitles = hits(ROOTS, /(^|\s)title=/, (lines, index) => !onDomElement(lines, index));
    expect(iframeTitles.some((h) => h.includes('pdf/PdfPreviewModal.tsx:'))).toBe(true);
  });

  it('draws control glyphs as SVG icons, never text characters', () => {
    // The characters that stood in for icons before the sweep — plus their
    // near neighbours, because an additions-only list is how this rule keeps
    // getting re-broken: the sweep's own first pass listed the item-type marks
    // but not the ▤ on the tree's document-root row one element above them, and
    // only a live look found it. The breadcrumb's CSS `content:'›'` separator
    // is deliberately absent: it is a separator, not a control's icon.
    //
    // The message catalogs are exempt — they hold translated PROSE, never
    // chrome markup, and several of these characters are ordinary in it (the
    // char_grid mark 囲 is the kanji in 範囲, which every range diagnostic uses).
    const glyph = /[✓✔✕✖✗✘▾▿▴▵▸▹◂◃▭▬▮▯╱╲▦▧▨▩▤▥№▣▢⬚⬛⬜⊞⊟⊠≣≡⤓⤒囲◯◉●○☑☐☒❘❙❚◇◆★☆■□•]/u;
    expect(hits(ROOTS, glyph, (_lines, _index, file) => !file.includes('/i18n/catalog/'))).toEqual(
      [],
    );
  });
});
