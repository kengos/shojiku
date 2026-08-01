import { describe, expect, it } from 'vitest';
import {
  CUSTOM,
  composeDimension,
  convertDimension,
  formatDimension,
  namedSize,
  PAGE_SIZE_NAMES,
  PAGE_SIZES,
  splitDimension,
  thumbnailGeometry,
  unitToPt,
} from './pageSizes';

describe('named size table', () => {
  it('lists the eight engine sizes in table order', () => {
    expect(PAGE_SIZE_NAMES).toEqual(['A3', 'A4', 'A5', 'B4', 'B5', 'Letter', 'Legal', 'Tabloid']);
  });

  it('stores portrait dimensions (w < h) for every named size', () => {
    for (const size of PAGE_SIZES) {
      expect(size.w, size.name).toBeLessThan(size.h);
    }
  });

  it('looks up a known size and misses an unknown one', () => {
    expect(namedSize('Letter')).toEqual({ name: 'Letter', w: 612, h: 792, unit: 'in' });
    expect(namedSize('B6')).toBeUndefined();
  });

  it('exposes a custom sentinel that cannot collide with a capitalized name', () => {
    expect(PAGE_SIZE_NAMES).not.toContain(CUSTOM);
  });
});

describe('unit conversion', () => {
  it('converts physical units and points to points', () => {
    expect(unitToPt(1, 'in')).toBe(72);
    expect(unitToPt(25.4, 'mm')).toBeCloseTo(72, 6);
    expect(unitToPt(1, 'cm')).toBeCloseTo(72 / 2.54, 6);
    expect(unitToPt(200, 'pt')).toBe(200);
  });
});

describe('splitDimension (seed the custom inputs)', () => {
  it('splits a unit-suffixed value', () => {
    expect(splitDimension('8.5in')).toEqual({ value: '8.5', unit: 'in' });
    expect(splitDimension(' 200mm ')).toEqual({ value: '200', unit: 'mm' });
    expect(splitDimension('12pt')).toEqual({ value: '12', unit: 'pt' });
  });

  it('splits a bare numeral to a null unit', () => {
    expect(splitDimension('200')).toEqual({ value: '200', unit: null });
  });

  it('rejects empty, over-long, and non-numeric input', () => {
    expect(splitDimension('')).toBeNull();
    expect(splitDimension('   ')).toBeNull();
    expect(splitDimension('8.5em')).toBeNull();
    expect(splitDimension('abc')).toBeNull();
    expect(splitDimension(`${'9'.repeat(40)}mm`)).toBeNull();
  });
});

describe('formatDimension', () => {
  it('trims trailing zeros and the point', () => {
    expect(formatDimension(72, 'in')).toBe('1');
    expect(formatDimension(612, 'in')).toBe('8.5');
    expect(formatDimension(595.28, 'mm')).toBe('210');
  });
});

describe('composeDimension (input → wire length)', () => {
  it('composes a positive numeral with its unit', () => {
    expect(composeDimension('8.5', 'in')).toBe('8.5in');
    expect(composeDimension(' 200 ', 'mm')).toBe('200mm');
  });

  it('rejects zero, negative, empty, exponential, and non-numeric input', () => {
    expect(composeDimension('0', 'mm')).toBeNull();
    expect(composeDimension('-5', 'mm')).toBeNull();
    expect(composeDimension('', 'mm')).toBeNull();
    expect(composeDimension('1e3', 'mm')).toBeNull();
    expect(composeDimension('abc', 'mm')).toBeNull();
  });
});

describe('convertDimension (unit-select conversion)', () => {
  it('preserves the physical length across units', () => {
    expect(convertDimension('1', 'in', 'pt')).toBe('72');
    expect(convertDimension('72', 'pt', 'in')).toBe('1');
    expect(convertDimension('25.4', 'mm', 'in')).toBe('1');
  });

  it('rejects the same invalid inputs as composeDimension', () => {
    expect(convertDimension('0', 'in', 'mm')).toBeNull();
    expect(convertDimension('bad', 'in', 'mm')).toBeNull();
  });
});

describe('thumbnailGeometry', () => {
  it('scales the longer side to the max for a portrait size', () => {
    expect(thumbnailGeometry(595.28, 841.89, 120)).toEqual({ width: 85, height: 120 });
  });

  it('scales the longer side to the max for a landscape size', () => {
    expect(thumbnailGeometry(841.89, 595.28, 120)).toEqual({ width: 120, height: 85 });
  });

  it('handles a square size', () => {
    expect(thumbnailGeometry(100, 100, 120)).toEqual({ width: 120, height: 120 });
  });

  it('falls back to a neutral portrait outline for hostile dimensions', () => {
    const fallback = { width: 85, height: 120 };
    expect(thumbnailGeometry(Number.NaN, 100)).toEqual(fallback);
    expect(thumbnailGeometry(100, 0)).toEqual(fallback);
    expect(thumbnailGeometry(-5, 100)).toEqual(fallback);
    expect(thumbnailGeometry(100, Number.POSITIVE_INFINITY)).toEqual(fallback);
  });

  it('clamps a degenerate ratio to a visible minimum side', () => {
    expect(thumbnailGeometry(14400, 1, 120)).toEqual({ width: 120, height: 1 });
  });

  it('uses the default max when none is given', () => {
    expect(thumbnailGeometry(100, 200).height).toBe(120);
  });
});
