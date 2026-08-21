// The shared source walker behind the convention GATES (`ui/chromeConvention`,
// `ui/actionConvention`, `i18n/ellipsis`). A component test can only pin the
// primitives it happens to render; these gates walk the package source instead,
// so the NEXT surface cannot quietly reintroduce a banned shape.
//
// It lives in `testkit/` because it is suite substrate, not product code: the
// package's vitest config excludes `src/testkit/**` from coverage, exactly as
// it excludes the test files that import it. One copy, because two copies of a
// walker drift — and a drifting walker makes a gate quietly stop looking.
//
// Node env only (it reads files off disk); every consumer carries the
// `@vitest-environment node` docblock.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `gui/` — the workspace root every reported path is relative to, so a hit in
 * one package is never mistaken for the same file path in the other. */
export const GUI_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The React component package's source root (`gui/designer/src`). */
export const DESIGNER_SRC = fileURLToPath(new URL('../', import.meta.url));

/** The standalone app host's source root (`gui/designer-app/src`). It is read,
 * not imported — the package dependency direction (app → designer) is
 * untouched. Rules about a shared PRIMITIVE have to hold wherever chrome is
 * painted, and the app is the only other package that paints any. */
export const APP_SRC = fileURLToPath(new URL('../../../designer-app/src/', import.meta.url));

/** Every `.ts`/`.tsx` source file under `dir`, tests excluded. */
export function sourceFiles(dir: string): string[] {
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
export function codeLines(file: string): string[] {
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

/** The tag name of the nearest opening `<Tag` at or above `index`, or `null`.
 *
 * CAVEAT, and it is the reason no rule may rest on this ALONE: a generic type
 * argument reads as a tag (`Record<ButtonVariant, string>` answers
 * `ButtonVariant`). Lowercase tags are DOM elements and are safe to key on;
 * anything else is only a hint, so a rule that must exempt a specific module
 * exempts it BY PATH. */
export function nearestOpenTag(lines: string[], index: number): string | null {
  for (let i = index; i >= 0; i -= 1) {
    const open = /<([A-Za-z][\w.]*)/.exec(lines[i] ?? '');
    if (open !== null) {
      return open[1] ?? null;
    }
  }
  return null;
}

/** `gui`-relative `path:line` for every code line in `roots` matching
 * `pattern`, keeping only the lines `extra` (given the file's code lines, the
 * line index, and the file path) accepts. */
export function hits(
  roots: readonly string[],
  pattern: RegExp,
  extra?: (lines: string[], index: number, file: string) => boolean,
): string[] {
  const found: string[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const lines = codeLines(file);
      lines.forEach((line, index) => {
        if (pattern.test(line) && (extra === undefined || extra(lines, index, file))) {
          found.push(`${file.slice(GUI_ROOT.length)}:${index + 1}`);
        }
      });
    }
  }
  return found;
}
