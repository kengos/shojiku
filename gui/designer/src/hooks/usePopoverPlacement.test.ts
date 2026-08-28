import { describe, expect, it } from 'vitest';
import { placeIn, placementClasses } from './usePopoverPlacement';

describe('placeIn', () => {
  // The grid is both taller and wider than the flat palette it replaced, so both
  // axes can overflow — and each is flipped only when the OTHER side has room. A
  // window too small for either keeps the near edge put and lets the max-height
  // scroll, because moving the overflow to the top or the left hides the palette
  // just as completely.
  //
  // Both inputs are independent of the answer: the ANCHOR is the trigger, which does
  // not move, and the SIZE is the popover's extent, which is the same either way.
  // The first version read the popover's own rect and so decided against a box a
  // previous answer had already moved — it measured correctly and still came out
  // unflipped in the running Designer.
  const VIEW = { width: 1280, height: 720 };
  const SIZE = { width: 202, height: 311 };
  const at = (over: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>) => ({
    top: 100,
    bottom: 128,
    left: 100,
    right: 140,
    ...over,
  });

  it('keeps both axes at their default when the popover fits', () => {
    expect(placeIn(at({}), SIZE, VIEW)).toEqual({ up: false, toLeft: false });
  });

  it('flips UP when hanging below would overflow and there is room above', () => {
    // The trigger position measured in the running Designer, where the palette ran
    // 212px past the fold.
    expect(placeIn(at({ top: 590, bottom: 618 }), SIZE, VIEW).up).toBe(true);
  });

  it('stays DOWN when flipping up would only move the overflow to the top', () => {
    // A trigger near the TOP of a window shorter than the popover: neither side
    // fits, so the max-height scrolls instead of the palette hiding upward.
    expect(placeIn(at({ top: 40, bottom: 68 }), SIZE, { width: 1280, height: 300 }).up).toBe(false);
  });

  it('flips LEFT when hanging right would overflow and there is room that side', () => {
    // Also measured in the running Designer: a colour control near the property
    // panel's right edge put the palette 55px off the side.
    expect(placeIn(at({ left: 1133, right: 1173 }), SIZE, VIEW).toLeft).toBe(true);
  });

  it('stays anchored LEFT when flipping would only move the overflow to the side', () => {
    expect(placeIn(at({ left: 100, right: 140 }), { width: 1300, height: 311 }, VIEW).toLeft).toBe(
      false,
    );
  });

  it('flips BOTH axes at once when a corner overflows', () => {
    expect(placeIn(at({ top: 590, bottom: 618, left: 1133, right: 1173 }), SIZE, VIEW)).toEqual({
      up: true,
      toLeft: true,
    });
  });
});

describe('placementClasses', () => {
  it('anchors to the near edges by default', () => {
    const cls = placementClasses({ up: false, toLeft: false });
    expect(cls).toContain('left-0');
    expect(cls).toContain('top-[calc(100%+var(--sj-space-1))]');
  });

  it('swaps BOTH edges when both axes flip, never a mix of old and new', () => {
    const cls = placementClasses({ up: true, toLeft: true });
    expect(cls).toContain('right-0');
    expect(cls).toContain('bottom-[calc(100%+var(--sj-space-1))]');
    expect(cls).not.toContain('left-0');
    expect(cls).not.toContain('top-[');
  });
});
