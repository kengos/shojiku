import { describe, expect, it } from 'vitest';
import { hitRect, MIN_HIT_PX, scaleRect } from './geometry';

describe('scaleRect', () => {
  it('scales every component by the scale factor', () => {
    expect(scaleRect({ x: 1, y: 2, w: 3, h: 4 }, 2)).toEqual({ x: 2, y: 4, w: 6, h: 8 });
  });
});

describe('hitRect', () => {
  it('grows a zero HEIGHT into a centred band — the horizontal-rule case', () => {
    // An axis-aligned `line` reports a zero-thickness placement box, and an SVG
    // rect with a zero side is neither drawn nor clickable, so without this the
    // rule has no selection outline and can never be picked on the canvas.
    expect(hitRect({ x: 10, y: 40, w: 200, h: 0 })).toEqual({
      x: 10,
      y: 40 - MIN_HIT_PX / 2,
      w: 200,
      h: MIN_HIT_PX,
    });
  });

  it('grows a zero WIDTH the same way — a vertical rule', () => {
    expect(hitRect({ x: 40, y: 10, w: 0, h: 200 })).toEqual({
      x: 40 - MIN_HIT_PX / 2,
      y: 10,
      w: MIN_HIT_PX,
      h: 200,
    });
  });

  it('leaves a rect with two real sides exactly as it is', () => {
    // The control for both cases above, and the reason this is not a general
    // minimum-size rule: an ordinary box must not be nudged off the pixels the
    // engine rasterized it at.
    const r = { x: 1, y: 2, w: 3, h: 4 };
    expect(hitRect(r)).toEqual(r);
    // A merely TINY side is deliberately NOT grown — only an exactly-zero one.
    expect(hitRect({ x: 0, y: 0, w: 100, h: 0.2 })).toEqual({ x: 0, y: 0, w: 100, h: 0.2 });
  });

  it('grows BOTH sides of a degenerate point box', () => {
    expect(hitRect({ x: 50, y: 50, w: 0, h: 0 })).toEqual({
      x: 50 - MIN_HIT_PX / 2,
      y: 50 - MIN_HIT_PX / 2,
      w: MIN_HIT_PX,
      h: MIN_HIT_PX,
    });
  });
});
