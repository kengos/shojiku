import { describe, expect, it } from 'vitest';
import type { PaletteGroup } from '../palette/model';
import {
  defaultVariantFor,
  MAX_SCAFFOLD_FIELDS,
  SCAFFOLD_VARIANTS,
  scaffoldFromGroup,
  variantFitsBody,
  variantsFor,
} from './scaffold';
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
    for (const variant of SCAFFOLD_VARIANTS) {
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
  it('offers every variant with fields, the list alone without', () => {
    expect(variantsFor(scaffoldFromGroup(ITEMS))).toEqual([
      'table',
      'repeat_flow',
      'repeat',
      'list',
    ]);
    expect(variantsFor({ sourceKey: 'tags', columns: [] })).toEqual(['list']);
  });

  it('lists the four variants once, in the order the dialog offers them', () => {
    expect(SCAFFOLD_VARIANTS).toEqual(['table', 'repeat_flow', 'repeat', 'list']);
  });

  it('fits every variant into a flow body, and only table and list into any other', () => {
    // The cards and the grid are flow-body-only on the wire
    // (`repeat_flow_in_absolute_body` / `repeat_in_absolute_body`); a table and a
    // list lay out in every owner. The integration suite pins this answer
    // against the real engine's diagnostics.
    expect(SCAFFOLD_VARIANTS.filter((v) => variantFitsBody(v, true))).toEqual(SCAFFOLD_VARIANTS);
    expect(SCAFFOLD_VARIANTS.filter((v) => variantFitsBody(v, false))).toEqual(['table', 'list']);
  });

  it('never drops a flow-only variant from a palette drag, whatever the body', () => {
    // The drag inserts `defaultVariantFor` without asking, so it is a scaffold
    // entry point the dialog's gate does not guard — it must not need one.
    for (const spec of [scaffoldFromGroup(ITEMS), { sourceKey: 'tags', columns: [] }]) {
      expect(variantFitsBody(defaultVariantFor(spec), false)).toBe(true);
    }
  });

  it('drops a group as a table by default, a field-less group as a list', () => {
    expect(defaultVariantFor(scaffoldFromGroup(ITEMS))).toBe('table');
    expect(defaultVariantFor({ sourceKey: 'tags', columns: [] })).toBe('list');
  });
});
