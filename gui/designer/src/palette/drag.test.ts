import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PlacedBox } from '../engine/types';
import { planInsertDrop, planPaletteDrop } from './drag';
import { boundSnippet, dropSnippet } from './dragSnippet';
import type { PaletteGroup } from './model';

/** A read function over a flat path → materialized-value table. */
function readOf(doc: Record<string, unknown>): ReadFn {
  return (path) => doc[path];
}

const box = (path: string, y: number, h = 20): PlacedBox => ({
  path,
  border: { x: 10, y, w: 100, h },
  content: { x: 10, y, w: 100, h },
});

const FLOW_DOC: Record<string, unknown> = {
  'sections.body': { type: 'flow', items: [{}, {}, {}] },
  'sections.body.items': [{}, {}, {}],
};

const PAGE: readonly PlacedBox[] = [
  box('sections.body.items[0]', 0),
  box('sections.body.items[1]', 30),
  box('sections.body.items[2]', 60),
];

describe('boundSnippet', () => {
  it('binds a string field as a flow-auto-sized text item', () => {
    expect(
      boundSnippet({ key: 'order.code', type: 'string', label: 'コード', group: null }),
    ).toEqual({
      type: 'text',
      data: { key: 'order.code' },
    });
  });

  it('binds number-like display types as text too', () => {
    for (const type of ['number', 'currency', 'date', 'datetime', 'boolean', 'weird']) {
      expect(boundSnippet({ key: 'k', type, label: '', group: null })).toEqual({
        type: 'text',
        data: { key: 'k' },
      });
    }
  });

  it('gives a 工房モード currency drop a symbol format; engineer mode stays bare', () => {
    // Workshop: the field's currency-ness came from the user's own kind
    // pick, so the drop shows ¥ (number + `symbol` coerces at render).
    expect(
      boundSnippet({ key: '金額', type: 'currency', label: '金額', group: null }, true),
    ).toEqual({
      type: 'text',
      data: { key: '金額', format: 'symbol' },
    });
    // Engineer mode (default): the declared `displayFormat` is the
    // engineer's channel — the drop authors no format of its own.
    expect(boundSnippet({ key: '金額', type: 'currency', label: '金額', group: null })).toEqual({
      type: 'text',
      data: { key: '金額' },
    });
    // The workshop flag touches only currency fields.
    expect(boundSnippet({ key: 'k', type: 'number', label: '', group: null }, true)).toEqual({
      type: 'text',
      data: { key: 'k' },
    });
  });

  it('binds an image field as an image item with an explicit box', () => {
    expect(boundSnippet({ key: 'order.logo', type: 'image', label: 'ロゴ', group: null })).toEqual({
      type: 'image',
      data: { key: 'order.logo' },
      box: { w: 120, h: 60 },
    });
  });

  it('keeps a hostile key a plain string scalar (structural injection impossible)', () => {
    const hostile = '__proto__.a: [zzz]\n  - {';
    const snippet = boundSnippet({ key: hostile, type: 'string', label: '', group: null });
    expect(snippet).toEqual({ type: 'text', data: { key: hostile } });
  });
});

describe('dropSnippet', () => {
  const group = (fields: readonly { key: string; type?: string }[]): PaletteGroup => ({
    id: 'order_items',
    label: '明細',
    description: '',
    isArray: true,
    fields: fields.map((f) => ({
      key: f.key,
      label: '',
      type: f.type ?? 'string',
      description: '',
      sample: '',
      enumOptions: [],
    })),
  });

  it('routes a field payload through boundSnippet', () => {
    const field = { key: 'order.code', type: 'string', label: '', group: null };
    expect(dropSnippet({ kind: 'field', field })).toEqual(boundSnippet(field));
  });

  it('threads the workshop flag through to the field snippet', () => {
    const field = { key: '金額', type: 'currency', label: '金額', group: null };
    expect(dropSnippet({ kind: 'field', field }, true)).toEqual({
      type: 'text',
      data: { key: '金額', format: 'symbol' },
    });
  });

  it('drops a fielded array group as its default table scaffold', () => {
    expect(dropSnippet({ kind: 'group', group: group([{ key: 'name' }]) })).toEqual({
      type: 'table',
      data: { key: 'order_items' },
      columns: [{ label: 'name', data: { key: 'name' } }],
    });
  });

  it('drops a field-less array group as a list', () => {
    expect(dropSnippet({ kind: 'group', group: group([]) })).toEqual({
      type: 'list',
      data: { key: 'order_items' },
    });
  });

  it('threads the declarations flag to the scaffold, inert for the drop defaults', () => {
    // Only a list with FIELDS can carry a declaration, and a drop never picks
    // that shape: a fielded group defaults to the table, a field-less one to a
    // list with nothing to declare. The flag rides along so the drop cannot
    // drift from the insert dialog, which does reach the declaring variant.
    for (const fields of [[{ key: '品名' }], []]) {
      const payload = { kind: 'group', group: group(fields) } as const;
      expect(dropSnippet(payload, false, true)).toEqual(dropSnippet(payload, false, false));
    }
  });
});

describe('planInsertDrop', () => {
  const read = readOf(FLOW_DOC);

  it('plans the slot the pointer precedes, with an indicator line', () => {
    const plan = planInsertDrop(read, PAGE, { x: 20, y: 26 });
    expect(plan.index).toBe(1);
    expect(plan.line).not.toBeNull();
    expect(plan.line?.y1).toBe(25);
  });

  it('plans the tail slot past the last sibling', () => {
    const plan = planInsertDrop(read, PAGE, { x: 20, y: 200 });
    expect(plan.index).toBe(3);
    expect(plan.line?.y1).toBe(80);
  });

  it('maps a sparse page run to DOCUMENT indices', () => {
    const sparse = [box('sections.body.items[5]', 0), box('sections.body.items[6]', 30)];
    const doc = readOf({
      'sections.body': { type: 'flow' },
      'sections.body.items': new Array(8).fill({}),
    });
    const plan = planInsertDrop(doc, sparse, { x: 20, y: 35 });
    expect(plan.index).toBe(6);
  });

  it('appends at the end when the body is not a flow', () => {
    const grid = readOf({
      'sections.body': { type: 'grid' },
      'sections.body.items': [{}, {}],
    });
    expect(planInsertDrop(grid, PAGE, { x: 20, y: 26 })).toEqual({ index: 2, line: null });
  });

  it('appends when the page shows no body items (band-only page / empty body)', () => {
    expect(planInsertDrop(read, [], { x: 20, y: 26 })).toEqual({ index: 3, line: null });
    const empty = readOf({ 'sections.body': { type: 'flow' }, 'sections.body.items': [] });
    expect(planInsertDrop(empty, [], { x: 20, y: 26 })).toEqual({ index: 0, line: null });
  });

  it('appends when sibling geometry is ambiguous (duplicated repeat indices)', () => {
    const dup = [box('sections.body.items[0]', 0), box('sections.body.items[0]', 30)];
    expect(planInsertDrop(read, dup, { x: 20, y: 26 })).toEqual({ index: 3, line: null });
  });

  it('appends on a hostile non-finite pointer', () => {
    expect(planInsertDrop(read, PAGE, { x: 20, y: Number.NaN })).toEqual({
      index: 3,
      line: null,
    });
  });

  it('appends at 0 when the body read throws or is malformed', () => {
    const throwing: ReadFn = () => {
      throw new Error('hostile');
    };
    expect(planInsertDrop(throwing, PAGE, { x: 20, y: 26 })).toEqual({ index: 0, line: null });
    const bad = readOf({ 'sections.body': 'not a map' });
    expect(planInsertDrop(bad, PAGE, { x: 20, y: 26 })).toEqual({ index: 0, line: null });
  });
});

describe('planPaletteDrop', () => {
  const TABLE = 'sections.body.items[1]';
  const COLUMN = `${TABLE}.columns[0]`;
  const CELL_ITEMS = `${COLUMN}.cell.items`;
  // A table whose first column carries a `cell:` sub-template, laid out as two
  // ROWS — both fragments carry the column's one document path.
  const CELL_DOC: Record<string, unknown> = {
    ...FLOW_DOC,
    [TABLE]: {
      type: 'table',
      data: { key: 'items' },
      columns: [{ label: 'c', cell: { items: [] } }],
    },
    [COLUMN]: { label: 'c', cell: { items: [] } },
    [CELL_ITEMS]: [],
  };
  const cellBox = (y: number): PlacedBox => ({
    path: COLUMN,
    border: { x: 200, y, w: 60, h: 20 },
    content: { x: 200, y, w: 60, h: 20 },
  });
  // Page geometry: the flow siblings from the body fixture, plus the two
  // drawn fragments of the cell column.
  const CELL_PAGE: readonly PlacedBox[] = [...PAGE, cellBox(100), cellBox(130)];
  const IN_CELL = { x: 220, y: 110 };
  const IN_BODY = { x: 20, y: 26 };
  const docField = {
    kind: 'field',
    field: { key: 'store.name', type: 'string', label: '', group: null },
  } as const;
  const rowField = {
    kind: 'field',
    field: { key: 'qty', type: 'number', label: '', group: 'items' },
  } as const;
  const read = readOf(CELL_DOC);

  it('plans a document field into the cell under the pointer, appending at the end', () => {
    const plan = planPaletteDrop(read, CELL_PAGE, IN_CELL, docField, true);
    expect(plan).not.toBeNull();
    expect(plan?.path).toBe(CELL_ITEMS);
    expect(plan?.index).toBe(0);
    expect(plan?.documentScoped).toBe(true);
    // No slot line — every row draws the same sub-template, so the indicator
    // outlines the cell instead, once per drawn fragment.
    expect(plan?.line).toBeNull();
    expect(plan?.rects).toEqual([cellBox(100).border, cellBox(130).border]);
  });

  it('appends AFTER the items a cell already holds', () => {
    const filled = readOf({ ...CELL_DOC, [CELL_ITEMS]: [{}, {}] });
    expect(planPaletteDrop(filled, CELL_PAGE, IN_CELL, docField, true)?.index).toBe(2);
  });

  it('plans a document field over the BODY exactly as before, with its line', () => {
    const plan = planPaletteDrop(read, CELL_PAGE, IN_BODY, docField, false);
    expect(plan?.path).toBe('sections.body.items');
    expect(plan?.documentScoped).toBe(false);
    expect(plan?.rects).toEqual([]);
    expect(plan?.line).not.toBeNull();
    expect(plan?.index).toBe(planInsertDrop(read, PAGE, IN_BODY).index);
  });

  it('lets a ROW field into its OWN group’s cell, with no scope authored', () => {
    const plan = planPaletteDrop(read, CELL_PAGE, IN_CELL, rowField, true);
    expect(plan?.path).toBe(CELL_ITEMS);
    // The row IS the ambient scope there — `scope: element` is never authored.
    expect(plan?.documentScoped).toBe(false);
  });

  it('refuses a row field over a FOREIGN group’s cell', () => {
    const foreign = { ...rowField, field: { ...rowField.field, group: 'other' } } as const;
    expect(planPaletteDrop(read, CELL_PAGE, IN_CELL, foreign, true)).toBeNull();
  });

  it('refuses a row field over the body (its key means nothing there)', () => {
    expect(planPaletteDrop(read, CELL_PAGE, IN_BODY, rowField, true)).toBeNull();
  });

  it('refuses a GROUP scaffold over a cell (iterables are body-level)', () => {
    const group = {
      kind: 'group',
      group: { id: 'items', label: '', description: '', isArray: true, fields: [] },
    } as const;
    expect(planPaletteDrop(read, CELL_PAGE, IN_CELL, group, true)).toBeNull();
    // …but the same payload still plans over the body.
    expect(planPaletteDrop(read, CELL_PAGE, IN_BODY, group, true)?.path).toBe(
      'sections.body.items',
    );
  });

  it('refuses a document field over a cell when the engine cannot carry a scope', () => {
    // Without `binding.scope` the drop could only author a binding that reads
    // the ROW — silently the wrong value, so nothing happens instead.
    expect(planPaletteDrop(read, CELL_PAGE, IN_CELL, docField, false)).toBeNull();
  });

  it('enters a repeat cell and a repeat_flow card the same way', () => {
    for (const [key, type] of [
      ['cell', 'repeat'],
      ['item', 'repeat_flow'],
    ] as const) {
      const path = 'sections.body.items[2]';
      const doc = {
        ...FLOW_DOC,
        [path]: { type, data: { key: 'items' }, [key]: { items: [{}] } },
        [`${path}.${key}.items`]: [{}],
      };
      const boxes = [
        {
          path: `${path}.${key}.items[0]`,
          border: { x: 200, y: 100, w: 60, h: 20 },
          content: { x: 200, y: 100, w: 60, h: 20 },
        },
      ];
      const plan = planPaletteDrop(readOf(doc), boxes, IN_CELL, docField, true);
      expect(plan?.path, type).toBe(`${path}.${key}.items`);
      expect(plan?.index, type).toBe(1);
    }
  });

  it('picks the INNERMOST cell when the pointer is over nested ones', () => {
    const outer = 'sections.body.items[2]';
    const innerTable = `${outer}.item.items[0]`;
    const doc = {
      ...FLOW_DOC,
      [outer]: { type: 'repeat_flow', data: { key: 'items' }, item: { items: [{}] } },
      [`${innerTable}.columns[0]`]: { label: 'c', cell: { items: [] } },
    };
    const boxes = [
      {
        path: `${outer}.item.items[0]`,
        border: { x: 200, y: 100, w: 60, h: 20 },
        content: { x: 200, y: 100, w: 60, h: 20 },
      },
      {
        path: `${innerTable}.columns[0]`,
        border: { x: 205, y: 105, w: 40, h: 10 },
        content: { x: 205, y: 105, w: 40, h: 10 },
      },
    ];
    expect(planPaletteDrop(readOf(doc), boxes, { x: 210, y: 108 }, docField, true)?.path).toBe(
      `${innerTable}.columns[0].cell.items`,
    );
  });

  it('is not a target for a plain (cell-less) table column', () => {
    // Nothing to enter: a bound column renders its row value, it holds no items.
    const doc = { ...FLOW_DOC, [COLUMN]: { label: 'c', data: { key: 'name' } } };
    expect(planPaletteDrop(readOf(doc), CELL_PAGE, IN_CELL, docField, true)?.path).toBe(
      'sections.body.items',
    );
  });

  it('degrades to the body on hostile geometry: an unparseable path or a throwing read', () => {
    const bad: readonly PlacedBox[] = [
      {
        path: 'not a path[[',
        border: { x: 200, y: 100, w: 60, h: 20 },
        content: { x: 200, y: 100, w: 60, h: 20 },
      },
    ];
    expect(planPaletteDrop(read, bad, IN_CELL, docField, true)?.path).toBe('sections.body.items');
    const throws: ReadFn = () => {
      throw new Error('gone');
    };
    expect(planPaletteDrop(throws, CELL_PAGE, IN_CELL, docField, true)?.path).toBe(
      'sections.body.items',
    );
    // A ROW field under the same throwing read is fully INERT (null), never a
    // body fallback: with no readable scope its key resolves nowhere.
    expect(planPaletteDrop(throws, CELL_PAGE, IN_CELL, rowField, true)).toBeNull();
  });

  it('never walks a prototype for the sub-template probe', () => {
    // A box path whose node INHERITS `cell` owns no sub-template; entering it
    // would author into a key the document does not have.
    const inherited = Object.create({ cell: { items: [] } }) as Record<string, unknown>;
    inherited.label = 'c';
    const doc = { ...FLOW_DOC, [COLUMN]: inherited };
    expect(planPaletteDrop(readOf(doc), CELL_PAGE, IN_CELL, docField, true)?.path).toBe(
      'sections.body.items',
    );
  });
});

describe('boundSnippet — document scope', () => {
  it('authors `scope: document` beside the key for text, image and currency', () => {
    const field = { key: 'store.name', type: 'string', label: '', group: null };
    expect(boundSnippet(field, false, true)).toEqual({
      type: 'text',
      data: { key: 'store.name', scope: 'document' },
    });
    expect(boundSnippet({ ...field, type: 'image' }, false, true)).toEqual({
      type: 'image',
      data: { key: 'store.name', scope: 'document' },
      box: { w: 120, h: 60 },
    });
    expect(boundSnippet({ ...field, type: 'currency' }, true, true)).toEqual({
      type: 'text',
      data: { key: 'store.name', format: 'symbol', scope: 'document' },
    });
  });

  it('never authors a scope key otherwise — unset already means the row', () => {
    const field = { key: 'qty', type: 'number', label: '', group: 'items' };
    for (const snippet of [boundSnippet(field), boundSnippet(field, true, false)]) {
      expect(JSON.stringify(snippet)).not.toContain('scope');
    }
  });

  it('threads the flag through dropSnippet', () => {
    const field = { key: 'store.name', type: 'string', label: '', group: null };
    expect(dropSnippet({ kind: 'field', field }, false, false, true)).toEqual(
      boundSnippet(field, false, true),
    );
  });
});
