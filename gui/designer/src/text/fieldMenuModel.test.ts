import { describe, expect, it } from 'vitest';
import type { PickerOption } from '../panel/pickerModel';
import type { ChipContext } from './chipContext';
import { fieldMenu } from './fieldMenuModel';

const OPTIONS: readonly PickerOption[] = [
  { key: 'customer.name', label: '顧客名', type: 'string', sample: '山田太郎', enumValues: [] },
  { key: 'total', label: 'Total', type: 'number', sample: '5000', enumValues: [] },
  { key: 'bad key', label: 'Unsafe', type: 'string', sample: '', enumValues: [] },
];

const DOCUMENT_OPTIONS: readonly PickerOption[] = [
  { key: 'store_name', label: '店舗名', type: 'string', sample: '青山店', enumValues: [] },
];

function context(over: Partial<ChipContext> = {}): ChipContext {
  return {
    options: OPTIONS,
    documentOptions: OPTIONS,
    scope: null,
    declared: new Map(),
    canDeclare: false,
    otherNames: [],
    ...over,
  };
}

function keysOf(menu: ReturnType<typeof fieldMenu>): string[] {
  return menu.sections.flatMap((section) => section.rows.map((row) => row.key));
}

describe('fieldMenu offerability', () => {
  it('withholds a charset-unsafe key from an engine that cannot declare', () => {
    const menu = fieldMenu(context(), '');
    expect(keysOf(menu)).toEqual(['customer.name', 'total']);
    expect(menu.offered).toBe(2);
  });

  it('offers every field once the engine understands declarations', () => {
    const menu = fieldMenu(context({ canDeclare: true }), '');
    expect(keysOf(menu)).toEqual(['customer.name', 'total', 'bad key']);
    expect(menu.offered).toBe(3);
  });
});

describe('fieldMenu sections', () => {
  it('adds a labeled document section inside a row scope that can declare', () => {
    const menu = fieldMenu(
      context({ scope: 'items', documentOptions: DOCUMENT_OPTIONS, canDeclare: true }),
      '',
    );
    expect(menu.sections.map((section) => [section.id, section.headingKey, section.doc])).toEqual([
      ['row', 'chips.section.row', false],
      ['document', 'chips.section.document', true],
    ]);
  });

  it('withholds the document section from a row scope that cannot declare', () => {
    const menu = fieldMenu(context({ scope: 'items', documentOptions: DOCUMENT_OPTIONS }), '');
    expect(menu.sections).toHaveLength(1);
    expect(menu.sections[0].headingKey).toBe('chips.section.row');
    expect(menu.offered).toBe(2);
  });

  it('leaves the single list unlabeled at document scope', () => {
    // `documentOptions` equals `options` there, so a second section would only
    // repeat the same rows under a heading.
    const menu = fieldMenu(context({ canDeclare: true }), '');
    expect(menu.sections).toHaveLength(1);
    expect(menu.sections[0].headingKey).toBeNull();
  });
});

describe('fieldMenu filtering', () => {
  it('narrows rows by the query while `offered` keeps the pre-filter count', () => {
    // The two empty states are different: nothing offered at all reads as "no
    // fields", a query that matched nothing reads as "no matches".
    const menu = fieldMenu(context(), 'tot');
    expect(keysOf(menu)).toEqual(['total']);
    expect(menu.offered).toBe(2);
  });

  it('drops a section the query empties, and reports zero rows for no matches', () => {
    const menu = fieldMenu(
      context({ scope: 'items', documentOptions: DOCUMENT_OPTIONS, canDeclare: true }),
      'store',
    );
    expect(menu.sections).toHaveLength(1);
    expect(menu.sections[0].id).toBe('document');
    expect(fieldMenu(context(), 'zzz').sections).toHaveLength(0);
  });

  it('filters BOTH sections against the same query', () => {
    const menu = fieldMenu(
      context({ scope: 'items', documentOptions: DOCUMENT_OPTIONS, canDeclare: true }),
      'name',
    );
    expect(keysOf(menu)).toEqual(['customer.name', 'store_name']);
  });
});
