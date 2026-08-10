import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_BUDGETS,
  defaultBox,
  fitDimensions,
  type ImageBudgets,
  importPlan,
} from './model';

describe('fitDimensions', () => {
  it('leaves an image within the edge budget unchanged', () => {
    expect(fitDimensions({ w: 800, h: 600 }, 2048)).toEqual({ w: 800, h: 600 });
  });

  it('scales the longest edge down preserving aspect', () => {
    expect(fitDimensions({ w: 4000, h: 2000 }, 2048)).toEqual({ w: 2048, h: 1024 });
  });

  it('never rounds a dimension below 1', () => {
    expect(fitDimensions({ w: 10000, h: 1 }, 2048)).toEqual({ w: 2048, h: 1 });
  });
});

describe('importPlan', () => {
  const budgets: ImageBudgets = {
    ...DEFAULT_IMAGE_BUDGETS,
    maxImageBytes: 1000,
    maxPixels: 100_000_000,
  };

  it('accepts an SVG within budget and refuses one over it (no rasterizing)', () => {
    expect(importPlan('svg', 500, null, budgets)).toEqual({ action: 'accept' });
    expect(importPlan('svg', 1001, null, budgets)).toEqual({
      action: 'refuse',
      reason: 'svg_too_large',
    });
  });

  it('refuses a raster whose dimensions could not be probed', () => {
    expect(importPlan('png', 500, null, budgets)).toEqual({
      action: 'refuse',
      reason: 'decode_failed',
    });
  });

  it('refuses an over-pixel-area raster before any canvas work', () => {
    expect(importPlan('jpeg', 500, { w: 20000, h: 20000 }, budgets)).toEqual({
      action: 'refuse',
      reason: 'dimensions',
    });
  });

  it('accepts a within-budget raster', () => {
    expect(importPlan('png', 1000, { w: 100, h: 100 }, budgets)).toEqual({ action: 'accept' });
  });

  it('downscales an over-byte-budget raster keeping its format', () => {
    expect(importPlan('jpeg', 5000, { w: 4000, h: 2000 }, budgets)).toEqual({
      action: 'downscale',
      kind: 'jpeg',
      target: { w: 2048, h: 1024 },
      quality: budgets.jpegQuality,
    });
  });

  it('accepts a within-budget GIF or WebP', () => {
    expect(importPlan('gif', 1000, { w: 100, h: 100 }, budgets)).toEqual({ action: 'accept' });
    expect(importPlan('webp', 999, { w: 100, h: 100 }, budgets)).toEqual({ action: 'accept' });
  });

  it('REFUSES an over-budget GIF or WebP rather than downscaling it', () => {
    // These two travel verbatim: a canvas cannot emit GIF at all, and
    // re-encoding either would silently drop an animation. The refusal is the
    // whole point — a `downscale` decision here would reach a re-encode that
    // changes the format out from under the author.
    for (const kind of ['gif', 'webp'] as const) {
      expect(importPlan(kind, 5000, { w: 4000, h: 2000 }, budgets), kind).toEqual({
        action: 'refuse',
        reason: 'too_large',
      });
    }
  });

  it('still refuses an over-pixel-area GIF or WebP before the byte check', () => {
    expect(importPlan('gif', 500, { w: 20000, h: 20000 }, budgets)).toEqual({
      action: 'refuse',
      reason: 'dimensions',
    });
    expect(importPlan('webp', 500, null, budgets)).toEqual({
      action: 'refuse',
      reason: 'decode_failed',
    });
  });
});

describe('defaultBox', () => {
  it('converts intrinsic pixels to points at 96 dpi', () => {
    expect(defaultBox({ w: 96, h: 48 }, 500)).toEqual({ w: 72, h: 36 });
  });

  it('clamps to the page content width preserving aspect', () => {
    // 1000px → 750pt wide, clamped to 400pt; height scales by the same ratio.
    expect(defaultBox({ w: 1000, h: 500 }, 400)).toEqual({ w: 400, h: 200 });
  });

  it('falls back to a page-bounded square for an unknown intrinsic (SVG)', () => {
    expect(defaultBox(null, 500)).toEqual({ w: 200, h: 200 });
    expect(defaultBox(null, 120)).toEqual({ w: 120, h: 120 });
  });

  it('floors a fractional content width so a full-width insert never overflows', () => {
    // The content width arrives slightly inflated (ceil'd page pixels ÷ scale);
    // rounding 545.7 up to 546 made every full-width image warn "off-sheet".
    expect(defaultBox({ w: 1000, h: 500 }, 545.7)).toEqual({ w: 545, h: 273 });
  });
});
