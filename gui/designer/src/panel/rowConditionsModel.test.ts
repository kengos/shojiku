import { describe, expect, it } from 'vitest';
import { openedRule, readRawEntries, readRowConditions, valueFormFor } from './rowConditionsModel';

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
        boolEquals: false,
        textAlign: 'center',
        verticalAlign: '',
        fontWeight: 'bold',
        backgroundColor: '#dbe7ff',
        color: '#222222',
        fontStyle: '',
        fontSize: '',
        fontFamily: '',
        styleNameCount: 2,
        styleKeyCount: 4,
      },
    ]);
  });

  it('reads a boolean `equals` as the off state, and a quoted one as text', () => {
    const [off, quoted] = readRowConditions([
      { when: { key: 'paid', equals: false } },
      { when: { key: 'paid', equals: 'false' } },
    ]);
    expect(off).toMatchObject({ equals: 'false', hasEquals: true, boolEquals: true });
    expect(quoted).toMatchObject({ equals: 'false', hasEquals: true, boolEquals: false });
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
    expect(rows.every((r) => r.fontWeight === '')).toBe(true);
    // A `style` that is not a map contributes no keys — the count is about the
    // wire, so a hostile shape must not inflate it into a false "adds something".
    expect(rows.every((r) => r.styleKeyCount === 0)).toBe(true);
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

  it('keeps fontWeight RAW, so an explicit `normal` is not read as unset', () => {
    // The Designer authors `normal` when Bold is un-ticked over a bold band.
    const [row] = readRowConditions([{ when: { key: 'k' }, style: { fontWeight: 'normal' } }]);
    expect(row.fontWeight).toBe('normal');
    expect(row.styleKeyCount).toBe(1);
  });

  it('counts style keys the panel does not model, own properties only', () => {
    const [row] = readRowConditions([
      { when: { key: 'k' }, style: { fontSize: 14, opacity: 0.5, textAlign: 'center' } },
    ]);
    expect(row.styleKeyCount).toBe(3);
    expect(row.textAlign).toBe('center');
  });
});

describe('openedRule', () => {
  it('names the open rule, and none once the index is gone or unset', () => {
    expect(openedRule(['a', 'b'], 1)).toEqual({ rule: 'b', index: 1 });
    // An undo that took the open rule away shows the list again.
    expect(openedRule(['a'], 1)).toBeNull();
    expect(openedRule(['a'], null)).toBeNull();
  });
});
