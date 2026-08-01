// Tests for insertSnippet.ts — the per-kind diagnostics-free default
// snippets (incl. the cut-line composite and the page-number band item).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CUT_LINE_PT, insertSnippet } from './insertSnippet';

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

  it('scaffolds a page number with no format key — the engine default is the value', () => {
    expect(insertSnippet('pageNumber', '')).toEqual({
      type: 'page_number',
      box: { w: '100%', h: 14 },
    });
  });
});
