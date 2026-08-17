import { describe, expect, it } from 'vitest';
import { ANCHOR_MARGIN_PX, clampToViewport } from './anchorPosition';

const VIEWPORT = { width: 1000, height: 800 };
const SMALL = { width: 160, height: 120 };

describe('clampToViewport', () => {
  it('returns the pointer verbatim when the surface fits below and right of it', () => {
    expect(clampToViewport({ x: 40, y: 60 }, SMALL, VIEWPORT)).toEqual({ x: 40, y: 60 });
  });

  it('pulls the surface back from the right edge', () => {
    // 1000 - 160 - 8 = 832 is the furthest left edge that still fits.
    expect(clampToViewport({ x: 900, y: 60 }, SMALL, VIEWPORT)).toEqual({ x: 832, y: 60 });
  });

  it('pulls the surface back from the bottom edge', () => {
    // 800 - 120 - 8 = 672.
    expect(clampToViewport({ x: 40, y: 780 }, SMALL, VIEWPORT)).toEqual({ x: 40, y: 672 });
  });

  it('pins a surface larger than the viewport to the margin, never off-screen', () => {
    const huge = { width: 1200, height: 900 };
    expect(clampToViewport({ x: 500, y: 400 }, huge, VIEWPORT)).toEqual({
      x: ANCHOR_MARGIN_PX,
      y: ANCHOR_MARGIN_PX,
    });
  });
});
