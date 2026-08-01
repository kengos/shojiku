import { describe, expect, it } from 'vitest';
import { MAX_ENUM_OPTIONS, MAX_TEXT_CHARS } from './caps';
import { displayType, enumMember, enumOptions, enumValues, sampleDisplay } from './fieldDisplay';

describe('displayType', () => {
  it('mirrors the engine mapping and keeps unknown formats as hints', () => {
    expect(displayType('string', 'date-time')).toBe('datetime');
    expect(displayType('string', 'date')).toBe('date');
    expect(displayType('string', 'image')).toBe('image');
    expect(displayType('number', 'currency')).toBe('currency');
    expect(displayType('integer', 'percentage')).toBe('percentage');
    expect(displayType('number', 'quantity')).toBe('quantity');
    expect(displayType('string', 'person-name')).toBe('string');
    expect(displayType('number', 'date')).toBe('number');
    expect(displayType('boolean', undefined)).toBe('boolean');
    // Unknown base types show verbatim (clipped) — never a catalog key.
    expect(displayType('strng', undefined)).toBe('strng');
    expect(displayType(7, 'date')).toBe('');
  });
});

describe('sampleDisplay', () => {
  it('displays scalars and clips long strings', () => {
    expect(sampleDisplay(undefined)).toBe('');
    expect(sampleDisplay(null)).toBe('');
    expect(sampleDisplay('a')).toBe('a');
    expect(sampleDisplay(3.5)).toBe('3.5');
    expect(sampleDisplay(true)).toBe('true');
    const clipped = sampleDisplay('s'.repeat(MAX_TEXT_CHARS * 3));
    expect(clipped.length).toBe(MAX_TEXT_CHARS + 1);
    expect(clipped.endsWith('…')).toBe(true);
  });

  it('renders containers as bounded JSON and swallows unstringifiable values', () => {
    expect(sampleDisplay({ a: [1, 2] })).toBe('{"a":[1,2]}');
    const deep: Record<string, unknown> = {};
    deep.self = deep;
    expect(sampleDisplay(deep)).toBe('');
  });
});

describe('enumMember', () => {
  it('reads a bare scalar as a value with no label', () => {
    expect(enumMember('shipped')).toEqual({ value: 'shipped', label: '' });
    expect(enumMember(1)).toEqual({ value: 1, label: '' });
    expect(enumMember(true)).toEqual({ value: true, label: '' });
  });

  it('reads a { value, label } pair with the value kept in its declared type', () => {
    expect(enumMember({ value: 1, label: '一号' })).toEqual({ value: 1, label: '一号' });
    expect(enumMember({ value: 'backorder', label: '（入荷待ち）' })).toEqual({
      value: 'backorder',
      label: '（入荷待ち）',
    });
  });

  it('reads a label-less pair as an unlabeled value', () => {
    expect(enumMember({ value: 'x' })).toEqual({ value: 'x', label: '' });
  });

  it('drops what the engine would reject: containers, non-string labels, no value', () => {
    expect(enumMember({ label: 'orphan' })).toBeUndefined();
    expect(enumMember({ value: ['x'], label: 'pair' })).toBeUndefined();
    expect(enumMember({ value: 'x', label: 42 })).toBeUndefined();
    expect(enumMember({ a: 1 })).toBeUndefined();
    expect(enumMember(null)).toBeUndefined();
    expect(enumMember(['x'])).toBeUndefined();
  });

  it('a literal __proto__ value or label rides through as plain data, inert', () => {
    // As an ARRAY member it is never used as an object key, so nothing to
    // pollute — pin that it parses as ordinary strings and the prototype
    // stays untouched.
    expect(enumMember({ value: '__proto__', label: '__proto__' })).toEqual({
      value: '__proto__',
      label: '__proto__',
    });
    expect(enumOptions(['__proto__'])).toEqual([{ value: '__proto__', label: '' }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('reads only own properties, so an inherited value never leaks in', () => {
    // A YAML-materialized object never carries a prototype chain, but the
    // guard must hold for any hostile object that reaches it.
    const hostile = Object.create({ value: 'inherited', label: 'x' });
    expect(enumMember(hostile)).toBeUndefined();
  });

  it('clips an overlong label', () => {
    const parsed = enumMember({ value: 'x', label: 'y'.repeat(MAX_TEXT_CHARS + 40) });
    expect(parsed?.label.length).toBe(MAX_TEXT_CHARS + 1);
  });
});

describe('enumOptions', () => {
  it('pairs each value with its declared label, bare members with none', () => {
    expect(enumOptions([{ value: 'backorder', label: '（入荷待ち）' }, 'arrived'])).toEqual([
      { value: 'backorder', label: '（入荷待ち）' },
      { value: 'arrived', label: '' },
    ]);
  });

  it('drops malformed members and keeps the rest', () => {
    expect(enumOptions([{ label: 'orphan' }, 'ok', { value: {}, label: 'x' }])).toEqual([
      { value: 'ok', label: '' },
    ]);
  });

  it('caps a hostile list so a select cannot be filled', () => {
    const declared = Array.from({ length: MAX_ENUM_OPTIONS + 20 }, (_, i) => ({
      value: `v${i}`,
      label: `L${i}`,
    }));
    expect(enumOptions(declared)).toHaveLength(MAX_ENUM_OPTIONS);
  });
});

describe('enumValues', () => {
  it('reads a declared enum as display strings', () => {
    expect(enumValues(['heading', 'end'])).toEqual(['heading', 'end']);
  });

  it('stringifies non-string scalars and drops members no literal can express', () => {
    expect(enumValues([1, true, { a: 1 }, ['x'], null])).toEqual(['1', 'true']);
    expect(enumValues([{ value: 'v', label: 'ラベル' }])).toEqual(['v']);
  });

  it('reads a non-array declaration as no enum', () => {
    expect(enumValues(undefined)).toEqual([]);
    expect(enumValues('heading')).toEqual([]);
  });

  it('caps a hostile list so a select cannot be filled', () => {
    const declared = Array.from({ length: MAX_ENUM_OPTIONS + 20 }, (_, i) => `v${i}`);
    expect(enumValues(declared)).toHaveLength(MAX_ENUM_OPTIONS);
  });

  it('clips an overlong member', () => {
    const [only] = enumValues(['x'.repeat(MAX_TEXT_CHARS + 40)]);
    expect(only.length).toBe(MAX_TEXT_CHARS + 1);
    expect(only.endsWith('…')).toBe(true);
  });
});
