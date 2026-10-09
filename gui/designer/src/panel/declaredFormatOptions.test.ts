// A field's declared display variants in the placement format picker: they head
// the list under their own origin, named by their labels, and once a field
// declares any, the rows the engine would refuse leave the list.
import { describe, expect, it } from 'vitest';
import type { DeclaredFormat } from '../palette/declaredFormats';
import { readDefinitionsView } from '../palette/model';
import { FORMAT_CATALOG as CATALOG } from '../testkit/formatCatalog';
import { allowedUnder, declaredRows } from './declaredFormatOptions';
import { formatOptions } from './formatModel';
import { pickerOptions } from './pickerModel';

const list = (...ids: string[]): DeclaredFormat[] => ids.map((id) => ({ id, label: '' }));
const spellings = (rows: readonly { spelling: string }[]) => rows.map((row) => row.spelling);

describe('formatOptions with no declared list', () => {
  it('is exactly what it was — an empty list and an absent one alike', () => {
    for (const [registry, type] of [
      [['stamp'], 'date'],
      [[], 'datetime'],
      [[], 'currency'],
      [[], 'number'],
      [[], undefined],
      [['stamp'], 'string'],
    ] as const) {
      const before = formatOptions(registry, type, undefined, CATALOG);
      expect(formatOptions(registry, type, undefined, CATALOG, [])).toEqual(before);
      expect(formatOptions(registry, type, undefined, CATALOG, undefined)).toEqual(before);
    }
  });
});

describe('formatOptions with a declared list', () => {
  it('heads the list with the declared variants, in the order written', () => {
    const declared = [
      { id: 'wareki', label: '和暦（元号）' },
      { id: 'stamp', label: '' },
    ];
    const rows = formatOptions(['stamp'], 'date', undefined, CATALOG, declared);
    expect(rows.slice(0, 2)).toEqual([
      {
        spelling: 'wareki',
        label: '和暦（元号）',
        labelKey: 'format.variant.wareki',
        samples: ['令和8年11月3日'],
        origin: 'declared',
        dropsTime: false,
      },
      {
        spelling: 'stamp',
        label: undefined,
        labelKey: undefined,
        samples: ['2026.11.03'],
        origin: 'declared',
        dropsTime: false,
      },
    ]);
    // Each spelling appears once — at its declared row, not again in its own
    // origin's group below.
    expect(spellings(rows)).toEqual(['wareki', 'stamp', 'datetime']);
  });

  it('offers a declared id the engine does not list, with no sample', () => {
    const rows = formatOptions([], 'date', undefined, CATALOG, [{ id: 'foo', label: 'Foo' }]);
    expect(rows[0]).toEqual({
      spelling: 'foo',
      label: 'Foo',
      labelKey: undefined,
      samples: [],
      origin: 'declared',
      dropsTime: false,
    });
  });

  it('carries what the engine measures for a declared variant', () => {
    const [row] = formatOptions([], 'datetime', undefined, CATALOG, list('compact'));
    expect(row).toMatchObject({ spelling: 'compact', samples: ['2026/11/03'], dropsTime: true });
  });

  it('drops the locale variants the list leaves out, keeping the picks that always pass', () => {
    // `wareki-compact` and `compact` are pack variants the list does not name —
    // validate would refuse them, and the render with them. `date` is a type
    // name (an override), and `stamp` is a registry name, so both still pass.
    const rows = formatOptions(['stamp'], 'datetime', undefined, CATALOG, list('wareki'));
    expect(spellings(rows)).toEqual(['wareki', 'date']);
    const dated = formatOptions(['stamp'], 'date', undefined, CATALOG, list('long'));
    expect(spellings(dated)).toEqual(['long', 'stamp', 'datetime']);
  });

  it('keeps the money formats on an amount and on a number', () => {
    expect(spellings(formatOptions([], 'currency', undefined, CATALOG, list('foo')))).toEqual([
      'foo',
      'symbol',
      'name',
    ]);
    expect(spellings(formatOptions([], 'number', undefined, CATALOG, list('foo')))).toEqual([
      'foo',
      'currency',
      'symbol',
      'name',
      'percentage',
      'quantity',
    ]);
  });

  it('restricts on a list holding only an empty id, offering no row for it', () => {
    const rows = formatOptions(['stamp'], 'date', undefined, CATALOG, [{ id: '', label: 'x' }]);
    expect(spellings(rows)).toEqual(['stamp', 'datetime']);
  });

  it('names a declared type name by the label its override row carries', () => {
    const [row] = formatOptions([], 'number', undefined, CATALOG, list('currency'));
    expect(row).toMatchObject({ spelling: 'currency', labelKey: 'format.label.currency' });
    expect(declaredRows(list('string', 'image'), 'string', CATALOG).map((r) => r.labelKey)).toEqual(
      [undefined, undefined],
    );
  });

  it('heads nothing without a catalog — the declared rows stay first, unheaded like the rest', () => {
    const rows = formatOptions(['stamp'], 'date', undefined, null, [
      { id: 'wareki', label: '和暦' },
    ]);
    expect(rows[0]).toMatchObject({ spelling: 'wareki', label: '和暦', origin: undefined });
    expect(rows.every((row) => row.origin === undefined)).toBe(true);
  });

  it('keeps every row without a catalog, since each is a type name or a registry name', () => {
    expect(spellings(formatOptions(['stamp'], undefined, undefined, null, list('foo')))).toEqual([
      'foo',
      'stamp',
      'currency',
      'date',
      'datetime',
      'percentage',
      'quantity',
    ]);
  });
});

describe('allowedUnder — the engine refusal it mirrors', () => {
  it('allows everything while the field declares nothing', () => {
    expect(allowedUnder([], 'anything', 'date', [])).toBe(true);
  });

  it('allows a declared id, a type name and a registry name on any type', () => {
    for (const type of ['date', 'currency', 'string', undefined]) {
      expect(allowedUnder(list('wareki'), 'wareki', type, [])).toBe(true);
      expect(allowedUnder(list('wareki'), 'image', type, [])).toBe(true);
      expect(allowedUnder(list('wareki'), 'stamp', type, ['stamp'])).toBe(true);
    }
  });

  it('allows the three money formats on an amount and two on a number, nowhere else', () => {
    for (const spelling of ['default', 'symbol', 'name']) {
      expect(allowedUnder(list('x'), spelling, 'currency', [])).toBe(true);
      expect(allowedUnder(list('x'), spelling, 'number', [])).toBe(spelling !== 'default');
      expect(allowedUnder(list('x'), spelling, 'date', [])).toBe(false);
    }
  });

  it('refuses a pick outside all of them, `value` included', () => {
    expect(allowedUnder(list('wareki'), 'long', 'date', ['stamp'])).toBe(false);
    expect(allowedUnder(list('wareki'), 'value', 'string', [])).toBe(false);
    expect(allowedUnder(list('wareki'), '__proto__', 'date', [])).toBe(false);
  });
});

describe('declaredRows', () => {
  it('reads no catalog entry for an unresolved type', () => {
    expect(declaredRows(list('wareki'), undefined, CATALOG)).toEqual([
      {
        spelling: 'wareki',
        label: undefined,
        labelKey: 'format.variant.wareki',
        samples: [],
        origin: 'declared',
        dropsTime: false,
      },
    ]);
  });

  it('samples a declared TYPE name as that type', () => {
    expect(declaredRows(list('currency'), 'number', CATALOG)[0]?.samples).toEqual(['1,234,568']);
  });
});

describe('the binding picker options carry the list', () => {
  const groups = readDefinitionsView(
    [
      'type: object',
      'properties:',
      '  issued: { type: string, format: date, displayFormats: [ { id: wareki, label: 和暦 } ] }',
      '  items:',
      '    type: array',
      '    items:',
      '      type: object',
      '      properties:',
      '        shipped: { type: string, format: date, displayFormats: [ { id: long } ] }',
      '',
    ].join('\n'),
  );

  it('at document scope and in a row scope', () => {
    expect(pickerOptions(groups, null, '')[0]?.displayFormats).toEqual([
      { id: 'wareki', label: '和暦' },
    ]);
    expect(pickerOptions(groups, 'items', '')[0]?.displayFormats).toEqual([
      { id: 'long', label: '' },
    ]);
  });
});
