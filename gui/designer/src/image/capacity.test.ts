// Tests for capacity.ts — the template-size headroom read, the projected
// size of one more image, and the cap steps the raise prompt walks.
import { describe, expect, it } from 'vitest';
import { byteAmount, CAP_STEPS, headroom, nextCapStep, projectImport } from './capacity';

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

describe('byteAmount', () => {
  const MIB = 1024 * 1024;

  it('writes a small count in whole KB, never as an empty 0', () => {
    expect(byteAmount(1)).toEqual({ value: 1, unit: 'KB' });
    expect(byteAmount(12_345)).toEqual({ value: 12, unit: 'KB' });
    expect(byteAmount(1_048_000)).toEqual({ value: 1023, unit: 'KB' });
  });

  it('switches to MB once the KB figure would round to a megabyte', () => {
    // 1_048_500 bytes is 1023.9 KiB, which rounds to 1024 KB.
    expect(byteAmount(1_048_500)).toEqual({ value: 1, unit: 'MB' });
    expect(byteAmount(2 * MIB)).toEqual({ value: 2, unit: 'MB' });
    expect(byteAmount(1.6 * MIB)).toEqual({ value: 1.6, unit: 'MB' });
  });

  it('reads nothing, a negative or a non-finite count as 0 KB', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(byteAmount(bad)).toEqual({ value: 0, unit: 'KB' });
    }
  });
});
