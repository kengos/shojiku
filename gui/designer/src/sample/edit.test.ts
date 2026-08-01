import { describe, expect, it } from 'vitest';
import { addSampleField, addSampleRow, removeSampleRow, setSampleValue } from './edit';
import { serializeParams } from './model';

describe('setSampleValue', () => {
  it('sets a leaf and preserves the order of untouched keys', () => {
    const text = JSON.stringify({ a: '1', b: '2', c: '3' });
    const next = setSampleValue(text, ['b'], '9');
    expect(next).toBe('{\n  "a": "1",\n  "b": "9",\n  "c": "3"\n}');
  });

  it('is a no-op (byte-identical) when the value is unchanged', () => {
    const text = '{"a": 1.50}';
    expect(setSampleValue(text, ['a'], 1.5)).toBe(text);
  });

  it('normalizes numbers elsewhere on a real edit', () => {
    const next = setSampleValue('{"a": 1.50, "b": 2}', ['b'], 3);
    expect(next).toContain('"a": 1.5');
    expect(next).toContain('"b": 3');
  });

  it('sets a value inside an array row', () => {
    const next = setSampleValue(
      JSON.stringify({ items: [{ name: 'x' }] }),
      ['items', 0, 'name'],
      'y',
    );
    expect(JSON.parse(next).items[0].name).toBe('y');
  });

  it('is a no-op when the path does not match the shape', () => {
    const text = serializeParams({ a: 'str' });
    // A numeric segment into a string leaf cannot resolve; nothing changes.
    expect(setSampleValue(text, ['a', 0], 'x')).toBe(text);
    // A string segment into a string leaf cannot resolve either.
    expect(setSampleValue(text, ['a', 'b'], 'x')).toBe(text);
  });

  it('is a no-op on invalid params', () => {
    expect(setSampleValue('nope', ['a'], 'x')).toBe('nope');
  });

  it('sets a value at a not-yet-present nested key', () => {
    const next = setSampleValue('{"a":{"b":1}}', ['a', 'c'], 2);
    const parsed = JSON.parse(next);
    expect(parsed.a).toEqual({ b: 1, c: 2 });
  });

  it('creates a MISSING intermediate map (a schema field whose params parent does not exist)', () => {
    // The data editor lists definitions-declared fields even when params lack
    // the containing object — typing a value must create it, never silently
    // drop the input.
    const next = setSampleValue('{"other":1}', ['customer', 'name'], '株式会社X');
    expect(JSON.parse(next)).toEqual({ other: 1, customer: { name: '株式会社X' } });
  });

  it('creation never invents array rows (a numeric segment under a missing key stays a no-op)', () => {
    const text = serializeParams({ a: 1 });
    expect(JSON.parse(setSampleValue(text, ['items', 0, 'name'], 'x'))).toEqual({ a: 1 });
  });

  it('a hostile __proto__ intermediate creates inert own data, never the prototype', () => {
    const next = setSampleValue('{}', ['__proto__', 'polluted'], 'yes');
    expect(next).toContain('"polluted"');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not pollute Object.prototype through a __proto__ path', () => {
    const text = '{"__proto__": {"polluted": "no"}}';
    const next = setSampleValue(text, ['__proto__', 'polluted'], 'yes');
    expect(next).toContain('"__proto__"');
    expect(next).toContain('"yes"');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('treats constructor/prototype keys as inert data', () => {
    const text = JSON.stringify({ constructor: { prototype: 1 } });
    const next = setSampleValue(text, ['constructor', 'prototype'], 2);
    expect(JSON.parse(next).constructor.prototype).toBe(2);
    expect(({} as Record<string, unknown>).prototype).toBeUndefined();
  });
});

describe('addSampleField', () => {
  it('adds a fresh top-level field', () => {
    const next = addSampleField('{}', 'note', 'hi');
    expect(JSON.parse(next).note).toBe('hi');
  });

  it('is a no-op for an empty key, an existing key, or invalid params', () => {
    expect(addSampleField('{}', '', 'x')).toBe('{}');
    expect(addSampleField('{"a":1}', 'a', 2)).toBe('{"a":1}');
    expect(addSampleField('nope', 'a', 1)).toBe('nope');
  });
});

describe('addSampleRow / removeSampleRow', () => {
  it('appends a row shaped like the existing rows', () => {
    const text = JSON.stringify({ items: [{ name: 'x', qty: 2 }] });
    const next = addSampleRow(text, ['items']);
    const items = JSON.parse(next).items;
    expect(items).toHaveLength(2);
    expect(Object.keys(items[1])).toEqual(['name', 'qty']);
    expect(items[1]).toEqual({ name: '', qty: 0 });
  });

  it('appends an empty object to an empty array', () => {
    const next = addSampleRow(JSON.stringify({ items: [] }), ['items']);
    expect(JSON.parse(next).items).toEqual([{}]);
  });

  it('blanks nested containers and booleans, and caps depth', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 40; i += 1) {
      deep = { a: deep };
    }
    // Shallow array + boolean exercise those blanking branches; `deep` exceeds
    // the walk cap without a stack overflow.
    const row = { flag: true, tags: ['a', 'b'], deep };
    const next = addSampleRow(JSON.stringify({ items: [row] }), ['items']);
    const appended = JSON.parse(next).items[1];
    expect(appended.flag).toBe(false);
    expect(appended.tags).toEqual([]);
  });

  it('is a no-op when the path is not an array or params are invalid', () => {
    const text = serializeParams({ a: 1 });
    expect(addSampleRow(text, ['a'])).toBe(text);
    expect(addSampleRow('nope', ['a'])).toBe('nope');
  });

  it('creates a MISSING top-level array with its first row (a schema list with no data yet)', () => {
    const next = addSampleRow(serializeParams({ a: 1 }), ['items']);
    expect(JSON.parse(next)).toEqual({ a: 1, items: [{}] });
  });

  it('does not create a missing NESTED array (top-level keys only)', () => {
    const text = serializeParams({ a: {} });
    expect(addSampleRow(text, ['a', 'items'])).toBe(text);
  });

  it('removes a row and keeps an emptied array', () => {
    const text = JSON.stringify({ items: [{ n: 1 }, { n: 2 }] });
    expect(JSON.parse(removeSampleRow(text, ['items'], 0)).items).toEqual([{ n: 2 }]);
    const oneLeft = JSON.stringify({ items: [{ n: 1 }] });
    expect(JSON.parse(removeSampleRow(oneLeft, ['items'], 0)).items).toEqual([]);
  });

  it('is a no-op for an out-of-range index, a non-array, or invalid params', () => {
    const text = JSON.stringify({ items: [{ n: 1 }] });
    expect(removeSampleRow(text, ['items'], 5)).toBe(text);
    expect(removeSampleRow(text, ['items'], -1)).toBe(text);
    const scalar = serializeParams({ a: 1 });
    expect(removeSampleRow(scalar, ['a'], 0)).toBe(scalar);
    expect(removeSampleRow('nope', ['a'], 0)).toBe('nope');
  });
});
