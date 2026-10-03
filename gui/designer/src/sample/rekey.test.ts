// Re-keying the sample data: rename / remove a key along a definitions keys path
// (rows included, nested arrays included), key order kept, a path the data
// contradicts skipped, an existing target never overwritten, hostile key names
// kept as plain data — and the undo that puts removed values back in place.

import { describe, expect, it } from 'vitest';
import { removeSampleKey, renameSampleKey, restoreSampleValues } from './rekey';

const DATA = JSON.stringify({
  a: 1,
  b: 2,
  rows: [{ x: 1, y: 2 }, { x: 3 }, 'junk'],
  orders: [{ lines: [{ sku: 's1', q: 1 }] }, { lines: [{ sku: 's2' }] }],
});

describe('renameSampleKey', () => {
  it('renames a top-level key in place', () => {
    const next = renameSampleKey(DATA, ['properties', 'a'], 'z');
    expect(Object.keys(JSON.parse(next))).toEqual(['z', 'b', 'rows', 'orders']);
  });

  it('renames in every row, skipping a row the shape contradicts', () => {
    const next = JSON.parse(
      renameSampleKey(DATA, ['properties', 'rows', 'items', 'properties', 'x'], 'w'),
    );
    expect(next.rows).toEqual([{ w: 1, y: 2 }, { w: 3 }, 'junk']);
  });

  it('renames inside nested arrays of rows', () => {
    const keys = [
      'properties',
      'orders',
      'items',
      'properties',
      'lines',
      'items',
      'properties',
      'sku',
    ];
    const next = JSON.parse(renameSampleKey(DATA, keys, 'code'));
    expect(next.orders).toEqual([{ lines: [{ code: 's1', q: 1 }] }, { lines: [{ code: 's2' }] }]);
  });

  it('leaves the text untouched when nothing matches, or the target exists', () => {
    expect(renameSampleKey(DATA, ['properties', 'nope'], 'z')).toBe(DATA);
    expect(renameSampleKey(DATA, ['properties', 'a'], 'b')).toBe(DATA);
    expect(renameSampleKey('not json', ['properties', 'a'], 'z')).toBe('not json');
    expect(renameSampleKey(DATA, ['properties', 'a', 'properties', 'q'], 'z')).toBe(DATA);
    expect(renameSampleKey(DATA, ['bogus', 'a'], 'z')).toBe(DATA);
  });

  it('leaves an array untouched when no row holds the key', () => {
    expect(renameSampleKey(DATA, ['properties', 'rows', 'items', 'properties', 'zz'], 'w')).toBe(
      DATA,
    );
    expect(restoreSampleValues(DATA, [{ path: ['rows', 0, 'x'], value: 9, position: 0 }])).toBe(
      DATA,
    );
  });

  it('skips a path whose array or parent object the data does not have', () => {
    expect(renameSampleKey(DATA, ['properties', 'a', 'items', 'properties', 'x'], 'z')).toBe(DATA);
    expect(renameSampleKey(DATA, ['properties', 'nope', 'properties', 'x'], 'z')).toBe(DATA);
  });

  it('keeps `__proto__` and `constructor` as plain keys', () => {
    const hostile = '{"__proto__":{"polluted":1},"constructor":2}';
    const next = renameSampleKey(hostile, ['properties', 'constructor'], 'c2');
    expect(next).toContain('"__proto__"');
    expect(Object.keys(JSON.parse(next))).toEqual(['__proto__', 'c2']);
    const renamed = renameSampleKey(hostile, ['properties', '__proto__'], 'p');
    expect(Object.keys(JSON.parse(renamed))).toEqual(['p', 'constructor']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('removeSampleKey / restoreSampleValues', () => {
  it('removes the key in every row, reporting what and where', () => {
    const { text, removed } = removeSampleKey(DATA, [
      'properties',
      'rows',
      'items',
      'properties',
      'x',
    ]);
    expect(JSON.parse(text).rows).toEqual([{ y: 2 }, {}, 'junk']);
    expect(removed).toEqual([
      { path: ['rows', 0, 'x'], value: 1, position: 0 },
      { path: ['rows', 1, 'x'], value: 3, position: 0 },
    ]);
    expect(restoreSampleValues(text, removed)).toBe(JSON.stringify(JSON.parse(DATA), null, 2));
  });

  it('removes a whole table', () => {
    const { text, removed } = removeSampleKey(DATA, ['properties', 'orders']);
    expect(Object.keys(JSON.parse(text))).toEqual(['a', 'b', 'rows']);
    expect(removed[0]?.path).toEqual(['orders']);
  });

  it('removes nothing when the key is absent', () => {
    expect(removeSampleKey(DATA, ['properties', 'nope'])).toEqual({ text: DATA, removed: [] });
  });

  it('skips a place that is gone or already filled again', () => {
    const removed = [
      { path: ['rows', 5, 'x'], value: 1, position: 0 },
      { path: ['a'], value: 9, position: 0 },
      { path: ['missing', 'x'], value: 1, position: 0 },
      { path: ['rows', 0], value: 1, position: 0 },
      { path: [], value: 1, position: 0 },
      { path: ['b', 'x'], value: 1, position: 0 },
    ];
    expect(restoreSampleValues(DATA, removed)).toBe(DATA);
    expect(restoreSampleValues('not json', removed)).toBe('not json');
  });
});
