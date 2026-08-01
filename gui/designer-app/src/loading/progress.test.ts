import { describe, expect, it } from 'vitest';
import { readProgress } from './progress';

describe('readProgress', () => {
  it('reads a determinate transfer as a clamped ratio with display text', () => {
    const reading = readProgress({ loaded: 11_500_000, total: 18_600_000 });
    expect(reading).toEqual({
      ratio: 11_500_000 / 18_600_000,
      percent: 62,
      loadedText: '11.5 MB',
      totalText: '18.6 MB',
    });
  });

  it('formats sub-megabyte values as whole KB (the first bytes of a transfer)', () => {
    expect(readProgress({ loaded: 0, total: 1000 })).toMatchObject({
      percent: 0,
      loadedText: '0 KB',
      totalText: '1 KB',
    });
    expect(readProgress({ loaded: 500_000, total: 1_000_000 })).toMatchObject({
      percent: 50,
      loadedText: '500 KB',
      totalText: '1.0 MB',
    });
  });

  it('is indeterminate when no total was declared', () => {
    expect(readProgress({ loaded: 4096 })).toBeNull();
  });

  // A wrong total is worse than no total: every unusable shape degrades to the
  // indeterminate bar rather than producing a NaN or negative width.
  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('is indeterminate for a %s total', (_label, total) => {
    expect(readProgress({ loaded: 10, total })).toBeNull();
  });

  it('is indeterminate when loaded is not a finite number', () => {
    expect(readProgress({ loaded: Number.NaN, total: 100 })).toBeNull();
    expect(readProgress({ loaded: Number.POSITIVE_INFINITY, total: 100 })).toBeNull();
  });

  it('tops out at 100% when the body outruns its declared Content-Length', () => {
    expect(readProgress({ loaded: 250, total: 100 })).toMatchObject({
      ratio: 1,
      percent: 100,
      loadedText: '0 KB',
    });
  });

  it('floors at 0% for a negative loaded count', () => {
    expect(readProgress({ loaded: -500, total: 1_000_000 })).toMatchObject({
      ratio: 0,
      percent: 0,
      loadedText: '0 KB',
    });
  });
});
