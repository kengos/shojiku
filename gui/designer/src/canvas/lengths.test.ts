import { describe, expect, it } from 'vitest';
import { formatLength, ptLength, readLength, snapLength, stepLength } from './lengths';

describe('readLength', () => {
  it('reads a finite number as pt', () => {
    expect(readLength(12)).toEqual({ pt: 12, unit: null });
    expect(readLength(-25)).toEqual({ pt: -25, unit: null });
    expect(readLength(145.95)).toEqual({ pt: 145.95, unit: null });
  });

  it('rejects non-finite numbers', () => {
    expect(readLength(Number.NaN)).toBeNull();
    expect(readLength(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('reads absolute-unit strings, converting to pt', () => {
    expect(readLength('12mm')).toEqual({ pt: 12 * (72 / 25.4), unit: 'mm' });
    expect(readLength('0.3mm')).toEqual({ pt: 0.3 * (72 / 25.4), unit: 'mm' });
    expect(readLength('2cm')).toEqual({ pt: 2 * (720 / 25.4), unit: 'cm' });
    expect(readLength('1.5in')).toEqual({ pt: 108, unit: 'in' });
    expect(readLength('12pt')).toEqual({ pt: 12, unit: 'pt' });
    expect(readLength('-25mm')).toEqual({ pt: -25 * (72 / 25.4), unit: 'mm' });
  });

  it('reads a unitless numeral string as a bare pt number', () => {
    expect(readLength('12')).toEqual({ pt: 12, unit: null });
  });

  it('rejects relative units — the drag must not rewrite authoring intent', () => {
    expect(readLength('50%')).toBeNull();
    expect(readLength('2em')).toBeNull();
    expect(readLength('1rem')).toBeNull();
  });

  it('rejects hostile strings and non-scalar shapes', () => {
    expect(readLength('')).toBeNull();
    expect(readLength('  ')).toBeNull();
    expect(readLength('--12mm')).toBeNull();
    expect(readLength('12mm x')).toBeNull();
    expect(readLength('1e999')).toBeNull();
    expect(readLength('NaN')).toBeNull();
    expect(readLength('Infinity')).toBeNull();
    expect(readLength(`1${'0'.repeat(40)}mm`)).toBeNull();
    expect(readLength({ x: 1 })).toBeNull();
    expect(readLength([12])).toBeNull();
    expect(readLength(true)).toBeNull();
    expect(readLength(undefined)).toBeNull();
    expect(readLength(null)).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(readLength(' 12mm ')).toEqual({ pt: 12 * (72 / 25.4), unit: 'mm' });
  });
});

describe('formatLength', () => {
  it('rounds a bare number to two decimals with no float noise', () => {
    expect(formatLength(0.1 + 0.2, null)).toBe(0.3);
    expect(formatLength(120, null)).toBe(120);
    expect(formatLength(145.949999, null)).toBe(145.95);
  });

  it('normalizes negative zero', () => {
    expect(formatLength(-0.001, null)).toBe(0);
  });

  it('formats unit strings at the unit precision, trimming trailing zeros', () => {
    expect(formatLength((12 * 72) / 25.4, 'mm')).toBe('12mm');
    expect(formatLength((12.44 * 72) / 25.4, 'mm')).toBe('12.4mm');
    expect(formatLength((12.46 * 72) / 25.4, 'mm')).toBe('12.5mm');
    expect(formatLength((0.3 * 72) / 25.4, 'mm')).toBe('0.3mm');
    expect(formatLength(108, 'in')).toBe('1.5in');
    expect(formatLength((2 * 720) / 25.4, 'cm')).toBe('2cm');
    expect(formatLength(12.34, 'pt')).toBe('12.3pt');
    expect(formatLength((-25 * 72) / 25.4, 'mm')).toBe('-25mm');
  });

  it('normalizes a tiny negative to plain zero in unit form', () => {
    expect(formatLength(-0.001, 'mm')).toBe('0mm');
    expect(formatLength(0.001, 'mm')).toBe('0mm');
  });

  it('refuses non-finite values', () => {
    expect(formatLength(Number.NaN, null)).toBeNull();
    expect(formatLength(Number.POSITIVE_INFINITY, 'mm')).toBeNull();
  });

  it('refuses a value whose rounding overflows', () => {
    expect(formatLength(Number.MAX_VALUE, null)).toBeNull();
  });
});

describe('snapLength', () => {
  it('quantizes to the step', () => {
    expect(snapLength(121.5, 4)).toBe(120);
    expect(snapLength(122.1, 4)).toBe(124);
    expect(snapLength(-3.2, 2)).toBe(-4);
  });

  it('is the identity when the grid is off or hostile', () => {
    expect(snapLength(121.5, 0)).toBe(121.5);
    expect(snapLength(121.5, -4)).toBe(121.5);
    expect(snapLength(121.5, Number.NaN)).toBe(121.5);
  });
});

describe('ptLength', () => {
  it('wraps a pt value as a bare-number authored length', () => {
    expect(ptLength(7)).toEqual({ pt: 7, unit: null });
  });
});

describe('stepLength', () => {
  it('steps a bare number keeping the plain-number form', () => {
    expect(stepLength('12', 1, 8)).toBe(20);
    expect(stepLength('12', -1, 8)).toBe(4);
  });

  it('steps a fractional value by a fractional step (line-height)', () => {
    expect(stepLength('1.4', 1, 0.1)).toBe(1.5);
    expect(stepLength('1.4', -1, 0.1)).toBe(1.3);
  });

  it('preserves the authored unit at its precision', () => {
    expect(stepLength('8mm', 1, 8)).toBe('10.8mm');
    expect(stepLength('2cm', -1, 8)).toBe('1.72cm');
    expect(stepLength('1in', 1, 72)).toBe('2in');
    expect(stepLength('10pt', 1, 8)).toBe('18pt');
  });

  it('round-trips exactly (↑ then ↓ returns the start — no re-snap)', () => {
    const up = stepLength('3', 1, 8);
    expect(up).toBe(11);
    expect(stepLength(String(up), -1, 8)).toBe(3);
  });

  it('returns null for an unsteppable value (relative unit / empty / garbage)', () => {
    expect(stepLength('50%', 1, 8)).toBeNull();
    expect(stepLength('', 1, 8)).toBeNull();
    expect(stepLength('auto', 1, 8)).toBeNull();
  });

  it('returns null when the stepped value overflows to non-finite', () => {
    // A readable base (1pt) plus a step that overflows the rounding multiply →
    // formatLength returns null, so no hostile delta reaches an op.
    expect(stepLength('1', 1, 1e308)).toBeNull();
  });
});
