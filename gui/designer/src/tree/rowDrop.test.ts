// Tests for rowDrop.ts — which gap a tree pointer is in, and which of that
// gap's meanings the horizontal position picks.
import { describe, expect, it } from 'vitest';
import type { TreeNode, TreeView } from './model';
import { ROW_INDENT_PX, rowDropAt, type VisibleRow, visiblePaths } from './rowDrop';

/** The stacked run the tests read against: 20px rows, one indent per level. */
const ROWS: readonly VisibleRow[] = [
  ['sections.body', 0],
  ['sections.body.items[0]', 1],
  ['sections.body.items[1]', 1],
  ['sections.body.items[1].items[0]', 2],
  ['sections.body.items[1].items[1]', 2],
  ['sections.body.items[2]', 1],
].map(([path, level], index) => ({
  path: path as string,
  top: index * 20,
  height: 20,
  left: (level as number) * ROW_INDENT_PX,
}));

/** A realistic `accepts`: only the item lists that really exist as owners in
 * the fixture. `rowDropAt` offers "inside the row above" as the deepest
 * reading of a gap, and in the app it is `receiverFor` that rejects that for a
 * leaf row — so a predicate that accepted everything would test a tree the
 * Designer cannot produce. */
const OWNERS = new Set(['sections.body.items', 'sections.body.items[1].items']);
const ALL = (parent: string) => OWNERS.has(parent);
const at = (level: number, y: number) => ({ x: level * ROW_INDENT_PX, y });

describe('rowDropAt', () => {
  it('reads the gap after a nested last child at the INNER indent as its own list', () => {
    // Between `items[1].items[1]` (row 4) and `items[2]` (row 5): y 95 is past
    // row 4's midpoint (90) and before row 5's (110).
    expect(rowDropAt(ROWS, at(2, 95), ALL)).toEqual({
      parent: 'sections.body.items[1].items',
      index: 2,
    });
  });

  it('reads the SAME gap one indent out as the container it closes', () => {
    expect(rowDropAt(ROWS, at(1, 95), ALL)).toEqual({ parent: 'sections.body.items', index: 2 });
  });

  it('clamps a pointer to the RIGHT of the row above to the deepest reading', () => {
    expect(rowDropAt(ROWS, at(9, 95), ALL)).toEqual({
      parent: 'sections.body.items[1].items',
      index: 2,
    });
  });

  it('never goes shallower than the row after the gap', () => {
    // Two indents further left than the deepest reading, but `items[2]` sits
    // in `sections.body.items`, so that is as far out as the gap goes.
    expect(rowDropAt(ROWS, at(-3, 95), ALL)).toEqual({ parent: 'sections.body.items', index: 2 });
  });

  it('has ONE reading for a gap between same-parent siblings', () => {
    // Between `items[0]` (row 1, midpoint 30) and `items[1]` (row 2,
    // midpoint 50).
    for (const level of [0, 1, 2]) {
      expect(rowDropAt(ROWS, at(level, 45), ALL)).toEqual({
        parent: 'sections.body.items',
        index: 1,
      });
    }
  });

  it('has ONE reading for a gap at the START of a container', () => {
    // Between `items[1]` (row 2, midpoint 50) and its own first child (row 3,
    // midpoint 70).
    for (const level of [0, 2]) {
      expect(rowDropAt(ROWS, at(level, 55), ALL)).toEqual({
        parent: 'sections.body.items[1].items',
        index: 0,
      });
    }
  });

  it('reads the gap above the first row as the head of its list', () => {
    // Above `sections.body` there is no item list — the section root is not a
    // sequence entry — so nothing takes the drop.
    expect(rowDropAt(ROWS, at(0, -5), ALL)).toBeNull();
    // But above a row that IS one, the head of its own list.
    expect(rowDropAt(ROWS.slice(1), at(1, -5), ALL)).toEqual({
      parent: 'sections.body.items',
      index: 0,
    });
  });

  it('offers every ancestor level past the end of the run', () => {
    const rows = ROWS.slice(0, 5);
    expect(rowDropAt(rows, at(2, 200), ALL)).toEqual({
      parent: 'sections.body.items[1].items',
      index: 2,
    });
    expect(rowDropAt(rows, at(1, 200), ALL)).toEqual({ parent: 'sections.body.items', index: 2 });
  });

  it('skips a level whose parent is not an item list, and keeps walking up', () => {
    const rows: readonly VisibleRow[] = [
      { path: 'sections.body.items[0]', top: 0, height: 20, left: 0 },
      { path: 'sections.body.items[0].columns[0]', top: 20, height: 20, left: ROW_INDENT_PX },
    ];
    // Past the column row: `columns` takes no items, so the only reading is
    // the body list its table sits in.
    expect(rowDropAt(rows, at(1, 60), ALL)).toEqual({ parent: 'sections.body.items', index: 1 });
  });

  it('stops walking up at a path with no enclosing key', () => {
    const rows: readonly VisibleRow[] = [{ path: 'items[0]', top: 0, height: 20, left: 0 }];
    // `items` is a bare top-level sequence: not an `…items` list, and there is
    // nothing above it to walk to.
    expect(rowDropAt(rows, at(0, 60), ALL)).toBeNull();
  });

  it('keeps every candidate when the row after the gap shares no ancestor list', () => {
    const rows: readonly VisibleRow[] = [
      { path: 'sections.body.items[0]', top: 0, height: 20, left: 0 },
      { path: 'sections.body.items[0].items[0]', top: 20, height: 20, left: ROW_INDENT_PX },
      // A column row: its parent is `columns`, which is in no slot chain the
      // row above walks, so nothing truncates the candidates.
      { path: 'sections.other.items[0].columns[0]', top: 40, height: 20, left: 0 },
    ];
    // Here `items[0]` IS the container, so its own list is a real owner.
    const owners = (parent: string) =>
      parent === 'sections.body.items' || parent === 'sections.body.items[0].items';
    expect(rowDropAt(rows, at(1, 35), owners)).toEqual({
      parent: 'sections.body.items[0].items',
      index: 1,
    });
    expect(rowDropAt(rows, at(0, 35), owners)).toEqual({
      parent: 'sections.body.items',
      index: 1,
    });
  });

  it('offers INSIDE a container that shows no children — the tree own blind spot', () => {
    // An empty (or collapsed) container has no gap of its own, so without
    // this the canvas could fill it and the tree never could.
    const rows: readonly VisibleRow[] = [
      { path: 'sections.body.items[0]', top: 0, height: 20, left: 0 },
      { path: 'sections.body.items[1]', top: 20, height: 20, left: 0 },
    ];
    // One indent RIGHT of the container row: inside it.
    expect(rowDropAt(rows, { x: ROW_INDENT_PX, y: 60 }, ALL)).toEqual({
      parent: 'sections.body.items[1].items',
      index: 0,
    });
    // At its own indent: after it, among its siblings.
    expect(rowDropAt(rows, { x: 0, y: 60 }, ALL)).toEqual({
      parent: 'sections.body.items',
      index: 2,
    });
  });

  it('offers only the slots `accepts` allows', () => {
    const only = (parent: string) => parent === 'sections.body.items';
    expect(rowDropAt(ROWS, at(2, 95), only)).toEqual({ parent: 'sections.body.items', index: 2 });
  });

  it('takes nothing when every candidate is refused', () => {
    expect(rowDropAt(ROWS, at(2, 95), () => false)).toBeNull();
    expect(rowDropAt(ROWS, at(0, 55), () => false)).toBeNull();
    expect(rowDropAt(ROWS.slice(1), at(1, -5), () => false)).toBeNull();
  });

  it('takes nothing from an empty run or a hostile pointer', () => {
    expect(rowDropAt([], at(0, 10), ALL)).toBeNull();
    expect(rowDropAt(ROWS, { x: Number.NaN, y: 10 }, ALL)).toBeNull();
    expect(rowDropAt(ROWS, { x: 0, y: Number.POSITIVE_INFINITY }, ALL)).toBeNull();
  });
});

const node = (path: string, children: readonly TreeNode[] = []): TreeNode => ({
  path,
  kind: 'text',
  label: null,
  children,
});

describe('visiblePaths', () => {
  const view: TreeView = {
    roots: [
      node('sections.body', [
        node('sections.body.items[0]'),
        node('sections.body.items[1]', [node('sections.body.items[1].items[0]')]),
      ]),
    ],
    truncated: false,
  };

  it('walks the tree in the order it renders', () => {
    expect(visiblePaths(view, new Set())).toEqual([
      'sections.body',
      'sections.body.items[0]',
      'sections.body.items[1]',
      'sections.body.items[1].items[0]',
    ]);
  });

  it('keeps a collapsed node and hides its subtree', () => {
    expect(visiblePaths(view, new Set(['sections.body.items[1]']))).toEqual([
      'sections.body',
      'sections.body.items[0]',
      'sections.body.items[1]',
    ]);
  });

  it('takes an absent view as an empty run', () => {
    expect(visiblePaths(null, new Set())).toEqual([]);
  });
});
