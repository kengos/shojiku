import { describe, expect, it } from 'vitest';
import {
  ACTUAL_SIZE_SCALE,
  anchorScroll,
  clampZoom,
  cssFactor,
  fitZoom,
  isMeasurable,
  isZoomStep,
  MAX_RENDER_SCALE,
  MAX_ZOOM,
  MIN_ZOOM,
  pixelRatio,
  renderScale,
  stepZoom,
  wheelZoom,
  zoomPercent,
} from './zoom';

describe('clampZoom', () => {
  it('clamps to the bounds and rescues a non-finite value to 1', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('stepZoom', () => {
  it('steps up to the next stop and saturates at MAX_ZOOM', () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.2, 1)).toBe(1.5);
    expect(stepZoom(4, 1)).toBe(MAX_ZOOM);
  });

  it('steps down to the previous stop and saturates at MIN_ZOOM', () => {
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(1.4, -1)).toBe(1);
    expect(stepZoom(0.25, -1)).toBe(MIN_ZOOM);
  });
});

describe('wheelZoom', () => {
  it('zooms in on a negative delta and out on a positive one', () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(1, 100)).toBeLessThan(1);
  });

  it('clamps at the bounds and ignores a non-finite delta', () => {
    expect(wheelZoom(4, -10000)).toBe(MAX_ZOOM);
    expect(wheelZoom(0.25, 10000)).toBe(MIN_ZOOM);
    expect(wheelZoom(1.5, Number.NaN)).toBe(1.5);
  });
});

describe('fitZoom', () => {
  it('fits the more-constraining axis with a margin', () => {
    // A 400×1000 page in an 800×800 container: height binds (800*0.94/1000).
    expect(fitZoom(800, 800, 400, 1000)).toBeCloseTo(0.752, 3);
    // A wide page: width binds.
    expect(fitZoom(800, 800, 2000, 400)).toBeCloseTo(0.376, 3);
  });

  it('falls back to 1 for a zero/absent container or page', () => {
    expect(fitZoom(0, 800, 400, 1000)).toBe(1);
    expect(fitZoom(800, 0, 400, 1000)).toBe(1);
    expect(fitZoom(800, 800, 0, 1000)).toBe(1);
    expect(fitZoom(800, 800, 400, 0)).toBe(1);
  });

  it('clamps a huge fit (tiny page) to MAX_ZOOM', () => {
    expect(fitZoom(8000, 8000, 10, 10)).toBe(MAX_ZOOM);
  });
});

describe('isMeasurable', () => {
  it('is true only when both dimensions are positive', () => {
    expect(isMeasurable(800, 1000)).toBe(true);
    expect(isMeasurable(0, 1000)).toBe(false);
    expect(isMeasurable(800, 0)).toBe(false);
    expect(isMeasurable(0, 0)).toBe(false);
    expect(isMeasurable(-1, 1000)).toBe(false);
  });
});

describe('pixelRatio', () => {
  it('passes a positive finite ratio through', () => {
    expect(pixelRatio(2)).toBe(2);
    expect(pixelRatio(1.5)).toBe(1.5);
  });

  it('rescues every degenerate ratio to 1', () => {
    expect(pixelRatio(Number.NaN)).toBe(1);
    expect(pixelRatio(Number.POSITIVE_INFINITY)).toBe(1);
    expect(pixelRatio(0)).toBe(1);
    expect(pixelRatio(-2)).toBe(1);
  });
});

describe('ACTUAL_SIZE_SCALE', () => {
  it('is the printed size: an inch of 72pt is 96 CSS px', () => {
    expect(ACTUAL_SIZE_SCALE).toBe(96 / 72);
    // An A4 page (595.28pt wide) at 100% on a 1× screen is 793.7 CSS px wide —
    // the width gdoc and every PDF viewer give it at 100%.
    expect(renderScale(ACTUAL_SIZE_SCALE, 1, 1) * 595.28).toBeCloseTo(793.71, 2);
  });
});

describe('renderScale', () => {
  it('is baseScale × zoom, capped at MAX_RENDER_SCALE', () => {
    expect(renderScale(2, 1)).toBe(2);
    expect(renderScale(2, 2)).toBe(4);
    // 2 × 4 = 8 would exceed the cap.
    expect(renderScale(2, 4)).toBe(MAX_RENDER_SCALE);
  });

  it('asks for the same scale with the ratio omitted as with an explicit 1', () => {
    // The identity every caller written before the parameter existed relies on.
    for (const zoom of [MIN_ZOOM, 0.5, 1, 2, MAX_ZOOM]) {
      expect(renderScale(2, zoom)).toBe(renderScale(2, zoom, 1));
    }
  });

  it('multiplies the ratio in, so a 2× screen is rasterized at 2× the pixels', () => {
    expect(renderScale(2, 0.25, 2)).toBe(1);
    expect(renderScale(2, 0.25, 3)).toBe(1.5);
  });

  it('caps AFTER the ratio, so no ratio can outgrow the memory bound', () => {
    expect(renderScale(2, 1, 4)).toBe(MAX_RENDER_SCALE);
    // The security case: an absurd ratio from a hostile embedding.
    expect(renderScale(2, 1, 1e9)).toBe(MAX_RENDER_SCALE);
  });

  it('treats a degenerate ratio as 1 rather than producing NaN', () => {
    expect(renderScale(2, 1, Number.NaN)).toBe(2);
    expect(renderScale(2, 1, 0)).toBe(2);
    expect(renderScale(2, 1, -2)).toBe(2);
  });
});

describe('cssFactor', () => {
  it('is 1 when the render matches the desired scale', () => {
    expect(cssFactor(2, 1, 2)).toBe(1);
  });

  it('exceeds 1 when the render was capped (desired beyond MAX_RENDER_SCALE)', () => {
    // zoom 4 wants scale 8, render capped at 6 → 8/6.
    expect(cssFactor(2, 4, MAX_RENDER_SCALE)).toBeCloseTo(8 / 6, 6);
  });

  it('is the interim ratio while a newer zoom has not re-rendered', () => {
    // Desired scale 4 (zoom 2) but pages still at the old scale 2 → 2× interim.
    expect(cssFactor(2, 2, 2)).toBe(2);
  });

  it('falls back to 1 for a non-positive rendered scale (no render yet)', () => {
    expect(cssFactor(2, 1, 0)).toBe(1);
  });

  it('reads the same with the ratio omitted as with an explicit 1', () => {
    expect(cssFactor(2, 1, 2)).toBe(cssFactor(2, 1, 2, 1));
    expect(cssFactor(2, 4, MAX_RENDER_SCALE)).toBe(cssFactor(2, 4, MAX_RENDER_SCALE, 1));
  });

  it('is 1 on a 2× screen whose render matched — crisp, not magnified', () => {
    // zoom 1 at ratio 2 asks for device scale 4; a render that delivered it
    // needs no transform, because the element is laid out at raster ÷ 2.
    expect(cssFactor(2, 1, 4, 2)).toBe(1);
  });

  it('exceeds 1 on a 2× screen whose render was capped', () => {
    // zoom 2 at ratio 2 wants 8, capped at 6.
    expect(cssFactor(2, 2, MAX_RENDER_SCALE, 2)).toBeCloseTo(8 / 6, 6);
  });

  it('treats a degenerate ratio as 1', () => {
    expect(cssFactor(2, 1, 2, Number.NaN)).toBe(1);
  });
});

describe('anchorScroll', () => {
  it('keeps the content point under the cursor stationary', () => {
    // scroll 100, cursor 50, 2× → (100+50)*2 − 50 = 250.
    expect(anchorScroll(100, 50, 2)).toBe(250);
  });

  it('never returns a negative scroll', () => {
    expect(anchorScroll(0, 100, 0.5)).toBe(0);
  });
});

describe('zoomPercent / isZoomStep', () => {
  it('rounds the percent', () => {
    expect(zoomPercent(1)).toBe(100);
    expect(zoomPercent(0.752)).toBe(75);
  });

  it('recognises the discrete steps', () => {
    expect(isZoomStep(1)).toBe(true);
    expect(isZoomStep(1.5)).toBe(true);
    expect(isZoomStep(0.9)).toBe(false);
  });
});
