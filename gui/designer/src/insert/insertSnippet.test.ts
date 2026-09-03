// Tests for insertSnippet.ts — the per-kind diagnostics-free default
// snippets (incl. the cut-line composite and the page-number band item).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CUT_LINE_PT, insertSnippet, RULE_Y_PT } from './insertSnippet';

describe('insertSnippet', () => {
  it('pins the probed diagnostics-free default per kind', () => {
    expect(insertSnippet('text', 'テキスト')).toEqual({ type: 'text', text: 'テキスト' });
    expect(insertSnippet('rect', '')).toEqual({
      type: 'rect',
      box: { w: 120, h: 60 },
      style: { borderWidth: 1 },
    });
    expect(insertSnippet('qrCode', '')).toEqual({
      type: 'qr_code',
      box: { w: 60, h: 60 },
      text: 'https://example.com',
    });
  });

  it('scaffolds a plain rule that spans its parent, with no style and no box', () => {
    // `100%` rather than a pt run: the rule then follows whatever it is nested
    // in, and needs no render geometry to be right before the first paint.
    // The ABSENCE of the other two keys is the assertion — `toEqual` fails on
    // an extra key, where `toMatchObject` would not. A `style` would author the
    // engine's own 1 pt black; a `box` is a parse error on a `line`.
    expect(insertSnippet('line', 'テキスト')).toEqual({
      type: 'line',
      from: { x: 0, y: RULE_Y_PT },
      to: { x: '100%', y: RULE_Y_PT },
    });
    // The constant too, not only itself: asserting the snippet against
    // `RULE_Y_PT` alone holds for any value it is ever changed to, and the
    // value is a probe result about how the rule LOOKS.
    expect(RULE_Y_PT).toBe(4);
  });

  it('pins the two form marks — the ellipse sized, the checkbox deliberately not', () => {
    // An unanchored ellipse with no positive `w`/`h` is SKIPPED with
    // `mark_missing_size`, so the box is required; 60x40 is the rect's own 2:1
    // at half scale, an oval rather than a circle. The ABSENCE of `style` is
    // the other half of the assertion (`toEqual` fails on an extra key): a
    // mark's outline already defaults to 1 pt black, so authoring one would put
    // a value in the file the user never chose.
    expect(insertSnippet('ellipse', '')).toEqual({ type: 'ellipse', box: { w: 60, h: 40 } });
    // The checkbox authors NOTHING, and that is the engine's own default rather
    // than an omission: unsized, it takes the inherited font's cap-height
    // square — a frame matched to the label beside it, which is the size an
    // author wants and cannot compute.
    expect(insertSnippet('checkbox', '')).toEqual({ type: 'checkbox' });
  });

  it('does not let the cut-line argument reach any other kind', () => {
    // Every kind takes the same third argument; only `cutLine` may read it.
    const cut = { label: 'LEAK', width: 123 };
    expect(insertSnippet('line', 'テキスト', cut)).toEqual(insertSnippet('line', 'テキスト'));
    expect(insertSnippet('text', 'テキスト', cut)).toEqual({ type: 'text', text: 'テキスト' });
    expect(insertSnippet('rect', '', cut)).toEqual({
      type: 'rect',
      box: { w: 120, h: 60 },
      style: { borderWidth: 1 },
    });
  });

  it('builds the cut line as a labelled dashed rule sized to the content width', () => {
    const snippet = insertSnippet('cutLine', 'text', { label: '切り取り線', width: 480.7 }) as {
      readonly type: string;
      readonly items: readonly Record<string, unknown>[];
    };
    expect(snippet.type).toBe('container');
    expect(snippet.items).toHaveLength(2);
    expect(snippet.items[0]).toMatchObject({ type: 'text', text: '切り取り線' });
    expect(snippet.items[1]).toMatchObject({
      type: 'line',
      // Pixel-derived geometry is ceil-inflated, so the width is FLOORED —
      // a rounded-up value would place the end past the printable edge.
      to: { x: 480, y: 2 },
      style: { style: 'dashed' },
    });
  });

  it('falls back to an A4 content width before the first render', () => {
    const snippet = insertSnippet('cutLine', 'text', {
      label: 'cut here',
      width: Number.NaN,
    }) as { readonly items: readonly Record<string, unknown>[] };
    expect(snippet.items[1]).toMatchObject({ to: { x: DEFAULT_CUT_LINE_PT, y: 2 } });
  });

  it('scaffolds a page number with no format key and no height', () => {
    // No `format`: the engine's own default is the value. No `h` either — a
    // definite height is what `text_overflow` measures against, and 14pt was
    // shorter than the line the blank presets' 10.5pt default text draws, so
    // the first page number a reader inserted warned.
    expect(insertSnippet('pageNumber', '')).toEqual({
      type: 'page_number',
      box: { w: '100%' },
    });
  });
});
