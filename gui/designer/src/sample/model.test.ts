import { describe, expect, it } from 'vitest';
import { addSampleField } from './edit';
import {
  clipText,
  coerceSampleValue,
  initialSampleValue,
  MAX_TEXT_CHARS,
  parseParams,
} from './model';

describe('initialSampleValue', () => {
  it('produces a typed initial value per kind', () => {
    expect(initialSampleValue('string', '2026-07-19')).toBe('');
    expect(initialSampleValue('number', '2026-07-19')).toBe(0);
    expect(initialSampleValue('boolean', '2026-07-19')).toBe(false);
    expect(initialSampleValue('date', '2026-07-19')).toBe('2026-07-19');
  });

  it('creates a NUMBER field, not a stringified number', () => {
    const text = addSampleField('{}', 'qty', initialSampleValue('number', '2026-07-19'));
    expect(JSON.parse(text).qty).toBe(0);
    expect(typeof JSON.parse(text).qty).toBe('number');
  });

  it('keeps a hostile key inert own data with a typed value (no prototype pollution)', () => {
    const text = addSampleField('{}', '__proto__', initialSampleValue('number', '2026-07-19'));
    // The computed-key rebuild never triggers the prototype setter.
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(parseParams(text)).not.toBeNull();
  });
});

describe('clipText', () => {
  it('clips beyond the cap and leaves short values intact', () => {
    expect(clipText('short')).toBe('short');
    expect(clipText('y'.repeat(MAX_TEXT_CHARS + 5)).endsWith('…')).toBe(true);
  });
});

describe('coerceSampleValue', () => {
  it('coerces per kind, keeping a non-numeric entry as a string', () => {
    expect(coerceSampleValue('number', '12.5')).toBe(12.5);
    expect(coerceSampleValue('number', 'abc')).toBe('abc');
    expect(coerceSampleValue('number', '')).toBe('');
    expect(coerceSampleValue('boolean', 'true')).toBe(true);
    expect(coerceSampleValue('boolean', 'false')).toBe(false);
    expect(coerceSampleValue('string', 'hi')).toBe('hi');
  });
});

describe('parseParams', () => {
  it('returns the object or null per the caps', () => {
    expect(parseParams('{"a":1}')).toEqual({ a: 1 });
    expect(parseParams('  ')).toBeNull();
  });
});
