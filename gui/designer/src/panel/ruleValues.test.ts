// @vitest-environment node
//
// The value chips a rule offers are read from UNTRUSTED params: bounded,
// own-property only, scalars only, never truncated into a value that commits
// something other than what it shows.
import { describe, expect, it } from 'vitest';
import { MAX_VALUE_CHIPS, sampleValues } from './ruleValues';

const params = (value: unknown) => JSON.stringify(value);

describe('sampleValues', () => {
  it('lists the distinct values of a field across the rows, in first-seen order', () => {
    const text = params({ rows: [{ k: 'b' }, { k: 'a' }, { k: 'b' }, { k: 3 }] });
    expect(sampleValues(text, 'rows', 'k')).toEqual(['b', 'a', '3']);
  });

  it('walks a dotted array key and a dotted field key', () => {
    const text = params({ order: { items: [{ meta: { kind: 'x' } }] } });
    expect(sampleValues(text, 'order.items', 'meta.kind')).toEqual(['x']);
  });

  it('caps the chips it returns', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ k: `v${i}` }));
    expect(sampleValues(params({ rows }), 'rows', 'k')).toHaveLength(MAX_VALUE_CHIPS);
  });

  it('reads no further than the row cap, whatever the array holds', () => {
    const rows = [...Array.from({ length: 1000 }, () => ({ k: 'same' })), { k: 'late' }];
    expect(sampleValues(params({ rows }), 'rows', 'k')).toEqual(['same']);
  });

  it('skips what cannot be a chip: empty, too long, non-scalar, boolean, null', () => {
    const rows = [
      { k: '' },
      { k: 'x'.repeat(41) },
      { k: { a: 1 } },
      { k: ['a'] },
      { k: true },
      { k: null },
      {},
      'not a row',
      { k: 'ok' },
    ];
    expect(sampleValues(params({ rows }), 'rows', 'k')).toEqual(['ok']);
  });

  it('answers nothing for params that do not parse, a scope that is not an array, or a prototype walk', () => {
    expect(sampleValues('{', 'rows', 'k')).toEqual([]);
    expect(sampleValues(params({ rows: { k: 'a' } }), 'rows', 'k')).toEqual([]);
    expect(sampleValues(params({ rows: [{ k: 'a' }] }), 'constructor', 'k')).toEqual([]);
    expect(sampleValues(params({ rows: [{}] }), 'rows', '__proto__')).toEqual([]);
  });
});
