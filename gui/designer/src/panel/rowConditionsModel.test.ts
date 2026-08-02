import { describe, expect, it } from 'vitest';
import { readRawEntries, readRowConditions, valueFormFor } from './rowConditionsModel';

const TABLE = 'sections.body.items[0]';

/** A table node carrying the given entries. */
function node(entries: unknown) {
  return { type: 'table', row: { conditionalStyles: entries } };
}

describe('readRawEntries', () => {
  it('reads the entry list', () => {
    const entries = [{ when: { key: 'kind' } }];
    expect(readRawEntries(() => node(entries), TABLE)).toEqual(entries);
  });

  it('reads an absent, malformed, or unreadable list as empty', () => {
    expect(readRawEntries(() => ({ type: 'table' }), TABLE)).toEqual([]);
    expect(readRawEntries(() => node('not-a-list'), TABLE)).toEqual([]);
    expect(readRawEntries(() => undefined, TABLE)).toEqual([]);
    expect(
      readRawEntries(() => {
        throw new Error('bad path');
      }, TABLE),
    ).toEqual([]);
  });
});

describe('readRowConditions', () => {
  it('reads a rule with a predicate and style layers', () => {
    const rows = readRowConditions([
      {
        when: { key: 'kind', equals: 'heading' },
        styleNames: ['banner', 'loud'],
        style: {
          textAlign: 'center',
          fontWeight: 'bold',
          backgroundColor: '#dbe7ff',
          color: '#222222',
        },
      },
    ]);
    expect(rows).toEqual([
      {
        key: 'kind',
        equals: 'heading',
        hasEquals: true,
        textAlign: 'center',
        bold: true,
        backgroundColor: '#dbe7ff',
        color: '#222222',
        styleNameCount: 2,
      },
    ]);
  });

  it('reads an equals-less rule as the boolean form', () => {
    const [row] = readRowConditions([{ when: { key: 'flagged' } }]);
    expect(row.hasEquals).toBe(false);
    expect(row.equals).toBe('');
  });

  it('shows non-string equals scalars in their display form', () => {
    const rows = readRowConditions([
      { when: { key: 'n', equals: 2 } },
      { when: { key: 'b', equals: true } },
    ]);
    expect(rows.map((r) => r.equals)).toEqual(['2', 'true']);
    expect(rows.every((r) => r.hasEquals)).toBe(true);
  });

  it('still yields a row for hostile entries so indices stay true', () => {
    const rows = readRowConditions([null, 'nope', { when: 5, style: [] }, { when: { key: 7 } }]);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.key === '')).toBe(true);
    expect(rows.every((r) => r.bold === false)).toBe(true);
  });

  it('clips an overlong display string', () => {
    const [row] = readRowConditions([{ when: { key: 'k', equals: 'x'.repeat(200) } }]);
    expect(row.equals.length).toBeLessThan(200);
    expect(row.equals.endsWith('…')).toBe(true);
  });
});

describe('valueFormFor', () => {
  it('offers a declared enum as a choice', () => {
    expect(valueFormFor('string', ['a', 'b'])).toBe('enum');
  });

  it('drops the value control for a boolean field', () => {
    expect(valueFormFor('boolean', [])).toBe('boolean');
  });

  it('falls back to free entry', () => {
    expect(valueFormFor('string', [])).toBe('text');
    expect(valueFormFor('', [])).toBe('text');
  });

  it('prefers the enum even on a boolean field that declares one', () => {
    expect(valueFormFor('boolean', ['true', 'false'])).toBe('enum');
  });
});
