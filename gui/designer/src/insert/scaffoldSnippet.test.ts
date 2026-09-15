// Tests for scaffoldSnippet.ts — the iterable scaffold's item snippet
// (table / repeat_flow / repeat / list forms) composed from a palette group.
import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PaletteGroup } from '../palette/model';
import { BODY_ITEMS_PATH } from './model';
import { SCAFFOLD_VARIANTS, scaffoldFromGroup } from './scaffold';
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

describe('scaffoldSnippet', () => {
  const spec = scaffoldFromGroup(ITEMS);

  it('builds a table with one column per field and no widths or heights', () => {
    expect(scaffoldSnippet(spec, 'table')).toEqual({
      type: 'table',
      data: { key: 'order_items' },
      columns: [
        { label: '品名', data: { key: 'name' } },
        { label: '数量', data: { key: 'quantity' } },
        { label: 'note', data: { key: 'note' } },
      ],
    });
  });

  it('emits a per-column data.format when a column carries one (money columns)', () => {
    const withFormat = {
      sourceKey: 'rows',
      columns: [
        { key: 'name', label: '品名' },
        { key: 'amount', label: '金額', format: 'symbol' },
      ],
    };
    expect(scaffoldSnippet(withFormat, 'table')).toEqual({
      type: 'table',
      data: { key: 'rows' },
      columns: [
        { label: '品名', data: { key: 'name' } },
        { label: '金額', data: { key: 'amount', format: 'symbol' } },
      ],
    });
  });

  it('builds a visible auto-height card list for repeat_flow', () => {
    expect(scaffoldSnippet(spec, 'repeat_flow')).toEqual({
      type: 'repeat_flow',
      data: { key: 'order_items' },
      gap: 8,
      item: {
        box: { padding: 8 },
        style: { borderWidth: 0.5 },
        items: [
          { type: 'text', data: { key: 'name' } },
          { type: 'text', data: { key: 'quantity' } },
          { type: 'text', data: { key: 'note' } },
        ],
      },
    });
  });

  it('builds a two-by-two n-up grid whose cell is the card body', () => {
    expect(scaffoldSnippet(spec, 'repeat')).toEqual({
      type: 'repeat',
      data: { key: 'order_items' },
      grid: { columns: 2, rows: 2, columnGap: 8, rowGap: 8 },
      cell: {
        box: { padding: 8 },
        style: { borderWidth: 0.5 },
        items: [
          { type: 'text', data: { key: 'name' } },
          { type: 'text', data: { key: 'quantity' } },
          { type: 'text', data: { key: 'note' } },
        ],
      },
    });
  });

  it('authors neither breakBefore nor cutMarks nor the gap shorthand on the grid', () => {
    // Engine defaults stand, and `gap` needs a newer engine than the axis keys.
    const grid = scaffoldSnippet(spec, 'repeat') as Record<string, unknown>;
    expect(Object.keys(grid).sort()).toEqual(['cell', 'data', 'grid', 'type']);
    expect(Object.keys(grid.grid as object)).not.toContain('gap');
  });

  it('builds a list interpolating the first interpolation-safe field', () => {
    expect(scaffoldSnippet(spec, 'list')).toEqual({
      type: 'list',
      data: { key: 'order_items' },
      text: '{name}',
    });
  });

  it('skips fields that cannot ride the interpolation charset for the list text', () => {
    const jp = scaffoldFromGroup(group([{ key: '品名' }, { key: 'name' }]));
    expect(scaffoldSnippet(jp, 'list')).toEqual({
      type: 'list',
      data: { key: 'order_items' },
      text: '{name}',
    });
  });

  it('never composes interpolation grammar from an unsafe key', () => {
    const hostile = scaffoldFromGroup(group([{ key: 'a}b{c' }, { key: '品名' }]));
    expect(scaffoldSnippet(hostile, 'list')).toEqual({
      type: 'list',
      data: { key: 'order_items' },
    });
  });

  it('declares the first field for the list once the engine understands bindings', () => {
    // The blank-start default names fields in Japanese, so without
    // declarations the list silently dropped them; with one it shows the
    // first field through an ASCII alias.
    const jp = scaffoldFromGroup(group([{ key: '品名' }, { key: 'name' }]));
    expect(scaffoldSnippet(jp, 'list', true)).toEqual({
      type: 'list',
      data: { key: 'order_items' },
      text: '{f1}',
      bindings: { f1: { key: '品名' } },
    });
  });

  it('still writes the bare grammar when the first field can spell itself', () => {
    // Minimal wire: a declaration is authored only where the bare form cannot
    // say it, so a plain scaffold is byte-identical either way.
    expect(scaffoldSnippet(spec, 'list', true)).toEqual(scaffoldSnippet(spec, 'list'));
  });

  it('declares a hostile key through its stripped spelling, never composing it', () => {
    const hostile = scaffoldFromGroup(group([{ key: 'a}b{c' }]));
    expect(scaffoldSnippet(hostile, 'list', true)).toEqual({
      type: 'list',
      data: { key: 'order_items' },
      text: '{abc}',
      bindings: { abc: { key: 'a}b{c' } },
    });
  });

  it('degrades a field-less spec to the list for every variant', () => {
    const scalar = { sourceKey: 'tags', columns: [] };
    const expected = { type: 'list', data: { key: 'tags' } };
    expect(scaffoldSnippet(scalar, 'table')).toEqual(expected);
    expect(scaffoldSnippet(scalar, 'repeat_flow')).toEqual(expected);
    expect(scaffoldSnippet(scalar, 'repeat')).toEqual(expected);
    expect(scaffoldSnippet(scalar, 'list')).toEqual(expected);
  });

  it('passes designer-core snippet validation for every variant (applyOp inserts)', () => {
    const editor = Editor.create(
      ['sections:', '  body:', '    type: flow', '    items: []', ''].join('\n'),
    );
    for (const variant of SCAFFOLD_VARIANTS) {
      const result = editor.apply({
        op: 'insertItem',
        path: BODY_ITEMS_PATH,
        index: 0,
        value: scaffoldSnippet(spec, variant),
      });
      expect(result.ok).toBe(true);
    }
  });

  it('passes the same validation with a declared list', () => {
    const jp = scaffoldFromGroup(group([{ key: '品名' }]));
    const editor = Editor.create(
      ['sections:', '  body:', '    type: flow', '    items: []', ''].join('\n'),
    );
    const result = editor.apply({
      op: 'insertItem',
      path: BODY_ITEMS_PATH,
      index: 0,
      value: scaffoldSnippet(jp, 'list', true),
    });
    expect(result.ok).toBe(true);
    expect(editor.text()).toContain('        bindings:\n          f1:\n            key: 品名\n');
  });

  it('keeps hostile field keys inert data through the snippet path', () => {
    const hostile = scaffoldFromGroup(
      group([{ key: '__proto__', label: 'constructor' }, { key: '"]: x' }]),
    );
    const editor = Editor.create(
      ['sections:', '  body:', '    type: flow', '    items: []', ''].join('\n'),
    );
    const result = editor.apply({
      op: 'insertItem',
      path: BODY_ITEMS_PATH,
      index: 0,
      value: scaffoldSnippet(hostile, 'table'),
    });
    expect(result.ok).toBe(true);
    // The keys land as plain map data (quoted where YAML needs it) and the
    // serialized text stays a fixed point — no structural injection.
    const columns = editor.read('sections.body.items[0].columns');
    expect(columns).toEqual([
      { label: 'constructor', data: { key: '__proto__' } },
      { label: '"]: x', data: { key: '"]: x' } },
    ]);
    expect(Object.getPrototypeOf(editor.read('sections.body.items[0]'))).toBe(Object.prototype);
    const roundTrip = Editor.create(editor.text());
    expect(roundTrip.text()).toBe(editor.text());
  });

  it('keeps a hostile field key inert data in the grid cell too', () => {
    const hostile = scaffoldFromGroup(group([{ key: '__proto__' }]));
    const editor = Editor.create(
      ['sections:', '  body:', '    type: flow', '    items: []', ''].join('\n'),
    );
    const result = editor.apply({
      op: 'insertItem',
      path: BODY_ITEMS_PATH,
      index: 0,
      value: scaffoldSnippet(hostile, 'repeat'),
    });
    expect(result.ok).toBe(true);
    expect(editor.read('sections.body.items[0].cell.items')).toEqual([
      { type: 'text', data: { key: '__proto__' } },
    ]);
    expect(Object.getPrototypeOf(editor.read('sections.body.items[0].cell'))).toBe(
      Object.prototype,
    );
  });
});
