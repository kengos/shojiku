import { describe, expect, it } from 'vitest';
import type { BoxRect } from '../engine/types';
import { alignPositions, axisGuide, guideLineFor } from './guides';

const rect = (x: number, y: number, w: number, h: number): BoxRect => ({ x, y, w, h });

describe('alignPositions', () => {
  it('offers leading edge, center, trailing edge per axis', () => {
    expect(alignPositions(rect(10, 20, 30, 40), 'x')).toEqual([10, 25, 40]);
    expect(alignPositions(rect(10, 20, 30, 40), 'y')).toEqual([20, 40, 60]);
  });
});

describe('axisGuide', () => {
  const siblings = [rect(100, 0, 50, 10), rect(300, 50, 40, 10)];

  it('snaps to the nearest sibling position within the threshold', () => {
    // Candidate 103 vs sibling left edge 100 (distance 3 ≤ 4).
    const hit = axisGuide([103], siblings, 'x', 4);
    expect(hit).not.toBeNull();
    expect(hit?.offset).toBe(-3);
    expect(hit?.at).toBe(100);
    expect(hit?.sibling).toBe(siblings[0]);
  });

  it('prefers the closest hit across all siblings and candidates', () => {
    // 298 is 2 from 300 (sibling 2 left) and 27 from 325/etc — the 300 wins.
    const hit = axisGuide([298, 130], siblings, 'x', 5);
    expect(hit?.at).toBe(300);
    expect(hit?.offset).toBe(2);
  });

  it('returns null outside the threshold or with no siblings', () => {
    expect(axisGuide([200], siblings, 'x', 4)).toBeNull();
    expect(axisGuide([100], [], 'x', 4)).toBeNull();
  });

  it('matches centers too', () => {
    // Sibling 1 center x = 125.
    const hit = axisGuide([127], siblings, 'x', 4);
    expect(hit?.at).toBe(125);
  });

  it('works on the y axis', () => {
    // Sibling 2 top edge y = 50.
    const hit = axisGuide([52], siblings, 'y', 4);
    expect(hit?.at).toBe(50);
    expect(hit?.offset).toBe(-2);
  });

  it('disables on a zero/hostile threshold and skips non-finite candidates', () => {
    expect(axisGuide([100], siblings, 'x', 0)).toBeNull();
    expect(axisGuide([100], siblings, 'x', Number.NaN)).toBeNull();
    expect(axisGuide([100], siblings, 'x', -1)).toBeNull();
    expect(axisGuide([Number.NaN], siblings, 'x', 4)).toBeNull();
  });
});

describe('guideLineFor', () => {
  it('spans the union of ghost and sibling on a vertical (x) guide', () => {
    const sibling = rect(100, 0, 50, 10);
    const line = guideLineFor({ offset: 0, at: 100, sibling }, rect(100, 40, 20, 20), 'x');
    expect(line).toEqual({ x1: 100, y1: 0, x2: 100, y2: 60 });
  });

  it('spans the union on a horizontal (y) guide', () => {
    const sibling = rect(200, 50, 40, 10);
    const line = guideLineFor({ offset: 0, at: 50, sibling }, rect(20, 50, 30, 30), 'y');
    expect(line).toEqual({ x1: 20, y1: 50, x2: 240, y2: 50 });
  });
});
