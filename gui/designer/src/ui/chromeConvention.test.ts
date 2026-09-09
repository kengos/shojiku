// @vitest-environment node
//
// The chrome-convention gate (gui/STYLE.md § Toolbar chrome). Three rules are
// written down and each used to be violated in SHARED code, so every new
// consumer inherited the violation rather than introducing one:
//
//   1. an icon-only control conveys its tooltip through `TipBubble`, never the
//      native `title` attribute (its OS-controlled ~1s delay reads as "no
//      tooltip");
//   2. a glyph on a control is a real SVG from `ui/icons.tsx`, never a text
//      character;
//   3. the thin rule between two toolbar groups is minted in `ui/Sep.tsx` and
//      nowhere else. Four hand-rolled copies had drifted into two margin
//      spellings, and only one of the four was `aria-hidden` — so the bar an
//      author read to copy the convention from depended on which file they
//      opened. Same shape as `actionConvention`'s rule 1 for the filled accent.
//
// A component test can only pin the primitives it happens to render; this walks
// the whole package source so the NEXT surface cannot quietly reintroduce
// any of them. The walker itself is `testkit/sourceWalk.ts`, shared with the
// action-convention and ellipsis gates.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

/** The designer's own stylesheet — read directly, because no test environment
 * applies it and the property below is the rules' ORDER within it. */
const STYLES = fileURLToPath(new URL('../styles.css', import.meta.url));

/** The ONE place `--sj-*` tokens are bridged into Tailwind colour names. */
const TAILWIND_CSS = fileURLToPath(
  new URL('../../../designer-app/src/tailwind.css', import.meta.url),
);

/** The single sanctioned native `title=` on a DOM control — see the test that
 * pins it below. Kept as a constant so the rule reads as "exactly this one",
 * not as a loosened pattern. */
const TITLE_AS_DESCRIPTION = 'designer-app/src/app/EditableTitle.tsx:106';

/** The ONE file the toolbar group rule may be authored in. Kept as a constant
 * for the same reason as the title exception above: the rule reads as "exactly
 * this one", not as a pattern that happens to match little. The FILE, not a
 * `file:line` — a hit list pinned to a line number turns every comment edit in
 * `Sep.tsx` into a red gate, which is how a real rule gets relaxed. */
const SEP_MINT_FILE = 'designer/src/ui/Sep.tsx';

/** A `w-px` box tinted `bg-border` on one line IS the group rule; there is no
 * other reason to author a one-pixel-wide tinted box. Both orders, because a
 * class list has no canonical order. */
const GROUP_RULE = /\bw-px\b.*\bbg-border\b|\bbg-border\b.*\bw-px\b/;

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

  it('mints the toolbar group rule in exactly one file', () => {
    const found = hits(ROOTS, GROUP_RULE);
    // Exactly one authored rule, and it is `ui/Sep.tsx`'s. Asserting the COUNT
    // as well as the file is what keeps a second copy from hiding beside the
    // first.
    expect(found).toHaveLength(1);
    expect(found[0]?.startsWith(`${SEP_MINT_FILE}:`)).toBe(true);
  });

  it('reads a hand-rolled copy (the positive control for the sweep)', () => {
    // The sweep asserts a ONE-element list, so a walk that reached nothing would
    // fail loudly rather than pass. What still needs pinning is that the PATTERN
    // recognises the shape it is policing: the two pre-extraction spellings
    // (they differed in margin and in `aria-hidden`), plus a reversed class
    // order, since a class list has none.
    for (const handRolled of [
      '<span className="mx-1 h-5 w-px shrink-0 bg-border" />',
      '<span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />',
      '<span className="bg-border h-5 w-px" />',
    ]) {
      expect(GROUP_RULE.test(handRolled), handRolled).toBe(true);
    }
    // And that it does NOT sweep in an ordinary hairline border.
    expect(GROUP_RULE.test('<div className="border-border border-b" />')).toBe(false);
  });

  it('resets every list, because no preflight does it for us', () => {
    // Tailwind's preflight is deliberately NOT imported (the legacy sheets
    // expect UA defaults), so a `<ul>` keeps the browser's disc markers and its
    // 40px indent unless the element says otherwise. Every list in the package
    // says so — except one, which shipped with bullets down the side of the
    // property panel and a 40px gutter, past a green line budget, Biome, tsc
    // and 100%x4 coverage, because nothing in a repo reads CSS. A LIVE look
    // found it; this is what a live look should not have to find twice.
    //
    // TWO defaults, not one, and a rule that names only the marker leaves the
    // other live: `list-none` kills the disc, `p-0` kills the 40px indent, and
    // `flex` kills the marker alone by making each child a flex item. So the
    // predicate asks for the marker to be handled AND the padding to be, which
    // is what the fix itself had to write.
    //
    // `<ol>` is in the population too. Nothing in the package needed fixing —
    // all three comply — but the class is "an HTML list", not "a `<ul>`", and a
    // rule scoped to the tag it happened to be written for is one `<ol>` away
    // from silence.
    const LIST_TAG = /<(?:ul|ol)\b/;
    // Any utility that sets the INLINE-START padding clears the UA indent, not
    // just `p-0`: `p-4`, `px-2` and `pl-3` all do. `pt-`/`pb-`/`py-` do not, and
    // the character class is what keeps them out — a first cut accepting only
    // `p-0` reported three compliant app lists as violations.
    const handled = (tag: string) =>
      (/\blist-none\b/.test(tag) || /\bflex\b/.test(tag)) && /\bp[xls]?-\d/.test(tag);
    const lists = hits(
      ROOTS,
      LIST_TAG,
      (lines, index) => !handled(lines.slice(index, index + 4).join(' ')),
    );
    expect(lists).toEqual([]);

    // A POSITIVE CONTROL, the shape the sibling rules above already carry: the
    // predicate must RECOGNISE the thing it polices, or an empty result means
    // only that the pattern matched nothing.
    expect(LIST_TAG.test('<ul className="mb-2 rounded-md border border-border">')).toBe(true);
    expect(LIST_TAG.test('<ol className="m-0 flex list-none p-0">')).toBe(true);
    expect(handled('<ul className="mb-2 rounded-md border">')).toBe(false);
    // The marker handled and the INDENT left behind — the half a marker-only
    // rule would pass.
    expect(handled('<ul className="list-none">')).toBe(false);
    expect(handled('<ul className="m-0 list-none p-0">')).toBe(true);
    expect(handled('<ul className="m-0 flex list-none p-0">')).toBe(true);
    // A non-zero inline padding clears the indent just as well.
    for (const pad of ['p-4', 'px-2', 'pl-3']) {
      expect(handled(`<ul className="m-0 list-none ${pad}">`), pad).toBe(true);
    }
    // …and the axes that do NOT touch inline-start must not count.
    for (const pad of ['pt-2', 'pb-2', 'py-2']) {
      expect(handled(`<ul className="m-0 list-none ${pad}">`), pad).toBe(false);
    }
  });

  it('names only theme tokens in its semantic colour utilities', () => {
    // A Tailwind utility naming a colour the theme does not define compiles to
    // NOTHING — no class, no error, no warning. `bg-accent-bg` did exactly
    // that: the selected fragment row got no background at all, kept the
    // browser's `ButtonFace` grey (no preflight is imported), and rendered
    // near-white text on it.
    //
    // The population is the `-bg` / `-text` SEMANTIC PAIRS this repo names its
    // tokens with (`error-bg`, `warn-text`, `diff-add-bg`…). Restricting to
    // that suffix is what keeps `text-sm` and `border-0` out of the sweep,
    // which is why the rule is worth having rather than merely tempting.
    //
    // It is therefore a PARTIAL rule, and worth saying so: the tokens without
    // that suffix (`accent`, `surface`, `muted`, `canvas`, `focus`, …) are
    // outside it, so `bg-accent/15` — the class that REPLACED the broken one —
    // is not itself covered. Widening to every colour utility means telling
    // `text-accent` apart from `text-sm` by a list of Tailwind's own scale
    // words, which is a bigger and more brittle rule than the defect warrants.
    const defined = new Set(
      [...readFileSync(TAILWIND_CSS, 'utf8').matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]),
    );
    expect(defined.size).toBeGreaterThan(10);
    const SEMANTIC = /\b(?:bg|text|border)-([a-z0-9-]*-(?:bg|text))\b/;
    const used = hits(ROOTS, SEMANTIC, (lines, index) => {
      const names = [...lines[index].matchAll(new RegExp(SEMANTIC, 'g'))];
      return names.some((m) => !defined.has(m[1]));
    });
    expect(used).toEqual([]);

    // A POSITIVE CONTROL: the pattern must recognise the exact spelling that
    // shipped broken, and must not sweep in the size and layout utilities that
    // share the `text-` and `border-` prefixes.
    expect(SEMANTIC.test('className="bg-accent-bg text-text"')).toBe(true);
    expect(SEMANTIC.exec('className="bg-accent-bg"')?.[1]).toBe('accent-bg');
    expect(defined.has('accent-bg')).toBe(false);
    expect(defined.has('error-bg')).toBe(true);
    for (const safe of ['text-sm', 'border-0', 'text-left', 'border-border']) {
      expect(SEMANTIC.test(`className="${safe}"`), safe).toBe(false);
    }
  });

  it("lets a fragment's AUTHORED decoration outrank the link underline", () => {
    // `.sj-run--linked`, `--underline` and `--strike` all set
    // `text-decoration-line` at equal specificity, so the one written LAST
    // wins. With `--linked` last, a struck-through fragment that also carried a
    // link rendered underlined and the strike simply vanished. A fragment's
    // decoration is a value the AUTHOR set; the link's underline is this
    // surface's own convention, and the authored one has to be the one that
    // shows. Ordering is the whole mechanism, so ordering is what is pinned.
    const css = readFileSync(STYLES, 'utf8');
    const at = (rule: string) => {
      const index = css.indexOf(`.${rule} {`);
      expect(index, rule).toBeGreaterThan(-1);
      return index;
    };
    expect(at('sj-run--linked')).toBeLessThan(at('sj-run--underline'));
    expect(at('sj-run--linked')).toBeLessThan(at('sj-run--strike'));
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
