// Reading a field's declared display variants (`displayFormats`) for the
// placement format picker: what is kept, what is skipped, and the bound.
import { describe, expect, it } from 'vitest';
import { MAX_DECLARED_FORMATS } from './caps';
import { declaredFormats } from './declaredFormats';
import { readDefinitionsView } from './model';

describe('declaredFormats', () => {
  it('reads nothing from an absent or non-list value', () => {
    for (const raw of [undefined, null, 'wareki', 3, { id: 'wareki' }]) {
      expect(declaredFormats(raw)).toEqual([]);
    }
  });

  it('keeps the entries in the order written, label or not', () => {
    expect(declaredFormats([{ id: 'wareki', label: '和暦' }, { id: 'long' }])).toEqual([
      { id: 'wareki', label: '和暦' },
      { id: 'long', label: '' },
    ]);
  });

  it('skips every entry it cannot read, keeping the rest', () => {
    const raw = [
      'wareki',
      null,
      [{ id: 'x' }],
      { id: 3 },
      { label: 'no id' },
      { id: 'a', label: 3 },
      { id: 'b', lable: 'typo' },
      { id: 'kept' },
    ];
    expect(declaredFormats(raw)).toEqual([{ id: 'kept', label: '' }]);
  });

  it('keeps an empty id — the engine counts it as a restriction', () => {
    expect(declaredFormats([{ id: '' }])).toEqual([{ id: '', label: '' }]);
  });

  it('keeps the first entry of a repeated id', () => {
    expect(declaredFormats([{ id: 'wareki', label: 'first' }, { id: 'wareki' }])).toEqual([
      { id: 'wareki', label: 'first' },
    ]);
  });

  it('keeps the id verbatim — a long one is not clipped, a prototype name is plain text', () => {
    const long = 'x'.repeat(300);
    expect(declaredFormats([{ id: long }, { id: '__proto__' }, { id: 'constructor' }])).toEqual([
      { id: long, label: '' },
      { id: '__proto__', label: '' },
      { id: 'constructor', label: '' },
    ]);
  });

  it('reads an inherited key as absent', () => {
    const inherited = Object.create({ id: 'wareki' }) as Record<string, unknown>;
    expect(declaredFormats([inherited])).toEqual([]);
  });

  it(`reads at most ${MAX_DECLARED_FORMATS} entries`, () => {
    const raw = Array.from({ length: MAX_DECLARED_FORMATS + 5 }, (_, i) => ({ id: `f${i}` }));
    const read = declaredFormats(raw);
    expect(read).toHaveLength(MAX_DECLARED_FORMATS);
    expect(read.at(-1)?.id).toBe(`f${MAX_DECLARED_FORMATS - 1}`);
  });
});

describe('the palette carries them on each field', () => {
  it('at document scope, in a group and in a table row', () => {
    const view = readDefinitionsView(
      [
        'type: object',
        'properties:',
        '  issued: { type: string, format: date, displayFormats: [ { id: wareki, label: 和暦 } ] }',
        '  customer:',
        '    type: object',
        '    properties:',
        '      since: { type: string, format: date, displayFormats: [ { id: long } ] }',
        '  items:',
        '    type: array',
        '    items:',
        '      type: object',
        '      properties:',
        '        shipped: { type: string, format: date, displayFormats: [ { id: compact } ] }',
        '        memo: { type: string }',
        '',
      ].join('\n'),
    );
    const field = (key: string) =>
      view?.flatMap((group) => group.fields).find((candidate) => candidate.key === key);
    expect(field('issued')?.displayFormats).toEqual([{ id: 'wareki', label: '和暦' }]);
    expect(field('customer.since')?.displayFormats).toEqual([{ id: 'long', label: '' }]);
    expect(field('shipped')?.displayFormats).toEqual([{ id: 'compact', label: '' }]);
    expect(field('memo')).toBeDefined();
    expect(field('memo')?.displayFormats).toBeUndefined();
  });
});
