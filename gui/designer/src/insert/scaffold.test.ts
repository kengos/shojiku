import { describe, expect, it } from 'vitest';
import type { PaletteGroup } from '../palette/model';
import { defaultVariantFor, MAX_SCAFFOLD_FIELDS, scaffoldFromGroup, variantsFor } from './scaffold';
import { scaffoldSnippet } from './scaffoldSnippet';

function group(fields: readonly { key: string; label?: string; type?: string }[]): PaletteGroup {
  return {
    id: 'order_items',
    label: '明細',
    description: '',
    isArray: true,
    fields: fields.map((f) => ({
      key: f.key,
      label: f.label ?? '',
      type: f.type ?? 'string',
      description: '',
      sample: '',
      enumOptions: [],
    })),
  };
}

const ITEMS = group([
  { key: 'name', label: '品名' },
  { key: 'quantity', label: '数量', type: 'number' },
  { key: 'note' },
]);

describe('scaffoldFromGroup', () => {
  it('maps fields to columns with label falling back to the key', () => {
    expect(scaffoldFromGroup(ITEMS)).toEqual({
      sourceKey: 'order_items',
      columns: [
        { key: 'name', label: '品名' },
        { key: 'quantity', label: '数量' },
        { key: 'note', label: 'note' },
      ],
    });
  });

  it('excludes image-typed fields from every variant', () => {
    const spec = scaffoldFromGroup(
      group([
        { key: 'photo', type: 'image' },
        { key: 'name', label: '品名' },
      ]),
    );
    expect(spec.columns).toEqual([{ key: 'name', label: '品名' }]);
    for (const variant of ['table', 'repeat_flow', 'list'] as const) {
      expect(JSON.stringify(scaffoldSnippet(spec, variant))).not.toContain('photo');
    }
  });

  it('caps a hostile wide group at MAX_SCAFFOLD_FIELDS columns', () => {
    const wide = group(
      Array.from({ length: MAX_SCAFFOLD_FIELDS + 20 }, (_, i) => ({ key: `f${i}` })),
    );
    expect(scaffoldFromGroup(wide).columns).toHaveLength(MAX_SCAFFOLD_FIELDS);
  });
});
describe('variant availability', () => {
  it('offers all three variants with fields, the list alone without', () => {
    expect(variantsFor(scaffoldFromGroup(ITEMS))).toEqual(['table', 'repeat_flow', 'list']);
    expect(variantsFor({ sourceKey: 'tags', columns: [] })).toEqual(['list']);
  });

  it('drops a group as a table by default, a field-less group as a list', () => {
    expect(defaultVariantFor(scaffoldFromGroup(ITEMS))).toBe('table');
    expect(defaultVariantFor({ sourceKey: 'tags', columns: [] })).toBe('list');
  });
});
