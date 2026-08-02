import { describe, expect, it } from 'vitest';
import { baselineSynth, hashKey } from './synth';

const spec = (over: Partial<Parameters<typeof baselineSynth>[0]>) => ({
  type: 'string',
  keyPath: 'a',
  locale: 'en',
  constraints: {},
  ...over,
});

describe('hashKey', () => {
  it('is deterministic and stable across calls', () => {
    expect(hashKey('items[0].name')).toBe(hashKey('items[0].name'));
    expect(hashKey('a')).not.toBe(hashKey('b'));
  });

  it('handles the empty string', () => {
    expect(typeof hashKey('')).toBe('number');
  });
});

describe('baselineSynth', () => {
  it('returns false for boolean', () => {
    expect(baselineSynth(spec({ type: 'boolean' }))).toBe(false);
  });

  it('returns the minimum when one is set', () => {
    expect(baselineSynth(spec({ type: 'number', constraints: { minimum: 5 } }))).toBe(5);
  });

  it('returns a negative maximum when the range is negative-only', () => {
    expect(baselineSynth(spec({ type: 'number', constraints: { maximum: -3 } }))).toBe(-3);
  });

  it('falls back to 1 for an unconstrained number (and an integer)', () => {
    expect(baselineSynth(spec({ type: 'number', constraints: { maximum: 100 } }))).toBe(1);
    expect(baselineSynth(spec({ type: 'integer' }))).toBe(1);
  });

  it('returns an ISO date for a date/date-time format', () => {
    expect(baselineSynth(spec({ format: 'date' }))).toBe('2026-01-01');
    expect(baselineSynth(spec({ format: 'date-time' }))).toBe('2026-01-01');
  });

  it('returns a placeholder string, padded to minLength', () => {
    const short = baselineSynth(spec({ keyPath: 'x' }));
    expect(typeof short).toBe('string');
    const padded = baselineSynth(spec({ constraints: { minLength: 40 } })) as string;
    expect(padded.length).toBeGreaterThanOrEqual(40);
  });
});
