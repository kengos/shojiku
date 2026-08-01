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
// either shape. (Node env: it reads the files off disk, like the catalog gate.)

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

/** Every `.ts`/`.tsx` source file in the package, tests excluded. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

/** The file's lines with line comments and block comments (including the JSX
 * brace-wrapped form) blanked out, so prose ABOUT a banned shape never counts
 * as a use of it. */
function codeLines(file: string): string[] {
  let inBlock = false;
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => {
      const opened = inBlock;
      if (inBlock && line.includes('*/')) {
        inBlock = false;
        return '';
      }
      if (!inBlock && /\/\*/.test(line) && !line.includes('*/')) {
        inBlock = true;
      }
      return opened ? '' : line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
    });
}

/** `src`-relative `path:line` for every code line matching `pattern`, keeping
 * only the lines `extra` (given the file's code lines, the line index, and the
 * file path) accepts. */
function hits(
  pattern: RegExp,
  extra?: (lines: string[], index: number, file: string) => boolean,
): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const lines = codeLines(file);
    lines.forEach((line, index) => {
      if (pattern.test(line) && (extra === undefined || extra(lines, index, file))) {
        found.push(`${file.slice(SRC.length)}:${index + 1}`);
      }
    });
  }
  return found;
}

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
  for (let i = index; i >= 0; i -= 1) {
    const open = /<([A-Za-z][\w.]*)/.exec(lines[i] ?? '');
    if (open !== null) {
      const tag = open[1] ?? '';
      return /^[a-z]/.test(tag) && tag !== 'iframe';
    }
  }
  return false;
}

describe('chrome conventions', () => {
  it('walks the package source (the guard is never silently empty)', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('TipBubble.tsx'))).toBe(true);
  });

  it('blanks commented-out prose so a comment about a banned shape does not count', () => {
    // The helper is what keeps this suite from flagging its own documentation;
    // pin both comment forms rather than trusting them implicitly.
    const bubble = sourceFiles(SRC).find((f) => f.endsWith('TipBubble.tsx')) ?? '';
    expect(codeLines(bubble).some((l) => l.includes('title'))).toBe(false);
  });

  it('conveys no tooltip through the native title attribute', () => {
    expect(hits(/(^|\s)title=/, onDomElement)).toEqual([]);
  });

  it('still allows an iframe its accessible name (the a11y lint demands it)', () => {
    // The exclusion is deliberate, so it is pinned: were it dropped, the PDF
    // preview frame would have to choose between two failing gates.
    const iframeTitles = hits(/(^|\s)title=/, (lines, index) => !onDomElement(lines, index));
    expect(iframeTitles.some((h) => h.startsWith('pdf/PdfPreviewModal.tsx'))).toBe(true);
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
    expect(hits(glyph, (_lines, _index, file) => !file.includes('/i18n/catalog/'))).toEqual([]);
  });
});
