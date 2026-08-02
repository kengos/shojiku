// Tests for capacity.ts — the template-size headroom read, the projected
// size of one more image, and the cap steps the raise prompt walks.
import { describe, expect, it } from 'vitest';
import { CAP_STEPS, headroom, nextCapStep, projectImport } from './capacity';

describe('headroom', () => {
  it('is ok below the warn threshold and warns at or above it', () => {
    expect(headroom(500, 1000)).toEqual({ ratio: 0.5, level: 'ok' });
    expect(headroom(800, 1000)).toEqual({ ratio: 0.8, level: 'warn' });
    expect(headroom(2000, 1000)).toEqual({ ratio: 1, level: 'warn' });
  });

  it('reads as full for a non-positive cap', () => {
    expect(headroom(10, 0)).toEqual({ ratio: 1, level: 'warn' });
  });
});

describe('projectImport', () => {
  it('fits when the projected size is within the cap', () => {
    const p = projectImport(1000, 500, 2000);
    expect(p.fits).toBe(true);
    expect(p.projectedBytes).toBeGreaterThan(1500);
  });

  it('does not fit when the projected size exceeds the cap', () => {
    expect(projectImport(1000, 900, 1500).fits).toBe(false);
  });
});

describe('nextCapStep', () => {
  const [two, four, eight] = CAP_STEPS;

  it('returns the next step above the current cap', () => {
    expect(nextCapStep(two)).toBe(four);
    expect(nextCapStep(four)).toBe(eight);
    expect(nextCapStep(two - 1)).toBe(two);
  });

  it('returns null once at (or past) the ceiling', () => {
    expect(nextCapStep(eight)).toBeNull();
    expect(nextCapStep(eight + 1)).toBeNull();
  });
});
