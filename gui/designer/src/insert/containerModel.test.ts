import { describe, expect, it } from 'vitest';
import {
  COLUMN_GAP_PT,
  containerShape,
  containerSnippet,
  GRID_GAP_PT,
  isPlaceholderSlot,
  PICKER_MAX_COLUMNS,
  PICKER_MAX_ROWS,
  ROW_GAP_PT,
} from './containerModel';

describe('containerShape', () => {
  it('maps one row to 横並び (flex row) with the traced column count', () => {
    expect(containerShape(3, 1)).toEqual({ kind: 'row', columns: 3, rows: 1 });
  });

  it('maps a 1×1 trace to a one-slot row', () => {
    expect(containerShape(1, 1)).toEqual({ kind: 'row', columns: 1, rows: 1 });
  });

  it('maps one column (rows ≥ 2) to 縦積み (flex column)', () => {
    expect(containerShape(1, 3)).toEqual({ kind: 'column', columns: 1, rows: 3 });
  });

  it('maps a two-dimensional trace to 表組み (grid)', () => {
    expect(containerShape(3, 2)).toEqual({ kind: 'grid', columns: 3, rows: 2 });
  });

  it('clamps oversized and fractional input into the picker bounds', () => {
    expect(containerShape(99, 2.9)).toEqual({
      kind: 'grid',
      columns: PICKER_MAX_COLUMNS,
      rows: 2,
    });
    expect(containerShape(2.5, 99)).toEqual({ kind: 'grid', columns: 2, rows: PICKER_MAX_ROWS });
  });

  it('clamps zero and negative input up to one', () => {
    expect(containerShape(0, -5)).toEqual({ kind: 'row', columns: 1, rows: 1 });
  });

  it('refuses non-finite input (fail closed)', () => {
    expect(containerShape(Number.NaN, 1)).toBeNull();
    expect(containerShape(2, Number.POSITIVE_INFINITY)).toBeNull();
    expect(containerShape(Number.NEGATIVE_INFINITY, Number.NaN)).toBeNull();
  });
});

describe('containerSnippet', () => {
  it('scaffolds a row: explicit direction, gap, one placeholder text per column', () => {
    const shape = containerShape(3, 1);
    expect(shape).not.toBeNull();
    expect(containerSnippet(shape as NonNullable<typeof shape>, 'Text')).toEqual({
      type: 'container',
      box: { direction: 'row', gap: ROW_GAP_PT },
      items: [
        { type: 'text', text: 'Text' },
        { type: 'text', text: 'Text' },
        { type: 'text', text: 'Text' },
      ],
    });
  });

  it('scaffolds a column: explicit direction, one placeholder per row', () => {
    const shape = containerShape(1, 2);
    expect(shape).not.toBeNull();
    expect(containerSnippet(shape as NonNullable<typeof shape>, 'テキスト')).toEqual({
      type: 'container',
      box: { direction: 'column', gap: COLUMN_GAP_PT },
      items: [
        { type: 'text', text: 'テキスト' },
        { type: 'text', text: 'テキスト' },
      ],
    });
  });

  it('scaffolds a grid: box.type grid + a column COUNT + row-major placeholders', () => {
    const shape = containerShape(3, 2);
    expect(shape).not.toBeNull();
    const snippet = containerSnippet(shape as NonNullable<typeof shape>, 'Text');
    expect(snippet).toMatchObject({
      type: 'container',
      box: { type: 'grid', columns: 3, gap: GRID_GAP_PT },
    });
    const items = (snippet as { items: unknown[] }).items;
    expect(items).toHaveLength(6);
    expect(items[5]).toEqual({ type: 'text', text: 'Text' });
  });

  it('stays under the snippet node cap at the maximum trace', () => {
    const shape = containerShape(PICKER_MAX_COLUMNS, PICKER_MAX_ROWS);
    expect(shape).not.toBeNull();
    const snippet = containerSnippet(shape as NonNullable<typeof shape>, 'Text');
    // Rough node count: the container map + box map (4 scalars) + the items
    // list + 24 placeholders × (map + 2 scalars) — comfortably under the
    // designer-core MAX_SNIPPET_NODES (256). Count JSON nodes to pin it.
    const count = countNodes(snippet);
    expect(count).toBeLessThan(256);
    expect((snippet as { items: unknown[] }).items).toHaveLength(24);
  });
});

describe('isPlaceholderSlot', () => {
  const DEFAULT = 'テキスト';

  it('accepts a bare text node carrying the scaffold default text', () => {
    expect(isPlaceholderSlot({ type: 'text', text: DEFAULT }, DEFAULT)).toBe(true);
  });

  it('accepts an empty or absent text node', () => {
    expect(isPlaceholderSlot({ type: 'text', text: '' }, DEFAULT)).toBe(true);
    expect(isPlaceholderSlot({ type: 'text' }, DEFAULT)).toBe(true);
  });

  it('rejects a text node the user gave real prose', () => {
    expect(isPlaceholderSlot({ type: 'text', text: '請求書' }, DEFAULT)).toBe(false);
  });

  it('rejects a node carrying any content key (data / box / style / styleNames / id)', () => {
    expect(isPlaceholderSlot({ type: 'text', text: DEFAULT, data: { key: 'x' } }, DEFAULT)).toBe(
      false,
    );
    expect(isPlaceholderSlot({ type: 'text', text: DEFAULT, box: { w: 10 } }, DEFAULT)).toBe(false);
    expect(
      isPlaceholderSlot({ type: 'text', text: DEFAULT, style: { color: '#000' } }, DEFAULT),
    ).toBe(false);
    expect(isPlaceholderSlot({ type: 'text', text: DEFAULT, styleNames: ['x'] }, DEFAULT)).toBe(
      false,
    );
    expect(isPlaceholderSlot({ type: 'text', text: DEFAULT, id: 'stamp' }, DEFAULT)).toBe(false);
  });

  it('rejects a non-text item, a non-map, and a null', () => {
    expect(isPlaceholderSlot({ type: 'rect' }, DEFAULT)).toBe(false);
    expect(isPlaceholderSlot([1, 2], DEFAULT)).toBe(false);
    expect(isPlaceholderSlot(null, DEFAULT)).toBe(false);
    expect(isPlaceholderSlot('text', DEFAULT)).toBe(false);
  });
});

function countNodes(value: unknown): number {
  if (Array.isArray(value)) {
    return 1 + value.reduce<number>((sum, entry) => sum + countNodes(entry), 0);
  }
  if (typeof value === 'object' && value !== null) {
    return 1 + Object.values(value).reduce<number>((sum, entry) => sum + countNodes(entry), 0);
  }
  return 1;
}
