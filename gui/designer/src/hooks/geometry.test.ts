// Tests for hooks/geometry.ts — the shared page-geometry vocabulary:
// content width/height in pt recovered from pixel-derived render geometry
// (callers floor), and the band classification of a page-relative Y.
import { describe, expect, it } from 'vitest';
import { bandOf, contentHeightPt, contentWidthPt } from './geometry';

describe('contentWidthPt', () => {
  const page = { width: 200, height: 300, rgba: new Uint8Array(0) };
  const inspectWith = (margin: readonly [number, number, number, number]) => ({
    engine: { version: '', capabilities: [], builtinLocales: [] },
    document: {},
    boxes: { pages: [] },
    margin,
  });

  it('falls back to the A4 content width with no render or no page', () => {
    expect(contentWidthPt(null)).toBe(480);
    expect(contentWidthPt({ pages: [], inspect: null, scale: 2 })).toBe(480);
  });

  it('converts px to pt at the render scale and subtracts the L/R margins', () => {
    // 200px ÷ scale 2 = 100pt; margins [t,r,b,l]=[0,10,0,5] → inset 15 → 85pt.
    expect(contentWidthPt({ pages: [page], inspect: inspectWith([0, 10, 0, 5]), scale: 2 })).toBe(
      85,
    );
  });

  it('uses the full page width when the inspect margins are absent', () => {
    expect(contentWidthPt({ pages: [page], inspect: null, scale: 2 })).toBe(100);
  });
});

describe('contentHeightPt', () => {
  const page = { width: 200, height: 300, rgba: new Uint8Array(0) };
  const inspectWith = (margin: readonly [number, number, number, number]) => ({
    engine: { version: '', capabilities: [], builtinLocales: [] },
    document: {},
    boxes: { pages: [] },
    margin,
  });

  it('falls back to a common content height with no render or no page', () => {
    expect(contentHeightPt(null)).toBe(792);
    expect(contentHeightPt({ pages: [], inspect: null, scale: 2 })).toBe(792);
  });

  it('converts px to pt at the render scale and subtracts the T/B margins', () => {
    // 300px ÷ scale 2 = 150pt; margins [t,r,b,l]=[10,0,20,0] → inset 30 → 120pt.
    expect(contentHeightPt({ pages: [page], inspect: inspectWith([10, 0, 20, 0]), scale: 2 })).toBe(
      120,
    );
  });

  it('uses the full page height when the inspect carries no margin', () => {
    expect(contentHeightPt({ pages: [page], inspect: null, scale: 2 })).toBe(150);
  });

  it('never reports a non-positive height', () => {
    expect(
      contentHeightPt({ pages: [page], inspect: inspectWith([200, 0, 200, 0]), scale: 2 }),
    ).toBe(1);
  });
});

describe('bandOf', () => {
  it('names the band an item list belongs to', () => {
    expect(bandOf('sections.header.items')).toBe('header');
    expect(bandOf('sections.footer.items')).toBe('footer');
  });

  it('is null for the body and for anything else', () => {
    expect(bandOf('sections.body.items')).toBeNull();
    expect(bandOf('styles')).toBeNull();
  });
});
