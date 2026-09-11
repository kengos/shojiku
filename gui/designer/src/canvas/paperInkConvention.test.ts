// @vitest-environment node
//
// The paper-ink gate (gui/STYLE.md § Ink on the paper). The canvas overlay
// draws on the engine-rendered page, which is PIXELS and stays white in both
// colour schemes — so a mark on it must not take its colour from a chrome token
// that inverts with the scheme. `--sj-text` is sumi ink in light chrome and
// near-white in dark, where it disappears against the page.
//
// The rule was prose in five comments across two files, and it had already been
// broken: `.sj-grid-line` shipped as `--sj-text` at 8 % opacity and faded out in
// dark chrome, with the margin guide one edit from the same. A component test
// can only pin the marks it happens to render; this walks the overlay's own
// source and the three stylesheets, so the next decoration cannot reintroduce
// it. The walker is `testkit/sourceWalk.ts`, shared with the chrome-, action-
// and ellipsis-convention gates.
//
// A chrome colour has four routes onto the paper and each is closed here: a
// token in a stylesheet rule, a token in an inline style, a Tailwind utility
// named after the same token (`--color-text: var(--sj-text)`, so `stroke-text`
// carries it with no `--sj-` to grep for), and `currentColor`, which on this
// page inherits the document root's `color: var(--sj-text)`.
//
// Two of those checks are classified by DATA rather than by a hand-kept list,
// because a list standing in for a category is how this kind of gate goes
// quietly blind. A declaration is judged by whether its TOKEN carries a colour,
// never by whether its PROPERTY is one this file thought of — `outline:`,
// `border:`, `background-image:` and `text-shadow:` all carry one, and this
// stylesheet already writes three of them. And the tokens that may paint on the
// paper are derived from `theme/tokens.ts`: both scheme values must clear the
// WCAG non-text bar of 3:1 against the paper. That admits `--sj-accent` /
// `--sj-focus`, which eleven overlay rules use deliberately — the chrome's
// identity, and what a host rethemes — and refuses the rest.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeLines } from '../testkit/sourceWalk';
import { DARK_THEME, LIGHT_THEME, TOKEN_VARS, type TokenName } from '../theme/tokens';
import { isHexColor, relativeLuminance } from '../ui/chipContrast';

/** The overlay's assembly — every mark on the paper is drawn from here. */
const ENTRY = fileURLToPath(new URL('./BoxOverlay.tsx', import.meta.url));

const DESIGNER_SRC = fileURLToPath(new URL('../', import.meta.url));

/** The ONE exemption from membership, and the reason it is one: `ui/` holds the
 * SHARED primitives, which are chrome and overlay at once. They paint
 * `currentColor` by design so a toolbar glyph follows its control, and the
 * overlay colours them at the call site. They keep their own rules
 * (`ui/chromeConvention.test.ts`); the exemption is pinned below rather than
 * asserted, because an exemption nobody measures is how a member escapes. */
const SHARED_PRIMITIVES = 'ui/';

/** Every stylesheet that can reach an overlay class. The designer's own is the
 * half that diverged; the app's two are read because "they name no overlay
 * class" is a fact worth keeping true rather than a fact once checked. */
const STYLESHEETS = [
  fileURLToPath(new URL('../styles.css', import.meta.url)),
  fileURLToPath(new URL('../../../designer-app/src/app.css', import.meta.url)),
  fileURLToPath(new URL('../../../designer-app/src/tailwind.css', import.meta.url)),
];

/** The page the overlay is drawn on. Engine-rendered pixels, both schemes. */
const PAPER = '#ffffff';

/** The WCAG non-text contrast bar — the same 3:1 `ui/chipContrast.ts` reasons
 * with for a chip's ring. */
const INK_ON_PAPER = 3;

/** The Tailwind colour-utility prefixes that the `--color-*` bridge in
 * `designer-app/src/tailwind.css` feeds. A LIST, and unavoidably one: matching
 * `<anything>-<token>` instead would read the class `sj-margin-origin-text` as
 * the utility `text`. Taken from Tailwind v4's colour namespace. */
const UTILITY_PREFIXES = [
  'fill',
  'stroke',
  'text',
  'bg',
  'border',
  'outline',
  'ring',
  'shadow',
  'decoration',
  'divide',
  'caret',
  'accent',
  'placeholder',
  'from',
  'via',
  'to',
];

function contrast(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** True when the token carries a COLOUR in either scheme. The spacing, radius
 * and type-ramp tokens cannot vanish against anything, so they are none of this
 * rule's business wherever they appear. */
function isColourToken(name: TokenName): boolean {
  return [LIGHT_THEME[name], DARK_THEME[name]].some((value) =>
    /^(?:#|rgba?\(|hsla?\()/.test(value),
  );
}

const COLOUR_VARS: ReadonlySet<string> = new Set(
  (Object.keys(LIGHT_THEME) as TokenName[]).filter(isColourToken).map((name) => TOKEN_VARS[name]),
);

/** The `--sj-*` properties whose value reads as ink on the paper in BOTH
 * schemes. Derived from the token values themselves, never listed. */
const PAPER_SAFE: ReadonlySet<string> = new Set(
  (Object.keys(LIGHT_THEME) as TokenName[])
    .filter(
      (name) =>
        isHexColor(LIGHT_THEME[name]) &&
        isHexColor(DARK_THEME[name]) &&
        contrast(LIGHT_THEME[name], PAPER) >= INK_ON_PAPER &&
        contrast(DARK_THEME[name], PAPER) >= INK_ON_PAPER,
    )
    .map((name) => TOKEN_VARS[name]),
);

/** A Tailwind colour utility named after a theme token. The bridge is
 * `--color-<name>: var(--sj-<name>)`, so the utility and the token share a name
 * and only the token has an `--sj-` to grep for. */
const TOKEN_UTILITY = new RegExp(
  `\\b(?:${UTILITY_PREFIXES.join('|')})-(?:${[...COLOUR_VARS]
    .map((property) => property.slice('--sj-'.length))
    // Longest first: the alternation is ordered, and no token name is a proper
    // prefix of another TODAY — this keeps that from being load-bearing.
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
);

/** True when an element sets its own paint. An element that does not draws in
 * `currentColor`, which on this page is the document root's
 * `color: var(--sj-text)` — the one token that disappears against the paper. */
function paintsItsOwnColour(element: string): boolean {
  return /\bstroke=/.test(element) || /\bfill=/.test(element);
}

/** The overlay's own sources: the transitive local-import closure of
 * `BoxOverlay.tsx`, minus the shared `ui/` primitives. NOT restricted to
 * `canvas/` — the rule is about what the overlay DRAWS, and a decoration one
 * directory over draws just as much, so restricting by directory would make
 * "a new decoration file joins on its own" true only for an author who guessed
 * the directory. Returns paths relative to `designer/src`. */
function overlayFiles(): string[] {
  const seen = new Set<string>([ENTRY]);
  const queue = [ENTRY];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    for (const match of codeLines(file)
      .join('\n')
      .matchAll(/from '(\.[^']+)'/g)) {
      const spec = match[1];
      if (spec === undefined) {
        continue;
      }
      for (const ext of ['.ts', '.tsx']) {
        const resolved = join(dirname(file), `${spec}${ext}`);
        if (seen.has(resolved) || !existsSync(resolved)) {
          continue;
        }
        seen.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return [...seen].map((file) => relative(DESIGNER_SRC, file));
}

const ALL_REACHED = overlayFiles();
const MEMBERS = ALL_REACHED.filter((file) => !file.startsWith(SHARED_PRIMITIVES));
const EXEMPTED = ALL_REACHED.filter((file) => file.startsWith(SHARED_PRIMITIVES));

function source(file: string): string[] {
  return codeLines(join(DESIGNER_SRC, file));
}

/** Every `sj-*` class the overlay's own source emits. The trailing hyphen of an
 * interpolated id (`sj-grid-${useId()}`) is dropped, which lands it on the real
 * class the same element carries. */
const CLASSES: ReadonlySet<string> = new Set(
  MEMBERS.flatMap((file) =>
    [
      ...source(file)
        .join('\n')
        .matchAll(/sj-[a-z0-9-]+/g),
    ].map((match) => match[0].replace(/-+$/, '')),
  ),
);

interface InkOffence {
  readonly where: string;
  readonly token: string;
}

/** The offences ONE stylesheet rule commits. Pure over its inputs so the
 * controls below can fire it at a rule that is not in any file. */
function offences(
  selector: string,
  body: string,
  classes: ReadonlySet<string>,
  safe: ReadonlySet<string>,
): InkOffence[] {
  const targets = [...selector.matchAll(/\.(sj-[a-z0-9-]+)/g)].some((match) =>
    classes.has(match[1] ?? ''),
  );
  if (!targets) {
    return [];
  }
  const found: InkOffence[] = [];
  for (const declaration of body.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) {
      continue;
    }
    const where = `${selector.trim()} { ${declaration.slice(0, colon).trim()} }`;
    const value = declaration.slice(colon + 1);
    for (const match of value.matchAll(/var\((--sj-[a-z0-9-]+)/g)) {
      const token = match[1] ?? '';
      if (COLOUR_VARS.has(token) && !safe.has(token)) {
        found.push({ where, token });
      }
    }
    if (value.includes('currentColor')) {
      found.push({ where, token: 'currentColor' });
    }
  }
  return found;
}

/** A stylesheet as `{selector, body}` pairs, block comments stripped FIRST —
 * the rules' own comments name the banned tokens as prose, and a sweep that
 * counted those would report the rule as broken by its own explanation. */
function cssRules(file: string): { selector: string; body: string }[] {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: { selector: string; body: string }[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? '').trim();
    if (selector.length > 0) {
      rules.push({ selector, body: match[2] ?? '' });
    }
  }
  return rules;
}

describe('the canvas overlay paints in ink the paper can carry', () => {
  it('themes no overlay mark with a colour the paper cannot follow', () => {
    const found = STYLESHEETS.flatMap((file) =>
      cssRules(file).flatMap(({ selector, body }) => offences(selector, body, CLASSES, PAPER_SAFE)),
    );
    expect(found).toEqual([]);
  });

  it('names no chrome token in the overlay source itself', () => {
    // The stylesheet is not the only way in: an inline `style={{ stroke:
    // 'var(--sj-text)' }}` would route around the rule above, and a Tailwind
    // utility would route around BOTH — `stroke-text` is the same value with no
    // `--sj-` anywhere in the file. Every inline paint in the overlay is a
    // fixed value today, and the overlay carries no utility classes at all
    // (`gui/STYLE.md` § Hand-CSS carve-out: the canvas SVG paint is the
    // carve-out). This is what keeps both so.
    const named: string[] = [];
    for (const file of MEMBERS) {
      source(file).forEach((line, index) => {
        if (line.includes('--sj-') || TOKEN_UTILITY.test(line)) {
          named.push(`${file}:${index + 1}`);
        }
      });
    }
    expect(named).toEqual([]);

    // Controls: the pattern must recognise the utility spellings, including the
    // prefixes beyond the obvious SVG two, and must not sweep in the size and
    // geometry attributes that share those prefixes.
    for (const utility of ['stroke-text', 'bg-warn-text', 'ring-text', 'shadow-muted']) {
      expect(TOKEN_UTILITY.test(`className="${utility}"`), utility).toBe(true);
    }
    for (const safe of ['strokeWidth={1}', 'stroke-width: 1', 'text-anchor', 'border-0']) {
      expect(TOKEN_UTILITY.test(safe), safe).toBe(false);
    }
    // …and it must not read a hand-CSS class name as a utility. Not
    // hypothetical: `sj-margin-origin-text` ends in a token name.
    expect(TOKEN_UTILITY.test('className="sj-margin-origin-text"')).toBe(false);
  });

  it('overrides the colour of every glyph it borrows from the chrome', () => {
    // The fourth route, and the likeliest next one: the overlay draws ONE icon
    // — the link badge's chain — and `ui/icons.tsx` paints `currentColor` so a
    // toolbar glyph follows its control's text token. On the paper that
    // inherits `designer-app/src/app.css`'s root `color: var(--sj-text)`. The
    // badge overrides the stroke for exactly that reason; dropping the override
    // would carry no `--sj-` and no stylesheet rule, so neither rule above
    // would see it.
    const bare: string[] = [];
    for (const file of MEMBERS) {
      const text = source(file).join('\n');
      expect(text, file).not.toContain('currentColor');
      for (const match of text.matchAll(/<Icon[A-Za-z]*\b[\s\S]*?\/>/g)) {
        if (!paintsItsOwnColour(match[0])) {
          bare.push(`${file}: ${match[0].split('\n')[0]}`);
        }
      }
    }
    expect(bare).toEqual([]);

    expect(paintsItsOwnColour('<IconLink x={1} y={2} />')).toBe(false);
    expect(paintsItsOwnColour('<IconLink stroke="#1f1a17" />')).toBe(true);
  });

  it('exempts the shared primitives, and nothing else', () => {
    // The boundary the member set stops at, measured rather than described:
    // `ui/` is chrome AND overlay, it paints `currentColor` by design, and the
    // overlay colours it at the call site. If the overlay ever reaches a SECOND
    // shared file this reds — which is the right moment to ask whether that
    // file paints.
    expect(EXEMPTED).toEqual(['ui/icons.tsx']);
    const glyphs = readFileSync(join(DESIGNER_SRC, 'ui/icons.tsx'), 'utf8');
    expect(glyphs).toContain('stroke="currentColor"');
    expect(glyphs).not.toContain('--sj-');
  });

  it('derives its members from the assembly, not from a list', () => {
    // Without this the rules above could pass over a set of one file: an import
    // the walk failed to resolve looks exactly like a clean overlay.
    for (const painter of [
      'canvas/BoxOverlay.tsx',
      'canvas/OverlayShapes.tsx',
      'canvas/OverlayBox.tsx',
      'canvas/OverlayBoxLayer.tsx',
      'canvas/OverlayHandles.tsx',
      'canvas/OverlayGestureShapes.tsx',
      'canvas/OverlayDropShapes.tsx',
      'canvas/ContainerMarkVisual.tsx',
      // Not a painter — the pure model behind the link badge, and the newest
      // file the overlay assembles from. It is named because the closure
      // reaching a decoration's MODEL is what says the walk followed the import
      // that ADDED it, rather than only the components it already knew.
      'canvas/linkBadge.ts',
    ]) {
      expect(MEMBERS, painter).toContain(painter);
    }
    // The closure leaves `canvas/` on its own, which is the point: a decoration
    // authored one directory over is a member too.
    expect(MEMBERS.some((file) => !file.startsWith('canvas/'))).toBe(true);
    // …and the chrome AROUND the page is not a member. `DesignerCanvas` and
    // `PageRail` frame the page rather than drawing on it; `InlineTextEditor`
    // IS positioned over the page, and is outside for a different reason — it
    // paints its own opaque ground (`background: var(--sj-surface)`), so its
    // text sits on a surface of its own and never on the paper.
    for (const chrome of [
      'canvas/DesignerCanvas.tsx',
      'canvas/PageRail.tsx',
      'canvas/InlineTextEditor.tsx',
    ]) {
      expect(MEMBERS, chrome).not.toContain(chrome);
    }
  });

  it('reads the overlay classes off the overlay source', () => {
    for (const painted of [
      'sj-box',
      'sj-handle',
      'sj-grid-line',
      'sj-margin-guide',
      'sj-link-badge-disc',
      'sj-marquee',
      'sj-drag-ghost',
      'sj-group-bounds',
    ]) {
      expect([...CLASSES], painted).toContain(painted);
    }
    // The same stylesheet carries the chrome that is NOT on the paper — the
    // chip editor and the inline text editor — and those must stay outside.
    for (const chrome of ['sj-chip', 'sj-text-editor', 'sj-inline-editor']) {
      expect([...CLASSES], chrome).not.toContain(chrome);
    }
  });

  it('judges a token by its own two values', () => {
    expect([...PAPER_SAFE]).toContain('--sj-accent');
    expect([...PAPER_SAFE]).toContain('--sj-focus');
    for (const banned of ['--sj-text', '--sj-surface', '--sj-bg', '--sj-muted']) {
      expect([...PAPER_SAFE], banned).not.toContain(banned);
    }
    // The colour/non-colour split the rule turns on, so a spacing token is
    // never mistaken for ink and a colour one is never missed.
    expect([...COLOUR_VARS]).toContain('--sj-paper-shadow');
    for (const measure of ['--sj-space-2', '--sj-radius', '--sj-font-family']) {
      expect([...COLOUR_VARS], measure).not.toContain(measure);
    }
    // The three numbers the rule turns on. `text` is the break that shipped:
    // sumi ink in light chrome, 1.21 against the page in dark. `surface` is the
    // one this gate found: the resize handle's fill, white in light chrome and
    // near-black in dark, on a page that is white in both. `accent` is the
    // tightest PASS, so a future theme that lightens it reds this gate — which
    // is the answer we want, not a margin to widen.
    expect(contrast(DARK_THEME.text, PAPER)).toBeLessThan(INK_ON_PAPER);
    expect(contrast(LIGHT_THEME.surface, PAPER)).toBeLessThan(INK_ON_PAPER);
    expect(contrast(DARK_THEME.accent, PAPER)).toBeGreaterThanOrEqual(INK_ON_PAPER);
  });

  it('fires on the exact rule that shipped broken', () => {
    // The positive control, and the reason it is written against the ORIGINAL
    // text: a gate over a clean tree reports the same empty list whether it is
    // looking or not.
    expect(
      offences(
        '.sj-grid-line',
        'stroke: var(--sj-text);\nstroke-opacity: 0.08;',
        CLASSES,
        PAPER_SAFE,
      ),
    ).toEqual([{ where: '.sj-grid-line { stroke }', token: '--sj-text' }]);
    expect(offences('.sj-handle', 'fill: var(--sj-surface);', CLASSES, PAPER_SAFE)).toEqual([
      { where: '.sj-handle { fill }', token: '--sj-surface' },
    ]);

    // The PROPERTY is never what decides — these four are the shorthands and
    // longhands a property list forgets, and this stylesheet already writes
    // three of them elsewhere.
    for (const declaration of [
      'outline: 1px solid var(--sj-text)',
      'border-top-color: var(--sj-text)',
      'background-image: linear-gradient(var(--sj-text), var(--sj-text))',
      'text-shadow: 0 0 1px var(--sj-text)',
    ]) {
      expect(
        offences('.sj-grid-line', declaration, CLASSES, PAPER_SAFE).map((hit) => hit.token),
        declaration,
      ).toContain('--sj-text');
    }
    // …and `currentColor` is an offence on its own: it names no token and
    // resolves to the one that vanishes.
    expect(offences('.sj-margin-guide', 'stroke: currentColor;', CLASSES, PAPER_SAFE)).toEqual([
      { where: '.sj-margin-guide { stroke }', token: 'currentColor' },
    ]);

    // The NEWEST member, added by the cycle immediately before this one: the
    // link badge. Both of its rules are fixed ink already, so the sweep passes
    // over them in silence whether it reaches them or not — a rule the gate
    // cannot see is indistinguishable from a rule that obeys. This is what says
    // it reaches them, and it is the shape to copy for the next decoration.
    expect(offences('.sj-link-badge-disc', 'stroke: var(--sj-text);', CLASSES, PAPER_SAFE)).toEqual(
      [{ where: '.sj-link-badge-disc { stroke }', token: '--sj-text' }],
    );
    expect(offences('.sj-link-badge svg', 'stroke: var(--sj-text);', CLASSES, PAPER_SAFE)).toEqual([
      { where: '.sj-link-badge svg { stroke }', token: '--sj-text' },
    ]);

    // …and the four things it must NOT fire on: fixed ink, a token that reads
    // on the paper, a token that carries no colour at all, and the chrome this
    // stylesheet also carries.
    expect(offences('.sj-grid-line', 'stroke: #1f1a17;', CLASSES, PAPER_SAFE)).toEqual([]);
    expect(
      offences('.sj-handle', 'stroke-width: 1;\nstroke: var(--sj-accent);', CLASSES, PAPER_SAFE),
    ).toEqual([]);
    expect(offences('.sj-box', 'padding: var(--sj-space-2);', CLASSES, PAPER_SAFE)).toEqual([]);
    expect(offences('.sj-chip', 'color: var(--sj-text);', CLASSES, PAPER_SAFE)).toEqual([]);
  });
});
